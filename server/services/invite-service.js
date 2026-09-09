import { ALLOWED_INVITE_KINDS, authError, cleanId, makeId } from './common.js';
import { requireMember, requireTeamMember } from './access-service.js';
import { assertSingleTeamMembership } from './team-service.js';
import { publishRoomState } from './room-service.js';

export async function readInvite(db, token) {
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
export async function createInvite(db, request, user, input) {
  const kind = ALLOWED_INVITE_KINDS.has(input?.kind) ? input.kind : '';
  const roomId = cleanId(input?.roomId);
  const teamId = cleanId(input?.teamId);
  if (!kind || (kind !== 'team' && !roomId) || (kind !== 'room-person' && !teamId)) {
    const error = new Error('Invite target is incomplete');
    error.status = 400;
    throw error;
  }
  if (roomId) await requireMember(db, roomId, user);
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

export async function acceptInvite(db, user, token) {
  const invite = await readInvite(db, token);
  if (!invite) {
    const error = new Error('This invite link is missing or expired');
    error.status = 404;
    throw error;
  }
  const now = new Date().toISOString();
  const statements = [];
  if (invite.kind === 'team') {
    await assertSingleTeamMembership(db, user.id, invite.team.id);
    statements.push(db.prepare(`INSERT INTO team_members (team_id, account_id, role, created_at)
      VALUES (?, ?, 'member', ?) ON CONFLICT DO NOTHING`)
      .bind(invite.team.id, user.id, now));
  } else if (invite.kind === 'room-team') {
    statements.push(db.prepare(`INSERT INTO room_members (room_id, account_id, role, created_at)
      SELECT ?, account_id, 'developer', ? FROM team_members WHERE team_id = ? ON CONFLICT DO NOTHING`)
      .bind(invite.room.id, now, invite.team.id));
    statements.push(db.prepare(`INSERT INTO room_members (room_id, account_id, role, created_at)
      VALUES (?, ?, 'developer', ?) ON CONFLICT DO NOTHING`)
      .bind(invite.room.id, user.id, now));
  } else {
    statements.push(db.prepare(`INSERT INTO room_members (room_id, account_id, role, created_at)
      VALUES (?, ?, 'developer', ?) ON CONFLICT DO NOTHING`)
      .bind(invite.room.id, user.id, now));
  }
  await db.batch(statements);
  if (invite.room?.id) await publishRoomState(db, invite.room.id);
  return { invite, roomId: invite.room?.id || null, teamId: invite.team?.id || null };
}
