import { authError, bytesToBase64, cleanText, cleanStoryUrl } from './common.js';

const CONNECTION_ID = 'workspace';

function encode(value) {
  return bytesToBase64(new TextEncoder().encode(value));
}

function decode(value) {
  return new TextDecoder().decode(Uint8Array.from(atob(value), (character) => character.charCodeAt(0)));
}

async function encryptionKey(secret) {
  if (!secret) throw authError('POINTLINE_JIRA_ENCRYPTION_KEY is not configured', 503);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function encrypt(secret, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await encryptionKey(secret), new TextEncoder().encode(value));
  return `${encode(iv)}.${encode(new Uint8Array(encrypted))}`;
}

async function decrypt(secret, value) {
  const [ivText, payloadText] = String(value || '').split('.');
  if (!ivText || !payloadText) throw authError('Stored Jira credentials are invalid', 503);
  const iv = Uint8Array.from(atob(ivText), (character) => character.charCodeAt(0));
  const payload = Uint8Array.from(atob(payloadText), (character) => character.charCodeAt(0));
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await encryptionKey(secret), payload);
  return new TextDecoder().decode(plain);
}

function normalizeBaseUrl(value) {
  const url = cleanText(value, '', 2048).replace(/\/+$/, '');
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('invalid');
    return parsed.href.replace(/\/+$/, '');
  } catch {
    throw authError('Jira base URL must be an http or https URL', 400);
  }
}

function safeMappings(value) {
  if (!Array.isArray(value)) return [];
  return value.map((mapping) => ({
    jiraField: cleanText(mapping?.jiraField, '', 120),
    localKey: cleanText(mapping?.localKey, '', 120),
  })).filter((mapping) => mapping.jiraField && mapping.localKey).slice(0, 100);
}

export async function readJiraConnection(db) {
  const row = await db.prepare(`SELECT id, base_url, auth_mode, username, board_id, board_name, field_mappings_json, updated_at
    FROM jira_connections WHERE id = ? LIMIT 1`).bind(CONNECTION_ID).first();
  if (!row) return null;
  let fieldMappings = [];
  try { fieldMappings = safeMappings(JSON.parse(row.field_mappings_json || '[]')); } catch { /* keep empty */ }
  return {
    configured: true,
    baseUrl: row.base_url,
    authMode: row.auth_mode,
    username: row.username || '',
    boardId: row.board_id || '',
    boardName: row.board_name || '',
    fieldMappings,
    updatedAt: row.updated_at,
  };
}

async function readConnectionCredentials(db, env) {
  const row = await db.prepare('SELECT base_url, auth_mode, username, secret_ciphertext FROM jira_connections WHERE id = ? LIMIT 1')
    .bind(CONNECTION_ID).first();
  if (!row) throw authError('Jira is not configured', 503);
  const secret = await decrypt(env.POINTLINE_JIRA_ENCRYPTION_KEY, row.secret_ciphertext);
  const auth = row.auth_mode === 'pat'
    ? `Bearer ${secret}`
    : `Basic ${btoa(`${row.username || ''}:${secret}`)}`;
  return { baseUrl: row.base_url, auth };
}

