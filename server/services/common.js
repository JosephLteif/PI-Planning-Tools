export const DEFAULT_ROOM_ID = 'room-7917bb803c5d47649042a61a';
export const DEFAULT_ROOM_NAME = 'PI71 Planning';
export const DEFAULT_PI_LABEL = 'PI 71';
export const ALLOWED_SEQUENCES = new Set(['sequential', 'fibonacci', 'modified']);
export const ALLOWED_PHASES = new Set(['idle', 'voting', 'revealed']);
export const ALLOWED_INVITE_KINDS = new Set(['room-person', 'room-team', 'team']);
export const TEAM_MEMBER_ROLES = new Set(['developer', 'observer']);
export const ROOM_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,79}$/i;
export const USERNAME_PATTERN = /^[a-z][a-z0-9._-]{2,39}$/;
export const SESSION_COOKIE = 'pointline_session';
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_ITERATIONS = 100000;
export const MAX_BODY_BYTES = 1_500_000;
export const ROOM_STREAMS = new Map();
export const ROOM_SOCKETS = new Map();

export const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

export function json(body, status = 200, extraHeaders = {}) {
  const headers = new Headers(JSON_HEADERS);
  Object.entries(extraHeaders).forEach(([key, value]) => headers.set(key, value));
  return new Response(JSON.stringify(body), {
    status,
    headers,
  });
}

export function streamEvent(event, payload) {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export function accountUser(account) {
  return {
    id: account.id,
    username: account.username || '',
    name: account.display_name || account.username || 'Planner',
    email: account.email || '',
    role: account.role === 'admin' ? 'admin' : 'member',
  };
}

export function teamMemberRole(value) {
  return value === 'observer' ? 'observer' : 'developer';
}

export function normalizeUsername(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function requestCookie(request, name) {
  const cookieHeader = request.headers.get('cookie') || '';
  for (const part of cookieHeader.split(';')) {
    const [key, ...valueParts] = part.trim().split('=');
    if (key === name) return valueParts.join('=');
  }
  return '';
}

export function bytesToBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function bytesToBase64Url(bytes) {
  return bytesToBase64(bytes).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export async function sha256Base64Url(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(digest));
}

export async function createPasswordRecord(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const digest = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: PASSWORD_ITERATIONS, hash: 'SHA-256' }, key, 256);
  return { salt: bytesToBase64(salt), hash: bytesToBase64(new Uint8Array(digest)) };
}

export async function verifyPassword(password, salt, expectedHash) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const digest = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: base64ToBytes(salt), iterations: PASSWORD_ITERATIONS, hash: 'SHA-256' }, key, 256);
  const actual = new Uint8Array(digest);
  const expected = base64ToBytes(expectedHash);
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) difference |= actual[index] ^ expected[index];
  return difference === 0;
}

export async function getSessionUser(db, request) {
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

export function sessionCookie(token, maxAge = SESSION_MAX_AGE_SECONDS, secure = true) {
  return `${SESSION_COOKIE}=${token}; Max-Age=${maxAge}; Path=/; HttpOnly${secure ? '; Secure' : ''}; SameSite=Lax`;
}

export function isSecureRequest(request) {
  const forwardedProtocol = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  return new URL(request.url).protocol === 'https:' || forwardedProtocol === 'https';
}

export function authError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function roomIdFromRequest(request) {
  const requested = new URL(request.url).searchParams.get('room');
  return requested && ROOM_ID_PATTERN.test(requested) ? requested : DEFAULT_ROOM_ID;
}

export function rows(result) {
  return result?.results || [];
}

export function parseScore(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 100000 ? number : null;
}

export function cleanText(value, fallback = '', maxLength = 5000) {
  const text = String(value ?? '').trim();
  return (text || fallback).slice(0, maxLength);
}

export function cleanStoryUrl(value) {
  const url = cleanText(value, '', 2048);
  if (!url) return '';
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
  } catch {
    return '';
  }
}

