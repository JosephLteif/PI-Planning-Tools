import { authError, rows } from './common.js';

const BACKUP_FORMAT = 'pointline-backup';
const BACKUP_VERSION = 1;
const TABLES = [
  'accounts',
  'rooms',
  'roomMembers',
  'teams',
  'teamMembers',
  'roomInvites',
  'domains',
  'services',
  'stories',
  'storyServiceAllocations',
  'planningRounds',
  'planningRoundParticipants',
  'roomVotingMembers',
  'votes',
];
const TABLE_LIMITS = {
  accounts: 10_000,
  rooms: 5_000,
  roomMembers: 100_000,
  teams: 5_000,
  teamMembers: 100_000,
  roomInvites: 100_000,
  domains: 100_000,
  services: 100_000,
  stories: 500_000,
  storyServiceAllocations: 1_000_000,
  planningRounds: 1_000_000,
  planningRoundParticipants: 1_000_000,
  roomVotingMembers: 100_000,
  votes: 1_000_000,
};
const TABLE_SQL_NAMES = {
  roomMembers: 'room_members',
  teamMembers: 'team_members',
  roomInvites: 'room_invites',
  storyServiceAllocations: 'story_service_allocations',
  planningRounds: 'planning_rounds',
  planningRoundParticipants: 'planning_round_participants',
  roomVotingMembers: 'room_voting_members',
};

function tableName(key) {
  return TABLE_SQL_NAMES[key] || key;
}

function requireBackupArray(backup, key) {
  if (!Array.isArray(backup[key])) throw authError(`Backup field "${key}" must be an array`, 400);
  if (backup[key].length > TABLE_LIMITS[key]) throw authError(`Backup field "${key}" exceeds the supported limit`, 413);
  return backup[key];
}

function required(record, field, table) {
  if (!record || record[field] === undefined) throw authError(`Backup record in "${table}" is missing "${field}"`, 400);
  return record[field];
}

function prepareInsert(db, sql, record, fields, table) {
  return db.prepare(sql).bind(...fields.map((field) => required(record, field, table)));
}

async function runBatches(db, statements) {
  for (let index = 0; index < statements.length; index += 50) {
    await db.batch(statements.slice(index, index + 50));
  }
}

export async function exportBackup(db) {
  const data = {};
  await Promise.all(TABLES.map(async (key) => {
    data[key] = rows(await db.prepare(`SELECT * FROM ${tableName(key)}`).all());
  }));
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    sessions: 'excluded',
    data,
  };
}

function validateBackup(input) {
  if (!input || input.format !== BACKUP_FORMAT || input.version !== BACKUP_VERSION || !input.data || typeof input.data !== 'object') {
    throw authError(`Unsupported Pointline backup. Expected ${BACKUP_FORMAT} version ${BACKUP_VERSION}.`, 400);
  }
  const data = {};
  TABLES.forEach((key) => {
    data[key] = requireBackupArray(input.data, key);
  });
  return data;
}

async function buildAccountIdMap(db, accounts) {
  const existing = rows(await db.prepare('SELECT id, username FROM accounts WHERE username IS NOT NULL').all());
  const existingByUsername = new Map(existing.map((account) => [account.username, account.id]));
  const sourceByUsername = new Map();
  const accountIdMap = new Map();
  for (const account of accounts) {
    if (account.username) {
      const previousId = sourceByUsername.get(account.username);
      if (previousId && previousId !== account.id) {
        throw authError(`Backup contains duplicate username "${account.username}"`, 400);
      }
      sourceByUsername.set(account.username, account.id);
    }
    accountIdMap.set(account.id, existingByUsername.get(account.username) || account.id);
  }
  return accountIdMap;
}

