import { useCallback, useEffect, useState } from 'react';
import { addRoomMember, addTeamMember, ApiError, clearVotes, createAdminUser, createInvite, createRoom, createTeam, deleteAdminUser, deleteRoom, deleteTeam, downloadBackup, getSession, importBackup, joinRoom, listAdminUsers, listDirectoryUsers, listDiscoverableRooms, listRooms, listTeams, loadRoom, login, logout, normalizeRoomPayload, promoteTeamOwner, removeRoomMember, removeRoomTeam, removeTeamMember, saveRoomState, setParticipation, submitVote, updateAdminUser, updateRoom, updateTeamMemberRole } from './api';
import { AdminPage } from './components/AdminPage';
import { AppIcon } from './components/AppIcon';
import { AuthScreen } from './components/AuthScreen';
import { AppShell, type ViewKey } from './components/AppShell';
import { CapacityPage } from './components/CapacityPage';
import { DeliveryBoardPage } from './components/DeliveryBoardPage';
import { EmptyWorkspacePage } from './components/EmptyWorkspacePage';
import { EstimatesPage } from './components/EstimatesPage';
import { ResourcesPage } from './components/ResourcesPage';
import { RoomsPage } from './components/RoomsPage';
import { TeamPage } from './components/TeamPage';
import { SettingsPage } from './components/WorkspacePage';
import { defaultRoomState } from './state';
import type { DiscoverableRoom, Room, RoomPayload, RoomState, Team, User } from './types';
import './app.css';

type SessionStatus = 'loading' | 'signed-out' | 'signed-in';
type AuthMode = 'sign-in' | 'switch-account';

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}