export function cleanId(value, fallback = '') {
  const id = cleanText(value, fallback, 120);
  return /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/.test(id) ? id : fallback;
}

export function cleanTimer(value) {
  const timer = cleanText(value, '', 80);
  if (!timer || !Number.isFinite(Date.parse(timer))) return null;
  return new Date(timer).toISOString();
}

export function makeId(prefix) {
  return `${prefix}-${crypto.randomUUID().replaceAll('-', '').slice(0, 24)}`;
}

export function cleanInviteToken(value) {
  const token = cleanText(value, '', 160);
  return /^[a-zA-Z0-9._:-]{8,160}$/.test(token) ? token : '';
}

export function parseAcceptance(value) {
  if (!Array.isArray(value)) return ['Ready for discussion'];
  const items = value.map((item) => cleanText(item, '', 300)).filter(Boolean).slice(0, 20);
  return items.length ? items : ['Ready for discussion'];
}

export function normalizeLinks(links, serviceIds) {
  if (!Array.isArray(links)) return [];
  return links
    .map((link) => ({
      serviceId: cleanId(link?.serviceId),
      allocation: Math.min(100, Math.max(0, Number(link?.allocation) || 0)),
    }))
    .filter((link) => link.serviceId && serviceIds.has(link.serviceId));
}

export function normalizeCapacity(source, roster = null) {
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
  })).filter((member) => member.id && (roster === null || roster.some((candidate) => cleanId(candidate?.id) === member.id))) : [];
  const knownIds = new Set(members.map((member) => member.id));
  if (Array.isArray(roster)) roster.forEach((member) => {
    const id = cleanId(member?.id);
    if (id && !knownIds.has(id)) {
      members.push({ id, name: cleanText(member?.name, 'Planner', 120), office: 'beirut', trainStaffDevCapacityPct: 0.75 });
    }
  });
  return {
    defaults: {
      ceremoniesPct: percent(defaults.ceremoniesPct, 0.13),
      featureCapacityPct: percent(defaults.featureCapacityPct, 0.8),
      codeReviewPct: percent(defaults.codeReviewPct, 0),
      supportCapacityPct: percent(defaults.supportCapacityPct, 0.2),
    },
    members,
    sprints: Array.isArray(input.sprints) ? input.sprints.map((sprint) => ({
      id: cleanId(sprint?.id),
      name: cleanText(sprint?.name, 'Sprint', 120),
      startDate: cleanText(sprint?.startDate, '', 20),
      endDate: cleanText(sprint?.endDate, '', 20),
      excludeFromTotal: sprint?.excludeFromTotal === true,
      holidayDaysBeirut: Math.max(0, Math.min(366, Number(sprint?.holidayDaysBeirut) || 0)),
      holidayDaysCyprus: Math.max(0, Math.min(366, Number(sprint?.holidayDaysCyprus) || 0)),
      availabilityDays: sprint?.availabilityDays && typeof sprint.availabilityDays === 'object'
        ? Object.fromEntries(Object.entries(sprint.availabilityDays).map(([id, days]) => [cleanId(id), Math.max(0, Math.min(366, Number(days) || 0))]).filter(([id]) => id))
        : {},
    })).filter((sprint) => sprint.id) : [],
  };
}

export function normalizeStateInput(input, capacityRoster = null) {
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
      url: cleanStoryUrl(story?.url),
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
  const capacity = normalizeCapacity(source.capacity, capacityRoster);

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

export async function readJson(request, maxBytes = MAX_BODY_BYTES) {
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > maxBytes) {
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

export function validateUsername(value) {
  const username = normalizeUsername(value);
  if (!USERNAME_PATTERN.test(username)) {
    throw authError('Use 3–40 lowercase letters, numbers, dots, underscores, or hyphens for the username');
  }
  return username;
}

export function validatePassword(value) {
  const password = String(value ?? '');
  if (password.length < PASSWORD_MIN_LENGTH || password.length > 200) {
    throw authError(`Password must be between ${PASSWORD_MIN_LENGTH} and 200 characters`);
  }
  return password;
}

