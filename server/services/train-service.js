import { authError, cleanText, makeId, rows } from './common.js';
import { readTeams } from './team-service.js';

function requireTrainManager(user) {
  if (user.role !== 'admin') throw authError('Only a workspace admin can manage trains', 403);
}

async function readTrain(db, trainId) {
  const train = await db.prepare('SELECT id, name FROM trains WHERE id = ? LIMIT 1').bind(trainId).first();
  if (!train) return null;
  const result = await db.prepare(`SELECT t.id, t.name, COUNT(tm.account_id) AS member_count
    FROM teams t
    LEFT JOIN team_members tm ON tm.team_id = t.id
    WHERE t.train_id = ?
    GROUP BY t.id, t.name
    ORDER BY t.name, t.id`).bind(trainId).all();
  const teams = rows(result).map((team) => ({
    id: team.id,
    name: team.name,
    memberCount: Math.max(0, Number(team.member_count) || 0),
  }));
  return { id: train.id, name: train.name, teamCount: teams.length, teams };
}

async function readUpdatedTeam(db, user, teamId) {
  const teams = await readTeams(db, user.id, user.role === 'admin');
  return teams.find((team) => team.id === teamId) || null;
}

export async function readTrains(db) {
  const result = await db.prepare('SELECT id FROM trains ORDER BY updated_at DESC, id').all();
  return Promise.all(rows(result).map((train) => readTrain(db, train.id)));
}

export async function createTrain(db, user, input) {
  requireTrainManager(user);
  const name = cleanText(input?.name, '', 80);
  if (!name) throw authError('Train name is required', 400);
  const trainId = makeId('train');
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO trains (id, name, created_at, updated_at)
    VALUES (?, ?, ?, ?)`).bind(trainId, name, now, now).run();
  return readTrain(db, trainId);
}

export async function deleteTrain(db, user, trainId) {
  requireTrainManager(user);
  const train = await db.prepare('SELECT id FROM trains WHERE id = ? LIMIT 1').bind(trainId).first();
  if (!train) throw authError('Train not found', 404);
  const teamResult = await db.prepare('SELECT id FROM teams WHERE train_id = ?').bind(trainId).all();
  const teamIds = rows(teamResult).map((team) => team.id);
  const now = new Date().toISOString();
  await db.batch([
    db.prepare('UPDATE teams SET train_id = NULL, updated_at = ? WHERE train_id = ?').bind(now, trainId),
    db.prepare('DELETE FROM trains WHERE id = ?').bind(trainId),
  ]);
  return { ok: true, trainId, teamIds };
}

export async function addTeamToTrain(db, user, trainId, teamId) {
  requireTrainManager(user);
  const train = await db.prepare('SELECT id FROM trains WHERE id = ? LIMIT 1').bind(trainId).first();
  if (!train) throw authError('Train not found', 404);
  const team = await db.prepare('SELECT train_id FROM teams WHERE id = ? LIMIT 1').bind(teamId).first();
  if (!team) throw authError('Team not found', 404);
  if (team.train_id && team.train_id !== trainId) throw authError('Each team can belong to only one train', 409);
  if (team.train_id !== trainId) {
    await db.prepare('UPDATE teams SET train_id = ?, updated_at = ? WHERE id = ?')
      .bind(trainId, new Date().toISOString(), teamId)
      .run();
  }
  return { ok: true, train: await readTrain(db, trainId), team: await readUpdatedTeam(db, user, teamId) };
}

export async function removeTeamFromTrain(db, user, trainId, teamId) {
  requireTrainManager(user);
  const team = await db.prepare('SELECT train_id FROM teams WHERE id = ? LIMIT 1').bind(teamId).first();
  if (!team) throw authError('Team not found', 404);
  if (team.train_id !== trainId) throw authError('Team is not part of this train', 404);
  await db.prepare('UPDATE teams SET train_id = NULL, updated_at = ? WHERE id = ?')
    .bind(new Date().toISOString(), teamId)
    .run();
  return { ok: true, train: await readTrain(db, trainId), team: await readUpdatedTeam(db, user, teamId) };
}
