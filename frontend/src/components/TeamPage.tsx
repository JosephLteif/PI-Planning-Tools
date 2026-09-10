import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { Team, Train, User } from '../types';
import { AppIcon } from './AppIcon';

type TeamPageProps = {
  teams: Team[];
  trains: Train[];
  directoryUsers: User[];
  saving: boolean;
  canManage: boolean;
  canManageTrains: boolean;
  onCreate: (name: string) => Promise<void>;
  onCreateTrain: (name: string) => Promise<void>;
  onAddMember: (teamId: string, accountId: string) => Promise<void>;
  onUpdateMemberRole: (teamId: string, accountId: string, role: 'developer' | 'observer') => Promise<void>;
  onDelete: (teamId: string) => Promise<void>;
  onDeleteTrain: (trainId: string) => Promise<void>;
  onAddTeamToTrain: (trainId: string, teamId: string) => Promise<void>;
  onRemoveTeamFromTrain: (trainId: string, teamId: string) => Promise<void>;
  onRemoveMember: (teamId: string, accountId: string) => Promise<void>;
  onPromoteOwner: (teamId: string, accountId: string) => Promise<void>;
};

export function TeamPage({ teams, trains, directoryUsers, saving, canManage, canManageTrains, onCreate, onCreateTrain, onAddMember, onUpdateMemberRole, onDelete, onDeleteTrain, onAddTeamToTrain, onRemoveTeamFromTrain, onRemoveMember, onPromoteOwner }: TeamPageProps) {
  const [name, setName] = useState('');
  const [trainName, setTrainName] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState(teams[0]?.id || '');
  const [selectedTrainId, setSelectedTrainId] = useState(trains[0]?.id || '');
  const [memberId, setMemberId] = useState('');
  const [trainTeamId, setTrainTeamId] = useState('');
  const selectedTeam = teams.find((team) => team.id === selectedTeamId) || teams[0];
  const selectedTrain = trains.find((train) => train.id === selectedTrainId) || trains[0];
  const canManageSelectedTeam = canManage || selectedTeam?.role === 'owner';
  const availableUsers = useMemo(() => {
    const existing = new Set(selectedTeam?.members.map((member) => member.id) || []);
    const assignedToAnotherTeam = new Set(teams
      .filter((team) => team.id !== selectedTeam?.id)
      .flatMap((team) => team.members.map((member) => member.id)));
    return directoryUsers.filter((candidate) => !existing.has(candidate.id) && !assignedToAnotherTeam.has(candidate.id));
  }, [directoryUsers, selectedTeam, teams]);
  const availableTeams = teams.filter((team) => !team.trainId);

  useEffect(() => {
    if (!selectedTeam || !teams.some((team) => team.id === selectedTeamId)) setSelectedTeamId(teams[0]?.id || '');
  }, [selectedTeam, selectedTeamId, teams]);

  useEffect(() => {
    if (!selectedTrain || !trains.some((train) => train.id === selectedTrainId)) setSelectedTrainId(trains[0]?.id || '');
  }, [selectedTrain, selectedTrainId, trains]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    await onCreate(name.trim());
    setName('');
  }

  async function submitTrain(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trainName.trim()) return;
    await onCreateTrain(trainName.trim());
    setTrainName('');
  }

  async function addMember() {
    if (!selectedTeam || !memberId) return;
    await onAddMember(selectedTeam.id, memberId);
    setMemberId('');
  }

  async function addTeamToTrain() {
    if (!selectedTrain || !trainTeamId) return;
    await onAddTeamToTrain(selectedTrain.id, trainTeamId);
    setTrainTeamId('');
  }

  async function deleteSelectedTeam() {
    if (!selectedTeam || !window.confirm(`Delete ${selectedTeam.name}? This removes the team and its invite links.`)) return;
    await onDelete(selectedTeam.id);
  }

  async function deleteSelectedTrain() {
    if (!selectedTrain || !window.confirm(`Delete ${selectedTrain.name}? Its teams will remain but become unassigned.`)) return;
    await onDeleteTrain(selectedTrain.id);
  }

  async function promoteMember(accountId: string, memberName: string) {
    if (!selectedTeam || !window.confirm(`Make ${memberName} the owner of ${selectedTeam.name}?`)) return;
    await onPromoteOwner(selectedTeam.id, accountId);
  }

  async function removeMember(accountId: string, memberName: string) {
    if (!selectedTeam || !window.confirm(`Remove ${memberName} from ${selectedTeam.name}?`)) return;
    await onRemoveMember(selectedTeam.id, accountId);
  }

  async function removeTeam(teamId: string, teamName: string) {
    if (!selectedTrain || !window.confirm(`Remove ${teamName} from ${selectedTrain.name}?`)) return;
    await onRemoveTeamFromTrain(selectedTrain.id, teamId);
  }

  async function updateRole(accountId: string, role: 'developer' | 'observer') {
    if (!selectedTeam) return;
    await onUpdateMemberRole(selectedTeam.id, accountId, role);
  }

  return (
    <div className="management-content">
      <div className="hero-row"><div><p className="eyebrow">Workspace</p><h1>Build the team structure.</h1><p className="hero-copy">Teams are workspace-wide groups. Add people here, then organize several teams into a train. Each team can belong to one train at a time.</p></div></div>
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
        {canManageTrains ? <section className="card pl-form-card">
          <span className="story-progress">New train</span>
          <h2>Create a train</h2>
          <p>Group related teams under one workspace train.</p>
          <form className="pl-form" onSubmit={(event) => void submitTrain(event)}>
            <label className="modal-field"><span>Train name</span><input className="modal-input" value={trainName} onChange={(event) => setTrainName(event.target.value)} placeholder="Customer experience" required /></label>
            <button className="primary-button" type="submit" disabled={saving}>Create train</button>
          </form>
        </section> : null}
        <section className="card pl-list-card">
          <div className="queue-header"><div><h2>Teams</h2><p>{teams.length} {teams.length === 1 ? 'team' : 'teams'} available across the workspace</p></div></div>
          <div className="pl-team-list">
            {teams.length ? teams.map((team) => <button className={`pl-team-card${team.id === selectedTeam?.id ? ' active' : ''}`} type="button" key={team.id} onClick={() => setSelectedTeamId(team.id)}><div><strong>{team.name}</strong><p>{team.memberCount} {team.memberCount === 1 ? 'member' : 'members'} · {team.trainName ? `Train: ${team.trainName}` : 'No train'} · {team.role}</p></div><div className="pl-team-members">{team.members.slice(0, 4).map((member) => <span className="avatar" title={member.name} key={member.id}>{member.name.slice(0, 1).toUpperCase()}</span>)}</div></button>) : <div className="empty-state"><h2>No teams yet</h2><p>Create a team to make membership reusable.</p></div>}
          </div>
        </section>
        {canManageTrains ? <section className="card pl-list-card">
          <div className="queue-header"><div><h2>Trains</h2><p>{trains.length} {trains.length === 1 ? 'train' : 'trains'} grouping workspace teams</p></div></div>
          <div className="pl-team-list">
            {trains.length ? trains.map((train) => <button className={`pl-team-card pl-train-card${train.id === selectedTrain?.id ? ' active' : ''}`} type="button" key={train.id} onClick={() => setSelectedTrainId(train.id)}><div><strong>{train.name}</strong><p>{train.teamCount} {train.teamCount === 1 ? 'team' : 'teams'} assigned</p></div><span className="member-role">Train</span></button>) : <div className="empty-state"><h2>No trains yet</h2><p>Create a train, then add existing teams to it.</p></div>}
          </div>
        </section> : null}
      </div>
      {selectedTeam ? <section className="card pl-detail-card">
        <div className="lower-card-heading">
          <div><p className="section-kicker">Workspace team</p><h2>{selectedTeam.name}</h2><p>{selectedTeam.memberCount} members · {selectedTeam.role}{selectedTeam.trainName ? ` · ${selectedTeam.trainName}` : ''}</p></div>
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
      {canManageTrains && selectedTrain ? <section className="card pl-detail-card">
        <div className="lower-card-heading">
          <div><p className="section-kicker">Workspace train</p><h2>{selectedTrain.name}</h2><p>{selectedTrain.teamCount} {selectedTrain.teamCount === 1 ? 'team' : 'teams'} assigned</p></div>
          <button className="outline-button danger-outline" type="button" disabled={saving} onClick={() => void deleteSelectedTrain()}>Delete train</button>
        </div>
        <div className="inline-manager">
          <select className="modal-input" value={trainTeamId} disabled={saving || !availableTeams.length} onChange={(event) => setTrainTeamId(event.target.value)} aria-label="Add an unassigned team to this train">
            <option value="">{availableTeams.length ? 'Add an unassigned team…' : 'No unassigned teams available'}</option>
            {availableTeams.map((team) => <option value={team.id} key={team.id}>{team.name} · {team.memberCount} members</option>)}
          </select>
          <button className="primary-button" type="button" disabled={saving || !trainTeamId} onClick={() => void addTeamToTrain()}>Add team</button>
        </div>
        <p className="modal-hint">A team can belong to only one train. Remove it from its current train before assigning it to another.</p>
        <div className="pl-member-grid">
          {selectedTrain.teams.map((team) => <div className="pl-member-row" key={team.id}>
            <span className="avatar small-avatar">{team.name.slice(0, 1).toUpperCase()}</span>
            <span><strong>{team.name}</strong><small>{team.memberCount} {team.memberCount === 1 ? 'member' : 'members'}</small></span>
            <button className="outline-button danger-outline" type="button" disabled={saving} onClick={() => void removeTeam(team.id, team.name)}>Remove</button>
          </div>)}
          {!selectedTrain.teams.length ? <div className="empty-state"><h2>No teams assigned</h2><p>Add an unassigned team to start this train.</p></div> : null}
        </div>
      </section> : null}
    </div>
  );
}
