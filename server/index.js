const DEFAULT_ROOM_ID = 'pi-24-commerce';
const DEFAULT_ROOM_NAME = 'Commerce platform';
const DEFAULT_PI_LABEL = 'PI 24';
const ALLOWED_SEQUENCES = new Set(['sequential', 'fibonacci', 'modified']);
const ALLOWED_PHASES = new Set(['idle', 'voting', 'revealed']);
const ALLOWED_INVITE_KINDS = new Set(['room-person', 'room-team', 'team']);
const ROOM_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,79}$/i;
const MAX_BODY_BYTES = 1_500_000;
const STATIC_ASSETS = new Map();

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS,
  });
}

function getIdentity(request) {
  const id = request.headers.get('oai-authenticated-user-id')?.trim();
  if (!id) return null;

  const encodedName = request.headers.get('oai-authenticated-user-full-name')?.trim() || '';
  let name = encodedName;
  try {
    name = decodeURIComponent(encodedName);
  } catch {
    // Keep the raw header when an optional display name is not encoded cleanly.
  }

  return {
    id: id.slice(0, 200),
    email: (request.headers.get('oai-authenticated-user-email') || '').trim().slice(0, 320),
    name: name.slice(0, 160),
  };
}

function roomIdFromRequest(request) {
  const requested = new URL(request.url).searchParams.get('room');
  return requested && ROOM_ID_PATTERN.test(requested) ? requested : DEFAULT_ROOM_ID;
}

function rows(result) {
  return result?.results || [];
}

function parseScore(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 100000 ? number : null;
}

function cleanText(value, fallback = '', maxLength = 5000) {
  const text = String(value ?? '').trim();
  return (text || fallback).slice(0, maxLength);
}

function cleanId(value, fallback = '') {
  const id = cleanText(value, fallback, 120);
  return /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/.test(id) ? id : fallback;
}

function makeId(prefix) {
  return `${prefix}-${crypto.randomUUID().replaceAll('-', '').slice(0, 24)}`;
}

function cleanInviteToken(value) {
  const token = cleanText(value, '', 160);
  return /^[a-zA-Z0-9._:-]{8,160}$/.test(token) ? token : '';
}

function parseAcceptance(value) {
  if (!Array.isArray(value)) return ['Ready for discussion'];
  const items = value.map((item) => cleanText(item, '', 300)).filter(Boolean).slice(0, 20);
  return items.length ? items : ['Ready for discussion'];
}

function normalizeLinks(links, serviceIds) {
  if (!Array.isArray(links)) return [];
  return links
    .map((link) => ({
      serviceId: cleanId(link?.serviceId),
      allocation: Math.min(100, Math.max(0, Number(link?.allocation) || 0)),
    }))
    .filter((link) => link.serviceId && serviceIds.has(link.serviceId));
}

function normalizeStateInput(input) {
  const source = input && typeof input === 'object' ? input : {};
  const domains = Array.isArray(source.domains)
    ? source.domains.map((domain) => ({
      id: cleanId(domain?.id),
      name: cleanText(domain?.name, '', 120),
    })).filter((domain) => domain.id && domain.name)
    : [];
  const services = Array.isArray(source.services)
    ? source.services.map((service) => ({
      id: cleanId(service?.id),
      name: cleanText(service?.name, '', 120),
      domainId: cleanId(service?.domainId),
    })).filter((service) => service.id && service.name)
    : [];
  const serviceIds = new Set(services.map((service) => service.id));
  const stories = Array.isArray(source.stories)
    ? source.stories.map((story) => ({
      id: cleanId(story?.id),
      type: cleanText(story?.type, 'Feature', 80),
      title: cleanText(story?.title, 'Untitled story', 500),
      description: cleanText(story?.description, 'A new story ready for the team to shape and estimate together.', 5000),
      acceptance: parseAcceptance(story?.acceptance),
      manual: parseScore(story?.manual),
      ai: parseScore(story?.ai),
      aiEnabled: story?.aiEnabled === true || parseScore(story?.ai) !== null,
      saved: story?.saved === true,
      serviceLinks: normalizeLinks(story?.serviceLinks, serviceIds),
    })).filter((story) => story.id && story.title)
    : [];
  const roundSource = source.round && typeof source.round === 'object' ? source.round : {};
  const selectedStoryId = stories.some((story) => story.id === source.selectedStoryId)
    ? source.selectedStoryId
    : stories[0]?.id || null;
  const roundStoryId = stories.some((story) => story.id === roundSource.storyId)
    ? roundSource.storyId
    : selectedStoryId;
  const roundNumber = Number.isInteger(roundSource.roundNumber) && roundSource.roundNumber > 0
    ? roundSource.roundNumber
    : 1;

  return {
    sequence: ALLOWED_SEQUENCES.has(source.sequence) ? source.sequence : 'fibonacci',
    selectedStoryId,
    domains,
    services,
    stories,
    round: {
      phase: ALLOWED_PHASES.has(roundSource.phase) ? roundSource.phase : 'idle',
      mode: roundSource.mode === 'open' ? 'open' : 'hidden',
      storyId: roundStoryId,
      roundNumber,
      revealedAt: roundSource.revealedAt ? cleanText(roundSource.revealedAt, '', 80) : null,
    },
  };
}

