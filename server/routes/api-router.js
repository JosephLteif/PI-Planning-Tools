import {
  SESSION_MAX_AGE_SECONDS,
  authError,
  cleanId,
  cleanInviteToken,
  getSessionUser,
  isSecureRequest,
  json,
  parseScore,
  readJson,
  roomIdFromRequest,
  sessionCookie,
} from '../services/common.js';
import {
  createManagedUser,
  deleteManagedUser,
  login,
  logout,
  readAdminUsers,
  requireAdmin,
  updateManagedUser,
} from '../services/auth-service.js';
import { canManageRoom, readDirectoryUsers, requireMember } from '../services/access-service.js';
import { addTeamMember, createTeam, deleteTeam, promoteTeamOwner, readTeams, removeTeamMember, updateTeamMemberRole } from '../services/team-service.js';
import {
  addRoomMembers,
  createRoom,
  createRoomWebSocket,
  createRoomStream,
  deleteRoom,
  joinRoom,
  removeRoomMember,
  removeRoomTeam,
  publishRoomState,
  readDiscoverableRooms,
  readRoomState,
  readRooms,
  saveRoomState,
  updateRoom,
} from '../services/room-service.js';
import { acceptInvite, createInvite, readInvite } from '../services/invite-service.js';
import { exportBackup, importBackup } from '../services/backup-service.js';

