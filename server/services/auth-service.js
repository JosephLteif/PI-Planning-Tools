import {
  DEFAULT_ROOM_ID,
  DEFAULT_ROOM_NAME,
  DEFAULT_PI_LABEL,
  PASSWORD_MIN_LENGTH,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  USERNAME_PATTERN,
  accountUser,
  authError,
  bytesToBase64Url,
  cleanId,
  cleanText,
  createPasswordRecord,
  isSecureRequest,
  json,
  makeId,
  normalizeUsername,
  requestCookie,
  rows,
  sessionCookie,
  sha256Base64Url,
  validatePassword,
  validateUsername,
  verifyPassword,
} from './common.js';

export async function ensureBootstrapAdmin(db, env) {
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
    db.prepare(`INSERT INTO rooms (id, name, pi_label, owner_account_id, sequence_key, selected_story_key, vote_mode, ai_enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'fibonacci', NULL, 'hidden', 1, ?, ?) ON CONFLICT DO NOTHING`)
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
export async function ensureDefaultRoomMembership(db, user) {
  const room = await db.prepare('SELECT id FROM rooms WHERE id = ? LIMIT 1').bind(DEFAULT_ROOM_ID).first();
  if (!room) {
    const now = new Date().toISOString();
    await db.prepare(`INSERT INTO rooms (id, name, pi_label, owner_account_id, sequence_key, selected_story_key, vote_mode, ai_enabled, capacity_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'fibonacci', NULL, 'hidden', 1, '{}', ?, ?)`)
      .bind(DEFAULT_ROOM_ID, DEFAULT_ROOM_NAME, DEFAULT_PI_LABEL, user.id, now, now)
      .run();
  }
  await db.prepare(`INSERT INTO room_members (room_id, account_id, role, created_at)
    VALUES (?, ?, 'editor', ?) ON CONFLICT DO NOTHING`)
    .bind(DEFAULT_ROOM_ID, user.id, new Date().toISOString())
    .run();
}

export async function createSession(db, accountId) {
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

export async function login(db, env, input) {
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

export async function logout(db, request) {
  const token = requestCookie(request, SESSION_COOKIE);
  if (token) await db.prepare('DELETE FROM sessions WHERE id = ?').bind(await sha256Base64Url(token)).run();
  return json({ ok: true }, 200, { 'set-cookie': sessionCookie('', 0, isSecureRequest(request)) });
}

export function requireAdmin(user) {
  if (user?.role !== 'admin') throw authError('Only an admin can manage users', 403);
}

export async function readAdminUsers(db) {
  const result = await db.prepare(`SELECT id, username, email, display_name, role, disabled, created_at, last_login_at
    FROM accounts ORDER BY role DESC, username, display_name`).all();
  return rows(result).map((account) => ({
    ...accountUser(account),
    disabled: account.disabled === 1,
    createdAt: account.created_at,
    lastLoginAt: account.last_login_at || null,
  }));
}

export async function createManagedUser(db, user, input) {
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
    db.prepare(`INSERT INTO room_members (room_id, account_id, role, created_at)
      VALUES (?, ?, 'editor', ?) ON CONFLICT DO NOTHING`)
      .bind(DEFAULT_ROOM_ID, accountId, now),
  ]);
  return {
    user: accountUser({ id: accountId, username, email: `${username}@pointline.local`, display_name: displayName, role: 'member' }),
    credentials: { username, password },
  };
}

export async function updateManagedUser(db, user, accountId, input) {
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

export async function deleteManagedUser(db, user, accountId) {
  requireAdmin(user);
  const target = await db.prepare('SELECT id FROM accounts WHERE id = ? LIMIT 1').bind(accountId).first();
  if (!target) throw authError('User not found', 404);
  if (target.id === user.id) throw authError('You cannot remove your own admin account', 400);
  const roomResult = await db.prepare('SELECT id, capacity_json FROM rooms').all();
  const capacityUpdates = rows(roomResult).flatMap((room) => {
    try {
      const capacity = JSON.parse(room.capacity_json || '{}');
      if (!Array.isArray(capacity.members) || !capacity.members.some((member) => cleanId(member?.id || member?.accountId) === accountId)) return [];
      return [db.prepare('UPDATE rooms SET capacity_json = ?, state_version = state_version + 1, updated_at = ? WHERE id = ?')
        .bind(JSON.stringify({ ...capacity, members: capacity.members.filter((member) => cleanId(member?.id || member?.accountId) !== accountId) }), new Date().toISOString(), room.id)];
    } catch {
      return [];
    }
  });
  await db.batch([
    ...capacityUpdates,
    db.prepare('DELETE FROM sessions WHERE account_id = ?').bind(accountId),
    db.prepare('DELETE FROM room_members WHERE account_id = ?').bind(accountId),
    db.prepare('DELETE FROM team_members WHERE account_id = ?').bind(accountId),
    db.prepare('DELETE FROM votes WHERE account_id = ?').bind(accountId),
    db.prepare('DELETE FROM room_invites WHERE created_by = ?').bind(accountId),
    db.prepare('UPDATE rooms SET owner_account_id = NULL WHERE owner_account_id = ?').bind(accountId),
    db.prepare('DELETE FROM teams WHERE owner_account_id = ?').bind(accountId),
    db.prepare('DELETE FROM accounts WHERE id = ?').bind(accountId),
  ]);
  return { accountId };
}