async function readJson(request) {
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
    const error = new Error('Request body is too large');
    error.status = 413;
    throw error;
  }
  if (!body.trim()) return {};
  try {
    return JSON.parse(body);
  } catch {
    const error = new Error('Request body must be valid JSON');
    error.status = 400;
    throw error;
  }
}

async function ensureAccountAndRoom(db, user) {
  const email = user.email || `${user.id}@chatgpt.local`;
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(`INSERT INTO accounts (id, email, display_name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET email = excluded.email, display_name = excluded.display_name, updated_at = excluded.updated_at`)
      .bind(user.id, email, user.name || null, now, now),
    db.prepare(`INSERT OR IGNORE INTO rooms (id, name, pi_label, owner_account_id, sequence_key, selected_story_key, vote_mode, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)`)
      .bind(DEFAULT_ROOM_ID, DEFAULT_ROOM_NAME, DEFAULT_PI_LABEL, user.id, 'fibonacci', 'hidden', now, now),
    db.prepare(`UPDATE rooms SET owner_account_id = COALESCE(owner_account_id, ?)
      WHERE id = ?`)
      .bind(user.id, DEFAULT_ROOM_ID),
    db.prepare(`INSERT OR IGNORE INTO room_members (room_id, account_id, role, created_at)
      VALUES (?, ?, 'editor', ?)`)
      .bind(DEFAULT_ROOM_ID, user.id, now),
  ]);
}

async function requireMember(db, roomId, userId) {
  const member = await db.prepare('SELECT role FROM room_members WHERE room_id = ? AND account_id = ? LIMIT 1')
    .bind(roomId, userId)
    .first();
  if (!member) {
    const error = new Error('You do not have access to this planning room');
    error.status = 403;
    throw error;
  }
  return member;
}

async function requireTeamMember(db, teamId, userId) {
  const member = await db.prepare(`SELECT tm.role, t.owner_account_id
    FROM team_members tm JOIN teams t ON t.id = tm.team_id
    WHERE tm.team_id = ? AND tm.account_id = ? LIMIT 1`)
    .bind(teamId, userId)
    .first();
  if (!member) {
    const error = new Error('You do not have access to this team');
    error.status = 403;
    throw error;
  }
  return member;
}

