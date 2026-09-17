import { useState } from 'react';
import type { CapacitySprint, Room, RoomState, User } from '../types';
import { cloneState } from '../state';
import { businessDays, officeWorkdays, sprintCapacity } from '../capacityUtils';
import { AppIcon } from './AppIcon';

type CapacityPageProps = {
  room: Room;
  state: RoomState;
  user: User;
  saving: boolean;
  readOnly?: boolean;
  onSave: (state: RoomState) => Promise<void>;
};

function nextSprint() {
  const start = new Date();
  const end = new Date(start.getTime() + 13 * 86400000);
  const date = (value: Date) => value.toISOString().slice(0, 10);
  return {
    id: `sprint-${Date.now().toString(36)}`,
    name: 'New sprint',
    startDate: date(start),
    endDate: date(end),
    excludeFromTotal: false,
    holidayDaysBeirut: 0,
    holidayDaysCyprus: 0,
    availabilityDays: {},
  };
}

function SprintEditorModal({ sprint, saving, onClose, onSave }: { sprint: CapacitySprint; saving: boolean; onClose: () => void; onSave: (sprint: CapacitySprint) => Promise<void> }) {
  const [draft, setDraft] = useState<CapacitySprint>(() => structuredClone(sprint));

  return (
    <div className="modal-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="capacity-sprint-title">
        <div className="modal-header">
          <div>
            <p className="section-kicker">Capacity plan</p>
            <h2 id="capacity-sprint-title">Edit {sprint.name}</h2>
            <p>Adjust this sprint’s dates, holidays, and inclusion. Edit people availability directly on the sprint card.</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close"><AppIcon name="x" size={16} /></button>
        </div>
        <form className="modal-form" onSubmit={(event) => { event.preventDefault(); void onSave(draft); }}>
          <label className="modal-field">
            <span>Sprint name</span>
            <input className="modal-input" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} required />
          </label>
          <div className="capacity-default-grid">
            <label className="modal-field">
              <span>Start date</span>
              <input className="modal-input" type="date" value={draft.startDate} onChange={(event) => setDraft((current) => ({ ...current, startDate: event.target.value }))} required />
            </label>
            <label className="modal-field">
              <span>End date</span>
              <input className="modal-input" type="date" value={draft.endDate} onChange={(event) => setDraft((current) => ({ ...current, endDate: event.target.value }))} required />
            </label>
            <label className="modal-field">
              <span>Beirut holidays</span>
              <input className="modal-input" type="number" min="0" max="366" value={draft.holidayDaysBeirut} onChange={(event) => setDraft((current) => ({ ...current, holidayDaysBeirut: Math.max(0, Number(event.target.value) || 0) }))} />
            </label>
            <label className="modal-field">
              <span>Cyprus holidays</span>
              <input className="modal-input" type="number" min="0" max="366" value={draft.holidayDaysCyprus} onChange={(event) => setDraft((current) => ({ ...current, holidayDaysCyprus: Math.max(0, Number(event.target.value) || 0) }))} />
            </label>
          </div>
          <label className="room-setting-checkbox">
            <input type="checkbox" checked={draft.excludeFromTotal} onChange={(event) => setDraft((current) => ({ ...current, excludeFromTotal: event.target.checked }))} />
            Do not count towards PI total
          </label>
          <div className="modal-footer">
            <button className="outline-button" type="button" onClick={onClose}>Cancel</button>
            <button className="primary-button" type="submit" disabled={saving}>Save sprint</button>
          </div>
        </form>
      </section>
    </div>
  );
}

