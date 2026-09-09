import {
  ALLOWED_PHASES,
  ALLOWED_SEQUENCES,
  ROOM_ID_PATTERN,
  ROOM_SOCKETS,
  ROOM_STREAMS,
  authError,
  cleanId,
  cleanStoryUrl,
  cleanText,
  makeId,
  normalizeCapacity,
  normalizeStateInput,
  parseAcceptance,
  parseScore,
  rows,
  teamMemberRole,
  streamEvent,
} from './common.js';
import { canManageRoom, requireRoomManager, requireTeamMember } from './access-service.js';

export async function addRoomMembers(db, user, roomId, input) {
  await requireRoomManager(db, roomId, user);
  const accountId = cleanId(input?.accountId);
  const teamId = cleanId(input?.teamId);
  if ((!accountId && !teamId) || (accountId && teamId)) throw authError('Choose one member or team', 400);
  const now = new Date().toISOString();
  if (teamId) {
    if (user.role !== 'admin') await requireTeamMember(db, teamId, user.id);
    await db.batch([
      db.prepare(`INSERT INTO room_members (room_id, account_id, role, created_at)
        SELECT ?, account_id, 'developer', ? FROM team_members WHERE team_id = ? ON CONFLICT DO NOTHING`)
        .bind(roomId, now, teamId),
      db.prepare('UPDATE rooms SET state_version = state_version + 1, updated_at = ? WHERE id = ?')
        .bind(now, roomId),
    ]);
  } else {
    const account = await db.prepare('SELECT id FROM accounts WHERE id = ? AND disabled = 0 LIMIT 1').bind(accountId).first();
    if (!account) throw authError('Member not found', 404);
    await db.batch([
      db.prepare(`INSERT INTO room_members (room_id, account_id, role, created_at)
        VALUES (?, ?, 'developer', ?) ON CONFLICT DO NOTHING`).bind(roomId, accountId, now),
      db.prepare('UPDATE rooms SET state_version = state_version + 1, updated_at = ? WHERE id = ?')
        .bind(now, roomId),
    ]);
  }
  return readRoomState(db, roomId, user.id);
}
export async function readRoomState(db, roomId, userId) {
  const room = await db.prepare(`SELECT id, name, pi_label, owner_account_id, state_version, sequence_key, selected_story_key, vote_mode, ai_enabled, capacity_json
    FROM rooms WHERE id = ? LIMIT 1`).bind(roomId).first();
  if (!room) return { state: null, memberCount: 0 };

  const [domainResult, serviceResult, storyResult, allocationResult, memberResult, voteHistoryResult, memberRosterResult, votingMemberResult, roomTeamMemberResult] = await Promise.all([
    db.prepare('SELECT id, name, sort_order FROM domains WHERE room_id = ? ORDER BY sort_order, id').bind(roomId).all(),
    db.prepare('SELECT id, name, domain_id, sort_order FROM services WHERE room_id = ? ORDER BY sort_order, id').bind(roomId).all(),
    db.prepare(`SELECT story_key, type, epic_id, title, url, description, acceptance_json, sort_order,
      manual_estimate, ai_estimate, ai_enabled, saved
      FROM stories WHERE room_id = ? ORDER BY sort_order, story_key`).bind(roomId).all(),
    db.prepare(`SELECT story_key, service_id, allocation_pct
      FROM story_service_allocations WHERE room_id = ? ORDER BY story_key, service_id`).bind(roomId).all(),
    db.prepare('SELECT COUNT(*) AS count FROM room_members WHERE room_id = ?').bind(roomId).first(),
    db.prepare(`SELECT v.story_key, v.round_number, v.account_id, v.manual_estimate, v.ai_estimate, v.ai_enabled, v.updated_at,
        a.display_name, a.email
      FROM votes v
      JOIN planning_rounds pr ON pr.room_id = v.room_id AND pr.story_key = v.story_key AND pr.round_number = v.round_number
      LEFT JOIN accounts a ON a.id = v.account_id
      WHERE v.room_id = ? AND (pr.phase = 'revealed' OR pr.mode = 'open')
        AND (v.manual_estimate IS NOT NULL OR v.ai_estimate IS NOT NULL)
      ORDER BY v.story_key, v.round_number, v.updated_at, v.account_id`).bind(roomId).all(),
    db.prepare(`SELECT rm.account_id, rm.role AS room_role, tm.role AS team_role, a.display_name, a.email
      FROM room_members rm
      LEFT JOIN team_members tm ON tm.account_id = rm.account_id
      LEFT JOIN accounts a ON a.id = rm.account_id
      WHERE rm.room_id = ? ORDER BY COALESCE(tm.role, rm.role) DESC, a.display_name, a.email`).bind(roomId).all(),
    db.prepare(`SELECT rvm.account_id FROM room_voting_members rvm
      JOIN room_members rm ON rm.room_id = rvm.room_id AND rm.account_id = rvm.account_id
      JOIN rooms r ON r.id = rvm.room_id
      LEFT JOIN team_members tm ON tm.account_id = rvm.account_id
      WHERE rvm.room_id = ? AND (r.owner_account_id = rvm.account_id OR COALESCE(tm.role, 'developer') <> 'observer')`).bind(roomId).all(),
    db.prepare(`SELECT t.id AS team_id, t.name AS team_name, tm.account_id
      FROM team_members tm
      JOIN teams t ON t.id = tm.team_id
      JOIN room_members rm ON rm.account_id = tm.account_id AND rm.room_id = ?
      ORDER BY t.name, tm.account_id`).bind(roomId).all(),
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
      epicId: story.epic_id || null,
      title: story.title,
      url: cleanStoryUrl(story.url),
      description: story.description || 'A new story ready for the team to shape and estimate together.',
      acceptance,
      manual: parseScore(story.manual_estimate),
      ai: parseScore(story.ai_estimate),
      aiEnabled: story.ai_enabled === 1,
      saved: story.saved === 1,
      serviceLinks: linksByStory.get(story.story_key) || [],
    };
  });

  const roomTeamsById = new Map();
  const teamByMemberId = new Map();
  rows(roomTeamMemberResult).forEach((member) => {
    const team = roomTeamsById.get(member.team_id) || { id: member.team_id, name: member.team_name, memberIds: new Set() };
    team.memberIds.add(member.account_id);
    roomTeamsById.set(member.team_id, team);
    if (!teamByMemberId.has(member.account_id)) teamByMemberId.set(member.account_id, { id: member.team_id, name: member.team_name });
  });
  const roomTeams = [...roomTeamsById.values()].map((team) => ({ id: team.id, name: team.name, memberCount: team.memberIds.size }));
  const roomMembers = rows(memberRosterResult).map((member) => {
    const team = teamByMemberId.get(member.account_id) || null;
    return {
      id: member.account_id,
      name: member.display_name || member.email?.split('@')[0] || 'Planner',
      email: member.email || '',
      role: member.account_id === room.owner_account_id ? 'owner' : teamMemberRole(member.team_role),
      teamId: team?.id || null,
      teamName: team?.name || null,
    };
  });

  const selectedStoryId = stories.some((story) => story.id === room.selected_story_key)
    ? room.selected_story_key
    : stories[0]?.id || null;
  const votingMemberIds = new Set(rows(votingMemberResult).map((member) => member.account_id));
  const eligibleRoomMemberIds = new Set(roomMembers.filter((member) => member.role !== 'observer').map((member) => member.id));
  let currentRound = null;
  if (selectedStoryId) {
    currentRound = await db.prepare(`SELECT story_key, round_number, phase, mode, revealed_at, timer_ends_at, timer_started_at
      FROM planning_rounds WHERE room_id = ? AND story_key = ?
      ORDER BY round_number DESC LIMIT 1`).bind(roomId, selectedStoryId).first();
  }

  const round = currentRound
    ? {
      phase: ALLOWED_PHASES.has(currentRound.phase) ? currentRound.phase : 'idle',
      mode: currentRound.mode === 'open' ? 'open' : 'hidden',
      hideVoteCountUntilComplete: currentRound.mode === 'hidden-count',
      storyId: currentRound.story_key,
      roundNumber: Number(currentRound.round_number) || 1,
      submittedCount: 0,
      votes: {},
      cardFlipped: false,
      revealedAt: currentRound.revealed_at || null,
      timerStartedAt: currentRound.timer_started_at || (currentRound.timer_ends_at ? new Date(Date.parse(currentRound.timer_ends_at) - 5 * 60 * 1000).toISOString() : null),
      timerEndsAt: currentRound.timer_ends_at || null,
    }
    : {
      phase: 'idle',
      mode: room.vote_mode === 'open' ? 'open' : 'hidden',
      hideVoteCountUntilComplete: room.vote_mode === 'hidden-count',
      storyId: selectedStoryId,
      roundNumber: 1,
      submittedCount: 0,
      votes: {},
      cardFlipped: false,
      revealedAt: null,
      timerStartedAt: null,
      timerEndsAt: null,
    };

  if (currentRound) {
    const participantResult = await db.prepare(`SELECT account_id FROM planning_round_participants
      WHERE room_id = ? AND story_key = ? AND round_number = ?`)
      .bind(roomId, round.storyId, round.roundNumber)
      .all();
    const participantIds = new Set(rows(participantResult).map((participant) => participant.account_id));
    const activeParticipantIds = new Set([...votingMemberIds, ...participantIds].filter((accountId) => eligibleRoomMemberIds.has(accountId)));
    const countRow = await db.prepare(`SELECT COUNT(*) AS count FROM votes v
      JOIN planning_round_participants p ON p.room_id = v.room_id AND p.story_key = v.story_key
        AND p.round_number = v.round_number AND p.account_id = v.account_id
      JOIN room_members rm ON rm.room_id = v.room_id AND rm.account_id = v.account_id
      JOIN rooms r ON r.id = v.room_id
      LEFT JOIN team_members tm ON tm.account_id = v.account_id
      WHERE v.room_id = ? AND v.story_key = ? AND v.round_number = ?
        AND (r.owner_account_id = v.account_id OR COALESCE(tm.role, 'developer') <> 'observer')`)
      .bind(roomId, round.storyId, round.roundNumber)
      .first();
    round.submittedCount = Number(countRow?.count) || 0;

    const voteResult = await db.prepare(`SELECT v.account_id, v.manual_estimate, v.ai_estimate, v.ai_enabled,
        a.display_name, a.email
      FROM votes v LEFT JOIN accounts a ON a.id = v.account_id
      WHERE v.room_id = ? AND v.story_key = ? AND v.round_number = ?
      ORDER BY v.updated_at, v.account_id`).bind(roomId, round.storyId, round.roundNumber).all();
    const voteRows = rows(voteResult);
    const canSeeAllVotes = round.phase === 'revealed' || round.mode === 'open';
    const voteByPlayer = new Map(voteRows.map((vote) => [vote.account_id, vote]));
    round.votes = Object.fromEntries(voteRows
      .filter((vote) => activeParticipantIds.has(vote.account_id) && (canSeeAllVotes || vote.account_id === userId))
      .map((vote) => [vote.account_id, {
        name: vote.display_name || vote.email?.split('@')[0] || 'Planner',
        manual: parseScore(vote.manual_estimate),
        ai: parseScore(vote.ai_estimate),
        aiEnabled: vote.ai_enabled === 1,
      }]));
    round.players = roomMembers.map((member) => {
      const joined = activeParticipantIds.has(member.id);
      const vote = joined ? voteByPlayer.get(member.id) : null;
      const manual = joined ? parseScore(vote?.manual_estimate) : null;
      const ai = joined ? parseScore(vote?.ai_estimate) : null;
      return {
        id: member.id,
        name: member.name,
        role: member.role,
        joined,
        hasVoted: joined && (manual !== null || ai !== null),
        manualSubmitted: joined && manual !== null,
        aiSubmitted: joined && ai !== null,
        manual: canSeeAllVotes || member.id === userId ? manual : null,
        ai: canSeeAllVotes || member.id === userId ? ai : null,
        aiEnabled: vote?.ai_enabled === 1,
      };
    });
  } else {
    round.players = roomMembers.map((member) => ({
      id: member.id,
      name: member.name,
      role: member.role,
      joined: votingMemberIds.has(member.id),
      hasVoted: false,
      manualSubmitted: false,
      aiSubmitted: false,
      manual: null,
      ai: null,
      aiEnabled: false,
    }));
  }

  const voteHistory = rows(voteHistoryResult).map((vote) => ({
    storyId: vote.story_key,
    roundNumber: Number(vote.round_number) || 1,
    voterId: vote.account_id,
    voterName: vote.display_name || vote.email?.split('@')[0] || 'Planner',
    manual: parseScore(vote.manual_estimate),
    ai: parseScore(vote.ai_estimate),
    aiEnabled: vote.ai_enabled === 1,
    updatedAt: vote.updated_at || null,
  }));
  let storedCapacity = {};
  try {
    storedCapacity = JSON.parse(room.capacity_json || '{}');
  } catch {
    storedCapacity = {};
  }
  const capacityRoster = roomMembers
    .filter((member) => member.role !== 'observer')
    .map((member) => ({ id: member.id, name: member.name }));
  const capacity = normalizeCapacity(storedCapacity, capacityRoster);

  return {
    memberCount: Math.max(0, Number(memberResult?.count) || 0),
    room: {
      id: room.id,
      name: room.name,
      piLabel: room.pi_label,
      stateVersion: Number(room.state_version) || 0,
      role: room.owner_account_id === userId ? 'owner' : 'member',
      teamCount: roomTeams.length,
      teams: roomTeams,
      members: roomMembers,
    },
    state: stories.length
      ? {
        resourceModelVersion: 1,
        capacity,
        sequence: ALLOWED_SEQUENCES.has(room.sequence_key) ? room.sequence_key : 'fibonacci',
        roomSettings: {
          aiEnabled: room.ai_enabled !== 0,
          voteMode: room.vote_mode === 'open' ? 'open' : 'hidden',
          hideVoteCountUntilComplete: room.vote_mode === 'hidden-count',
        },
        selectedStoryId,
        stories,
        domains,
        services,
        voteHistory,
        round,
      }
      : null,
  };
}