async function readRoomState(db, roomId, userId) {
  const room = await db.prepare(`SELECT id, name, pi_label, owner_account_id, sequence_key, selected_story_key, vote_mode
    FROM rooms WHERE id = ? LIMIT 1`).bind(roomId).first();
  if (!room) return { state: null, memberCount: 0 };

  const [domainResult, serviceResult, storyResult, allocationResult, memberResult] = await Promise.all([
    db.prepare('SELECT id, name, sort_order FROM domains WHERE room_id = ? ORDER BY sort_order, id').bind(roomId).all(),
    db.prepare('SELECT id, name, domain_id, sort_order FROM services WHERE room_id = ? ORDER BY sort_order, id').bind(roomId).all(),
    db.prepare(`SELECT story_key, type, title, description, acceptance_json, sort_order,
      manual_estimate, ai_estimate, ai_enabled, saved
      FROM stories WHERE room_id = ? ORDER BY sort_order, story_key`).bind(roomId).all(),
    db.prepare(`SELECT story_key, service_id, allocation_pct
      FROM story_service_allocations WHERE room_id = ? ORDER BY story_key, service_id`).bind(roomId).all(),
    db.prepare('SELECT COUNT(*) AS count FROM room_members WHERE room_id = ?').bind(roomId).first(),
  ]);

  const domains = rows(domainResult).map((domain) => ({ id: domain.id, name: domain.name }));
  const services = rows(serviceResult).map((service) => ({
    id: service.id,
    name: service.name,
    domainId: service.domain_id || '',
  }));
  const linksByStory = new Map();
  rows(allocationResult).forEach((link) => {
    const links = linksByStory.get(link.story_key) || [];
    links.push({ serviceId: link.service_id, allocation: Number(link.allocation_pct) || 0 });
    linksByStory.set(link.story_key, links);
  });
  const stories = rows(storyResult).map((story) => {
    let acceptance = ['Ready for discussion'];
    try {
      acceptance = parseAcceptance(JSON.parse(story.acceptance_json || '[]'));
    } catch {
      // Keep the safe default for a malformed legacy row.
    }
    return {
      id: story.story_key,
      type: story.type || 'Feature',
      title: story.title,
      description: story.description || 'A new story ready for the team to shape and estimate together.',
      acceptance,
      manual: parseScore(story.manual_estimate),
      ai: parseScore(story.ai_estimate),
      aiEnabled: story.ai_enabled === 1,
      saved: story.saved === 1,
      serviceLinks: linksByStory.get(story.story_key) || [],
    };
  });

  const selectedStoryId = stories.some((story) => story.id === room.selected_story_key)
    ? room.selected_story_key
    : stories[0]?.id || null;
  let currentRound = null;
  if (selectedStoryId) {
    currentRound = await db.prepare(`SELECT story_key, round_number, phase, mode, revealed_at
      FROM planning_rounds WHERE room_id = ? AND story_key = ?
      ORDER BY round_number DESC LIMIT 1`).bind(roomId, selectedStoryId).first();
  }

  const round = currentRound
    ? {
      phase: ALLOWED_PHASES.has(currentRound.phase) ? currentRound.phase : 'idle',
      mode: currentRound.mode === 'open' ? 'open' : 'hidden',
      storyId: currentRound.story_key,
      roundNumber: Number(currentRound.round_number) || 1,
      submittedCount: 0,
      votes: {},
      cardFlipped: false,
      revealedAt: currentRound.revealed_at || null,
    }
    : {
      phase: 'idle',
      mode: room.vote_mode === 'open' ? 'open' : 'hidden',
      storyId: selectedStoryId,
      roundNumber: 1,
      submittedCount: 0,
      votes: {},
      cardFlipped: false,
      revealedAt: null,
    };

  if (currentRound) {
    const countRow = await db.prepare(`SELECT COUNT(*) AS count FROM votes
      WHERE room_id = ? AND story_key = ? AND round_number = ?`)
      .bind(roomId, round.storyId, round.roundNumber)
      .first();
    round.submittedCount = Number(countRow?.count) || 0;

    const voteResult = round.phase === 'revealed' || round.mode === 'open'
      ? await db.prepare(`SELECT account_id, manual_estimate, ai_estimate, ai_enabled
        FROM votes WHERE room_id = ? AND story_key = ? AND round_number = ?
        ORDER BY updated_at, account_id`).bind(roomId, round.storyId, round.roundNumber).all()
      : await db.prepare(`SELECT account_id, manual_estimate, ai_estimate, ai_enabled
        FROM votes WHERE room_id = ? AND story_key = ? AND round_number = ? AND account_id = ?`)
        .bind(roomId, round.storyId, round.roundNumber, userId)
        .all();
    round.votes = Object.fromEntries(rows(voteResult).map((vote) => [vote.account_id, {
      manual: parseScore(vote.manual_estimate),
      ai: parseScore(vote.ai_estimate),
      aiEnabled: vote.ai_enabled === 1,
    }]));
  }

  return {
    memberCount: Math.max(1, Number(memberResult?.count) || 1),
    room: {
      id: room.id,
      name: room.name,
      piLabel: room.pi_label,
      role: room.owner_account_id === userId ? 'owner' : 'member',
    },
    state: stories.length
      ? {
        resourceModelVersion: 1,
        sequence: ALLOWED_SEQUENCES.has(room.sequence_key) ? room.sequence_key : 'fibonacci',
        selectedStoryId,
        stories,
        domains,
        services,
        round,
      }
      : null,
  };
}

