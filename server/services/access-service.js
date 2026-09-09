import { accountUser, authError, rows } from './common.js';

export async function requireMember(db, roomId, user) {
  if (user?.role === 'admin') {
    const room = await db.prepare('SELECT id FROM rooms WHERE id = ? LIMIT 1').bind(roomId).first();
    if (room) return { role: 'admin' };
  }
  const member = await db.prepare(`SELECT CASE
      WHEN r.owner_account_id = rm.account_id THEN 'owner'
      ELSE COALESCE(tm.role, 'developer')
    END AS role
    FROM room_members rm
    JOIN rooms r ON r.id = rm.room_id
    LEFT JOIN team_members tm ON tm.account_id = rm.account_id
    WHERE rm.room_id = ? AND rm.account_id = ? LIMIT 1`)
    .bind(roomId, user?.id)
    .first();
  if (!member) {
    const error = new Error('You do not have access to this planning room');
    error.status = 403;
    throw error;
  }
  return member;
}
export async function requireTeamMember(db, teamId, userId) {
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

export async function requireRoomManager(db, roomId, user) {
  const room = await db.prepare('SELECT owner_account_id FROM rooms WHERE id = ? LIMIT 1').bind(roomId).first();
  if (!room) throw authError('Room not found', 404);
  if (user?.role === 'admin') return;
  if (room.owner_account_id !== user.id) throw authError('Only the room owner can manage room members', 403);
}

export async function canManageRoom(db, roomId, user) {
  if (user?.role === 'admin') return true;
  const room = await db.prepare('SELECT owner_account_id FROM rooms WHERE id = ? LIMIT 1').bind(roomId).first();
  return room?.owner_account_id === user?.id;
}

export async function readDirectoryUsers(db) {
  const result = await db.prepare(`SELECT id, username, email, display_name, role
    FROM accounts WHERE disabled = 0 AND username IS NOT NULL ORDER BY display_name, username`).all();
  return rows(result).map(accountUser);
}

