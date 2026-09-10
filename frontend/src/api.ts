import type { AdminUser, Room, RoomPayload, RoomState, Team, Train, User } from './types';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

type RequestOptions = Omit<RequestInit, 'body'> & { body?: unknown };

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body !== undefined && !headers.has('content-type')) headers.set('content-type', 'application/json');

  const response = await fetch(path, {
    ...options,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    credentials: 'same-origin',
    headers,
  });
  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  if (!response.ok) {
    const message = typeof payload === 'object' && payload !== null && 'error' in payload
      ? String(payload.error)
      : `Request failed with status ${response.status}`;
    throw new ApiError(message, response.status);
  }
  return payload as T;
}

function withRoom(path: string, roomId: string): string {
  const url = new URL(path, window.location.href);
  url.searchParams.set('room', roomId);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function normalizeRoomPayload(payload: RoomPayload): RoomPayload {
  const payloadMemberCount = Number(payload.memberCount);
  const roomMemberCount = Number(payload.room.memberCount);
  const memberCount = Number.isFinite(payloadMemberCount) ? payloadMemberCount : roomMemberCount;
  return {
    ...payload,
    room: {
      ...payload.room,
      memberCount: Math.max(0, memberCount || 0),
      teamCount: Math.max(0, Number(payload.room.teamCount) || 0),
    },
  };
}

export async function getSession(): Promise<User | null> {
  try {
    return (await request<{ user: User }>('/api/auth/session')).user;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export function login(username: string, password: string): Promise<{ user: User }> {
  return request('/api/auth/login', { method: 'POST', body: { username, password } });
}

export function logout(): Promise<unknown> {
  return request('/api/auth/logout', { method: 'POST' });
}

export async function listRooms(): Promise<Room[]> {
  return (await request<{ rooms: Room[] }>('/api/rooms')).rooms;
}

export async function loadRoom(roomId: string): Promise<RoomPayload> {
  return normalizeRoomPayload(await request<RoomPayload>(withRoom('/api/state', roomId)));
}

export async function listTeams(): Promise<Team[]> {
  return (await request<{ teams: Team[] }>('/api/teams')).teams;
}

export async function listTrains(): Promise<Train[]> {
  return (await request<{ trains: Train[] }>('/api/trains')).trains;
}

export async function listAdminUsers(roomId: string): Promise<AdminUser[]> {
  return (await request<{ users: AdminUser[] }>(withRoom('/api/admin/users', roomId))).users;
}

export async function downloadBackup(): Promise<Blob> {
  const response = await fetch('/api/admin/backup', { credentials: 'same-origin' });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new ApiError(payload?.error || 'Request failed with status ' + response.status, response.status);
  }
  return response.blob();
}

export async function importBackup(file: File): Promise<{ ok: true; counts: Record<string, number> }> {
  const response = await fetch('/api/admin/backup/import', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: await file.text(),
  });
  const payload = await response.json().catch(() => null) as { error?: string; counts?: Record<string, number> } | null;
  if (!response.ok) {
    throw new ApiError(payload?.error || 'Request failed with status ' + response.status, response.status);
  }
  return payload as { ok: true; counts: Record<string, number> };
}

export async function listDirectoryUsers(): Promise<User[]> {
  return (await request<{ users: User[] }>('/api/directory/users')).users;
}

export function createAdminUser(roomId: string, input: { displayName: string; username: string; password: string }) {
  return request<{ ok: true; user: AdminUser; credentials: { username: string; password: string } }>(withRoom('/api/admin/users', roomId), {
    method: 'POST',
    body: input,
  });
}

export function updateAdminUser(roomId: string, accountId: string, input: { displayName: string; username: string; password?: string }) {
  return request<{ ok: true; user: AdminUser; credentials: { username: string; password: string } | null }>(withRoom(`/api/admin/users/${encodeURIComponent(accountId)}`, roomId), {
    method: 'PUT',
    body: input,
  });
}

export function deleteAdminUser(roomId: string, accountId: string) {
  return request<{ ok: true; accountId: string }>(withRoom(`/api/admin/users/${encodeURIComponent(accountId)}`, roomId), { method: 'DELETE' });
}

export function createRoom(roomId: string, name: string, piLabel: string, state: RoomState) {
  return request<RoomPayload & { ok: true }>(withRoom('/api/rooms', roomId), {
    method: 'POST',
    body: { name, piLabel, state },
  }).then(normalizeRoomPayload);
}

export function createTeam(name: string) {
  return request<{ ok: true; team: Team }>('/api/teams', {
    method: 'POST',
    body: { name },
  });
}

export function createTrain(name: string) {
  return request<{ ok: true; train: Train }>('/api/trains', {
    method: 'POST',
    body: { name },
  });
}

export function deleteTrain(trainId: string) {
  return request<{ ok: true; trainId: string; teamIds: string[] }>(`/api/trains/${encodeURIComponent(trainId)}`, { method: 'DELETE' });
}

export function addTeamToTrain(trainId: string, teamId: string) {
  return request<{ ok: true; train: Train; team: Team | null }>(`/api/trains/${encodeURIComponent(trainId)}/teams/${encodeURIComponent(teamId)}`, {
    method: 'POST',
  });
}

export function removeTeamFromTrain(trainId: string, teamId: string) {
  return request<{ ok: true; train: Train; team: Team | null }>(`/api/trains/${encodeURIComponent(trainId)}/teams/${encodeURIComponent(teamId)}`, {
    method: 'DELETE',
  });
}

export function addTeamMember(teamId: string, accountId: string) {
  return request<{ ok: true; team: Team | null }>(`/api/teams/${encodeURIComponent(teamId)}/members`, {
    method: 'POST',
    body: { accountId },
  });
}

export function removeTeamMember(teamId: string, accountId: string) {
  return request<{ ok: true; team: Team | null }>(`/api/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(accountId)}`, {
    method: 'DELETE',
  });
}

export function promoteTeamOwner(teamId: string, accountId: string) {
  return request<{ ok: true; team: Team | null }>(`/api/teams/${encodeURIComponent(teamId)}/owner`, {
    method: 'POST',
    body: { accountId },
  });
}

export function deleteTeam(teamId: string) {
  return request<{ ok: true; teamId: string }>(`/api/teams/${encodeURIComponent(teamId)}`, { method: 'DELETE' });
}

export function addRoomMember(roomId: string, input: { accountId?: string; teamId?: string }) {
  return request<RoomPayload & { ok: true }>(`/api/rooms/${encodeURIComponent(roomId)}/members`, {
    method: 'POST',
    body: input,
  }).then(normalizeRoomPayload);
}

export function removeRoomMember(roomId: string, accountId: string) {
  return request<RoomPayload & { ok: true }>(`/api/rooms/${encodeURIComponent(roomId)}/members/${encodeURIComponent(accountId)}`, {
    method: 'DELETE',
  }).then(normalizeRoomPayload);
}

export function updateTeamMemberRole(teamId: string, accountId: string, role: 'developer' | 'observer') {
  return request<{ ok: true; team: Team | null; roomIds: string[] }>(`/api/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(accountId)}`, {
    method: 'PATCH',
    body: { role },
  });
}

export function removeRoomTeam(roomId: string, teamId: string) {
  return request<RoomPayload & { ok: true }>(`/api/rooms/${encodeURIComponent(roomId)}/teams/${encodeURIComponent(teamId)}`, {
    method: 'DELETE',
  }).then(normalizeRoomPayload);
}

export function updateRoom(roomId: string, input: { name: string; piLabel: string }) {
  return request<RoomPayload & { ok: true }>(`/api/rooms/${encodeURIComponent(roomId)}`, {
    method: 'PUT',
    body: input,
  }).then(normalizeRoomPayload);
}

export function createInvite(roomId: string, kind: 'team' | 'room-person' | 'room-team', teamId?: string) {
  return request<{ token: string; kind: string; url: string; expiresAt: string }>(withRoom('/api/invites', roomId), {
    method: 'POST',
    body: { roomId, kind, teamId: teamId || null },
  });
}

export function deleteRoom(roomId: string) {
  return request<{ ok: true; roomId: string }>(`/api/rooms/${encodeURIComponent(roomId)}`, { method: 'DELETE' });
}

export function saveRoomState(roomId: string, state: RoomState, stateVersion: number): Promise<RoomPayload> {
  return request<RoomPayload>(withRoom('/api/state', roomId), {
    method: 'PUT',
    body: { ...state, stateVersion },
  }).then(normalizeRoomPayload);
}

export function setParticipation(roomId: string, storyId: string, roundNumber: number, joined: boolean, accountId?: string): Promise<RoomPayload> {
  return request<RoomPayload>(withRoom('/api/round/participation', roomId), {
    method: 'PUT',
    body: { storyId, roundNumber, joined, accountId },
  }).then(normalizeRoomPayload);
}

export function clearVotes(roomId: string, storyId: string, roundNumber: number): Promise<RoomPayload> {
  return request<RoomPayload>(withRoom('/api/votes', roomId), {
    method: 'DELETE',
    body: { storyId, roundNumber },
  }).then(normalizeRoomPayload);
}

export function submitVote(
  roomId: string,
  storyId: string,
  roundNumber: number,
  manual: number | null,
  ai: number | null,
  aiEnabled: boolean,
) {
  return request<{ ok: true; submittedCount: number }>(withRoom('/api/vote', roomId), {
    method: 'PUT',
    body: { storyId, roundNumber, manual, ai, aiEnabled },
  });
}