async function readRooms(db, userId) {
  const result = await db.prepare(`SELECT r.id, r.name, r.pi_label, r.owner_account_id,
      COUNT(all_members.account_id) AS member_count, mine.role
    FROM rooms r
    JOIN room_members mine ON mine.room_id = r.id AND mine.account_id = ?
    LEFT JOIN room_members all_members ON all_members.room_id = r.id
    GROUP BY r.id, r.name, r.pi_label, r.owner_account_id, mine.role
    ORDER BY r.updated_at DESC, r.id`).bind(userId).all();
  return rows(result).map((room) => ({
    id: room.id,
    name: room.name,
    piLabel: room.pi_label,
    memberCount: Math.max(1, Number(room.member_count) || 1),
    role: room.owner_account_id === userId ? 'owner' : room.role === 'owner' ? 'owner' : 'member',
  }));
}

async function readTeams(db, userId) {
  const result = await db.prepare(`SELECT t.id, t.name, t.owner_account_id, tm.role,
      COUNT(all_members.account_id) AS member_count
    FROM teams t
    JOIN team_members tm ON tm.team_id = t.id AND tm.account_id = ?
    LEFT JOIN team_members all_members ON all_members.team_id = t.id
    GROUP BY t.id, t.name, t.owner_account_id, tm.role
    ORDER BY t.updated_at DESC, t.id`).bind(userId).all();
  const teams = await Promise.all(rows(result).map(async (team) => {
    const members = await db.prepare(`SELECT a.id, a.display_name, a.email, tm.role
      FROM team_members tm JOIN accounts a ON a.id = tm.account_id
      WHERE tm.team_id = ? ORDER BY tm.role DESC, a.display_name, a.email`).bind(team.id).all();
    return {
      id: team.id,
      name: team.name,
      role: team.owner_account_id === userId ? 'owner' : team.role === 'owner' ? 'owner' : 'member',
      memberCount: Math.max(0, Number(team.member_count) || 0),
      members: rows(members).map((member) => ({
        id: member.id,
        name: member.display_name || member.email?.split('@')[0] || 'Planner',
        email: member.email || '',
        role: member.role === 'owner' ? 'owner' : 'member',
      })),
    };
  }));
  return teams;
}

async function readInvite(db, token) {
  const invite = await db.prepare(`SELECT ri.token, ri.kind, ri.room_id, ri.team_id, ri.expires_at,
      r.name AS room_name, r.pi_label, t.name AS team_name
    FROM room_invites ri
    LEFT JOIN rooms r ON r.id = ri.room_id
    LEFT JOIN teams t ON t.id = ri.team_id
    WHERE ri.token = ? LIMIT 1`).bind(token).first();
  if (!invite) return null;
  if (invite.expires_at && invite.expires_at < new Date().toISOString()) return null;
  return {
    token: invite.token,
    kind: invite.kind,
    room: invite.room_id ? { id: invite.room_id, name: invite.room_name, piLabel: invite.pi_label } : null,
    team: invite.team_id ? { id: invite.team_id, name: invite.team_name } : null,
  };
}

async function runBatches(db, statements) {
  for (let index = 0; index < statements.length; index += 50) {
    await db.batch(statements.slice(index, index + 50));
  }
}