export default function App() {
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>('loading');
  const [authMode, setAuthMode] = useState<AuthMode>('sign-in');
  const [user, setUser] = useState<User | null>(null);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [discoverableRooms, setDiscoverableRooms] = useState<DiscoverableRoom[]>([]);
  const [discoverableHasMore, setDiscoverableHasMore] = useState(false);
  const [discoverableLoading, setDiscoverableLoading] = useState(false);
  const [discoverableQuery, setDiscoverableQuery] = useState('');
  const [teams, setTeams] = useState<Team[]>([]);
  const [directoryUsers, setDirectoryUsers] = useState<User[]>([]);
  const [adminUsers, setAdminUsers] = useState<import('./types').AdminUser[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [roomPayload, setRoomPayload] = useState<RoomPayload | null>(null);
  const [view, setView] = useState<ViewKey>('estimates');
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
  const [workspaceRefreshToken, setWorkspaceRefreshToken] = useState(0);
  const [saving, setSaving] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = '/legacy/styles.css';
    document.head.appendChild(stylesheet);
    return () => stylesheet.remove();
  }, []);

  useEffect(() => {
    let active = true;
    getSession().then((nextUser) => {
      if (!active) return;
      setUser(nextUser);
      setSessionStatus(nextUser ? 'signed-in' : 'signed-out');
    }).catch((error) => {
      if (!active) return;
      setAuthError(errorMessage(error));
      setSessionStatus('signed-out');
    });
    return () => { active = false; };
  }, []);

  const refreshRoom = useCallback(async (roomId: string) => {
    const payload = await loadRoom(roomId);
    setSelectedRoomId(roomId);
    setRoomPayload(payload);
    setRooms((current) => current.map((candidate) => candidate.id === payload.room.id ? { ...candidate, ...payload.room } : candidate));
    return payload;
  }, []);

  useEffect(() => {
    if (sessionStatus !== 'signed-in' || !user) return;
    let active = true;
    setLoadingWorkspace(true);
    (async () => {
      try {
        const nextRooms = await listRooms();
        if (!active) return;
        setRooms(nextRooms);
        const queryRoom = new URLSearchParams(window.location.search).get('room');
        const nextRoomId = nextRooms.some((room) => room.id === queryRoom) ? queryRoom! : nextRooms[0]?.id;
        if (!nextRoomId) {
          if (!active) return;
          const nextDiscoverablePage = await listDiscoverableRooms();
          if (!active) return;
          setDiscoverableRooms(nextDiscoverablePage.rooms);
          setDiscoverableHasMore(nextDiscoverablePage.hasMore);
          setSelectedRoomId('');
          setRoomPayload(null);
          setTeams([]);
          setAdminUsers([]);
          setDirectoryUsers([]);
          window.history.replaceState({}, '', window.location.pathname);
          return;
        }
        setDiscoverableRooms([]);
        setDiscoverableHasMore(false);
        setDiscoverableQuery('');
        const [payload, nextTeams, nextAdminUsers, nextDirectoryUsers] = await Promise.all([
          loadRoom(nextRoomId),
          listTeams(),
          user.role === 'admin' ? listAdminUsers(nextRoomId) : Promise.resolve([]),
          listDirectoryUsers(),
        ]);
        if (!active) return;
        setSelectedRoomId(nextRoomId);
        setRoomPayload(payload);
        setTeams(nextTeams);
        setAdminUsers(nextAdminUsers);
        setDirectoryUsers(nextDirectoryUsers);
      } catch (error) {
        if (active) setNotice(errorMessage(error));
      } finally {
        if (active) setLoadingWorkspace(false);
      }
    })();
    return () => { active = false; };
  }, [sessionStatus, user, workspaceRefreshToken]);

  useEffect(() => {
    if (sessionStatus !== 'signed-in' || !selectedRoomId) return undefined;
    let active = true;
    let socket: WebSocket | null = null;
    let stream: EventSource | null = null;
    const roomQuery = `?room=${encodeURIComponent(selectedRoomId)}`;
    const applyPayload = (candidate: RoomPayload) => {
      try {
        const payload = normalizeRoomPayload(candidate);
        if (payload.roomId !== selectedRoomId) return;
        setRooms((current) => current.map((room) => room.id === payload.room.id ? { ...room, ...payload.room } : room));
        setRoomPayload((current) => payload.room.stateVersion !== undefined
          && current?.room.stateVersion !== undefined
          && payload.room.stateVersion < current.room.stateVersion
          ? current
          : payload);
      } catch {
        // The next realtime event or an explicit refresh will recover from malformed data.
      }
    };

    const handleSocketMessage = (event: MessageEvent<string>) => {
      try {
        const message = JSON.parse(event.data) as { event?: string; data?: RoomPayload; payload?: RoomPayload };
        if (message.event && message.event !== 'state') return;
        applyPayload(message.data || message.payload || message as unknown as RoomPayload);
      } catch {
        // The fallback stream or the next socket message can recover from malformed data.
      }
    };

    const connectStream = () => {
      if (!active || stream) return;
      stream = new EventSource(`/api/state/stream${roomQuery}`);
      stream.addEventListener('state', (event) => {
        try {
          applyPayload(JSON.parse((event as MessageEvent<string>).data) as RoomPayload);
        } catch {
          // The next stream event or an explicit refresh will recover from malformed data.
        }
      });
    };

    if (window.WebSocket) {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      socket = new WebSocket(`${protocol}//${window.location.host}/api/state/socket${roomQuery}`);
      socket.addEventListener('message', handleSocketMessage);
      socket.addEventListener('error', () => {
        socket?.close();
        connectStream();
      });
      socket.addEventListener('close', () => {
        socket = null;
        connectStream();
      });
    } else {
      connectStream();
    }

    return () => {
      active = false;
      socket?.close();
      stream?.close();
      socket = null;
      stream = null;
    };
  }, [sessionStatus, selectedRoomId]);

  useEffect(() => {
    if (notice === '') return undefined;
    const timer = window.setTimeout(() => setNotice(''), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function handleLogin(username: string, password: string) {
    setAuthError('');
    setAuthLoading(true);
    try {
      const result = await login(username, password);
      setUser(result.user);
      setAuthMode('sign-in');
      setSessionStatus('signed-in');
    } catch (error) {
      setAuthError(errorMessage(error));
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleSignOut() {
    try { await logout(); } catch { /* A local session can still be cleared when the server is unavailable. */ }
    setUser(null);
    setRooms([]);
    setDiscoverableRooms([]);
    setDiscoverableHasMore(false);
    setDiscoverableQuery('');
    setTeams([]);
    setDirectoryUsers([]);
    setAdminUsers([]);
    setSelectedRoomId('');
    setRoomPayload(null);
    setAuthMode('sign-in');
    setSessionStatus('signed-out');
    setView('estimates');
  }

  async function handleSwitchAccount() {
    try { await logout(); } catch { /* A local session can still be cleared when the server is unavailable. */ }
    setUser(null);
    setRooms([]);
    setDiscoverableRooms([]);
    setDiscoverableHasMore(false);
    setDiscoverableQuery('');
    setTeams([]);
    setDirectoryUsers([]);
    setAdminUsers([]);
    setSelectedRoomId('');
    setRoomPayload(null);
    setAuthError('');
    setAuthMode('switch-account');
    setSessionStatus('signed-out');
    setView('estimates');
  }

  async function handleRoomChange(roomId: string) {
    setLoadingWorkspace(true);
    try {
      const [payload, nextAdminUsers] = await Promise.all([
        loadRoom(roomId),
        user?.role === 'admin' ? listAdminUsers(roomId) : Promise.resolve([]),
      ]);
      setSelectedRoomId(roomId);
      setRoomPayload(payload);
      setRooms((current) => current.map((candidate) => candidate.id === payload.room.id ? { ...candidate, ...payload.room } : candidate));
      setAdminUsers(nextAdminUsers);
      setView('estimates');
      window.history.replaceState({}, '', `?room=${encodeURIComponent(roomId)}`);
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setLoadingWorkspace(false);
    }
  }

  function handleWorkspaceRefresh() {
    setLoadingWorkspace(true);
    setDiscoverableRooms([]);
    setDiscoverableHasMore(false);
    setDiscoverableQuery('');
    setWorkspaceRefreshToken((current) => current + 1);
  }

  async function handleDiscoverableSearch(query: string) {
    const normalizedQuery = query.trim();
    setDiscoverableQuery(normalizedQuery);
    setDiscoverableLoading(true);
    try {
      const page = await listDiscoverableRooms(normalizedQuery);
      setDiscoverableRooms(page.rooms);
      setDiscoverableHasMore(page.hasMore);
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setDiscoverableLoading(false);
    }
  }

  async function handleDiscoverableLoadMore() {
    if (discoverableLoading || !discoverableHasMore) return;
    setDiscoverableLoading(true);
    try {
      const page = await listDiscoverableRooms(discoverableQuery, discoverableRooms.length);
      setDiscoverableRooms((current) => [...current, ...page.rooms]);
      setDiscoverableHasMore(page.hasMore);
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setDiscoverableLoading(false);
    }
  }

  async function handleJoinRoom(roomId: string) {
    setSaving(true);
    try {
      const payload = await joinRoom(roomId);
      const [nextRooms, nextTeams, nextDirectoryUsers, nextAdminUsers] = await Promise.all([
        listRooms(),
        listTeams(),
        listDirectoryUsers(),
        user?.role === 'admin' ? listAdminUsers(roomId) : Promise.resolve([]),
      ]);
      setRooms(nextRooms);
      setDiscoverableRooms([]);
      setDiscoverableHasMore(false);
      setDiscoverableQuery('');
      setSelectedRoomId(payload.room.id);
      setRoomPayload(payload);
      setTeams(nextTeams);
      setDirectoryUsers(nextDirectoryUsers);
      setAdminUsers(nextAdminUsers);
      setView('estimates');
      window.history.replaceState({}, '', `?room=${encodeURIComponent(payload.room.id)}`);
      setNotice(`Joined ${payload.room.name}`);
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function handleSave(nextState: RoomState) {
    if (!selectedRoomId || !roomPayload) return;
    setSaving(true);
    try {
      const payload = await saveRoomState(selectedRoomId, nextState, roomPayload.room.stateVersion || 0);
      setRoomPayload(payload);
      setNotice('Room state saved');
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) await refreshRoom(selectedRoomId);
      setNotice(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function handleVote(manual: number | null, ai: number | null) {
    if (!selectedRoomId || !roomPayload?.state) return;
    setSaving(true);
    try {
      const aiVote = roomPayload.state.roomSettings.aiEnabled ? ai : null;
      await submitVote(selectedRoomId, roomPayload.state.round.storyId || roomPayload.state.selectedStoryId || '', roomPayload.state.round.roundNumber, manual, aiVote, aiVote !== null);
      await refreshRoom(selectedRoomId);
      setNotice('Vote submitted');
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function handleJoin(joined: boolean) {
    if (!selectedRoomId || !roomPayload?.state) return;
    setSaving(true);
    try {
      const payload = await setParticipation(selectedRoomId, roomPayload.state.round.storyId || '', roomPayload.state.round.roundNumber, joined);
      setRoomPayload(payload);
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveVoter(accountId: string) {
    if (!selectedRoomId || !roomPayload?.state || accountId === user?.id) return;
    setSaving(true);
    try {
      const state = roomPayload.state;
      const payload = await setParticipation(selectedRoomId, state.round.storyId || '', state.round.roundNumber, false, accountId);
      setRoomPayload(payload);
      setNotice('Voter removed from the round');
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function handleClearVotes() {
    if (!selectedRoomId || !roomPayload?.state) return;
    setSaving(true);
    try {
      const state = roomPayload.state;
      const payload = await clearVotes(selectedRoomId, state.round.storyId || '', state.round.roundNumber);
      setRoomPayload(payload);
      setNotice('Votes cleared');
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateRoom(name: string, piLabel: string) {
    if (!selectedRoomId) return;
    setSaving(true);
    try {
      const payload = await createRoom(selectedRoomId, name, piLabel, defaultRoomState());
      const nextRooms = await listRooms();
      setRooms(nextRooms);
      setSelectedRoomId(payload.room.id);
      setRoomPayload(payload);
      setView('estimates');
      setNotice(`${name} created`);
      window.history.replaceState({}, '', `?room=${encodeURIComponent(payload.room.id)}`);
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateTeam(name: string) {
    setSaving(true);
    try {
      const result = await createTeam(name);
      setTeams((current) => [...current, result.team]);
      setNotice(`${name} created`);
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function handleAddTeamMember(teamId: string, accountId: string) {
    setSaving(true);
    try {
      const result = await addTeamMember(teamId, accountId);
      if (result.team) setTeams((current) => current.map((team) => team.id === teamId ? result.team! : team));
      setNotice('Team member added');
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateTeamMemberRole(teamId: string, accountId: string, role: 'developer' | 'observer') {
    setSaving(true);
    try {
      const result = await updateTeamMemberRole(teamId, accountId, role);
      if (result.team) setTeams((current) => current.map((team) => team.id === teamId ? result.team! : team));
      if (selectedRoomId && result.roomIds.includes(selectedRoomId)) await refreshRoom(selectedRoomId);
      setNotice(role === 'observer' ? 'Team member marked as observer' : 'Team member marked as developer');
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteTeam(teamId: string) {
    setSaving(true);
    try {
      await deleteTeam(teamId);
      setTeams((current) => current.filter((team) => team.id !== teamId));
      setNotice('Team deleted');
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveTeamMember(teamId: string, accountId: string) {
    setSaving(true);
    try {
      const result = await removeTeamMember(teamId, accountId);
      if (result.team) setTeams((current) => current.map((team) => team.id === teamId ? result.team! : team));
      setNotice('Team member removed');
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function handlePromoteTeamOwner(teamId: string, accountId: string) {
    setSaving(true);
    try {
      const result = await promoteTeamOwner(teamId, accountId);
      if (result.team) setTeams((current) => current.map((team) => team.id === teamId ? result.team! : team));
      setNotice('Team owner updated');
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateInvite(teamId: string | undefined, kind: 'team' | 'room-team' | 'room-person'): Promise<string | null> {
    if (!selectedRoomId) return null;
    setSaving(true);
    try {
      const result = await createInvite(selectedRoomId, kind, teamId);
      setNotice('Invite link created and copied when the browser allows it');
      return result.url;
    } catch (error) {
      setNotice(errorMessage(error));
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function handleAddRoomMember(input: { accountId?: string; teamId?: string }) {
    if (!selectedRoomId) return;
    setSaving(true);
    try {
      const payload = await addRoomMember(selectedRoomId, input);
      setRoomPayload(payload);
      setRooms((current) => current.map((candidate) => candidate.id === payload.room.id ? { ...candidate, ...payload.room } : candidate));
      setNotice(input.teamId ? 'Team added to room' : 'Member added to room');
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateRoom(name: string, piLabel: string) {
    if (!selectedRoomId) return;
    setSaving(true);
    try {
      const payload = await updateRoom(selectedRoomId, { name, piLabel });
      setRoomPayload(payload);
      setRooms((current) => current.map((candidate) => candidate.id === payload.room.id ? { ...candidate, ...payload.room } : candidate));
      setNotice('Room settings saved');
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveRoomMember(accountId: string) {
    if (!selectedRoomId) return;
    setSaving(true);
    try {
      const payload = await removeRoomMember(selectedRoomId, accountId);
      setRoomPayload(payload);
      setRooms((current) => current.map((candidate) => candidate.id === payload.room.id ? { ...candidate, ...payload.room } : candidate));
      setNotice('Member removed from room');
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveRoomTeam(teamId: string) {
    if (!selectedRoomId) return;
    setSaving(true);
    try {
      const payload = await removeRoomTeam(selectedRoomId, teamId);
      setRoomPayload(payload);
      setRooms((current) => current.map((candidate) => candidate.id === payload.room.id ? { ...candidate, ...payload.room } : candidate));
      setNotice('Team removed from room');
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteRoom(room: Room) {
    setSaving(true);
    try {
      await deleteRoom(room.id);
      const nextRooms = await listRooms();
      setRooms(nextRooms);
      const nextRoom = nextRooms[0];
      if (nextRoom) await handleRoomChange(nextRoom.id);
      setNotice(`${room.name} deleted`);
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateAdminUser(input: { displayName: string; username: string; password: string }) {
    if (!selectedRoomId) return null;
    setSaving(true);
    try {
      const result = await createAdminUser(selectedRoomId, input);
      setAdminUsers((current) => [...current, result.user]);
      setDirectoryUsers((current) => [...current, result.user]);
      setNotice(`${result.user.name} created`);
      return result.credentials;
    } catch (error) {
      setNotice(errorMessage(error));
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateAdminUser(accountId: string, input: { displayName: string; username: string; password?: string }) {
    if (!selectedRoomId) return null;
    setSaving(true);
    try {
      const result = await updateAdminUser(selectedRoomId, accountId, input);
      setAdminUsers((current) => current.map((account) => account.id === accountId ? { ...account, ...result.user } : account));
      setDirectoryUsers((current) => current.map((account) => account.id === accountId ? { ...account, ...result.user } : account));
      if (user?.id === accountId) setUser((current) => current ? { ...current, ...result.user } : current);
      setNotice(`${result.user.name} updated`);
      return result.credentials;
    } catch (error) {
      setNotice(errorMessage(error));
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteAdminUser(accountId: string) {
    if (!selectedRoomId) return;
    setSaving(true);
    try {
      await deleteAdminUser(selectedRoomId, accountId);
      setAdminUsers((current) => current.filter((account) => account.id !== accountId));
      setDirectoryUsers((current) => current.filter((account) => account.id !== accountId));
      if (selectedRoomId) await refreshRoom(selectedRoomId);
      setNotice('User removed');
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function handleExportBackup() {
    setSaving(true);
    try {
      const blob = await downloadBackup();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'pointline-backup-' + new Date().toISOString().replaceAll(':', '-') + '.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setNotice('Backup downloaded');
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function handleImportBackup(file: File) {
    setSaving(true);
    try {
      const result = await importBackup(file);
      const total = Object.values(result.counts).reduce((sum, count) => sum + count, 0);
      setNotice('Backup imported (' + total + ' records). Reloading workspace…');
      window.setTimeout(() => window.location.reload(), 600);
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  if (sessionStatus === 'loading') return <div className="pl-loading">Opening Pointline…</div>;
  if (sessionStatus === 'signed-out' || !user) return <AuthScreen error={authError} loading={authLoading} switchingAccount={authMode === 'switch-account'} onSubmit={handleLogin} />;
  if (loadingWorkspace) return <div className="pl-loading">Loading your planning workspace…</div>;
  if (!roomPayload || !selectedRoomId) {
    return <><AppShell user={user} rooms={rooms} selectedRoomId={selectedRoomId} view={view} collapsed={sidebarCollapsed} onRoomChange={handleRoomChange} onViewChange={setView} onToggleCollapsed={() => setSidebarCollapsed((current) => !current)} onSwitchAccount={handleSwitchAccount} onSignOut={handleSignOut}><EmptyWorkspacePage rooms={discoverableRooms} saving={saving} loading={discoverableLoading} hasMore={discoverableHasMore} query={discoverableQuery} onJoin={handleJoinRoom} onSearch={handleDiscoverableSearch} onLoadMore={handleDiscoverableLoadMore} onRefresh={handleWorkspaceRefresh} /></AppShell>{notice ? <div className="pl-toast" role="status">{notice}</div> : null}</>;
  }

  const room = roomPayload.room;
  const state = roomPayload.state;
  const isObserver = room.members?.some((member) => member.id === user.id && member.role === 'observer') === true;
  const content = !state
    ? <section className="card pl-placeholder"><div className="sidebar-tip-icon"><AppIcon name="listChecks" size={22} /></div><h2>This room is ready for its first story</h2><p>Initialize the room with a starter story, then invite the team into the first estimation round.</p>{isObserver ? <p className="modal-hint">Observers can view the room once it has been initialized by a room manager.</p> : <button className="primary-button" type="button" disabled={saving} onClick={() => void handleSave(defaultRoomState())}>Initialize room</button>}</section>
    : view === 'estimates'
      ? <EstimatesPage room={room} state={state} user={user} saving={saving} onSave={handleSave} onVote={handleVote} onJoin={handleJoin} onClearVotes={handleClearVotes} onRemoveVoter={handleRemoveVoter} />
      : view === 'rooms'
        ? <RoomsPage rooms={rooms} currentRoom={room} selectedRoomId={selectedRoomId} saving={saving} onCreate={handleCreateRoom} onSelect={handleRoomChange} onDelete={handleDeleteRoom} onUpdate={handleUpdateRoom} onRemoveMember={handleRemoveRoomMember} onRemoveTeam={handleRemoveRoomTeam} directoryUsers={directoryUsers} teams={teams} canManage={room.role === 'owner' || room.role === 'admin' || user.role === 'admin'} onAddMember={handleAddRoomMember} onInvite={(kind, teamId) => handleCreateInvite(teamId, kind)} />
        : view === 'team'
          ? <TeamPage teams={teams} directoryUsers={directoryUsers} saving={saving} canManage={user.role === 'admin'} onCreate={handleCreateTeam} onAddMember={handleAddTeamMember} onUpdateMemberRole={handleUpdateTeamMemberRole} onDelete={handleDeleteTeam} onRemoveMember={handleRemoveTeamMember} onPromoteOwner={handlePromoteTeamOwner} />
        : view === 'settings'
            ? <SettingsPage state={state} saving={saving} readOnly={isObserver} onSave={handleSave} />
            : view === 'board'
              ? <DeliveryBoardPage room={room} state={state} user={user} saving={saving} readOnly={isObserver} onSave={handleSave} />
            : view === 'capacity'
              ? <CapacityPage room={room} state={state} user={user} saving={saving} readOnly={isObserver} onSave={handleSave} />
              : view === 'resources'
                ? <ResourcesPage state={state} saving={saving} readOnly={isObserver} onSave={handleSave} />
                : <AdminPage users={adminUsers} currentUserId={user.id} saving={saving} onCreate={handleCreateAdminUser} onUpdate={handleUpdateAdminUser} onDelete={handleDeleteAdminUser} onExport={handleExportBackup} onImport={handleImportBackup} />;

  return <><AppShell user={user} rooms={rooms} selectedRoomId={selectedRoomId} view={view} collapsed={sidebarCollapsed} onRoomChange={handleRoomChange} onViewChange={setView} onToggleCollapsed={() => setSidebarCollapsed((current) => !current)} onSwitchAccount={handleSwitchAccount} onSignOut={handleSignOut}>{content}</AppShell>{notice ? <div className="pl-toast" role="status">{notice}</div> : null}</>;
}