function remapAccountReferences(data, accountIdMap) {
  const remap = (value) => value ? accountIdMap.get(value) || value : value;
  return {
    ...data,
    accounts: data.accounts.map((record) => ({ ...record, id: remap(record.id) })),
    rooms: data.rooms.map((record) => ({ ...record, owner_account_id: remap(record.owner_account_id) })),
    teams: data.teams.map((record) => ({ ...record, owner_account_id: remap(record.owner_account_id) })),
    roomMembers: data.roomMembers.map((record) => ({ ...record, account_id: remap(record.account_id) })),
    teamMembers: data.teamMembers.map((record) => ({ ...record, account_id: remap(record.account_id) })),
    roomInvites: data.roomInvites.map((record) => ({ ...record, created_by: remap(record.created_by) })),
    planningRoundParticipants: data.planningRoundParticipants.map((record) => ({ ...record, account_id: remap(record.account_id) })),
    roomVotingMembers: data.roomVotingMembers.map((record) => ({ ...record, account_id: remap(record.account_id) })),
    votes: data.votes.map((record) => ({ ...record, account_id: remap(record.account_id) })),
    stories: data.stories.map((record) => ({ ...record, stretch: record.stretch === true || Number(record.stretch) === 1 ? 1 : 0 })),
  };
}