async function saveRoomState(db, roomId, input) {
  const source = normalizeStateInput(input);
  if (!source.stories.length) {
    const error = new Error('At least one story is required');
    error.status = 400;
    throw error;
  }
  if (source.stories.length > 500 || source.services.length > 200 || source.domains.length > 100) {
    const error = new Error('The room contains more records than the supported limit');
    error.status = 400;
    throw error;
  }

  const now = new Date().toISOString();
  const statements = [
    db.prepare(`UPDATE rooms SET sequence_key = ?, selected_story_key = ?, vote_mode = ?, updated_at = ? WHERE id = ?`)
      .bind(source.sequence, source.selectedStoryId, source.round.mode, now, roomId),
    ...source.domains.map((domain, index) => db.prepare(`INSERT INTO domains (room_id, id, name, sort_order)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(room_id, id) DO UPDATE SET name = excluded.name, sort_order = excluded.sort_order`)
      .bind(roomId, domain.id, domain.name, index)),
    ...source.services.map((service, index) => db.prepare(`INSERT INTO services (room_id, id, name, domain_id, sort_order, active)
      VALUES (?, ?, ?, ?, ?, 1)
      ON CONFLICT(room_id, id) DO UPDATE SET name = excluded.name, domain_id = excluded.domain_id, sort_order = excluded.sort_order, active = 1`)
      .bind(roomId, service.id, service.name, service.domainId || null, index)),
    ...source.stories.map((story, index) => db.prepare(`INSERT INTO stories
      (room_id, story_key, type, title, description, acceptance_json, sort_order, manual_estimate, ai_estimate, ai_enabled, saved)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(room_id, story_key) DO UPDATE SET type = excluded.type, title = excluded.title,
        description = excluded.description, acceptance_json = excluded.acceptance_json, sort_order = excluded.sort_order,
        manual_estimate = excluded.manual_estimate, ai_estimate = excluded.ai_estimate,
        ai_enabled = excluded.ai_enabled, saved = excluded.saved`)
      .bind(roomId, story.id, story.type, story.title, story.description, JSON.stringify(story.acceptance), index,
        story.manual, story.ai, story.aiEnabled ? 1 : 0, story.saved ? 1 : 0)),
    ...source.stories.map((story) => db.prepare('DELETE FROM story_service_allocations WHERE room_id = ? AND story_key = ?')
      .bind(roomId, story.id)),
    ...source.stories.flatMap((story) => story.serviceLinks.map((link) => db.prepare(`INSERT INTO story_service_allocations
      (room_id, story_key, service_id, allocation_pct) VALUES (?, ?, ?, ?)
      ON CONFLICT(room_id, story_key, service_id) DO UPDATE SET allocation_pct = excluded.allocation_pct`)
      .bind(roomId, story.id, link.serviceId, link.allocation))),
  ];

  if (source.round.storyId) {
    statements.push(db.prepare(`INSERT INTO planning_rounds
      (room_id, story_key, round_number, phase, mode, submitted_count, revealed_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?)
      ON CONFLICT(room_id, story_key, round_number) DO UPDATE SET phase = excluded.phase,
        mode = excluded.mode, revealed_at = excluded.revealed_at, updated_at = excluded.updated_at`)
      .bind(roomId, source.round.storyId, source.round.roundNumber, source.round.phase, source.round.mode, source.round.revealedAt, now));
  }

  await runBatches(db, statements);
}

async function createRoom(db, user, input) {
  const name = cleanText(input?.name, '', 80);
  const piLabel = cleanText(input?.piLabel, '', 40);
  if (!name || !piLabel) {
    const error = new Error('Room name and increment label are required');
    error.status = 400;
    throw error;
  }

  const roomId = makeId('room');
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(`INSERT INTO rooms (id, name, pi_label, owner_account_id, sequence_key, selected_story_key, vote_mode, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'fibonacci', NULL, 'hidden', ?, ?)`)
      .bind(roomId, name, piLabel, user.id, now, now),
    db.prepare(`INSERT INTO room_members (room_id, account_id, role, created_at)
      VALUES (?, ?, 'owner', ?)`)
      .bind(roomId, user.id, now),
  ]);
  await saveRoomState(db, roomId, input?.state || {});
  return readRoomState(db, roomId, user.id);
}

async function createTeam(db, user, input) {
  const name = cleanText(input?.name, '', 80);
  if (!name) {
    const error = new Error('Team name is required');
    error.status = 400;
    throw error;
  }
  const teamId = makeId('team');
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(`INSERT INTO teams (id, name, owner_account_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)`)
      .bind(teamId, name, user.id, now, now),
    db.prepare(`INSERT INTO team_members (team_id, account_id, role, created_at)
      VALUES (?, ?, 'owner', ?)`)
      .bind(teamId, user.id, now),
  ]);
  const teams = await readTeams(db, user.id);
  return teams.find((team) => team.id === teamId);
}

