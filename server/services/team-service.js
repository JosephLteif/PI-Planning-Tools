import { authError, cleanText, makeId, rows } from './common.js';

export async function addTeamMember(db, user, teamId, accountId) {
  const team = await db.prepare('SELECT owner_account_id FROM teams WHERE id = ? LIMIT 1').bind(teamId).first();
  if (!team) throw authError('Team not found', 404);
  if (user.role !== 'admin' && team.owner_account_id !== user.id) {
    throw authError('Only the team owner can manage team members', 403);
  }
  const account = await db.prepare('SELECT id FROM accounts WHERE id = ? AND disabled = 0 LIMIT 1').bind(accountId).first();
  if (!account) throw authError('Member not found', 404);
  await db.prepare(`INSERT INTO team_members (team_id, account_id, role, created_at)
    VALUES (?, ?, 'member', ?) ON CONFLICT DO NOTHING`).bind(teamId, accountId, new Date().toISOString()).run();
  const teams = await readTeams(db, user.id);
  return teams.find((candidate) => candidate.id === teamId) || null;
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