async function jiraRequest(db, env, path, options = {}) {
  const connection = await readConnectionCredentials(db, env);
  const response = await fetch(`${connection.baseUrl}${path}`, {
    ...options,
    headers: {
      accept: 'application/json',
      authorization: connection.auth,
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  if (!response.ok) {
    const detail = typeof payload === 'object' && payload ? payload.errorMessages?.join(', ') : '';
    throw authError(`Jira request failed (${response.status})${detail ? `: ${detail}` : ''}`, response.status === 401 || response.status === 403 ? 502 : 502);
  }
  return payload;
}

function normalizeIssue(issue, baseUrl, fieldMappings = []) {
  const fields = issue?.fields || {};
  const typeName = String(fields.issuetype?.name || '').toLowerCase();
  const type = typeName === 'epic' ? 'Epic' : typeName === 'bug' ? 'Bug' : 'Feature';
  const acceptanceField = fieldMappings.find((mapping) => mapping.localKey === 'acceptance')?.jiraField || 'customfield_10000';
  const acceptance = fields[acceptanceField] ? String(fields[acceptanceField]).split(/\r?\n/).map((item) => item.trim()).filter(Boolean) : ['Ready for discussion'];
  return {
    jiraIssueId: String(issue.id || ''),
    jiraKey: String(issue.key || ''),
    jiraProjectKey: String(fields.project?.key || ''),
    jiraUpdatedAt: fields.updated || null,
    id: String(issue.key || ''),
    type,
    epicId: fields.parent?.key || fields.customfield_10014 || null,
    title: String(fields.summary || 'Untitled Jira issue'),
    url: cleanStoryUrl(`${baseUrl}/browse/${issue.key || ''}`),
    description: typeof fields.description === 'string' ? fields.description : '',
    acceptance,
    customFields: fields,
  };
}

export async function saveJiraConnection(db, env, input) {
  const baseUrl = normalizeBaseUrl(input?.baseUrl);
  const authMode = input?.authMode === 'pat' ? 'pat' : 'basic';
  const username = authMode === 'basic' ? cleanText(input?.username, '', 200) : null;
  const secret = cleanText(input?.secret, '', 5000);
  if (!secret) throw authError('A Jira PAT or password/API token is required', 400);
  if (authMode === 'basic' && !username) throw authError('A Jira username is required for Basic authentication', 400);
  const fieldMappings = safeMappings(input?.fieldMappings);
  const encrypted = await encrypt(env.POINTLINE_JIRA_ENCRYPTION_KEY, secret);
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO jira_connections
    (id, base_url, auth_mode, username, secret_ciphertext, board_id, board_name, field_mappings_json, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET base_url = excluded.base_url, auth_mode = excluded.auth_mode,
      username = excluded.username, secret_ciphertext = excluded.secret_ciphertext, board_id = excluded.board_id,
      board_name = excluded.board_name, field_mappings_json = excluded.field_mappings_json, updated_at = excluded.updated_at`)
    .bind(CONNECTION_ID, baseUrl, authMode, username, encrypted, cleanText(input?.boardId, '', 80) || null,
      cleanText(input?.boardName, '', 200) || null, JSON.stringify(fieldMappings), now).run();
  return readJiraConnection(db);
}

export async function testJiraConnection(db, env) {
  const payload = await jiraRequest(db, env, '/rest/api/2/myself');
  return { ok: true, user: payload?.displayName || payload?.name || payload?.key || 'Jira user' };
}

export async function searchJiraIssues(db, env, query, baseUrl, fieldMappings = []) {
  const escaped = String(query || '').replaceAll('"', '\\"').trim();
  const jql = escaped ? `text ~ "${escaped}" ORDER BY updated DESC` : 'ORDER BY updated DESC';
  const params = new URLSearchParams({ jql, maxResults: '50', fields: 'summary,description,issuetype,parent,project,updated,status' });
  const result = await jiraRequest(db, env, `/rest/api/2/search?${params}`);
  return (result?.issues || []).map((issue) => normalizeIssue(issue, baseUrl, fieldMappings));
}

export async function getJiraEpicChildren(db, env, epicKey) {
  const connection = await readConnectionCredentials(db, env);
  const publicConnection = await readJiraConnection(db);
  const escaped = String(epicKey).replaceAll('"', '\\"');
  const params = new URLSearchParams({ jql: `parent = "${escaped}" OR "Epic Link" = "${escaped}" ORDER BY key`, maxResults: '100', fields: 'summary,description,issuetype,parent,project,updated,status' });
  const result = await jiraRequest(db, env, `/rest/api/2/search?${params}`);
  return (result?.issues || []).map((issue) => ({ ...normalizeIssue(issue, connection.baseUrl, publicConnection?.fieldMappings || []), epicId: epicKey }));
}

export async function getJiraIssue(db, env, issueKey) {
  const connection = await readConnectionCredentials(db, env);
  const publicConnection = await readJiraConnection(db);
  const issue = await jiraRequest(db, env, `/rest/api/2/issue/${encodeURIComponent(issueKey)}?fields=*all`);
  return normalizeIssue(issue, connection.baseUrl, publicConnection?.fieldMappings || []);
}

export async function importJiraIssueIntoRoom(db, roomId, issue) {
  const now = new Date().toISOString();
  const storyKey = issue.jiraKey;
  if (!storyKey) throw authError('Jira issue did not include a key', 502);
  await db.batch([
    db.prepare(`INSERT INTO stories
      (room_id, story_key, type, epic_id, title, url, description, acceptance_json, sort_order, manual_estimate, ai_estimate, ai_enabled, saved, stretch)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT MAX(sort_order) + 1 FROM stories WHERE room_id = ?), 0), NULL, NULL, 0, 0, 0)
      ON CONFLICT(room_id, story_key) DO UPDATE SET type = excluded.type, epic_id = excluded.epic_id,
        title = excluded.title, url = excluded.url, description = excluded.description, acceptance_json = excluded.acceptance_json`)
      .bind(roomId, storyKey, issue.type, issue.epicId, issue.title, issue.url, issue.description, JSON.stringify(issue.acceptance), roomId),
    db.prepare(`INSERT INTO jira_issue_links
      (room_id, story_key, jira_issue_id, jira_key, jira_project_key, jira_updated_at, sync_status, sync_error, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'synced', NULL, ?)
      ON CONFLICT(room_id, story_key) DO UPDATE SET jira_issue_id = excluded.jira_issue_id,
        jira_key = excluded.jira_key, jira_project_key = excluded.jira_project_key,
        jira_updated_at = excluded.jira_updated_at, sync_status = 'synced', sync_error = NULL, updated_at = excluded.updated_at`)
      .bind(roomId, storyKey, issue.jiraIssueId, issue.jiraKey, issue.jiraProjectKey, issue.jiraUpdatedAt, now),
    db.prepare('UPDATE rooms SET state_version = state_version + 1, updated_at = ? WHERE id = ?').bind(now, roomId),
  ]);
  return storyKey;
}

export async function createJiraStory(db, env, input) {
  const projectKey = cleanText(input?.projectKey, '', 80);
  if (!projectKey) throw authError('A Jira project key is required', 400);
  const fields = { project: { key: projectKey }, summary: cleanText(input?.title, '', 255), issuetype: { name: 'Story' }, description: cleanText(input?.description, '', 5000) };
  if (input?.epicKey) fields.parent = { key: cleanText(input.epicKey, '', 80) };
  const result = await jiraRequest(db, env, '/rest/api/2/issue', { method: 'POST', body: JSON.stringify({ fields }) });
  return getJiraIssue(db, env, result.key);
}

export async function listJiraBoards(db, env, query = '') {
  const params = new URLSearchParams({ maxResults: '50', name: query });
  const result = await jiraRequest(db, env, `/rest/agile/1.0/board?${params}`);
  return (result?.values || []).map((board) => ({ id: String(board.id), name: board.name, type: board.type, location: board.location?.projectKey || '' }));
}

export async function listJiraSprints(db, env, boardId) {
  const result = await jiraRequest(db, env, `/rest/agile/1.0/board/${encodeURIComponent(boardId)}/sprint?maxResults=100`);
  return (result?.values || []).map((sprint) => ({ id: String(sprint.id), name: sprint.name, state: sprint.state, startDate: sprint.startDate || '', endDate: sprint.endDate || '', boardId: String(boardId) }));
}

export async function createJiraSprint(db, env, input) {
  const boardId = cleanText(input?.boardId, '', 80);
  if (!boardId) throw authError('A Jira board is required', 400);
  const result = await jiraRequest(db, env, '/rest/agile/1.0/sprint', { method: 'POST', body: JSON.stringify({ name: cleanText(input?.name, 'Sprint', 120), startDate: input?.startDate || undefined, endDate: input?.endDate || undefined, originBoardId: Number(boardId) }) });
  return { id: String(result.id), name: result.name, state: result.state || 'FUTURE', startDate: result.startDate || '', endDate: result.endDate || '', boardId };
}

export async function moveJiraIssue(db, env, issueKey, sprintId) {
  await jiraRequest(db, env, `/rest/agile/1.0/sprint/${encodeURIComponent(sprintId)}/issue`, { method: 'POST', body: JSON.stringify({ issues: [issueKey] }) });
  return { ok: true };
}

export function normalizeJiraError(error) {
  return error?.message || 'Jira synchronization failed';
}