async function createInvite(db, request, user, input) {
  const kind = ALLOWED_INVITE_KINDS.has(input?.kind) ? input.kind : '';
  const roomId = cleanId(input?.roomId);
  const teamId = cleanId(input?.teamId);
  if (!kind || (kind !== 'team' && !roomId) || (kind !== 'room-person' && !teamId)) {
    const error = new Error('Invite target is incomplete');
    error.status = 400;
    throw error;
  }
  if (roomId) await requireMember(db, roomId, user.id);
  if (teamId) await requireTeamMember(db, teamId, user.id);

  const token = makeId('invite');
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await db.prepare(`INSERT INTO room_invites (token, room_id, team_id, kind, created_by, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(token, roomId || null, teamId || null, kind, user.id, now, expiresAt)
    .run();

  const url = new URL(request.url);
  url.pathname = '/';
  url.search = '';
  url.searchParams.set('invite', token);
  if (roomId) url.searchParams.set('room', roomId);
  return { token, kind, url: url.toString(), expiresAt };
}

async function acceptInvite(db, user, token) {
  const invite = await readInvite(db, token);
  if (!invite) {
    const error = new Error('This invite link is missing or expired');
    error.status = 404;
    throw error;
  }
  const now = new Date().toISOString();
  const statements = [];
  if (invite.kind === 'team') {
    statements.push(db.prepare(`INSERT OR IGNORE INTO team_members (team_id, account_id, role, created_at)
      VALUES (?, ?, 'member', ?)`)
      .bind(invite.team.id, user.id, now));
  } else if (invite.kind === 'room-team') {
    statements.push(db.prepare(`INSERT OR IGNORE INTO room_members (room_id, account_id, role, created_at)
      SELECT ?, account_id, 'editor', ? FROM team_members WHERE team_id = ?`)
      .bind(invite.room.id, now, invite.team.id));
    statements.push(db.prepare(`INSERT OR IGNORE INTO room_members (room_id, account_id, role, created_at)
      VALUES (?, ?, 'editor', ?)`)
      .bind(invite.room.id, user.id, now));
  } else {
    statements.push(db.prepare(`INSERT OR IGNORE INTO room_members (room_id, account_id, role, created_at)
      VALUES (?, ?, 'editor', ?)`)
      .bind(invite.room.id, user.id, now));
  }
  await db.batch(statements);
  return { invite, roomId: invite.room?.id || null, teamId: invite.team?.id || null };
}

async function handleApi(request, env) {
  if (!env.DB) return json({ error: 'The Pointline database binding is not configured' }, 500);
  const url = new URL(request.url);
  const user = getIdentity(request);
  if (url.pathname === '/api/invites' && request.method === 'GET') {
    const invite = await readInvite(env.DB, cleanInviteToken(url.searchParams.get('token')));
    return invite ? json({ invite }) : json({ error: 'This invite link is missing or expired' }, 404);
  }
  if (!user) return json({ error: 'Sign in with ChatGPT to use this planning room' }, 401);
  const roomId = roomIdFromRequest(request);
  await ensureAccountAndRoom(env.DB, user);

  if (url.pathname === '/api/invites/accept' && request.method === 'POST') {
    const input = await readJson(request);
    const result = await acceptInvite(env.DB, user, cleanInviteToken(input.token));
    return json({ ok: true, ...result });
  }

  await requireMember(env.DB, roomId, user.id);

  if (url.pathname === '/api/me' && request.method === 'GET') {
    const room = await readRoomState(env.DB, roomId, user.id);
    return json({ user, roomId, room: room.room, memberCount: room.memberCount });
  }
  if (url.pathname === '/api/rooms' && request.method === 'GET') {
    return json({ rooms: await readRooms(env.DB, user.id) });
  }
  if (url.pathname === '/api/rooms' && request.method === 'POST') {
    const created = await createRoom(env.DB, user, await readJson(request));
    return json({ ok: true, roomId: created.room.id, room: created.room, memberCount: created.memberCount, state: created.state }, 201);
  }
  if (url.pathname === '/api/teams' && request.method === 'GET') {
    return json({ teams: await readTeams(env.DB, user.id) });
  }
  if (url.pathname === '/api/teams' && request.method === 'POST') {
    const team = await createTeam(env.DB, user, await readJson(request));
    return json({ ok: true, team }, 201);
  }
  if (url.pathname === '/api/invites' && request.method === 'POST') {
    return json(await createInvite(env.DB, request, user, await readJson(request)), 201);
  }
  if (url.pathname === '/api/state' && request.method === 'GET') {
    const room = await readRoomState(env.DB, roomId, user.id);
    return json({ roomId, ...room });
  }
  if (url.pathname === '/api/state' && request.method === 'PUT') {
    await saveRoomState(env.DB, roomId, await readJson(request));
    const room = await readRoomState(env.DB, roomId, user.id);
    return json({ ok: true, roomId, ...room });
  }
  if (url.pathname === '/api/vote' && request.method === 'PUT') {
    const input = await readJson(request);
    const storyId = cleanId(input.storyId);
    const roundNumber = Number(input.roundNumber);
    const round = await env.DB.prepare(`SELECT phase FROM planning_rounds
      WHERE room_id = ? AND story_key = ? AND round_number = ? LIMIT 1`)
      .bind(roomId, storyId, roundNumber)
      .first();
    if (!round || round.phase !== 'voting') return json({ error: 'This voting round is no longer accepting votes' }, 409);

    const manual = parseScore(input.manual);
    const ai = parseScore(input.ai);
    const aiEnabled = input.aiEnabled === true && ai !== null;
    if (manual === null && ai === null) {
      await env.DB.prepare(`DELETE FROM votes WHERE room_id = ? AND story_key = ? AND round_number = ? AND account_id = ?`)
        .bind(roomId, storyId, roundNumber, user.id)
        .run();
    } else {
      await env.DB.prepare(`INSERT INTO votes
        (room_id, story_key, round_number, account_id, manual_estimate, ai_estimate, ai_enabled, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(room_id, story_key, round_number, account_id) DO UPDATE SET manual_estimate = excluded.manual_estimate,
          ai_estimate = excluded.ai_estimate, ai_enabled = excluded.ai_enabled, updated_at = excluded.updated_at`)
        .bind(roomId, storyId, roundNumber, user.id, manual, ai, aiEnabled ? 1 : 0, new Date().toISOString())
        .run();
    }
    const count = await env.DB.prepare(`SELECT COUNT(*) AS count FROM votes
      WHERE room_id = ? AND story_key = ? AND round_number = ?`).bind(roomId, storyId, roundNumber).first();
    return json({ ok: true, submittedCount: Number(count?.count) || 0 });
  }
  if (url.pathname === '/api/votes' && request.method === 'DELETE') {
    const input = await readJson(request);
    const storyId = cleanId(input.storyId);
    const roundNumber = Number(input.roundNumber);
    await env.DB.prepare('DELETE FROM votes WHERE room_id = ? AND story_key = ? AND round_number = ?')
      .bind(roomId, storyId, roundNumber)
      .run();
    return json({ ok: true, submittedCount: 0 });
  }
  return json({ error: 'Not found' }, 404);
}

async function serveStatic(request, env) {
  if (env.ASSETS && typeof env.ASSETS.fetch === 'function') {
    const platformResponse = await env.ASSETS.fetch(request);
    if (platformResponse.status !== 404) return platformResponse;
  }
  const requestedPath = new URL(request.url).pathname;
  const assetPath = requestedPath === '/' ? '/index.html' : requestedPath;
  const asset = STATIC_ASSETS.get(assetPath);
  if (!asset) return new Response('Not found', { status: 404 });
  const contentType = assetPath.endsWith('.html')
    ? 'text/html; charset=utf-8'
    : assetPath.endsWith('.css')
      ? 'text/css; charset=utf-8'
      : 'application/javascript; charset=utf-8';
  return new Response(asset, {
    headers: {
      'content-type': contentType,
      'cache-control': 'no-cache',
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, env);
      } catch (error) {
        const status = Number.isInteger(error?.status) ? error.status : 500;
        if (status >= 500) console.error('Pointline API error', error);
        return json({ error: status >= 500 ? 'The Pointline service is temporarily unavailable' : error.message }, status);
      }
    }
    return serveStatic(request, env);
  },
};