async function publishRoomStateNow(db, roomId) {
  const streams = ROOM_STREAMS.get(roomId) || new Set();
  const sockets = ROOM_SOCKETS.get(roomId) || new Set();
  if (!streams.size && !sockets.size) return;
  await Promise.all([
    ...[...streams].map(async (subscriber) => {
      try {
        const payload = await readRoomState(db, roomId, subscriber.userId);
        subscriber.controller.enqueue(subscriber.encoder.encode(streamEvent('state', { roomId, ...payload })));
      } catch {
        subscriber.cleanup();
      }
    }),
    ...[...sockets].map(async (subscriber) => {
      try {
        const payload = await readRoomState(db, roomId, subscriber.userId);
        subscriber.send(JSON.stringify({ event: 'state', data: { roomId, ...payload } }));
      } catch {
        subscriber.cleanup();
      }
    }),
  ]);
}

const roomPublicationChains = new Map();

export function publishRoomState(db, roomId) {
  const previous = roomPublicationChains.get(roomId) || Promise.resolve();
  const queued = previous.catch(() => {}).then(() => publishRoomStateNow(db, roomId));
  roomPublicationChains.set(roomId, queued);
  return queued.finally(() => {
    if (roomPublicationChains.get(roomId) === queued) roomPublicationChains.delete(roomId);
  });
}

