const DEFAULT_ROOM_ID = 'pi-24-commerce';
const DEFAULT_ROOM_NAME = 'Commerce platform';
const DEFAULT_PI_LABEL = 'PI 24';
const ALLOWED_SEQUENCES = new Set(['sequential', 'fibonacci', 'modified']);
const ALLOWED_PHASES = new Set(['idle', 'voting', 'revealed']);
const ALLOWED_INVITE_KINDS = new Set(['room-person', 'room-team', 'team']);
const ROOM_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,79}$/i;
const USERNAME_PATTERN = /^[a-z][a-z0-9._-]{2,39}$/;
const SESSION_COOKIE = 'pointline_session';
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_ITERATIONS = 100000;
const MAX_BODY_BYTES = 1_500_000;
const STATIC_ASSETS = new Map();
const ROOM_STREAMS = new Map();

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

function json(body, status = 200, extraHeaders = {}) {
  const headers = new Headers(JSON_HEADERS);
  Object.entries(extraHeaders).forEach(([key, value]) => headers.set(key, value));
  return new Response(JSON.stringify(body), {
    status,
    headers,
  });
}

function streamEvent(event, payload) {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

function accountUser(account) {
  return {
    id: account.id,
    username: account.username || '',
    name: account.display_name || account.username || 'Planner',
    email: account.email || '',
    role: account.role === 'admin' ? 'admin' : 'member',
  };
}

function normalizeUsername(value) {
  return String(value ?? '').trim().toLowerCase();
}

function requestCookie(request, name) {
  const cookieHeader = request.headers.get('cookie') || '';
  for (const part of cookieHeader.split(';')) {
    const [key, ...valueParts] = part.trim().split('=');
    if (key === name) return valueParts.join('=');
  }
  return '';
}

function bytesToBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function bytesToBase64Url(bytes) {
  return bytesToBase64(bytes).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

async function sha256Base64Url(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(digest));
}

async function createPasswordRecord(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const digest = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: PASSWORD_ITERATIONS, hash: 'SHA-256' }, key, 256);
  return { salt: bytesToBase64(salt), hash: bytesToBase64(new Uint8Array(digest)) };
}

async function verifyPassword(password, salt, expectedHash) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const digest = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: base64ToBytes(salt), iterations: PASSWORD_ITERATIONS, hash: 'SHA-256' }, key, 256);
  const actual = new Uint8Array(digest);
  const expected = base64ToBytes(expectedHash);
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) difference |= actual[index] ^ expected[index];
  return difference === 0;
}

async function getSessionUser(db, request) {
  const sessionToken = requestCookie(request, SESSION_COOKIE);
  if (!sessionToken) return null;
  const sessionId = await sha256Base64Url(sessionToken);
  const account = await db.prepare(`SELECT a.id, a.username, a.email, a.display_name, a.role
    FROM sessions s JOIN accounts a ON a.id = s.account_id
    WHERE s.id = ? AND s.expires_at > ? AND a.disabled = 0 LIMIT 1`)
    .bind(sessionId, new Date().toISOString())
    .first();
  return account ? accountUser(account) : null;
}

