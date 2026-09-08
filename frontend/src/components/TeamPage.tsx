import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { Team, User } from '../types';

type TeamPageProps = {
  teams: Team[];
  directoryUsers: User[];
  saving: boolean;
  canManage: boolean;
  onCreate: (name: string) => Promise<void>;
  onAddMember: (teamId: string, accountId: string) => Promise<void>;
  onInvite: (teamId: string, kind: 'team' | 'room-team') => Promise<string | null>;
};

export function TeamPage({ teams, directoryUsers, saving, canManage, onCreate, onAddMember, onInvite }: TeamPageProps) {
  const [name, setName] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState(teams[0]?.id || '');
  const [memberId, setMemberId] = useState('');
  const [inviteUrl, setInviteUrl] = useState('');
  const selectedTeam = teams.find((team) => team.id === selectedTeamId) || teams[0];
  const availableUsers = useMemo(() => {
    const existing = new Set(selectedTeam?.members.map((member) => member.id));
    return directoryUsers.filter((candidate) => !existing.has(candidate.id));
  }, [directoryUsers, selectedTeam]);

  useEffect(() => {
    if (!selectedTeam || !teams.some((team) => team.id === selectedTeamId)) setSelectedTeamId(teams[0]?.id || '');
  }, [selectedTeam, selectedTeamId, teams]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    await onCreate(name.trim());
    setName('');
  }

  async function addMember() {
    if (!selectedTeam || !memberId) return;
    await onAddMember(selectedTeam.id, memberId);
    setMemberId('');
  }

  async function createInvite(kind: 'team' | 'room-team') {
    if (!selectedTeam) return;
    const url = await onInvite(selectedTeam.id, kind);
    if (url) {
      setInviteUrl(url);
      try { await navigator.clipboard.writeText(url); } catch { /* Copy remains available through the link field. */ }
    }
  }

  return <div className="management-content"><div className="hero-row"><div><p className="eyebrow">Workspace</p><h1>Bring the right people in.</h1><p className="hero-copy">Teams can be reused across rooms and invited into planning work when the increment is ready.</p></div></div><div className="pl-management-grid"><section className="card pl-form-card"><span className="story-progress">New team</span><h2>Create a team</h2><p>Start a reusable planning group for this workspace.</p><form className="pl-form" onSubmit={(event) => void submit(event)}><label className="modal-field"><span>Team name</span><input className="modal-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Commerce planning" required /></label><button className="primary-button" type="submit" disabled={saving}>Create team</button></form></section><section className="card pl-list-card"><div className="queue-header"><div><h2>Teams</h2><p>{teams.length} {teams.length === 1 ? 'team' : 'teams'} available</p></div></div><div className="pl-team-list">{teams.length ? teams.map((team) => <button className={`pl-team-card${team.id === selectedTeam?.id ? ' active' : ''}`} type="button" key={team.id} onClick={() => setSelectedTeamId(team.id)}><div><strong>{team.name}</strong><p>{team.memberCount} {team.memberCount === 1 ? 'member' : 'members'} · {team.role}</p></div><div className="pl-team-members">{team.members.slice(0, 4).map((member) => <span className="avatar" title={member.name} key={member.id}>{member.name.slice(0, 1).toUpperCase()}</span>)}</div></button>) : <div className="empty-state"><h2>No teams yet</h2><p>Create a team to make membership reusable.</p></div>}</div></section></div>{selectedTeam ? <section className="card pl-detail-card"><div className="lower-card-heading"><div><p className="section-kicker">Selected team</p><h2>{selectedTeam.name}</h2><p>{selectedTeam.memberCount} members · {selectedTeam.role}</p></div><div className="footer-actions">{canManage ? <><button className="outline-button" type="button" disabled={saving} onClick={() => void createInvite('team')}>Invite to team</button><button className="outline-button" type="button" disabled={saving} onClick={() => void createInvite('room-team')}>Invite team to room</button></> : null}</div></div>{canManage ? <div className="inline-manager"><select className="modal-input" value={memberId} onChange={(event) => setMemberId(event.target.value)}><option value="">Add an existing account…</option>{availableUsers.map((candidate) => <option value={candidate.id} key={candidate.id}>{candidate.name || candidate.username}</option>)}</select><button className="primary-button" type="button" disabled={saving || !memberId} onClick={() => void addMember()}>Add member</button></div> : null}<div className="pl-member-grid">{selectedTeam.members.map((member) => <div className="pl-member-row" key={member.id}><span className="avatar small-avatar">{member.name.slice(0, 1).toUpperCase()}</span><span><strong>{member.name}</strong><small>{member.email}</small></span><span className="member-role">{member.role}</span></div>)}</div>{inviteUrl ? <div className="invite-result"><label htmlFor="team-invite-url">Latest invite link</label><div className="invite-url-row"><input id="team-invite-url" className="modal-input" readOnly value={inviteUrl} onFocus={(event) => event.currentTarget.select()} /><button className="primary-button" type="button" onClick={() => void navigator.clipboard?.writeText(inviteUrl)}>Copy</button></div></div> : null}</section> : null}</div>;
}