export async function importBackup(db, input) {
  const validated = validateBackup(input);
  const data = remapAccountReferences(validated, await buildAccountIdMap(db, validated.accounts));

  const statements = [
    ...data.accounts.map((record) => prepareInsert(db, `INSERT INTO accounts
      (id, email, display_name, username, password_hash, password_salt, role, disabled, last_login_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET email = excluded.email, display_name = excluded.display_name,
        username = excluded.username, password_hash = excluded.password_hash, password_salt = excluded.password_salt,
        role = excluded.role, disabled = excluded.disabled, last_login_at = excluded.last_login_at,
        created_at = excluded.created_at, updated_at = excluded.updated_at`, record,
      ['id', 'email', 'display_name', 'username', 'password_hash', 'password_salt', 'role', 'disabled', 'last_login_at', 'created_at', 'updated_at'], 'accounts')),
    ...data.rooms.map((record) => prepareInsert(db, `INSERT INTO rooms
      (id, name, pi_label, owner_account_id, state_version, sequence_key, selected_story_key, vote_mode, ai_enabled, capacity_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, pi_label = excluded.pi_label,
        owner_account_id = excluded.owner_account_id, state_version = excluded.state_version,
        sequence_key = excluded.sequence_key, selected_story_key = excluded.selected_story_key,
        vote_mode = excluded.vote_mode, ai_enabled = excluded.ai_enabled, capacity_json = excluded.capacity_json,
        created_at = excluded.created_at, updated_at = excluded.updated_at`, record,
      ['id', 'name', 'pi_label', 'owner_account_id', 'state_version', 'sequence_key', 'selected_story_key', 'vote_mode', 'ai_enabled', 'capacity_json', 'created_at', 'updated_at'], 'rooms')),
    ...data.teams.map((record) => prepareInsert(db, `INSERT INTO teams
      (id, name, owner_account_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, owner_account_id = excluded.owner_account_id,
        created_at = excluded.created_at, updated_at = excluded.updated_at`, record,
      ['id', 'name', 'owner_account_id', 'created_at', 'updated_at'], 'teams')),
    ...data.roomMembers.map((record) => prepareInsert(db, `INSERT INTO room_members
      (room_id, account_id, role, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(room_id, account_id) DO UPDATE SET role = excluded.role, created_at = excluded.created_at`, record,
      ['room_id', 'account_id', 'role', 'created_at'], 'roomMembers')),
    ...data.teamMembers.map((record) => prepareInsert(db, `INSERT INTO team_members
      (team_id, account_id, role, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(team_id, account_id) DO UPDATE SET role = excluded.role, created_at = excluded.created_at`, record,
      ['team_id', 'account_id', 'role', 'created_at'], 'teamMembers')),
    ...data.domains.map((record) => prepareInsert(db, `INSERT INTO domains
      (room_id, id, name, sort_order)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(room_id, id) DO UPDATE SET name = excluded.name, sort_order = excluded.sort_order`, record,
      ['room_id', 'id', 'name', 'sort_order'], 'domains')),
    ...data.services.map((record) => prepareInsert(db, `INSERT INTO services
      (room_id, id, name, domain_id, sort_order, active)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(room_id, id) DO UPDATE SET name = excluded.name, domain_id = excluded.domain_id,
        sort_order = excluded.sort_order, active = excluded.active`, record,
      ['room_id', 'id', 'name', 'domain_id', 'sort_order', 'active'], 'services')),
    ...data.stories.map((record) => prepareInsert(db, `INSERT INTO stories
      (room_id, story_key, type, epic_id, title, url, description, acceptance_json, sort_order, manual_estimate, ai_estimate, ai_enabled, saved, stretch)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(room_id, story_key) DO UPDATE SET type = excluded.type, epic_id = excluded.epic_id,
        title = excluded.title, url = excluded.url, description = excluded.description,
        acceptance_json = excluded.acceptance_json, sort_order = excluded.sort_order,
        manual_estimate = excluded.manual_estimate, ai_estimate = excluded.ai_estimate,
        ai_enabled = excluded.ai_enabled, saved = excluded.saved, stretch = excluded.stretch`, record,
      ['room_id', 'story_key', 'type', 'epic_id', 'title', 'url', 'description', 'acceptance_json', 'sort_order', 'manual_estimate', 'ai_estimate', 'ai_enabled', 'saved', 'stretch'], 'stories')),
    ...data.storyServiceAllocations.map((record) => prepareInsert(db, `INSERT INTO story_service_allocations
      (room_id, story_key, service_id, allocation_pct)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(room_id, story_key, service_id) DO UPDATE SET allocation_pct = excluded.allocation_pct`, record,
      ['room_id', 'story_key', 'service_id', 'allocation_pct'], 'storyServiceAllocations')),
    ...data.planningRounds.map((record) => prepareInsert(db, `INSERT INTO planning_rounds
      (room_id, story_key, round_number, phase, mode, submitted_count, revealed_at, timer_ends_at, timer_started_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(room_id, story_key, round_number) DO UPDATE SET phase = excluded.phase,
        mode = excluded.mode, submitted_count = excluded.submitted_count, revealed_at = excluded.revealed_at,
        timer_ends_at = excluded.timer_ends_at, timer_started_at = excluded.timer_started_at,
        updated_at = excluded.updated_at`, record,
      ['room_id', 'story_key', 'round_number', 'phase', 'mode', 'submitted_count', 'revealed_at', 'timer_ends_at', 'timer_started_at', 'updated_at'], 'planningRounds')),
    ...data.planningRoundParticipants.map((record) => prepareInsert(db, `INSERT INTO planning_round_participants
      (room_id, story_key, round_number, account_id, joined_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(room_id, story_key, round_number, account_id) DO UPDATE SET joined_at = excluded.joined_at`, record,
      ['room_id', 'story_key', 'round_number', 'account_id', 'joined_at'], 'planningRoundParticipants')),
    ...data.roomVotingMembers.map((record) => prepareInsert(db, `INSERT INTO room_voting_members
      (room_id, account_id, joined_at)
      VALUES (?, ?, ?)
      ON CONFLICT(room_id, account_id) DO UPDATE SET joined_at = excluded.joined_at`, record,
      ['room_id', 'account_id', 'joined_at'], 'roomVotingMembers')),
    ...data.votes.map((record) => prepareInsert(db, `INSERT INTO votes
      (room_id, story_key, round_number, account_id, manual_estimate, ai_estimate, ai_enabled, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(room_id, story_key, round_number, account_id) DO UPDATE SET manual_estimate = excluded.manual_estimate,
        ai_estimate = excluded.ai_estimate, ai_enabled = excluded.ai_enabled, updated_at = excluded.updated_at`, record,
      ['room_id', 'story_key', 'round_number', 'account_id', 'manual_estimate', 'ai_estimate', 'ai_enabled', 'updated_at'], 'votes')),
    ...data.roomInvites.map((record) => prepareInsert(db, `INSERT INTO room_invites
      (token, room_id, team_id, kind, created_by, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(token) DO UPDATE SET room_id = excluded.room_id, team_id = excluded.team_id,
        kind = excluded.kind, created_by = excluded.created_by, created_at = excluded.created_at,
        expires_at = excluded.expires_at`, record,
      ['token', 'room_id', 'team_id', 'kind', 'created_by', 'created_at', 'expires_at'], 'roomInvites')),
  ];

  await runBatches(db, statements);
  return {
    ok: true,
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    mode: 'merge',
    sessionsImported: false,
    counts: Object.fromEntries(TABLES.map((key) => [key, data[key].length])),
  };
}
