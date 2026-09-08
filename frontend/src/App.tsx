import { useCallback, useEffect, useState } from 'react';
import { addRoomMember, addTeamMember, ApiError, clearVotes, createAdminUser, createInvite, createRoom, createTeam, deleteAdminUser, deleteRoom, downloadBackup, getSession, importBackup, listAdminUsers, listDirectoryUsers, listRooms, listTeams, loadRoom, login, logout, normalizeRoomPayload, saveRoomState, setParticipation, submitVote, updateAdminUser } from './api';
import { AdminPage } from './components/AdminPage';
import { AuthScreen } from './components/AuthScreen';
import { AppShell, type ViewKey } from './components/AppShell';
import { CapacityPage } from './components/CapacityPage';
import { EstimatesPage } from './components/EstimatesPage';
import { ResourcesPage } from './components/ResourcesPage';
import { RoomsPage } from './components/RoomsPage';
import { TeamPage } from './components/TeamPage';
import { SettingsPage } from './components/WorkspacePage';
import { defaultRoomState } from './state';
import type { Room, RoomPayload, RoomState, Team, User } from './types';
import './app.css';

type SessionStatus = 'loading' | 'signed-out' | 'signed-in';

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}

export default function App() {
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [directoryUsers, setDirectoryUsers] = useState<User[]>([]);
  const [adminUsers, setAdminUsers] = useState<import('./types').AdminUser[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [roomPayload, setRoomPayload] = useState<RoomPayload | null>(null);
  const [view, setView] = useState<ViewKey>('estimates');
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
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
        if (!nextRoomId) throw new Error('No planning room is available for this account.');
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
  }, [sessionStatus, user]);

  useEffect(() => {
    if (sessionStatus !== 'signed-in' || !selectedRoomId) return undefined;
    const stream = new EventSource(`/api/state/stream?room=${encodeURIComponent(selectedRoomId)}`);
    const handleState = (event: Event) => {
      try {
        const payload = normalizeRoomPayload(JSON.parse((event as MessageEvent<string>).data) as RoomPayload);
        if (payload.roomId === selectedRoomId) setRoomPayload(payload);
      } catch {
        // The next stream event or an explicit refresh will recover from malformed data.
      }
    };
    stream.addEventListener('state', handleState);
    return () => {
      stream.removeEventListener('state', handleState);
      stream.close();
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
    setTeams([]);
    setDirectoryUsers([]);
    setAdminUsers([]);
    setSelectedRoomId('');
    setRoomPayload(null);
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
      setAdminUsers(nextAdminUsers);
      setView('estimates');
      window.history.replaceState({}, '', `?room=${encodeURIComponent(roomId)}`);
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setLoadingWorkspace(false);
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
      await submitVote(selectedRoomId, roomPayload.state.round.storyId || roomPayload.state.selectedStoryId || '', roomPayload.state.round.roundNumber, manual, ai, ai !== null);
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
      await addRoomMember(selectedRoomId, input);
      const payload = await loadRoom(selectedRoomId);
      setRoomPayload(payload);
      setNotice(input.teamId ? 'Team added to room' : 'Member added to room');
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
  if (sessionStatus === 'signed-out' || !user) return <AuthScreen error={authError} loading={authLoading} onSubmit={handleLogin} />;
  if (loadingWorkspace || !roomPayload || !selectedRoomId) return <div className="pl-loading">Loading your planning workspace…</div>;

  const room = roomPayload.room;
  const state = roomPayload.state;
  const content = !state
    ? <section className="card pl-placeholder"><div className="sidebar-tip-icon">▦</div><h2>This room is ready for its first story</h2><p>Initialize the room with a starter story, then invite the team into the first estimation round.</p><button className="primary-button" type="button" disabled={saving} onClick={() => void handleSave(defaultRoomState())}>Initialize room</button></section>
    : view === 'estimates'
      ? <EstimatesPage room={room} state={state} user={user} saving={saving} onSave={handleSave} onVote={handleVote} onJoin={handleJoin} onClearVotes={handleClearVotes} onRemoveVoter={handleRemoveVoter} />
      : view === 'rooms'
        ? <RoomsPage rooms={rooms} selectedRoomId={selectedRoomId} saving={saving} onCreate={handleCreateRoom} onSelect={handleRoomChange} onDelete={handleDeleteRoom} directoryUsers={directoryUsers} teams={teams} canManage={room.role === 'owner' || room.role === 'admin' || user.role === 'admin'} onAddMember={handleAddRoomMember} onInvite={(kind, teamId) => handleCreateInvite(teamId, kind)} />
        : view === 'team'
          ? <TeamPage teams={teams} directoryUsers={directoryUsers} saving={saving} canManage={room.role === 'owner' || room.role === 'admin' || user.role === 'admin'} onCreate={handleCreateTeam} onAddMember={handleAddTeamMember} />
          : view === 'settings'
            ? <SettingsPage state={state} saving={saving} onSave={handleSave} />
            : view === 'capacity'
              ? <CapacityPage room={room} state={state} user={user} saving={saving} onSave={handleSave} />
              : view === 'resources'
                ? <ResourcesPage state={state} saving={saving} onSave={handleSave} />
                : <AdminPage users={adminUsers} currentUserId={user.id} saving={saving} onCreate={handleCreateAdminUser} onUpdate={handleUpdateAdminUser} onDelete={handleDeleteAdminUser} onExport={handleExportBackup} onImport={handleImportBackup} />;

  return <><AppShell user={user} rooms={rooms} selectedRoomId={selectedRoomId} view={view} collapsed={sidebarCollapsed} onRoomChange={handleRoomChange} onViewChange={setView} onToggleCollapsed={() => setSidebarCollapsed((current) => !current)} onSignOut={handleSignOut}>{content}</AppShell>{notice ? <div className="pl-toast" role="status">{notice}</div> : null}</>;
}
