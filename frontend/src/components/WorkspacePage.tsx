import type { RoomState } from '../types';
import { cloneState, sequences } from '../state';
import { AppIcon } from './AppIcon';

export function WorkspacePage({ kind }: { kind: 'capacity' | 'resources' | 'admin' }) {
  const copy = {
    capacity: ['Capacity is next', 'The React shell is in place. Capacity editing will move over after the estimation flow is fully wired.'],
    resources: ['Resources are next', 'The room’s domain and service model remains available through the shared API while this view is migrated.'],
    admin: ['Administration is next', 'Account management will move into the React workspace after the core room workflow is complete.'],
  } as const;
  return <div className="management-content"><div className="hero-row"><div><p className="eyebrow">React migration</p><h1>{copy[kind][0]}.</h1><p className="hero-copy">{copy[kind][1]}</p></div></div><section className="card pl-placeholder"><div className="sidebar-tip-icon"><AppIcon name="sparkles" size={22} /></div><h2>More of Pointline is coming across</h2><p>This route now belongs to the React application shell. Existing data stays in the same backend contract while the remaining management surface is converted screen by screen.</p></section></div>;
}

export function SettingsPage({ state, saving, readOnly = false, onSave }: { state: RoomState; saving: boolean; readOnly?: boolean; onSave: (state: RoomState) => Promise<void> }) {
  return <div className="management-content"><div className="hero-row"><div><p className="eyebrow">Room settings</p><h1>Set the room up once.</h1><p className="hero-copy">These defaults are shared by every planning round in the current room.</p>{readOnly ? <p className="modal-hint">Observers can view room settings but cannot change them.</p> : null}</div></div><section className="card pl-settings-card"><div className="room-setting-row"><span><strong>Story point sequence</strong><small>{sequences[state.sequence].helper}</small></span><select className="modal-input" value={state.sequence} disabled={saving || readOnly} onChange={(event) => { const next = cloneState(state); next.sequence = event.target.value as RoomState['sequence']; void onSave(next); }}><option value="sequential">Sequential</option><option value="fibonacci">Fibonacci</option><option value="modified">Modified Fibonacci</option></select></div><div className="room-setting-row"><span><strong>AI comparison</strong><small>Keep an optional second estimate beside the team’s manual value.</small></span><input type="checkbox" checked={state.roomSettings.aiEnabled} disabled={saving || readOnly} onChange={(event) => { const next = cloneState(state); next.roomSettings.aiEnabled = event.target.checked; void onSave(next); }} /></div><div className="room-setting-row"><span><strong>Vote visibility</strong><small>Open votes are visible as they arrive; hidden votes reveal together.</small></span><select className="modal-input" value={state.roomSettings.voteMode} disabled={saving || readOnly} onChange={(event) => { const next = cloneState(state); next.roomSettings.voteMode = event.target.value as 'hidden' | 'open'; next.round.mode = next.roomSettings.voteMode; void onSave(next); }}><option value="hidden">Hidden until reveal</option><option value="open">Open while voting</option></select></div></section></div>;
}

