const DEFAULT_ROOM_ID = 'pi-24-commerce';
const DEFAULT_ROOM_NAME = 'Commerce platform';
const DEFAULT_PI_LABEL = 'PI 24';
const ALLOWED_SEQUENCES = new Set(['sequential', 'fibonacci', 'modified']);
const ALLOWED_PHASES = new Set(['idle', 'voting', 'revealed']);
const MAX_BODY_BYTES = 1_500_000;

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
  return requested === DEFAULT_ROOM_ID ? requested : DEFAULT_ROOM_ID;
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
    db.prepare(`INSERT OR IGNORE INTO rooms (id, name, pi_label, sequence_key, selected_story_key, vote_mode, created_at, updated_at)
      VALUES (?, ?, ?, ?, NULL, ?, ?, ?)`)
      .bind(DEFAULT_ROOM_ID, DEFAULT_ROOM_NAME, DEFAULT_PI_LABEL, 'fibonacci', 'hidden', now, now),
    db.prepare(`INSERT OR IGNORE INTO room_members (room_id, account_id, role, created_at)
      VALUES (?, ?, 'editor', ?)`)
      .bind(DEFAULT_ROOM_ID, user.id, now),
  ]);
}

async function requireMember(db, roomId, userId) {
  const member = await db.prepare('SELECT 1 AS ok FROM room_members WHERE room_id = ? AND account_id = ? LIMIT 1')
    .bind(roomId, userId)
    .first();
  if (!member) {
    const error = new Error('You do not have access to this planning room');
    error.status = 403;
    throw error;
  }
}

async function readRoomState(db, roomId, userId) {
  const room = await db.prepare(`SELECT id, sequence_key, selected_story_key, vote_mode
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

async function handleApi(request, env) {
  if (!env.DB) return json({ error: 'The Pointline database binding is not configured' }, 500);
  const user = getIdentity(request);
  if (!user) return json({ error: 'Sign in with ChatGPT to use this planning room' }, 401);
  const roomId = roomIdFromRequest(request);
  await ensureAccountAndRoom(env.DB, user);
  await requireMember(env.DB, roomId, user.id);

  const url = new URL(request.url);
  if (url.pathname === '/api/me' && request.method === 'GET') {
    const room = await readRoomState(env.DB, roomId, user.id);
    return json({ user, roomId, memberCount: room.memberCount });
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
  if (env.ASSETS && typeof env.ASSETS.fetch === 'function') return env.ASSETS.fetch(request);
  return new Response('Not found', { status: 404 });
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
