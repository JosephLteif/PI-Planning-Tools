import { authError, cleanText, makeId, rows } from './common.js';

function requireTeamManager(team, user) {
  if (user.role !== 'admin' && team.owner_account_id !== user.id) {
    throw authError('Only the team owner or a workspace admin can manage team members', 403);
  }
}

async function readUpdatedTeam(db, userId, teamId) {
  const teams = await readTeams(db, userId);
  return teams.find((team) => team.id === teamId) || null;
}

export async function assertSingleTeamMembership(db, accountId, excludedTeamId = null) {
  const membership = excludedTeamId
    ? await db.prepare('SELECT team_id FROM team_members WHERE account_id = ? AND team_id <> ? LIMIT 1').bind(accountId, excludedTeamId).first()
    : await db.prepare('SELECT team_id FROM team_members WHERE account_id = ? LIMIT 1').bind(accountId).first();
  if (membership) throw authError('Each person can belong to only one team', 409);
}

export async function addTeamMember(db, user, teamId, accountId) {
  const team = await db.prepare('SELECT owner_account_id FROM teams WHERE id = ? LIMIT 1').bind(teamId).first();
  if (!team) throw authError('Team not found', 404);
  requireTeamManager(team, user);
  const account = await db.prepare('SELECT id FROM accounts WHERE id = ? AND disabled = 0 LIMIT 1').bind(accountId).first();
  if (!account) throw authError('Member not found', 404);
  await assertSingleTeamMembership(db, accountId, teamId);
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(`INSERT INTO team_members (team_id, account_id, role, created_at)
      VALUES (?, ?, 'member', ?) ON CONFLICT DO NOTHING`).bind(teamId, accountId, now),
    db.prepare('UPDATE teams SET updated_at = ? WHERE id = ?').bind(now, teamId),
  ]);
  return readUpdatedTeam(db, user.id, teamId);
}

export async function removeTeamMember(db, user, teamId, accountId) {
  const team = await db.prepare('SELECT owner_account_id FROM teams WHERE id = ? LIMIT 1').bind(teamId).first();
  if (!team) throw authError('Team not found', 404);
  requireTeamManager(team, user);
  const member = await db.prepare('SELECT role FROM team_members WHERE team_id = ? AND account_id = ? LIMIT 1')
    .bind(teamId, accountId)
    .first();
  if (!member) throw authError('Team member not found', 404);
  if (team.owner_account_id === accountId || member.role === 'owner') {
    throw authError('Transfer ownership before removing the current owner', 409);
  }
  await db.batch([
    db.prepare('DELETE FROM team_members WHERE team_id = ? AND account_id = ?').bind(teamId, accountId),
    db.prepare('UPDATE teams SET updated_at = ? WHERE id = ?').bind(new Date().toISOString(), teamId),
  ]);
  return readUpdatedTeam(db, user.id, teamId);
}

export async function promoteTeamOwner(db, user, teamId, accountId) {
  const team = await db.prepare('SELECT owner_account_id FROM teams WHERE id = ? LIMIT 1').bind(teamId).first();
  if (!team) throw authError('Team not found', 404);
  requireTeamManager(team, user);
  const member = await db.prepare('SELECT role FROM team_members WHERE team_id = ? AND account_id = ? LIMIT 1')
    .bind(teamId, accountId)
    .first();
  if (!member) throw authError('Team member not found', 404);
  if (team.owner_account_id === accountId && member.role === 'owner') return readUpdatedTeam(db, user.id, teamId);
  const now = new Date().toISOString();
  await db.batch([
    db.prepare("UPDATE team_members SET role = 'member' WHERE team_id = ? AND account_id = ?").bind(teamId, team.owner_account_id),
    db.prepare("UPDATE team_members SET role = 'owner' WHERE team_id = ? AND account_id = ?").bind(teamId, accountId),
    db.prepare('UPDATE teams SET owner_account_id = ?, updated_at = ? WHERE id = ?').bind(accountId, now, teamId),
  ]);
  return readUpdatedTeam(db, user.id, teamId);
}

export async function deleteTeam(db, user, teamId) {
  const team = await db.prepare('SELECT owner_account_id FROM teams WHERE id = ? LIMIT 1').bind(teamId).first();
  if (!team) throw authError('Team not found', 404);
  requireTeamManager(team, user);
  await db.batch([
    db.prepare('DELETE FROM room_invites WHERE team_id = ?').bind(teamId),
    db.prepare('DELETE FROM team_members WHERE team_id = ?').bind(teamId),
    db.prepare('DELETE FROM teams WHERE id = ?').bind(teamId),
  ]);
  return { ok: true, teamId };
}

export async function readTeams(db, userId) {
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

export async function createTeam(db, user, input) {
  const name = cleanText(input?.name, '', 80);
  if (!name) throw authError('Team name is required', 400);
  await assertSingleTeamMembership(db, user.id);
  const teamId = makeId('team');
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(`INSERT INTO teams (id, name, owner_account_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)`).bind(teamId, name, user.id, now, now),
    db.prepare(`INSERT INTO team_members (team_id, account_id, role, created_at)
      VALUES (?, ?, 'owner', ?)`).bind(teamId, user.id, now),
  ]);
  return readUpdatedTeam(db, user.id, teamId);
}