export function registerRoomSocket(roomId, subscriber) {
  const sockets = ROOM_SOCKETS.get(roomId) || new Set();
  sockets.add(subscriber);
  ROOM_SOCKETS.set(roomId, sockets);
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    sockets.delete(subscriber);
    if (!sockets.size) ROOM_SOCKETS.delete(roomId);
  };
}

export function closeRoomSubscribers(roomId) {
  for (const subscriber of ROOM_STREAMS.get(roomId) || []) {
    subscriber.cleanup();
    try {
      subscriber.controller.close();
    } catch {
      // The client may already have disconnected.
    }
  }
  ROOM_STREAMS.delete(roomId);
  for (const subscriber of ROOM_SOCKETS.get(roomId) || []) {
    subscriber.cleanup();
    try {
      subscriber.close();
    } catch {
      // The client may already have disconnected.
    }
  }
  ROOM_SOCKETS.delete(roomId);
}

export function createRoomWebSocket(roomId, userId, initialPayload) {
  if (typeof WebSocketPair !== 'function') return null;
  const pair = new WebSocketPair();
  const client = pair[0];
  const server = pair[1];
  server.accept();
  const subscriber = {
    userId,
    send(message) {
      server.send(message);
    },
    close() {
      server.close();
    },
  };
  const unregister = registerRoomSocket(roomId, subscriber);
  subscriber.cleanup = unregister;
  const cleanup = () => unregister();
  server.addEventListener('close', cleanup);
  server.addEventListener('error', cleanup);
  server.addEventListener('message', (event) => {
    if (event.data === 'ping') server.send('pong');
  });
  subscriber.send(JSON.stringify({ event: 'state', data: { roomId, ...initialPayload } }));
  return new Response(null, { status: 101, webSocket: client });
}

