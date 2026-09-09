import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { Room, Team, User } from '../types';

type RoomsPageProps = {
  rooms: Room[];
  currentRoom: Room;
  selectedRoomId: string;
  saving: boolean;
  onCreate: (name: string, piLabel: string) => Promise<void>;
  onSelect: (roomId: string) => void;
  onDelete: (room: Room) => Promise<void>;
  onUpdate: (name: string, piLabel: string) => Promise<void>;
  onRemoveMember: (accountId: string) => Promise<void>;
  onRemoveTeam: (teamId: string) => Promise<void>;
  directoryUsers: User[];
  teams: Team[];
  canManage: boolean;
  onAddMember: (input: { accountId?: string; teamId?: string }) => Promise<void>;
  onInvite: (kind: 'room-person' | 'room-team', teamId?: string) => Promise<string | null>;
};

export function RoomsPage({
  rooms,
  currentRoom,
  selectedRoomId,
  saving,
  onCreate,
  onSelect,
  onDelete,
  onUpdate,
  onRemoveMember,
  onRemoveTeam,
  directoryUsers,
  teams,
  canManage,
  onAddMember,
  onInvite,
}: RoomsPageProps) {
  const [newName, setNewName] = useState('');
  const [newPiLabel, setNewPiLabel] = useState('PI 71');
  const [roomName, setRoomName] = useState('');
  const [roomPiLabel, setRoomPiLabel] = useState('');
  const [memberId, setMemberId] = useState('');
  const [teamId, setTeamId] = useState('');
  const [inviteTeamId, setInviteTeamId] = useState('');
  const [inviteUrl, setInviteUrl] = useState('');

  const selectedRoom = currentRoom.id === selectedRoomId
    ? currentRoom
    : rooms.find((room) => room.id === selectedRoomId);
  const roomMembers = selectedRoom?.members || [];
  const roomTeams = selectedRoom?.teams || [];
  const ownerTeamId = roomMembers.find((member) => member.role === 'owner')?.teamId;

  useEffect(() => {
    setRoomName(selectedRoom?.name || '');
    setRoomPiLabel(selectedRoom?.piLabel || '');
    setMemberId('');
    setTeamId('');
    setInviteTeamId('');
  }, [selectedRoom?.id, selectedRoom?.name, selectedRoom?.piLabel]);

  const roomMemberIds = useMemo(() => new Set(roomMembers.map((member) => member.id)), [roomMembers]);
  const roomTeamIds = useMemo(() => new Set(roomTeams.map((team) => team.id)), [roomTeams]);
  const availableUsers = directoryUsers.filter((candidate) => !roomMemberIds.has(candidate.id));
  const availableTeams = teams.filter((team) => !roomTeamIds.has(team.id));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newName.trim() || !newPiLabel.trim()) return;
    await onCreate(newName.trim(), newPiLabel.trim());
    setNewName('');
  }

  async function saveRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRoom || !roomName.trim() || !roomPiLabel.trim()) return;
    await onUpdate(roomName.trim(), roomPiLabel.trim());
  }

  async function addPerson() {
    if (!memberId) return;
    await onAddMember({ accountId: memberId });
    setMemberId('');
  }

  async function addTeam() {
    if (!teamId) return;
    await onAddMember({ teamId });
    setTeamId('');
  }

  async function removeMember(accountId: string, memberName: string) {
    if (!window.confirm(`Remove ${memberName} from ${selectedRoom?.name || 'this room'}?`)) return;
    await onRemoveMember(accountId);
  }

  async function removeTeam(team: { id: string; name: string }) {
    if (!window.confirm(`Remove ${team.name} and its current members from ${selectedRoom?.name || 'this room'}?`)) return;
    await onRemoveTeam(team.id);
  }

  async function createInvite(kind: 'room-person' | 'room-team', selectedTeamId?: string) {
    const url = await onInvite(kind, selectedTeamId);
    if (!url) return;
    setInviteUrl(url);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // The link remains available in the field below when clipboard access is denied.
    }
  }

  return (
    <div className="management-content">
      <div className="hero-row">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1>Planning rooms.</h1>
          <p className="hero-copy">Keep each increment’s stories, voting rounds, and team context together.</p>
        </div>
      </div>

      <div className="pl-management-grid">
        <section className="card pl-form-card">
          <span className="story-progress">New room</span>
          <h2>Create a planning room</h2>
          <p>Start with one story and add the rest from the Estimates view.</p>
          <form className="pl-form" onSubmit={submit}>
            <label className="modal-field">
              <span>Room name</span>
              <input className="modal-input" value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="PI71 Planning" required />
            </label>
            <label className="modal-field">
              <span>Increment label</span>
              <input className="modal-input" value={newPiLabel} onChange={(event) => setNewPiLabel(event.target.value)} placeholder="PI 71" required />
            </label>
            <button className="primary-button" type="submit" disabled={saving}>Create room</button>
          </form>
        </section>

        <section className="card pl-list-card">
          <div className="queue-header">
            <div>
              <h2>Your rooms</h2>
              <p>{rooms.length} available planning {rooms.length === 1 ? 'room' : 'rooms'}</p>
            </div>
          </div>
          <div className="pl-room-list">
            {rooms.map((room) => (
              <div className={`pl-room-card${room.id === selectedRoomId ? ' active' : ''}`} key={room.id}>
                <button className="pl-room-open" type="button" onClick={() => onSelect(room.id)}>
                  <span className="room-dot" />
                  <span>
                    <strong>{room.name}</strong>
                    <small>{room.piLabel} · {room.teamCount || 0} {room.teamCount === 1 ? 'team' : 'teams'} · {room.memberCount} {room.memberCount === 1 ? 'planner' : 'planners'}</small>
                  </span>
                  <span className="pl-room-role">{room.role}</span>
                </button>
                {(room.role === 'owner' || room.role === 'admin') && rooms.length > 1 ? (
                  <button
                    className="story-action-button danger-action"
                    type="button"
                    disabled={saving}
                    onClick={() => {
                      if (window.confirm(`Delete ${room.name}? This removes its stories, votes, and memberships.`)) void onDelete(room);
                    }}
                    aria-label={`Delete ${room.name}`}
                  >×</button>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      </div>

      {selectedRoom && canManage ? (
        <section className="card pl-detail-card room-management-card">
          <div className="lower-card-heading">
            <div>
              <p className="section-kicker">Room access</p>
              <h2>Manage {selectedRoom.name}</h2>
              <p>{roomTeams.length} {roomTeams.length === 1 ? 'team' : 'teams'} · {roomMembers.length} {roomMembers.length === 1 ? 'member' : 'members'} in this room</p>
            </div>
          </div>

          <form className="room-settings-form" onSubmit={(event) => void saveRoom(event)}>
            <label className="modal-field">
              <span>Room name</span>
              <input className="modal-input" value={roomName} onChange={(event) => setRoomName(event.target.value)} maxLength={80} required />
            </label>
            <label className="modal-field">
              <span>Increment label</span>
              <input className="modal-input" value={roomPiLabel} onChange={(event) => setRoomPiLabel(event.target.value)} maxLength={40} required />
            </label>
            <button className="primary-button" type="submit" disabled={saving}>Save room</button>
          </form>

          <div className="room-access-overview">
            <section className="room-access-column">
              <div className="manager-heading">
                <div><strong>Included teams</strong><span>{roomTeams.length} {roomTeams.length === 1 ? 'team' : 'teams'} included</span></div>
              </div>
              <div className="manager-list">
                {roomTeams.length ? roomTeams.map((team) => (
                  <div className="room-access-row" key={team.id}>
                    <span><strong>{team.name}</strong><small>{team.memberCount} members currently in this room</small></span>
                    {team.id === ownerTeamId ? <span className="member-role" title="Transfer room ownership before removing this team">Owner’s team</span> : <button className="outline-button danger-outline room-remove-button" type="button" disabled={saving} onClick={() => void removeTeam(team)}>Remove</button>}
                  </div>
                )) : <p className="empty-manager">No workspace teams are included.</p>}
              </div>
            </section>

            <section className="room-access-column">
              <div className="manager-heading">
                <div><strong>Room members</strong><span>{roomMembers.length} current invitees</span></div>
              </div>
              <div className="manager-list">
                {roomMembers.length ? roomMembers.map((member) => (
                  <div className="room-access-row" key={member.id}>
                    <span><strong>{member.name}</strong><small>{member.teamName ? `Included via ${member.teamName}` : member.email || 'Direct room invite'}</small></span>
                    {member.role === 'owner' ? <span className="member-role">Owner</span> : <button className="outline-button danger-outline room-remove-button" type="button" disabled={saving} onClick={() => void removeMember(member.id, member.name)}>Remove</button>}
                  </div>
                )) : <p className="empty-manager">No members are currently included.</p>}
              </div>
            </section>
          </div>

          <div className="room-access-grid room-add-controls">
            <div className="inline-manager">
              <select className="modal-input" value={memberId} disabled={saving || !availableUsers.length} onChange={(event) => setMemberId(event.target.value)} aria-label="Add an existing account">
                <option value="">{availableUsers.length ? 'Add an existing account…' : 'No uninvited accounts available'}</option>
                {availableUsers.map((candidate) => <option value={candidate.id} key={candidate.id}>{candidate.name || candidate.username || candidate.email || candidate.id}</option>)}
              </select>
              <button className="primary-button" type="button" disabled={saving || !memberId} onClick={() => void addPerson()}>Add person</button>
            </div>
            <div className="inline-manager">
              <select className="modal-input" value={teamId} disabled={saving || !availableTeams.length} onChange={(event) => setTeamId(event.target.value)} aria-label="Add a workspace team">
                <option value="">{availableTeams.length ? 'Add a workspace team…' : 'No unassigned teams available'}</option>
                {availableTeams.map((team) => <option value={team.id} key={team.id}>{team.name} · {team.memberCount} members</option>)}
              </select>
              <button className="primary-button" type="button" disabled={saving || !teamId} onClick={() => void addTeam()}>Add team</button>
            </div>
          </div>

          <div className="footer-actions room-invite-controls">
            <button className="outline-button" type="button" disabled={saving} onClick={() => void createInvite('room-person')}>Create person invite</button>
            <select className="modal-input" value={inviteTeamId} disabled={saving || !teams.length} onChange={(event) => setInviteTeamId(event.target.value)} aria-label="Team to invite">
              <option value="">{teams.length ? 'Invite a team…' : 'No teams available'}</option>
              {teams.map((team) => <option value={team.id} key={team.id}>{team.name}</option>)}
            </select>
            <button className="outline-button" type="button" disabled={saving || !inviteTeamId} onClick={() => void createInvite('room-team', inviteTeamId)}>Create team invite</button>
          </div>

          {inviteUrl ? (
            <div className="invite-result">
              <label htmlFor="room-invite-url">Latest invite link</label>
              <div className="invite-url-row">
                <input id="room-invite-url" className="modal-input" readOnly value={inviteUrl} onFocus={(event) => event.currentTarget.select()} />
                <button className="primary-button" type="button" onClick={() => void navigator.clipboard?.writeText(inviteUrl)}>Copy</button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