function sessionCookie(token, maxAge = SESSION_MAX_AGE_SECONDS) {
  return `${SESSION_COOKIE}=${token}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

function authError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
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

function cleanTimer(value) {
  const timer = cleanText(value, '', 80);
  if (!timer || !Number.isFinite(Date.parse(timer))) return null;
  return new Date(timer).toISOString();
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

function normalizeCapacity(source, roster = []) {
  const input = source && typeof source === 'object' ? source : {};
  const defaults = input.defaults && typeof input.defaults === 'object' ? input.defaults : {};
  const percent = (value, fallback) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(1, Math.max(0, number > 1 ? number / 100 : number));
  };
  const members = Array.isArray(input.members) ? input.members.map((member) => ({
    id: cleanId(member?.id || member?.accountId),
    name: cleanText(member?.name, 'Planner', 120),
    office: member?.office === 'cyprus' ? 'cyprus' : 'beirut',
    trainStaffDevCapacityPct: percent(member?.trainStaffDevCapacityPct, 0.75),
  })).filter((member) => member.id) : [];
  const knownIds = new Set(members.map((member) => member.id));
  roster.forEach((member) => {
    const id = cleanId(member?.id);
    if (id && !knownIds.has(id)) {
      members.push({ id, name: cleanText(member?.name, 'Planner', 120), office: 'beirut', trainStaffDevCapacityPct: 0.75 });
    }
  });
  return {
    defaults: {
      ceremoniesPct: percent(defaults.ceremoniesPct, 0.13),
      featureCapacityPct: percent(defaults.featureCapacityPct, 0.8),
      supportCapacityPct: percent(defaults.supportCapacityPct, 0.2),
    },
    members,
    sprints: Array.isArray(input.sprints) ? input.sprints.map((sprint) => ({
      id: cleanId(sprint?.id),
      name: cleanText(sprint?.name, 'Sprint', 120),
      startDate: cleanText(sprint?.startDate, '', 20),
      endDate: cleanText(sprint?.endDate, '', 20),
      holidayDaysBeirut: Math.max(0, Math.min(366, Number(sprint?.holidayDaysBeirut) || 0)),
      holidayDaysCyprus: Math.max(0, Math.min(366, Number(sprint?.holidayDaysCyprus) || 0)),
      availabilityDays: sprint?.availabilityDays && typeof sprint.availabilityDays === 'object'
        ? Object.fromEntries(Object.entries(sprint.availabilityDays).map(([id, days]) => [cleanId(id), Math.max(0, Math.min(366, Number(days) || 0))]).filter(([id]) => id))
        : {},
    })).filter((sprint) => sprint.id) : [],
  };
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
  const rawStories = Array.isArray(source.stories)
    ? source.stories.map((story) => ({
      id: cleanId(story?.id),
      type: cleanText(story?.type, 'Feature', 80),
      epicId: cleanId(story?.epicId) || null,
      title: cleanText(story?.title, 'Untitled story', 500),
      description: cleanText(story?.description, 'A new story ready for the team to shape and estimate together.', 5000),
      acceptance: parseAcceptance(story?.acceptance),
      manual: story?.type === 'Epic' ? null : parseScore(story?.manual),
      ai: story?.type === 'Epic' ? null : parseScore(story?.ai),
      aiEnabled: story?.type !== 'Epic' && (story?.aiEnabled === true || parseScore(story?.ai) !== null),
      saved: story?.saved === true,
      serviceLinks: normalizeLinks(story?.serviceLinks, serviceIds),
    })).filter((story) => story.id && story.title)
    : [];
  const epicIds = new Set(rawStories.filter((story) => story.type === 'Epic').map((story) => story.id));
  const stories = rawStories.map((story) => ({
    ...story,
    epicId: story.type === 'Epic' || !epicIds.has(story.epicId) ? null : story.epicId,
    serviceLinks: story.type !== 'Epic' && epicIds.has(story.epicId) ? [] : story.serviceLinks,
  }));
  const roundSource = source.round && typeof source.round === 'object' ? source.round : {};
  const roomSettingsSource = source.roomSettings && typeof source.roomSettings === 'object' ? source.roomSettings : {};
  const legacyAiEnabled = rawStories.some((story) => story.type !== 'Epic' && (story.aiEnabled === true || parseScore(story.ai) !== null));
  const selectedStoryId = stories.some((story) => story.id === source.selectedStoryId)
    ? source.selectedStoryId
    : stories[0]?.id || null;
  const roundStoryId = stories.some((story) => story.id === roundSource.storyId)
    ? roundSource.storyId
    : selectedStoryId;
  const roundNumber = Number.isInteger(roundSource.roundNumber) && roundSource.roundNumber > 0
    ? roundSource.roundNumber
    : 1;
  const roundMode = roundSource.mode === 'open' ? 'open' : 'hidden';
  const hideVoteCountUntilComplete = roundMode === 'hidden' && roundSource.hideVoteCountUntilComplete === true;
  const roomSettings = {
    aiEnabled: roomSettingsSource.aiEnabled === undefined ? legacyAiEnabled : roomSettingsSource.aiEnabled === true,
    voteMode: roomSettingsSource.voteMode === 'open' ? 'open' : roomSettingsSource.voteMode === 'hidden' ? 'hidden' : roundMode,
    hideVoteCountUntilComplete: roomSettingsSource.hideVoteCountUntilComplete === true || hideVoteCountUntilComplete,
  };
  const capacity = normalizeCapacity(source.capacity);

  return {
    sequence: ALLOWED_SEQUENCES.has(source.sequence) ? source.sequence : 'fibonacci',
    capacity,
    roomSettings,
    selectedStoryId,
    domains,
    services,
    stories,
    round: {
      phase: ALLOWED_PHASES.has(roundSource.phase) ? roundSource.phase : 'idle',
      mode: roomSettings.voteMode,
      storageMode: roomSettings.hideVoteCountUntilComplete ? 'hidden-count' : roomSettings.voteMode,
      hideVoteCountUntilComplete: roomSettings.hideVoteCountUntilComplete,
      storyId: roundStoryId,
      roundNumber,
      revealedAt: roundSource.revealedAt ? cleanTimer(roundSource.revealedAt) : null,
      timerStartedAt: cleanTimer(roundSource.timerStartedAt),
      timerEndsAt: cleanTimer(roundSource.timerEndsAt),
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

function validateUsername(value) {
  const username = normalizeUsername(value);
  if (!USERNAME_PATTERN.test(username)) {
    throw authError('Use 3–40 lowercase letters, numbers, dots, underscores, or hyphens for the username');
  }
  return username;
}

function validatePassword(value) {
  const password = String(value ?? '');
  if (password.length < PASSWORD_MIN_LENGTH || password.length > 200) {
    throw authError(`Password must be between ${PASSWORD_MIN_LENGTH} and 200 characters`);
  }
  return password;
}

async function ensureBootstrapAdmin(db, env) {
  const existingAdmin = await db.prepare(`SELECT id, username, email, display_name, role
    FROM accounts WHERE role = 'admin' AND disabled = 0 ORDER BY created_at, id LIMIT 1`).first();
  if (existingAdmin) return accountUser(existingAdmin);

  const username = normalizeUsername(env.POINTLINE_BOOTSTRAP_ADMIN_USERNAME);
  const password = String(env.POINTLINE_BOOTSTRAP_ADMIN_PASSWORD || '');
  if (!USERNAME_PATTERN.test(username) || password.length < PASSWORD_MIN_LENGTH) {
    throw authError('Pointline admin bootstrap credentials are not configured', 503);
  }

  const existingAccount = await db.prepare('SELECT id FROM accounts WHERE username = ? LIMIT 1').bind(username).first();
  const accountId = existingAccount?.id || makeId('acct');
  const passwordRecord = await createPasswordRecord(password);
  const now = new Date().toISOString();
  await db.batch([
    existingAccount
      ? db.prepare(`UPDATE accounts SET email = ?, display_name = ?, password_hash = ?, password_salt = ?, role = 'admin', disabled = 0, updated_at = ? WHERE id = ?`)
        .bind(`${username}@pointline.local`, 'Pointline Admin', passwordRecord.hash, passwordRecord.salt, now, accountId)
      : db.prepare(`INSERT INTO accounts
        (id, email, display_name, username, password_hash, password_salt, role, disabled, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'admin', 0, ?, ?)`)
        .bind(accountId, `${username}@pointline.local`, 'Pointline Admin', username, passwordRecord.hash, passwordRecord.salt, now, now),
    db.prepare(`INSERT OR IGNORE INTO rooms (id, name, pi_label, owner_account_id, sequence_key, selected_story_key, vote_mode, ai_enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'fibonacci', NULL, 'hidden', 1, ?, ?)`)
      .bind(DEFAULT_ROOM_ID, DEFAULT_ROOM_NAME, DEFAULT_PI_LABEL, accountId, now, now),
    db.prepare('UPDATE rooms SET owner_account_id = ? WHERE id = ?').bind(accountId, DEFAULT_ROOM_ID),
    db.prepare(`INSERT INTO room_members (room_id, account_id, role, created_at)
      VALUES (?, ?, 'owner', ?)
      ON CONFLICT(room_id, account_id) DO UPDATE SET role = 'owner'`)
      .bind(DEFAULT_ROOM_ID, accountId, now),
  ]);
  const account = await db.prepare('SELECT id, username, email, display_name, role FROM accounts WHERE id = ? LIMIT 1').bind(accountId).first();
  return accountUser(account);
}

async function ensureDefaultRoomMembership(db, user) {
  const room = await db.prepare('SELECT id FROM rooms WHERE id = ? LIMIT 1').bind(DEFAULT_ROOM_ID).first();
  if (!room) {
    const now = new Date().toISOString();
    await db.prepare(`INSERT INTO rooms (id, name, pi_label, owner_account_id, sequence_key, selected_story_key, vote_mode, ai_enabled, capacity_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'fibonacci', NULL, 'hidden', 1, '{}', ?, ?)`)
      .bind(DEFAULT_ROOM_ID, DEFAULT_ROOM_NAME, DEFAULT_PI_LABEL, user.id, now, now)
      .run();
  }
  await db.prepare(`INSERT OR IGNORE INTO room_members (room_id, account_id, role, created_at)
    VALUES (?, ?, 'editor', ?)`)
    .bind(DEFAULT_ROOM_ID, user.id, new Date().toISOString())
    .run();
}

async function createSession(db, accountId) {
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = bytesToBase64Url(tokenBytes);
  const sessionId = await sha256Base64Url(token);
  const now = new Date();
  await db.prepare(`INSERT INTO sessions (id, account_id, expires_at, created_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?)`)
    .bind(sessionId, accountId, new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000).toISOString(), now.toISOString(), now.toISOString())
    .run();
  return token;
}

async function login(db, env, input) {
  await ensureBootstrapAdmin(db, env);
  const username = normalizeUsername(input?.username);
  const password = String(input?.password ?? '');
  const account = USERNAME_PATTERN.test(username)
    ? await db.prepare(`SELECT id, username, email, display_name, role, disabled, password_hash, password_salt
      FROM accounts WHERE username = ? LIMIT 1`).bind(username).first()
    : null;
  if (!account || account.disabled === 1 || !account.password_hash || !account.password_salt || password.length > 200 || !(await verifyPassword(password, account.password_salt, account.password_hash))) {
    throw authError('Invalid username or password', 401);
  }
  const now = new Date().toISOString();
  await db.prepare('UPDATE accounts SET last_login_at = ?, updated_at = ? WHERE id = ?').bind(now, now, account.id).run();
  const user = accountUser(account);
  await ensureDefaultRoomMembership(db, user);
  const token = await createSession(db, account.id);
  return { user, token };
}

async function logout(db, request) {
  const token = requestCookie(request, SESSION_COOKIE);
  if (token) await db.prepare('DELETE FROM sessions WHERE id = ?').bind(await sha256Base64Url(token)).run();
  return json({ ok: true }, 200, { 'set-cookie': sessionCookie('', 0) });
}

function requireAdmin(user) {
  if (user?.role !== 'admin') throw authError('Only an admin can manage users', 403);
}

async function readAdminUsers(db) {
  const result = await db.prepare(`SELECT id, username, email, display_name, role, disabled, created_at, last_login_at
    FROM accounts WHERE username IS NOT NULL ORDER BY role DESC, username`).all();
  return rows(result).map((account) => ({
    ...accountUser(account),
    disabled: account.disabled === 1,
    createdAt: account.created_at,
    lastLoginAt: account.last_login_at || null,
  }));
}

async function createManagedUser(db, user, input) {
  requireAdmin(user);
  const username = validateUsername(input?.username);
  const password = validatePassword(input?.password);
  const displayName = cleanText(input?.displayName, username, 120);
  const existing = await db.prepare('SELECT id FROM accounts WHERE username = ? LIMIT 1').bind(username).first();
  if (existing) throw authError('That username is already in use', 409);
  const passwordRecord = await createPasswordRecord(password);
  const accountId = makeId('acct');
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(`INSERT INTO accounts
      (id, email, display_name, username, password_hash, password_salt, role, disabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'member', 0, ?, ?)`)
      .bind(accountId, `${username}@pointline.local`, displayName, username, passwordRecord.hash, passwordRecord.salt, now, now),
    db.prepare(`INSERT OR IGNORE INTO room_members (room_id, account_id, role, created_at)
      VALUES (?, ?, 'editor', ?)`)
      .bind(DEFAULT_ROOM_ID, accountId, now),
  ]);
  return {
    user: accountUser({ id: accountId, username, email: `${username}@pointline.local`, display_name: displayName, role: 'member' }),
    credentials: { username, password },
  };
}

async function updateManagedUser(db, user, accountId, input) {
  requireAdmin(user);
  const account = await db.prepare(`SELECT id, username, email, display_name, role
    FROM accounts WHERE id = ? AND username IS NOT NULL LIMIT 1`).bind(accountId).first();
  if (!account) throw authError('User not found', 404);

  const username = input?.username === undefined ? account.username : validateUsername(input.username);
  const displayName = cleanText(input?.displayName, account.display_name || username, 120);
  const password = String(input?.password || '');
  const existing = await db.prepare('SELECT id FROM accounts WHERE username = ? AND id != ? LIMIT 1')
    .bind(username, accountId).first();
  if (existing) throw authError('That username is already in use', 409);

  const now = new Date().toISOString();
  if (password) {
    const passwordRecord = await createPasswordRecord(validatePassword(password));
    await db.prepare(`UPDATE accounts SET username = ?, email = ?, display_name = ?, password_hash = ?, password_salt = ?, updated_at = ?
      WHERE id = ?`).bind(username, `${username}@pointline.local`, displayName, passwordRecord.hash, passwordRecord.salt, now, accountId).run();
  } else {
    await db.prepare(`UPDATE accounts SET username = ?, email = ?, display_name = ?, updated_at = ?
      WHERE id = ?`).bind(username, `${username}@pointline.local`, displayName, now, accountId).run();
  }

  const updated = await db.prepare(`SELECT id, username, email, display_name, role
    FROM accounts WHERE id = ? LIMIT 1`).bind(accountId).first();
  return {
    user: accountUser(updated),
    credentials: password ? { username, password } : null,
  };
}

async function requireMember(db, roomId, user) {
  if (user?.role === 'admin') {
    const room = await db.prepare('SELECT id FROM rooms WHERE id = ? LIMIT 1').bind(roomId).first();
    if (room) return { role: 'admin' };
  }
  const member = await db.prepare('SELECT role FROM room_members WHERE room_id = ? AND account_id = ? LIMIT 1')
    .bind(roomId, user?.id)
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

async function requireRoomManager(db, roomId, user) {
  const room = await db.prepare('SELECT owner_account_id FROM rooms WHERE id = ? LIMIT 1').bind(roomId).first();
  if (!room) throw authError('Room not found', 404);
  if (user?.role === 'admin') return;
  if (room.owner_account_id !== user.id) throw authError('Only the room owner can manage room members', 403);
}

async function canManageRoom(db, roomId, user) {
  if (user?.role === 'admin') return true;
  const room = await db.prepare('SELECT owner_account_id FROM rooms WHERE id = ? LIMIT 1').bind(roomId).first();
  return room?.owner_account_id === user?.id;
}

async function readDirectoryUsers(db) {
  const result = await db.prepare(`SELECT id, username, email, display_name, role
    FROM accounts WHERE disabled = 0 AND username IS NOT NULL ORDER BY display_name, username`).all();
  return rows(result).map(accountUser);
}

async function addTeamMember(db, user, teamId, accountId) {
  const team = await db.prepare('SELECT owner_account_id FROM teams WHERE id = ? LIMIT 1').bind(teamId).first();
  if (!team) throw authError('Team not found', 404);
  if (user.role !== 'admin' && team.owner_account_id !== user.id) {
    throw authError('Only the team owner can manage team members', 403);
  }
  const account = await db.prepare('SELECT id FROM accounts WHERE id = ? AND disabled = 0 LIMIT 1').bind(accountId).first();
  if (!account) throw authError('Member not found', 404);
  await db.prepare(`INSERT OR IGNORE INTO team_members (team_id, account_id, role, created_at)
    VALUES (?, ?, 'member', ?)`).bind(teamId, accountId, new Date().toISOString()).run();
  const teams = await readTeams(db, user.id);
  return teams.find((candidate) => candidate.id === teamId) || null;
}

async function addRoomMembers(db, user, roomId, input) {
  await requireRoomManager(db, roomId, user);
  const accountId = cleanId(input?.accountId);
  const teamId = cleanId(input?.teamId);
  if ((!accountId && !teamId) || (accountId && teamId)) throw authError('Choose one member or team', 400);
  const now = new Date().toISOString();
  if (teamId) {
    await requireTeamMember(db, teamId, user.id);
    await db.prepare(`INSERT OR IGNORE INTO room_members (room_id, account_id, role, created_at)
      SELECT ?, account_id, 'editor', ? FROM team_members WHERE team_id = ?`)
      .bind(roomId, now, teamId).run();
  } else {
    const account = await db.prepare('SELECT id FROM accounts WHERE id = ? AND disabled = 0 LIMIT 1').bind(accountId).first();
    if (!account) throw authError('Member not found', 404);
    await db.prepare(`INSERT OR IGNORE INTO room_members (room_id, account_id, role, created_at)
      VALUES (?, ?, 'editor', ?)`).bind(roomId, accountId, now).run();
  }
  return readRoomState(db, roomId, user.id);
}

async function readRoomState(db, roomId, userId) {
  const room = await db.prepare(`SELECT id, name, pi_label, owner_account_id, state_version, sequence_key, selected_story_key, vote_mode, ai_enabled, capacity_json
    FROM rooms WHERE id = ? LIMIT 1`).bind(roomId).first();
  if (!room) return { state: null, memberCount: 0 };

  const [domainResult, serviceResult, storyResult, allocationResult, memberResult, voteHistoryResult, memberRosterResult] = await Promise.all([
    db.prepare('SELECT id, name, sort_order FROM domains WHERE room_id = ? ORDER BY sort_order, id').bind(roomId).all(),
    db.prepare('SELECT id, name, domain_id, sort_order FROM services WHERE room_id = ? ORDER BY sort_order, id').bind(roomId).all(),
    db.prepare(`SELECT story_key, type, epic_id, title, description, acceptance_json, sort_order,
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
    db.prepare(`SELECT rm.account_id, rm.role, a.display_name, a.email
      FROM room_members rm LEFT JOIN accounts a ON a.id = rm.account_id
      WHERE rm.room_id = ? ORDER BY rm.role DESC, a.display_name, a.email`).bind(roomId).all(),
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
    const countRow = await db.prepare(`SELECT COUNT(*) AS count FROM votes
      WHERE room_id = ? AND story_key = ? AND round_number = ?`)
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
      .filter((vote) => canSeeAllVotes || vote.account_id === userId)
      .map((vote) => [vote.account_id, {
        name: vote.display_name || vote.email?.split('@')[0] || 'Planner',
        manual: parseScore(vote.manual_estimate),
        ai: parseScore(vote.ai_estimate),
        aiEnabled: vote.ai_enabled === 1,
      }]));
    round.players = rows(memberRosterResult).map((member) => {
      const vote = voteByPlayer.get(member.account_id);
      const manual = parseScore(vote?.manual_estimate);
      const ai = parseScore(vote?.ai_estimate);
      return {
        id: member.account_id,
        name: member.display_name || member.email?.split('@')[0] || 'Planner',
        role: member.role === 'owner' ? 'owner' : 'member',
        hasVoted: manual !== null || ai !== null,
        manual: canSeeAllVotes || member.account_id === userId ? manual : null,
        ai: canSeeAllVotes || member.account_id === userId ? ai : null,
        aiEnabled: vote?.ai_enabled === 1,
      };
    });
  } else {
    round.players = rows(memberRosterResult).map((member) => ({
      id: member.account_id,
      name: member.display_name || member.email?.split('@')[0] || 'Planner',
      role: member.role === 'owner' ? 'owner' : 'member',
      hasVoted: false,
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
  const capacityRoster = rows(memberRosterResult).map((member) => ({
    id: member.account_id,
    name: member.display_name || member.email?.split('@')[0] || 'Planner',
  }));
  const capacity = normalizeCapacity(storedCapacity, capacityRoster);

  return {
    memberCount: Math.max(1, Number(memberResult?.count) || 1),
    room: {
      id: room.id,
      name: room.name,
      piLabel: room.pi_label,
      stateVersion: Number(room.state_version) || 0,
      role: room.owner_account_id === userId ? 'owner' : 'member',
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

async function publishRoomState(db, roomId) {
  const subscribers = ROOM_STREAMS.get(roomId);
  if (!subscribers?.size) return;
  await Promise.all([...subscribers].map(async (subscriber) => {
    try {
      const payload = await readRoomState(db, roomId, subscriber.userId);
      subscriber.controller.enqueue(subscriber.encoder.encode(streamEvent('state', { roomId, ...payload })));
    } catch {
      subscriber.cleanup();
    }
  }));
}

function createRoomStream(roomId, userId, initialPayload) {
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

async function readRooms(db, user) {
  const result = user.role === 'admin'
    ? await db.prepare(`SELECT r.id, r.name, r.pi_label, r.owner_account_id,
        COUNT(all_members.account_id) AS member_count, 'admin' AS role
      FROM rooms r
      LEFT JOIN room_members all_members ON all_members.room_id = r.id
      GROUP BY r.id, r.name, r.pi_label, r.owner_account_id
      ORDER BY r.updated_at DESC, r.id`).all()
    : await db.prepare(`SELECT r.id, r.name, r.pi_label, r.owner_account_id,
        COUNT(all_members.account_id) AS member_count, mine.role
      FROM rooms r
      JOIN room_members mine ON mine.room_id = r.id AND mine.account_id = ?
      LEFT JOIN room_members all_members ON all_members.room_id = r.id
      GROUP BY r.id, r.name, r.pi_label, r.owner_account_id, mine.role
      ORDER BY r.updated_at DESC, r.id`).bind(user.id).all();
  return rows(result).map((room) => ({
    id: room.id,
    name: room.name,
    piLabel: room.pi_label,
    memberCount: Math.max(1, Number(room.member_count) || 1),
    role: user.role === 'admin' ? 'admin' : room.owner_account_id === user.id ? 'owner' : room.role === 'owner' ? 'owner' : 'member',
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

async function saveRoomState(db, roomId, input, user) {
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

  const room = await db.prepare('SELECT state_version FROM rooms WHERE id = ? LIMIT 1').bind(roomId).first();
  if (!room) {
    const error = new Error('Room not found');
    error.status = 404;
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
        db.prepare(`DELETE FROM planning_rounds WHERE room_id = ? AND story_key NOT IN (${placeholders(storyIds)})`).bind(roomId, ...storyIds),
        db.prepare(`DELETE FROM story_service_allocations WHERE room_id = ? AND story_key NOT IN (${placeholders(storyIds)})`).bind(roomId, ...storyIds),
        db.prepare(`DELETE FROM stories WHERE room_id = ? AND story_key NOT IN (${placeholders(storyIds)})`).bind(roomId, ...storyIds),
      ]
      : [
        db.prepare('DELETE FROM votes WHERE room_id = ?').bind(roomId),
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
      (room_id, story_key, type, epic_id, title, description, acceptance_json, sort_order, manual_estimate, ai_estimate, ai_enabled, saved)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(room_id, story_key) DO UPDATE SET type = excluded.type, title = excluded.title,
        epic_id = excluded.epic_id, description = excluded.description, acceptance_json = excluded.acceptance_json, sort_order = excluded.sort_order,
        manual_estimate = excluded.manual_estimate, ai_estimate = excluded.ai_estimate,
        ai_enabled = excluded.ai_enabled, saved = excluded.saved`)
      .bind(roomId, story.id, story.type, story.epicId, story.title, story.description, JSON.stringify(story.acceptance), index,
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

async function deleteRoom(db, user, roomId) {
  if (!roomId || !ROOM_ID_PATTERN.test(roomId)) {
    const error = new Error('The room to remove is invalid');
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
    const error = new Error('Only the room owner can remove this room');
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
  return { ok: true, roomId };
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
  if (invite.room?.id) await publishRoomState(db, invite.room.id);
  return { invite, roomId: invite.room?.id || null, teamId: invite.team?.id || null };
}

async function handleApi(request, env) {
  if (!env.DB) return json({ error: 'The Pointline database binding is not configured' }, 500);
  const url = new URL(request.url);
  if (url.pathname === '/api/invites' && request.method === 'GET') {
    const invite = await readInvite(env.DB, cleanInviteToken(url.searchParams.get('token')));
    return invite ? json({ invite }) : json({ error: 'This invite link is missing or expired' }, 404);
  }
  if (url.pathname === '/api/auth/login' && request.method === 'POST') {
    const result = await login(env.DB, env, await readJson(request));
    return json({ ok: true, user: result.user }, 200, { 'set-cookie': sessionCookie(result.token) });
  }
  const user = await getSessionUser(env.DB, request);
  if (url.pathname === '/api/auth/logout' && request.method === 'POST') return logout(env.DB, request);
  if (url.pathname === '/api/auth/session' && request.method === 'GET') {
    return user ? json({ user }) : json({ error: 'Sign in required' }, 401);
  }
  if (!user) return json({ error: 'Sign in with your Pointline username and password' }, 401);
  await ensureDefaultRoomMembership(env.DB, user);
  const roomId = roomIdFromRequest(request);

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
    return json({ ok: true, roomId: targetRoomId, room: room.room, memberCount: room.memberCount });
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

  await requireMember(env.DB, roomId, user);

  if (url.pathname === '/api/me' && request.method === 'GET') {
    const room = await readRoomState(env.DB, roomId, user.id);
    return json({ user, roomId, room: room.room, memberCount: room.memberCount });
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
  if (url.pathname === '/api/admin/users' && request.method === 'GET') {
    requireAdmin(user);
    return json({ users: await readAdminUsers(env.DB) });
  }
  if (url.pathname === '/api/admin/users' && request.method === 'POST') {
    const result = await createManagedUser(env.DB, user, await readJson(request));
    return json({ ok: true, ...result }, 201);
  }
  const adminUserPathMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
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
    const round = await env.DB.prepare(`SELECT phase FROM planning_rounds
      WHERE room_id = ? AND story_key = ? AND round_number = ? LIMIT 1`)
      .bind(roomId, storyId, roundNumber)
      .first();
    if (!round || round.phase !== 'voting') return json({ error: 'This voting round is no longer accepting votes' }, 409);
    const story = await env.DB.prepare('SELECT type FROM stories WHERE room_id = ? AND story_key = ? LIMIT 1')
      .bind(roomId, storyId)
      .first();
    if (!story || story.type === 'Epic') return json({ error: 'Epics are estimated through their linked stories' }, 409);

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
      : assetPath.endsWith('.svg')
        ? 'image/svg+xml'
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