export function createRoomStream(roomId, userId, initialPayload) {
  const encoder = new TextEncoder();
  let subscriber;
  const stream = new ReadableStream({
    start(controller) {
      const cleanup = () => {
        if (!subscriber) return;
        clearInterval(subscriber.heartbeat);
        ROOM_STREAMS.get(roomId)?.delete(subscriber);
        if (!ROOM_STREAMS.get(roomId)?.size) ROOM_STREAMS.delete(roomId);
        subscriber = null;
      };
      subscriber = {
        controller,
        encoder,
        userId,
        cleanup,
        heartbeat: setInterval(() => {
          try {
            controller.enqueue(encoder.encode(': keep-alive\n\n'));
          } catch {
            cleanup();
          }
        }, 25000),
      };
      const subscribers = ROOM_STREAMS.get(roomId) || new Set();
      subscribers.add(subscriber);
      ROOM_STREAMS.set(roomId, subscribers);
      controller.enqueue(encoder.encode(streamEvent('state', { roomId, ...initialPayload })));
    },
    cancel() {
      subscriber?.cleanup();
    },
  });
  return stream;
}

export async function readRooms(db, user) {
  const result = user.role === 'admin'
    ? await db.prepare(`SELECT r.id, r.name, r.pi_label, r.owner_account_id,
        COUNT(all_members.account_id) AS member_count,
        (SELECT COUNT(DISTINCT tm.team_id)
          FROM team_members tm JOIN room_members team_members ON team_members.account_id = tm.account_id
          WHERE team_members.room_id = r.id) AS team_count,
        'admin' AS role
      FROM rooms r
      LEFT JOIN room_members all_members ON all_members.room_id = r.id
      GROUP BY r.id, r.name, r.pi_label, r.owner_account_id
      ORDER BY r.updated_at DESC, r.id`).all()
    : await db.prepare(`SELECT r.id, r.name, r.pi_label, r.owner_account_id,
        COUNT(all_members.account_id) AS member_count,
        (SELECT COUNT(DISTINCT tm.team_id)
          FROM team_members tm JOIN room_members team_members ON team_members.account_id = tm.account_id
          WHERE team_members.room_id = r.id) AS team_count,
        mine.role
      FROM rooms r
      JOIN room_members mine ON mine.room_id = r.id AND mine.account_id = ?
      LEFT JOIN room_members all_members ON all_members.room_id = r.id
      GROUP BY r.id, r.name, r.pi_label, r.owner_account_id, mine.role
      ORDER BY r.updated_at DESC, r.id`).bind(user.id).all();
  return rows(result).map((room) => ({
    id: room.id,
    name: room.name,
    piLabel: room.pi_label,
    memberCount: Math.max(0, Number(room.member_count) || 0),
    teamCount: Math.max(0, Number(room.team_count) || 0),
    role: user.role === 'admin' ? 'admin' : room.owner_account_id === user.id ? 'owner' : 'member',
  }));
}