export function CapacityPage({ room, state, user, saving, readOnly = false, onSave }: CapacityPageProps) {
  const [editingSprint, setEditingSprint] = useState<CapacitySprint | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [selectedSprintId, setSelectedSprintId] = useState('');
  const canEdit = !readOnly && (room.role === 'owner' || room.role === 'admin' || user.role === 'admin');
  const canEditMember = (memberId: string) => !readOnly && (canEdit || memberId === user.id);
  const capacity = state.capacity;
  const members = capacity.members;
  const included = capacity.sprints.filter((sprint) => !sprint.excludeFromTotal);
  const total = included.reduce((sum, sprint) => sum + members.reduce((inner, member) => inner + sprintCapacity(member, sprint, capacity.defaults).total, 0), 0);
  const activeMemberId = members.some((member) => member.id === selectedMemberId) ? selectedMemberId : '';
  const visibleMembers = activeMemberId ? members.filter((member) => member.id === activeMemberId) : members;
  const selectedSprint = capacity.sprints.find((sprint) => sprint.id === selectedSprintId) || capacity.sprints[0] || null;

  function saveCapacity(update: (next: RoomState) => void) {
    const next = cloneState(state);
    update(next);
    void onSave(next);
  }

  function updateSprintAvailability(sprintId: string, memberId: string, rawValue: string) {
    if (!canEditMember(memberId)) return;
    const trimmedValue = rawValue.trim();
    const parsedValue = Number(trimmedValue);
    const value = trimmedValue === '' ? null : Number.isFinite(parsedValue) ? Math.min(366, Math.max(0, parsedValue)) : 0;
    saveCapacity((next) => {
      const sprint = next.capacity.sprints.find((candidate) => candidate.id === sprintId);
      if (!sprint) return;
      const availabilityDays = { ...sprint.availabilityDays };
      if (value === null) delete availabilityDays[memberId];
      else availabilityDays[memberId] = value;
      sprint.availabilityDays = availabilityDays;
    });
  }

  return (
    <div className="management-content">
      <div className="hero-row">
        <div>
          <p className="eyebrow">Workspace · capacity planning</p>
          <h1>Plan the PI capacity.</h1>
          <p className="hero-copy">Model train/staff development time across sprints, offices, features, and support work.</p>
        </div>
        {canEdit ? <button className="primary-button" type="button" disabled={saving} onClick={() => saveCapacity((next) => { next.capacity.sprints.push(nextSprint()); })}><AppIcon name="plus" size={14} /> Add sprint</button> : null}
      </div>

      <section className="card capacity-summary-card pl-capacity-summary">
        <div className="section-heading">
          <div><p className="section-kicker">PI roll-up</p><h2>Planned capacity</h2></div>
          <span className="section-count">{room.piLabel} · {capacity.sprints.length} sprints</span>
        </div>
        <div className="capacity-summary-grid">
          <div><span>Features</span><strong>{included.reduce((sum, sprint) => sum + members.reduce((inner, member) => inner + sprintCapacity(member, sprint, capacity.defaults).feature, 0), 0).toFixed(1)}</strong></div>
          <div><span>Code review</span><strong>{included.reduce((sum, sprint) => sum + members.reduce((inner, member) => inner + sprintCapacity(member, sprint, capacity.defaults).codeReview, 0), 0).toFixed(1)}</strong></div>
          <div><span>Support / CM</span><strong>{included.reduce((sum, sprint) => sum + members.reduce((inner, member) => inner + sprintCapacity(member, sprint, capacity.defaults).support, 0), 0).toFixed(1)}</strong></div>
          <div><span>Total capacity</span><strong>{total.toFixed(1)}</strong></div>
        </div>
      </section>

      <section className="capacity-layout">
        <section className="card capacity-defaults-card pl-capacity-card">
          <div className="section-heading">
            <div><p className="section-kicker">Room defaults</p><h2>Capacity rules</h2></div>
          </div>
          <p className="settings-copy">Dev % is train/staff development minus ceremonies. The remaining time is split between features, code review, and support.</p>
          <div className="capacity-default-grid">
            {([['ceremoniesPct', 'Ceremonies %'], ['featureCapacityPct', 'Features capacity %'], ['codeReviewPct', 'Code review % of features'], ['supportCapacityPct', 'Support / CM capacity %']] as const).map(([key, label]) => (
              <label className="modal-field" key={key}>
                <span>{label}</span>
                <input className="modal-input" type="number" min="0" max="100" step="1" disabled={!canEdit || saving} defaultValue={Math.round(capacity.defaults[key] * 100)} onBlur={(event) => saveCapacity((next) => { next.capacity.defaults[key] = Math.min(1, Math.max(0, Number(event.target.value) / 100)); })} />
              </label>
            ))}
          </div>
        </section>

        <section className="card capacity-members-card pl-capacity-card">
          <div className="section-heading">
            <div><p className="section-kicker">Team assumptions</p><h2>Members and offices</h2></div>
            <label className="capacity-member-filter"><span>Member</span><select className="modal-input" value={activeMemberId} onChange={(event) => setSelectedMemberId(event.target.value)} aria-label="Filter capacity by member"><option value="">All members</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
          </div>
          <p className="settings-copy">Set your own office, train/staff development, and sprint availability. Room managers can edit the whole team.</p>
          <div className="capacity-member-list">
            {visibleMembers.map((member) => (
              <div className="capacity-member-row" key={member.id}>
                <div><strong>{member.name}</strong><small>Derived dev: {Math.round(Math.max(0, member.trainStaffDevCapacityPct - capacity.defaults.ceremoniesPct) * 100)}%</small></div>
                <label>
                  <span>Office</span>
                  <select className="modal-input" disabled={!canEditMember(member.id) || saving} defaultValue={member.office} onChange={(event) => saveCapacity((next) => { const target = next.capacity.members.find((item) => item.id === member.id); if (target) target.office = event.target.value as 'beirut' | 'cyprus'; })}>
                    <option value="beirut">Beirut</option>
                    <option value="cyprus">Cyprus</option>
                  </select>
                </label>
                <label>
                  <span>Train/staff dev %</span>
                  <input className="modal-input" type="number" min="0" max="100" step="1" disabled={!canEditMember(member.id) || saving} defaultValue={Math.round(member.trainStaffDevCapacityPct * 100)} onBlur={(event) => saveCapacity((next) => { const target = next.capacity.members.find((item) => item.id === member.id); if (target) target.trainStaffDevCapacityPct = Math.min(1, Math.max(0, Number(event.target.value) / 100)); })} />
                </label>
              </div>
            ))}
          </div>
        </section>
      </section>

      {capacity.sprints.length ? <div className="capacity-sprint-selector">
        <div className="capacity-sprint-selector-copy"><p className="section-kicker">Sprint focus</p><strong>Select a sprint</strong><span>Choose a sprint tag to view its capacity and availability.</span></div>
        <div className="capacity-sprint-tags" role="tablist" aria-label="Select sprint">
          {capacity.sprints.map((sprint) => <button className={`capacity-sprint-tag${selectedSprint?.id === sprint.id ? ' active' : ''}`} key={sprint.id} type="button" role="tab" aria-selected={selectedSprint?.id === sprint.id} onClick={() => setSelectedSprintId(sprint.id)}>{sprint.name}</button>)}
        </div>
      </div> : null}

      {selectedSprint ? (
        <section className="card capacity-sprint-card pl-capacity-card" key={selectedSprint.id}>
          <div className="section-heading">
            <div>
              <p className="section-kicker">Sprint</p>
              <h2>{selectedSprint.name}</h2>
              <p className="settings-copy">{selectedSprint.startDate || 'Start date'} → {selectedSprint.endDate || 'End date'} · {businessDays(selectedSprint.startDate, selectedSprint.endDate)} weekdays</p>
            </div>
            {canEdit ? <div className="footer-actions"><button className="outline-button" type="button" disabled={saving} onClick={() => setEditingSprint(selectedSprint)}>Edit</button><button className="outline-button" type="button" disabled={saving} onClick={() => saveCapacity((next) => { next.capacity.sprints = next.capacity.sprints.filter((item) => item.id !== selectedSprint.id); })}>Remove</button></div> : null}
          </div>

          <div className="capacity-summary-grid">
            {(['feature', 'codeReview', 'support', 'total'] as const).map((key) => (
              <div key={key}><span>{key === 'codeReview' ? 'Code review' : key === 'feature' ? 'Features' : key === 'support' ? 'Support / CM' : 'Total capacity'}</span><strong>{visibleMembers.reduce((sum, member) => sum + sprintCapacity(member, selectedSprint, capacity.defaults)[key], 0).toFixed(1)}</strong></div>
            ))}
          </div>

          {visibleMembers.length ? <div className="capacity-sprint-people">
            <div className="capacity-sprint-people-heading">
              <div><strong>People & availability</strong><span>Edit available days directly for this sprint.</span></div>
              <span>{visibleMembers.length} {visibleMembers.length === 1 ? 'person' : 'people'}</span>
            </div>
            <div className="capacity-sprint-person-list">
              <div className="capacity-sprint-person-header" aria-hidden="true"><span>Person</span><span>Office</span><span>Dev capacity</span><span>Available days</span></div>
              {visibleMembers.map((member) => {
                const details = sprintCapacity(member, selectedSprint, capacity.defaults);
                const defaultAvailability = officeWorkdays(member, selectedSprint);
                const hasOverride = Object.prototype.hasOwnProperty.call(selectedSprint.availabilityDays, member.id);
                return <div className="capacity-sprint-person-row" key={member.id}>
                  <div className="capacity-sprint-person-name"><strong>{member.name}</strong><small>{hasOverride ? 'Manual override' : `Office weekdays · ${defaultAvailability} days`}</small></div>
                  <span className="capacity-sprint-person-office">{member.office === 'cyprus' ? 'Cyprus' : 'Beirut'}</span>
                  <div className="capacity-sprint-person-dev"><strong>{Math.round(member.trainStaffDevCapacityPct * 100)}%</strong><small>Derived {Math.round(details.devPct * 100)}%</small></div>
                  <label className="capacity-sprint-availability-field">
                    <span className="capacity-sprint-availability-input"><input key={`${member.id}-${selectedSprint.availabilityDays[member.id] ?? `calculated-${details.availability}`}`} className="compact-input" type="number" min="0" max="366" step="1" defaultValue={details.availability} disabled={!canEditMember(member.id) || saving} onBlur={(event) => updateSprintAvailability(selectedSprint.id, member.id, event.target.value)} aria-label={`${member.name} available days for ${selectedSprint.name}`} /><span>days</span></span>
                    <small>{hasOverride ? 'override' : 'calculated'}</small>
                  </label>
                </div>;
              })}
            </div>
          </div> : null}
        </section>
      ) : <section className="card empty-state capacity-empty-state"><span className="empty-state-icon"><AppIcon name="plus" size={22} /></span><h3>Add the first sprint</h3><p>Set sprint dates and holidays to see office-aware capacity totals.</p></section>}

      {editingSprint ? <SprintEditorModal sprint={editingSprint} saving={saving} onClose={() => setEditingSprint(null)} onSave={async (updated) => { const next = cloneState(state); next.capacity.sprints = next.capacity.sprints.map((sprint) => sprint.id === updated.id ? updated : sprint); await onSave(next); setEditingSprint(null); }} /> : null}
    </div>
  );
}