export async function handleApiRequest(request, env) {
  if (!env.DB) return json({ error: 'The Pointline database binding is not configured' }, 500);
  const url = new URL(request.url);
  if (url.pathname === '/api/invites' && request.method === 'GET') {
    const invite = await readInvite(env.DB, cleanInviteToken(url.searchParams.get('token')));
    return invite ? json({ invite }) : json({ error: 'This invite link is missing or expired' }, 404);
  }
  if (url.pathname === '/api/auth/login' && request.method === 'POST') {
    const result = await login(env.DB, env, await readJson(request));
    return json({ ok: true, user: result.user }, 200, { 'set-cookie': sessionCookie(result.token, SESSION_MAX_AGE_SECONDS, isSecureRequest(request)) });
  }
  const user = await getSessionUser(env.DB, request);
  if (url.pathname === '/api/auth/logout' && request.method === 'POST') return logout(env.DB, request);
  if (url.pathname === '/api/auth/session' && request.method === 'GET') {
    return user ? json({ user }) : json({ error: 'Sign in required' }, 401);
  }
  if (!user) return json({ error: 'Sign in with your Pointline username and password' }, 401);

  if (url.pathname === '/api/admin/backup' && request.method === 'GET') {
    requireAdmin(user);
    const backup = await exportBackup(env.DB);
    const filename = 'pointline-backup-' + new Date().toISOString().replaceAll(':', '-') + '.json';
    return json(backup, 200, {
      'content-disposition': 'attachment; filename="' + filename + '"',
    });
  }
  if (url.pathname === '/api/admin/backup/import' && request.method === 'POST') {
    requireAdmin(user);
    return json(await importBackup(env.DB, await readJson(request, 50_000_000)));
  }

  const roomId = roomIdFromRequest(request);

  if (url.pathname === '/api/teams' && request.method === 'GET') {
    return json({ teams: await readTeams(env.DB, user.id, user.role === 'admin') });
  }
  if (url.pathname === '/api/teams' && request.method === 'POST') {
    const team = await createTeam(env.DB, user, await readJson(request));
    return json({ ok: true, team }, 201);
  }

  const teamPathMatch = url.pathname.match(/^\/api\/teams\/([^/]+)$/);
  if (teamPathMatch && request.method === 'DELETE') {
    const teamId = decodeURIComponent(teamPathMatch[1]);
    return json(await deleteTeam(env.DB, user, teamId));
  }

  const teamMemberAccountPathMatch = url.pathname.match(/^\/api\/teams\/([^/]+)\/members\/([^/]+)$/);
  if (teamMemberAccountPathMatch && request.method === 'DELETE') {
    const teamId = decodeURIComponent(teamMemberAccountPathMatch[1]);
    const accountId = decodeURIComponent(teamMemberAccountPathMatch[2]);
    const team = await removeTeamMember(env.DB, user, teamId, cleanId(accountId));
    return json({ ok: true, team });
  }
  if (teamMemberAccountPathMatch && (request.method === 'PUT' || request.method === 'PATCH')) {
    const teamId = decodeURIComponent(teamMemberAccountPathMatch[1]);
    const accountId = decodeURIComponent(teamMemberAccountPathMatch[2]);
    const result = await updateTeamMemberRole(env.DB, user, teamId, cleanId(accountId), await readJson(request));
    await Promise.all(result.roomIds.map((roomId) => publishRoomState(env.DB, roomId)));
    return json({ ok: true, ...result });
  }

  const teamOwnerPathMatch = url.pathname.match(/^\/api\/teams\/([^/]+)\/owner$/);
  if (teamOwnerPathMatch && request.method === 'POST') {
    const teamId = decodeURIComponent(teamOwnerPathMatch[1]);
    const input = await readJson(request);
    const team = await promoteTeamOwner(env.DB, user, teamId, cleanId(input?.accountId));
    return json({ ok: true, team });
  }

  const teamMemberPathMatch = url.pathname.match(/^\/api\/teams\/([^/]+)\/members$/);
  if (teamMemberPathMatch && request.method === 'POST') {
    const teamId = decodeURIComponent(teamMemberPathMatch[1]);
    const input = await readJson(request);
    const team = await addTeamMember(env.DB, user, teamId, cleanId(input?.accountId));
    return json({ ok: true, team });
  }

  const roomMemberPathMatch = url.pathname.match(/^\/api\/rooms\/([^/]+)\/members$/);
  if (roomMemberPathMatch && request.method === 'POST') {
    const targetRoomId = decodeURIComponent(roomMemberPathMatch[1]);
    const room = await addRoomMembers(env.DB, user, targetRoomId, await readJson(request));
    await publishRoomState(env.DB, targetRoomId);
    return json({ ok: true, roomId: targetRoomId, ...room });
  }

  const roomMemberAccountPathMatch = url.pathname.match(/^\/api\/rooms\/([^/]+)\/members\/([^/]+)$/);
  if (roomMemberAccountPathMatch && request.method === 'DELETE') {
    const targetRoomId = decodeURIComponent(roomMemberAccountPathMatch[1]);
    const accountId = decodeURIComponent(roomMemberAccountPathMatch[2]);
    const room = await removeRoomMember(env.DB, user, targetRoomId, accountId);
    await publishRoomState(env.DB, targetRoomId);
    return json({ ok: true, roomId: targetRoomId, ...room });
  }

  const roomTeamPathMatch = url.pathname.match(/^\/api\/rooms\/([^/]+)\/teams\/([^/]+)$/);
  if (roomTeamPathMatch && request.method === 'DELETE') {
    const targetRoomId = decodeURIComponent(roomTeamPathMatch[1]);
    const teamId = decodeURIComponent(roomTeamPathMatch[2]);
    const room = await removeRoomTeam(env.DB, user, targetRoomId, teamId);
    await publishRoomState(env.DB, targetRoomId);
    return json({ ok: true, roomId: targetRoomId, ...room });
  }

  if (url.pathname === '/api/directory/users' && request.method === 'GET') {
    return json({ users: await readDirectoryUsers(env.DB) });
  }

  if (url.pathname === '/api/invites/accept' && request.method === 'POST') {
    const input = await readJson(request);
    const result = await acceptInvite(env.DB, user, cleanInviteToken(input.token));
    return json({ ok: true, ...result });
  }

  const roomPathMatch = url.pathname.match(/^\/api\/rooms\/([^/]+)$/);
  if (roomPathMatch && request.method === 'PUT') {
    const targetRoomId = decodeURIComponent(roomPathMatch[1]);
    const room = await updateRoom(env.DB, user, targetRoomId, await readJson(request));
    await publishRoomState(env.DB, targetRoomId);
    return json({ ok: true, roomId: targetRoomId, ...room });
  }
  if (roomPathMatch && request.method === 'DELETE') {
    let targetRoomId = '';
    try {
      targetRoomId = decodeURIComponent(roomPathMatch[1]);
    } catch {
      targetRoomId = '';
    }
    return json(await deleteRoom(env.DB, user, targetRoomId));
  }

  if (url.pathname === '/api/rooms' && request.method === 'GET') {
    return json({ rooms: await readRooms(env.DB, user) });
  }
  if (url.pathname === '/api/rooms/discoverable' && request.method === 'GET') {
    return json(await readDiscoverableRooms(env.DB, user, {
      query: url.searchParams.get('q') || '',
      limit: url.searchParams.get('limit') || '',
      offset: url.searchParams.get('offset') || '',
    }));
  }

  const roomJoinPathMatch = url.pathname.match(/^\/api\/rooms\/([^/]+)\/join$/);
  if (roomJoinPathMatch && request.method === 'POST') {
    const targetRoomId = decodeURIComponent(roomJoinPathMatch[1]);
    const room = await joinRoom(env.DB, user, targetRoomId);
    await publishRoomState(env.DB, targetRoomId);
    return json({ ok: true, roomId: targetRoomId, ...room });
  }

  await requireMember(env.DB, roomId, user);

  if (url.pathname === '/api/me' && request.method === 'GET') {
    const room = await readRoomState(env.DB, roomId, user.id);
    return json({ user, roomId, room: room.room, memberCount: room.memberCount });
  }
  if (url.pathname === '/api/rooms' && request.method === 'POST') {
    const created = await createRoom(env.DB, user, await readJson(request));
    return json({ ok: true, roomId: created.room.id, room: created.room, memberCount: created.memberCount, state: created.state }, 201);
  }
  if (url.pathname === '/api/admin/users' && request.method === 'GET') {
    requireAdmin(user);
    return json({ users: await readAdminUsers(env.DB) });
  }
  if (url.pathname === '/api/admin/users' && request.method === 'POST') {
    const result = await createManagedUser(env.DB, user, await readJson(request));
    return json({ ok: true, ...result }, 201);
  }
  const adminUserPathMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
  if (adminUserPathMatch && request.method === 'DELETE') {
    const accountId = decodeURIComponent(adminUserPathMatch[1]);
    const result = await deleteManagedUser(env.DB, user, accountId);
    return json({ ok: true, ...result });
  }
  if (adminUserPathMatch && (request.method === 'PUT' || request.method === 'PATCH')) {
    const accountId = decodeURIComponent(adminUserPathMatch[1]);
    const result = await updateManagedUser(env.DB, user, accountId, await readJson(request));
    return json({ ok: true, ...result });
  }
  if (url.pathname === '/api/invites' && request.method === 'POST') {
    return json(await createInvite(env.DB, request, user, await readJson(request)), 201);
  }
  if (url.pathname === '/api/state' && request.method === 'GET') {
    const room = await readRoomState(env.DB, roomId, user.id);
    return json({ roomId, ...room });
  }
  if (url.pathname === '/api/state/socket' && request.method === 'GET') {
    const room = await readRoomState(env.DB, roomId, user.id);
    const response = createRoomWebSocket(roomId, user.id, { ...room });
    return response || json({ error: 'WebSocket upgrades are not supported by this runtime' }, 426);
  }
  if (url.pathname === '/api/state/stream' && request.method === 'GET') {
    const room = await readRoomState(env.DB, roomId, user.id);
    return new Response(createRoomStream(roomId, user.id, { ...room }), {
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        'connection': 'keep-alive',
      },
    });
  }
  if (url.pathname === '/api/round/participation' && request.method === 'PUT') {
    const input = await readJson(request);
    const storyId = cleanId(input.storyId);
    const roundNumber = Number(input.roundNumber);
    const targetAccountId = cleanId(input.accountId) || user.id;
    const targetMember = await env.DB.prepare(`SELECT CASE
        WHEN r.owner_account_id = rm.account_id THEN 'owner'
        ELSE COALESCE(tm.role, 'developer')
      END AS role
      FROM room_members rm
      JOIN rooms r ON r.id = rm.room_id
      LEFT JOIN team_members tm ON tm.account_id = rm.account_id
      WHERE rm.room_id = ? AND rm.account_id = ? LIMIT 1`)
      .bind(roomId, targetAccountId).first();
    if (targetMember?.role === 'observer') {
      return json({ error: 'Observers can view this room but cannot join voting rounds' }, 403);
    }
    if (targetAccountId !== user.id && !(await canManageRoom(env.DB, roomId, user))) {
      throw authError('Only the room owner or an admin can remove another voter', 403);
    }
    const round = await env.DB.prepare(`SELECT phase FROM planning_rounds
      WHERE room_id = ? AND story_key = ? AND round_number = ? LIMIT 1`)
      .bind(roomId, storyId, roundNumber)
      .first();
    if (input.joined === true) {
      if (targetAccountId !== user.id) return json({ error: 'Only a voter can join themselves' }, 400);
      if (!round || round.phase !== 'voting') return json({ error: 'Join is available while voting is in progress' }, 409);
      const now = new Date().toISOString();
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO room_voting_members (room_id, account_id, joined_at)
          VALUES (?, ?, ?) ON CONFLICT DO NOTHING`)
          .bind(roomId, user.id, now),
        env.DB.prepare(`INSERT INTO planning_round_participants
          (room_id, story_key, round_number, account_id, joined_at)
          VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`)
          .bind(roomId, storyId, roundNumber, user.id, now),
      ]);
    } else {
      const statements = [env.DB.prepare('DELETE FROM room_voting_members WHERE room_id = ? AND account_id = ?')
        .bind(roomId, targetAccountId)];
      if (round?.phase === 'voting' && storyId && Number.isInteger(roundNumber) && roundNumber > 0) {
        statements.push(
          env.DB.prepare('DELETE FROM votes WHERE room_id = ? AND story_key = ? AND round_number = ? AND account_id = ?')
            .bind(roomId, storyId, roundNumber, targetAccountId),
          env.DB.prepare('DELETE FROM planning_round_participants WHERE room_id = ? AND story_key = ? AND round_number = ? AND account_id = ?')
            .bind(roomId, storyId, roundNumber, targetAccountId),
        );
      }
      await env.DB.batch(statements);
    }
    const room = await readRoomState(env.DB, roomId, user.id);
    await publishRoomState(env.DB, roomId);
    return json({ ok: true, roomId, ...room });
  }
  if (url.pathname === '/api/state' && request.method === 'PUT') {
    await saveRoomState(env.DB, roomId, await readJson(request), user);
    const room = await readRoomState(env.DB, roomId, user.id);
    await publishRoomState(env.DB, roomId);
    return json({ ok: true, roomId, ...room });
  }
  if (url.pathname === '/api/vote' && request.method === 'PUT') {
    const input = await readJson(request);
    const storyId = cleanId(input.storyId);
    const roundNumber = Number(input.roundNumber);
    const member = await env.DB.prepare(`SELECT CASE
        WHEN r.owner_account_id = rm.account_id THEN 'owner'
        ELSE COALESCE(tm.role, 'developer')
      END AS role
      FROM room_members rm
      JOIN rooms r ON r.id = rm.room_id
      LEFT JOIN team_members tm ON tm.account_id = rm.account_id
      WHERE rm.room_id = ? AND rm.account_id = ? LIMIT 1`)
      .bind(roomId, user.id).first();
    if (member?.role === 'observer') {
      return json({ error: 'Observers can view this room but cannot submit votes' }, 403);
    }
    const roomSettings = await env.DB.prepare('SELECT ai_enabled FROM rooms WHERE id = ? LIMIT 1').bind(roomId).first();
    const round = await env.DB.prepare(`SELECT phase FROM planning_rounds
      WHERE room_id = ? AND story_key = ? AND round_number = ? LIMIT 1`)
      .bind(roomId, storyId, roundNumber)
      .first();
    if (!round || round.phase !== 'voting') return json({ error: 'This voting round is no longer accepting votes' }, 409);
    const participant = await env.DB.prepare(`SELECT 1 AS joined FROM planning_round_participants
      WHERE room_id = ? AND story_key = ? AND round_number = ? AND account_id = ? LIMIT 1`)
      .bind(roomId, storyId, roundNumber, user.id)
      .first();
    if (!participant) return json({ error: 'Join this voting round before choosing a card' }, 409);
    const story = await env.DB.prepare('SELECT type FROM stories WHERE room_id = ? AND story_key = ? LIMIT 1')
      .bind(roomId, storyId)
      .first();
    if (!story || story.type === 'Epic') return json({ error: 'Epics are estimated through their linked stories' }, 409);

    const manual = parseScore(input.manual);
    const ai = Number(roomSettings?.ai_enabled) !== 0 ? parseScore(input.ai) : null;
    const aiEnabled = Number(roomSettings?.ai_enabled) !== 0 && input.aiEnabled === true && ai !== null;
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
    const count = await env.DB.prepare(`SELECT COUNT(*) AS count FROM votes v
      JOIN planning_round_participants p ON p.room_id = v.room_id AND p.story_key = v.story_key
        AND p.round_number = v.round_number AND p.account_id = v.account_id
      JOIN room_members rm ON rm.room_id = v.room_id AND rm.account_id = v.account_id
      JOIN rooms r ON r.id = v.room_id
      LEFT JOIN team_members tm ON tm.account_id = v.account_id
      WHERE v.room_id = ? AND v.story_key = ? AND v.round_number = ?
        AND (r.owner_account_id = v.account_id OR COALESCE(tm.role, 'developer') <> 'observer')`).bind(roomId, storyId, roundNumber).first();
    await publishRoomState(env.DB, roomId);
    return json({ ok: true, submittedCount: Number(count?.count) || 0 });
  }
  if (url.pathname === '/api/votes' && request.method === 'DELETE') {
    if (!(await canManageRoom(env.DB, roomId, user))) {
      throw authError('Only the room owner or an admin can clear votes', 403);
    }
    const input = await readJson(request);
    const storyId = cleanId(input.storyId);
    const roundNumber = Number(input.roundNumber);
    await env.DB.prepare('DELETE FROM votes WHERE room_id = ? AND story_key = ? AND round_number = ?')
      .bind(roomId, storyId, roundNumber)
      .run();
    await publishRoomState(env.DB, roomId);
    return json({ ok: true, submittedCount: 0 });
  }
  return json({ error: 'Not found' }, 404);
}