export async function runBatches(db, statements) {
  for (let index = 0; index < statements.length; index += 50) {
    await db.batch(statements.slice(index, index + 50));
  }
}

export async function saveRoomState(db, roomId, input, user) {
  const room = await db.prepare('SELECT state_version, owner_account_id FROM rooms WHERE id = ? LIMIT 1').bind(roomId).first();
  if (!room) {
    const error = new Error('Room not found');
    error.status = 404;
    throw error;
  }
  const memberRosterResult = await db.prepare(`SELECT rm.account_id, rm.role AS room_role, tm.role AS team_role, a.display_name, a.email
    FROM room_members rm
    LEFT JOIN team_members tm ON tm.account_id = rm.account_id
    LEFT JOIN accounts a ON a.id = rm.account_id
    WHERE rm.room_id = ?`).bind(roomId).all();
  const memberRows = rows(memberRosterResult);
  const currentMember = memberRows.find((member) => member.account_id === user.id);
  const currentMemberRole = currentMember
    ? currentMember.account_id === room.owner_account_id ? 'owner' : teamMemberRole(currentMember.team_role)
    : null;
  if (user.role !== 'admin' && currentMemberRole === 'observer') {
    throw authError('Observers have view-only access to this room', 403);
  }
  const capacityRoster = memberRows
    .filter((member) => (member.account_id === room.owner_account_id ? 'owner' : teamMemberRole(member.team_role)) !== 'observer')
    .map((member) => ({
      id: member.account_id,
      name: member.display_name || member.email?.split('@')[0] || 'Planner',
    }));
  const source = normalizeStateInput(input, capacityRoster);
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

  const currentVersion = Number(room.state_version) || 0;
  const requestedVersion = Number.isInteger(Number(input?.stateVersion)) && Number(input.stateVersion) >= 0
    ? Number(input.stateVersion)
    : currentVersion;
  if (requestedVersion !== currentVersion) {
    const error = new Error('This room changed elsewhere. Your latest changes will be merged and retried.');
    error.status = 409;
    throw error;
  }

  const currentRound = await db.prepare(`SELECT story_key, round_number, phase, mode, revealed_at, timer_ends_at, timer_started_at
    FROM planning_rounds WHERE room_id = ? AND story_key = ? ORDER BY round_number DESC LIMIT 1`)
    .bind(roomId, source.round.storyId)
    .first();
  const roundChanged = currentRound
    ? currentRound.story_key !== source.round.storyId
      || Number(currentRound.round_number) !== source.round.roundNumber
      || currentRound.phase !== source.round.phase
      || currentRound.mode !== source.round.storageMode
      || (currentRound.revealed_at || null) !== (source.round.revealedAt || null)
      || (currentRound.timer_started_at || null) !== (source.round.timerStartedAt || null)
    : source.round.phase !== 'idle' || source.round.timerEndsAt !== null;
  if (roundChanged && !(await canManageRoom(db, roomId, user))) {
    throw authError('Only the room owner or an admin can manage the voting round', 403);
  }

  const now = new Date().toISOString();
  const reservation = await db.prepare(`UPDATE rooms
    SET state_version = state_version + 1, sequence_key = ?, selected_story_key = ?, vote_mode = ?, ai_enabled = ?, capacity_json = ?, updated_at = ?
    WHERE id = ? AND state_version = ?`)
    .bind(source.sequence, source.selectedStoryId, source.round.storageMode, source.roomSettings.aiEnabled ? 1 : 0, JSON.stringify(source.capacity), now, roomId, currentVersion)
    .run();
  if (Number(reservation?.meta?.changes) !== 1) {
    const error = new Error('This room changed elsewhere. Your latest changes will be merged and retried.');
    error.status = 409;
    throw error;
  }

  const storyIds = source.stories.map((story) => story.id);
  const serviceIds = source.services.map((service) => service.id);
  const domainIds = source.domains.map((domain) => domain.id);
  const placeholders = (items) => items.length ? items.map(() => '?').join(', ') : '';
  const statements = [
    ...(domainIds.length
      ? [db.prepare(`DELETE FROM domains WHERE room_id = ? AND id NOT IN (${placeholders(domainIds)})`).bind(roomId, ...domainIds)]
      : [db.prepare('DELETE FROM domains WHERE room_id = ?').bind(roomId)]),
    ...(serviceIds.length
      ? [db.prepare(`DELETE FROM services WHERE room_id = ? AND id NOT IN (${placeholders(serviceIds)})`).bind(roomId, ...serviceIds)]
      : [db.prepare('DELETE FROM services WHERE room_id = ?').bind(roomId)]),
    ...(storyIds.length
      ? [
        db.prepare(`DELETE FROM votes WHERE room_id = ? AND story_key NOT IN (${placeholders(storyIds)})`).bind(roomId, ...storyIds),
        db.prepare(`DELETE FROM planning_round_participants WHERE room_id = ? AND story_key NOT IN (${placeholders(storyIds)})`).bind(roomId, ...storyIds),
        db.prepare(`DELETE FROM planning_rounds WHERE room_id = ? AND story_key NOT IN (${placeholders(storyIds)})`).bind(roomId, ...storyIds),
        db.prepare(`DELETE FROM story_service_allocations WHERE room_id = ? AND story_key NOT IN (${placeholders(storyIds)})`).bind(roomId, ...storyIds),
        db.prepare(`DELETE FROM stories WHERE room_id = ? AND story_key NOT IN (${placeholders(storyIds)})`).bind(roomId, ...storyIds),
      ]
      : [
        db.prepare('DELETE FROM votes WHERE room_id = ?').bind(roomId),
        db.prepare('DELETE FROM planning_round_participants WHERE room_id = ?').bind(roomId),
        db.prepare('DELETE FROM planning_rounds WHERE room_id = ?').bind(roomId),
        db.prepare('DELETE FROM story_service_allocations WHERE room_id = ?').bind(roomId),
        db.prepare('DELETE FROM stories WHERE room_id = ?').bind(roomId),
      ]),
    ...source.domains.map((domain, index) => db.prepare(`INSERT INTO domains (room_id, id, name, sort_order)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(room_id, id) DO UPDATE SET name = excluded.name, sort_order = excluded.sort_order`)
      .bind(roomId, domain.id, domain.name, index)),
    ...source.services.map((service, index) => db.prepare(`INSERT INTO services (room_id, id, name, domain_id, sort_order, active)
      VALUES (?, ?, ?, ?, ?, 1)
      ON CONFLICT(room_id, id) DO UPDATE SET name = excluded.name, domain_id = excluded.domain_id, sort_order = excluded.sort_order, active = 1`)
      .bind(roomId, service.id, service.name, service.domainId || null, index)),
    ...source.stories.map((story, index) => db.prepare(`INSERT INTO stories
      (room_id, story_key, type, epic_id, title, url, description, acceptance_json, sort_order, manual_estimate, ai_estimate, ai_enabled, saved)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(room_id, story_key) DO UPDATE SET type = excluded.type, title = excluded.title,
        epic_id = excluded.epic_id, url = excluded.url, description = excluded.description, acceptance_json = excluded.acceptance_json, sort_order = excluded.sort_order,
        manual_estimate = excluded.manual_estimate, ai_estimate = excluded.ai_estimate,
        ai_enabled = excluded.ai_enabled, saved = excluded.saved`)
      .bind(roomId, story.id, story.type, story.epicId, story.title, story.url || null, story.description, JSON.stringify(story.acceptance), index,
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
      (room_id, story_key, round_number, phase, mode, submitted_count, revealed_at, timer_ends_at, timer_started_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
      ON CONFLICT(room_id, story_key, round_number) DO UPDATE SET phase = excluded.phase,
        mode = excluded.mode, revealed_at = excluded.revealed_at, timer_ends_at = excluded.timer_ends_at, timer_started_at = excluded.timer_started_at, updated_at = excluded.updated_at`)
      .bind(roomId, source.round.storyId, source.round.roundNumber, source.round.phase, source.round.storageMode, source.round.revealedAt, source.round.timerEndsAt, source.round.timerStartedAt, now));
    if (source.round.phase === 'voting') {
      statements.push(db.prepare(`INSERT INTO planning_round_participants
        (room_id, story_key, round_number, account_id, joined_at)
        SELECT rvm.room_id, ?, ?, rvm.account_id, rvm.joined_at
        FROM room_voting_members rvm
         JOIN room_members rm ON rm.room_id = rvm.room_id AND rm.account_id = rvm.account_id
         JOIN rooms r ON r.id = rvm.room_id
         LEFT JOIN team_members tm ON tm.account_id = rvm.account_id
         WHERE rvm.room_id = ?
           AND (r.owner_account_id = rvm.account_id OR COALESCE(tm.role, 'developer') <> 'observer')
         ON CONFLICT DO NOTHING`)
        .bind(source.round.storyId, source.round.roundNumber, roomId));
    }
  }

  await runBatches(db, statements);
}

export async function createRoom(db, user, input) {
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
    db.prepare(`INSERT INTO rooms (id, name, pi_label, owner_account_id, sequence_key, selected_story_key, vote_mode, ai_enabled, capacity_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'fibonacci', NULL, 'hidden', 1, '{}', ?, ?)`)
      .bind(roomId, name, piLabel, user.id, now, now),
    db.prepare(`INSERT INTO room_members (room_id, account_id, role, created_at)
      VALUES (?, ?, 'owner', ?)`)
      .bind(roomId, user.id, now),
  ]);
  await saveRoomState(db, roomId, input?.state || {}, user);
  return readRoomState(db, roomId, user.id);
}

export async function updateRoom(db, user, roomId, input) {
  if (!roomId || !ROOM_ID_PATTERN.test(roomId)) throw authError('The room to update is invalid', 400);
  await requireRoomManager(db, roomId, user);
  const current = await db.prepare('SELECT name, pi_label FROM rooms WHERE id = ? LIMIT 1').bind(roomId).first();
  const name = cleanText(input?.name, current?.name || '', 80);
  const piLabel = cleanText(input?.piLabel, current?.pi_label || '', 40);
  if (!name || !piLabel) throw authError('Room name and increment label are required', 400);
  await db.prepare(`UPDATE rooms
    SET name = ?, pi_label = ?, state_version = state_version + 1, updated_at = ?
    WHERE id = ?`).bind(name, piLabel, new Date().toISOString(), roomId).run();
  return readRoomState(db, roomId, user.id);
}

export async function removeRoomMember(db, user, roomId, accountId) {
  if (!roomId || !ROOM_ID_PATTERN.test(roomId)) throw authError('The room is invalid', 400);
  const targetAccountId = cleanId(accountId);
  if (!targetAccountId) throw authError('The member is invalid', 400);
  await requireRoomManager(db, roomId, user);
  const room = await db.prepare('SELECT owner_account_id FROM rooms WHERE id = ? LIMIT 1').bind(roomId).first();
  const member = await db.prepare('SELECT account_id FROM room_members WHERE room_id = ? AND account_id = ? LIMIT 1')
    .bind(roomId, targetAccountId).first();
  if (!member) throw authError('Room member not found', 404);
  if (room?.owner_account_id === targetAccountId) throw authError('Transfer room ownership before removing the owner', 409);
  const now = new Date().toISOString();
  await db.batch([
    db.prepare('DELETE FROM votes WHERE room_id = ? AND account_id = ?').bind(roomId, targetAccountId),
    db.prepare('DELETE FROM planning_round_participants WHERE room_id = ? AND account_id = ?').bind(roomId, targetAccountId),
    db.prepare('DELETE FROM room_voting_members WHERE room_id = ? AND account_id = ?').bind(roomId, targetAccountId),
    db.prepare('DELETE FROM room_members WHERE room_id = ? AND account_id = ?').bind(roomId, targetAccountId),
    db.prepare('UPDATE rooms SET state_version = state_version + 1, updated_at = ? WHERE id = ?').bind(now, roomId),
  ]);
  return readRoomState(db, roomId, user.id);
}

export async function removeRoomTeam(db, user, roomId, teamId) {
  if (!roomId || !ROOM_ID_PATTERN.test(roomId)) throw authError('The room is invalid', 400);
  const targetTeamId = cleanId(teamId);
  if (!targetTeamId) throw authError('The team is invalid', 400);
  await requireRoomManager(db, roomId, user);
  const room = await db.prepare('SELECT owner_account_id FROM rooms WHERE id = ? LIMIT 1').bind(roomId).first();
  const team = await db.prepare(`SELECT t.id, t.name
    FROM teams t
    JOIN team_members tm ON tm.team_id = t.id
    JOIN room_members rm ON rm.account_id = tm.account_id AND rm.room_id = ?
    WHERE t.id = ? LIMIT 1`).bind(roomId, targetTeamId).first();
  if (!team) throw authError('That team is not included in this room', 404);
  const ownerInTeam = room?.owner_account_id
    ? await db.prepare('SELECT 1 AS present FROM team_members WHERE team_id = ? AND account_id = ? LIMIT 1')
      .bind(targetTeamId, room.owner_account_id).first()
    : null;
  if (ownerInTeam) throw authError('Transfer room ownership before removing the owner\'s team', 409);
  const now = new Date().toISOString();
  const teamAccounts = 'SELECT account_id FROM team_members WHERE team_id = ?';
  await db.batch([
    db.prepare(`DELETE FROM votes WHERE room_id = ? AND account_id IN (${teamAccounts})`).bind(roomId, targetTeamId),
    db.prepare(`DELETE FROM planning_round_participants WHERE room_id = ? AND account_id IN (${teamAccounts})`).bind(roomId, targetTeamId),
    db.prepare(`DELETE FROM room_voting_members WHERE room_id = ? AND account_id IN (${teamAccounts})`).bind(roomId, targetTeamId),
    db.prepare(`DELETE FROM room_members
      WHERE room_id = ? AND account_id IN (${teamAccounts}) AND account_id <> COALESCE((SELECT owner_account_id FROM rooms WHERE id = ?), '')`)
      .bind(roomId, targetTeamId, roomId),
    db.prepare('UPDATE rooms SET state_version = state_version + 1, updated_at = ? WHERE id = ?').bind(now, roomId),
  ]);
  return readRoomState(db, roomId, user.id);
}

export async function deleteRoom(db, user, roomId) {
  if (!roomId || !ROOM_ID_PATTERN.test(roomId)) {
    const error = new Error('The room to delete is invalid');
    error.status = 400;
    throw error;
  }
  const room = await db.prepare('SELECT id, owner_account_id FROM rooms WHERE id = ? LIMIT 1').bind(roomId).first();
  if (!room) {
    const error = new Error('Room not found');
    error.status = 404;
    throw error;
  }
  if (user.role !== 'admin' && room.owner_account_id !== user.id) {
    const error = new Error('Only the room owner can delete this room');
    error.status = 403;
    throw error;
  }
  const roomCount = await db.prepare('SELECT COUNT(*) AS count FROM rooms').first();
  if (Number(roomCount?.count) <= 1) {
    const error = new Error('Keep at least one planning room available');
    error.status = 400;
    throw error;
  }
  await db.batch([
    db.prepare('DELETE FROM votes WHERE room_id = ?').bind(roomId),
    db.prepare('DELETE FROM planning_round_participants WHERE room_id = ?').bind(roomId),
    db.prepare('DELETE FROM planning_rounds WHERE room_id = ?').bind(roomId),
    db.prepare('DELETE FROM story_service_allocations WHERE room_id = ?').bind(roomId),
    db.prepare('DELETE FROM stories WHERE room_id = ?').bind(roomId),
    db.prepare('DELETE FROM services WHERE room_id = ?').bind(roomId),
    db.prepare('DELETE FROM domains WHERE room_id = ?').bind(roomId),
    db.prepare('DELETE FROM room_invites WHERE room_id = ?').bind(roomId),
    db.prepare('DELETE FROM room_members WHERE room_id = ?').bind(roomId),
    user.role === 'admin'
      ? db.prepare('DELETE FROM rooms WHERE id = ?').bind(roomId)
      : db.prepare('DELETE FROM rooms WHERE id = ? AND owner_account_id = ?').bind(roomId, user.id),
  ]);
  closeRoomSubscribers(roomId);
  return { ok: true, roomId };
}

