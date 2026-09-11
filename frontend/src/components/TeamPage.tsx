import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { Team, User } from '../types';
import { AppIcon } from './AppIcon';

type TeamPageProps = {
  teams: Team[];
  directoryUsers: User[];
  saving: boolean;
  canManage: boolean;
  onCreate: (name: string) => Promise<void>;
  onAddMember: (teamId: string, accountId: string) => Promise<void>;
  onUpdateMemberRole: (teamId: string, accountId: string, role: 'developer' | 'observer') => Promise<void>;
  onDelete: (teamId: string) => Promise<void>;
  onRemoveMember: (teamId: string, accountId: string) => Promise<void>;
  onPromoteOwner: (teamId: string, accountId: string) => Promise<void>;
};

export function TeamPage({ teams, directoryUsers, saving, canManage, onCreate, onAddMember, onUpdateMemberRole, onDelete, onRemoveMember, onPromoteOwner }: TeamPageProps) {
  const [name, setName] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState(teams[0]?.id || '');
  const [memberId, setMemberId] = useState('');
  const selectedTeam = teams.find((team) => team.id === selectedTeamId) || teams[0];
  const canManageSelectedTeam = canManage || selectedTeam?.role === 'owner';
  const availableUsers = useMemo(() => {
    const existing = new Set(selectedTeam?.members.map((member) => member.id));
    const assignedToAnotherTeam = new Set(teams
      .filter((team) => team.id !== selectedTeam?.id)
      .flatMap((team) => team.members.map((member) => member.id)));
    return directoryUsers.filter((candidate) => !existing.has(candidate.id) && !assignedToAnotherTeam.has(candidate.id));
  }, [directoryUsers, selectedTeam, teams]);

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

  async function deleteSelectedTeam() {
    if (!selectedTeam || !window.confirm(`Delete ${selectedTeam.name}? This removes the team and its invite links.`)) return;
    await onDelete(selectedTeam.id);
  }

  async function promoteMember(accountId: string, memberName: string) {
    if (!selectedTeam || !window.confirm(`Make ${memberName} the owner of ${selectedTeam.name}?`)) return;
    await onPromoteOwner(selectedTeam.id, accountId);
  }

  async function removeMember(accountId: string, memberName: string) {
    if (!selectedTeam || !window.confirm(`Remove ${memberName} from ${selectedTeam.name}?`)) return;
    await onRemoveMember(selectedTeam.id, accountId);
  }

  async function updateRole(accountId: string, role: 'developer' | 'observer') {
    if (!selectedTeam) return;
    await onUpdateMemberRole(selectedTeam.id, accountId, role);
  }

  return (
    <div className="management-content">
      <div className="hero-row"><div><p className="eyebrow">Workspace</p><h1>Bring the right people in.</h1><p className="hero-copy">Teams are workspace-wide groups. Add people here, set each person as a Developer or Observer, then invite a person or team into a room.</p></div></div>
      <div className="pl-management-grid">
        <section className="card pl-form-card">
          <span className="story-progress">New team</span>
          <h2>Create a team</h2>
          <p>Start a reusable planning group for this workspace.</p>
          <form className="pl-form" onSubmit={(event) => void submit(event)}>
            <label className="modal-field"><span>Team name</span><input className="modal-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Platform planning" required /></label>
            <button className="primary-button" type="submit" disabled={saving}>Create team</button>
          </form>
        </section>
        <section className="card pl-list-card">
          <div className="queue-header"><div><h2>Teams</h2><p>{teams.length} {teams.length === 1 ? 'team' : 'teams'} available across the workspace</p></div></div>
          <div className="pl-team-list">
            {teams.length ? teams.map((team) => <button className={`pl-team-card${team.id === selectedTeam?.id ? ' active' : ''}`} type="button" key={team.id} onClick={() => setSelectedTeamId(team.id)}><div><strong>{team.name}</strong><p>{team.memberCount} {team.memberCount === 1 ? 'member' : 'members'} · {team.role}</p></div><div className="pl-team-members">{team.members.slice(0, 4).map((member) => <span className="avatar" title={member.name} key={member.id}>{member.name.slice(0, 1).toUpperCase()}</span>)}</div></button>) : <div className="empty-state"><h2>No teams yet</h2><p>Create a team to make membership reusable.</p></div>}
          </div>
        </section>
      </div>
      {selectedTeam ? <section className="card pl-detail-card">
        <div className="lower-card-heading">
          <div><p className="section-kicker">Workspace team</p><h2>{selectedTeam.name}</h2><p>{selectedTeam.memberCount} members · {selectedTeam.role}</p></div>
          {canManageSelectedTeam ? <button className="outline-button danger-outline" type="button" disabled={saving} onClick={() => void deleteSelectedTeam()}>Delete team</button> : null}
        </div>
        {canManageSelectedTeam ? <>
          <div className="inline-manager">
            <select className="modal-input" value={memberId} disabled={saving || !availableUsers.length} onChange={(event) => setMemberId(event.target.value)} aria-label="Add an existing account">
              <option value="">{availableUsers.length ? 'Add an existing account…' : 'No unassigned accounts available'}</option>
              {availableUsers.map((candidate) => <option value={candidate.id} key={candidate.id}>{candidate.name || candidate.username || candidate.email || candidate.id}</option>)}
            </select>
            <button className="primary-button" type="button" disabled={saving || !memberId} onClick={() => void addMember()}><AppIcon name="userPlus" size={14} /> Add member</button>
          </div>
          <p className="modal-hint">Each person can belong to one workspace team at a time. Their role applies to every room where they participate through this team.</p>
        </> : null}
        <div className="pl-member-grid">
          {selectedTeam.members.map((member) => <div className="pl-member-row" key={member.id}>
            <span className="avatar small-avatar">{member.name.slice(0, 1).toUpperCase()}</span>
            <span><strong>{member.name}</strong><small>{member.email}</small></span>
            {canManageSelectedTeam && member.role !== 'owner' ? <div className="pl-member-actions">
              <select
                className="modal-input team-member-role-select"
                value={member.role === 'observer' ? 'observer' : 'developer'}
                disabled={saving}
                onChange={(event) => void updateRole(member.id, event.target.value as 'developer' | 'observer')}
                aria-label={`Role for ${member.name}`}
              >
                <option value="developer">Developer</option>
                <option value="observer">Observer</option>
              </select>
              <button className="outline-button" type="button" disabled={saving} onClick={() => void promoteMember(member.id, member.name)}>Make owner</button>
              <button className="outline-button danger-outline" type="button" disabled={saving} onClick={() => void removeMember(member.id, member.name)}>Remove</button>
            </div> : <span className="member-role">{member.role === 'owner' ? 'Owner' : member.role === 'observer' ? 'Observer' : 'Developer'}</span>}
          </div>)}
        </div>
      </section> : null}
    </div>
  );
}

