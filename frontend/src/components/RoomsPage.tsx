import { FormEvent, useState } from 'react';
import type { Room, Team, User } from '../types';

type RoomsPageProps = {
  rooms: Room[];
  selectedRoomId: string;
  saving: boolean;
  onCreate: (name: string, piLabel: string) => Promise<void>;
  onSelect: (roomId: string) => void;
  onDelete: (room: Room) => Promise<void>;
  directoryUsers: User[];
  teams: Team[];
  canManage: boolean;
  onAddMember: (input: { accountId?: string; teamId?: string }) => Promise<void>;
  onInvite: (kind: 'room-person' | 'room-team', teamId?: string) => Promise<string | null>;
};

export function RoomsPage({ rooms, selectedRoomId, saving, onCreate, onSelect, onDelete, directoryUsers, teams, canManage, onAddMember, onInvite }: RoomsPageProps) {
  const [name, setName] = useState('');
  const [piLabel, setPiLabel] = useState('PI 71');
  const [memberId, setMemberId] = useState('');
  const [teamId, setTeamId] = useState('');
  const [inviteUrl, setInviteUrl] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || !piLabel.trim()) return;
    await onCreate(name.trim(), piLabel.trim());
    setName('');
  }

  const selectedRoom = rooms.find((room) => room.id === selectedRoomId);
  async function addPerson() { if (!memberId) return; await onAddMember({ accountId: memberId }); setMemberId(''); }
  async function addTeam() { if (!teamId) return; await onAddMember({ teamId }); setTeamId(''); }
  async function createInvite(kind: 'room-person' | 'room-team', inviteTeamId?: string) { const url = await onInvite(kind, inviteTeamId); if (url) { setInviteUrl(url); try { await navigator.clipboard.writeText(url); } catch { /* Copy remains available through the link field. */ } } }

  return (
    <div className="management-content"><div className="hero-row"><div><p className="eyebrow">Workspace</p><h1>Planning rooms.</h1><p className="hero-copy">Keep each increment’s stories, voting rounds, and team context together.</p></div></div><div className="pl-management-grid"><section className="card pl-form-card"><span className="story-progress">New room</span><h2>Create a planning room</h2><p>Start with one story and add the rest from the Estimates view.</p><form className="pl-form" onSubmit={submit}><label className="modal-field"><span>Room name</span><input className="modal-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="PI71 Planning" required /></label><label className="modal-field"><span>Increment label</span><input className="modal-input" value={piLabel} onChange={(event) => setPiLabel(event.target.value)} placeholder="PI 71" required /></label><button className="primary-button" type="submit" disabled={saving}>Create room</button></form></section><section className="card pl-list-card"><div className="queue-header"><div><h2>Your rooms</h2><p>{rooms.length} available planning {rooms.length === 1 ? 'room' : 'rooms'}</p></div></div><div className="pl-room-list">{rooms.map((room) => <div className={`pl-room-card${room.id === selectedRoomId ? ' active' : ''}`} key={room.id}><button className="pl-room-open" type="button" onClick={() => onSelect(room.id)}><span className="room-dot" /><span><strong>{room.name}</strong><small>{room.piLabel} · {room.memberCount} planners</small></span><span className="pl-room-role">{room.role}</span></button>{(room.role === 'owner' || room.role === 'admin') && rooms.length > 1 ? <button className="story-action-button danger-action" type="button" disabled={saving} onClick={() => { if (window.confirm(`Delete ${room.name}? This removes its stories, votes, and memberships.`)) void onDelete(room); }} aria-label={`Delete ${room.name}`}>×</button> : null}</div>)}</div></section></div>{selectedRoom && canManage ? <section className="card pl-detail-card"><div className="lower-card-heading"><div><p className="section-kicker">Room invitations</p><h2>Invite people or teams to {selectedRoom.name}</h2><p>Add an existing account or reusable workspace team directly, or create a link to share privately.</p></div></div><div className="room-access-grid"><div className="inline-manager"><select className="modal-input" value={memberId} onChange={(event) => setMemberId(event.target.value)}><option value="">Existing account…</option>{directoryUsers.map((candidate) => <option value={candidate.id} key={candidate.id}>{candidate.name || candidate.username}</option>)}</select><button className="primary-button" type="button" disabled={saving || !memberId} onClick={() => void addPerson()}>Add person</button></div><div className="inline-manager"><select className="modal-input" value={teamId} onChange={(event) => setTeamId(event.target.value)}><option value="">Existing team…</option>{teams.map((team) => <option value={team.id} key={team.id}>{team.name}</option>)}</select><button className="primary-button" type="button" disabled={saving || !teamId} onClick={() => void addTeam()}>Add team</button></div></div><div className="footer-actions"><button className="outline-button" type="button" disabled={saving} onClick={() => void createInvite('room-person')}>Create person invite</button><select className="modal-input" value={teamId} onChange={(event) => setTeamId(event.target.value)} aria-label="Team to invite"><option value="">Invite a team…</option>{teams.map((team) => <option value={team.id} key={team.id}>{team.name}</option>)}</select><button className="outline-button" type="button" disabled={saving || !teamId} onClick={() => void createInvite('room-team', teamId)}>Create team invite</button></div>{inviteUrl ? <div className="invite-result"><label htmlFor="room-invite-url">Latest invite link</label><div className="invite-url-row"><input id="room-invite-url" className="modal-input" readOnly value={inviteUrl} onFocus={(event) => event.currentTarget.select()} /><button className="primary-button" type="button" onClick={() => void navigator.clipboard?.writeText(inviteUrl)}>Copy</button></div></div> : null}</section> : null}</div>
  );
}
