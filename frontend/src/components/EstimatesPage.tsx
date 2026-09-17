import { useEffect, useMemo, useState } from 'react';
import { ImportStoriesModal } from './ImportStoriesModal';
import { StoryEditorModal } from './StoryEditorModal';
import { AppIcon } from './AppIcon';
import type { Room, RoomState, Story, User } from '../types';
import { cloneState, initials, sequences } from '../state';
import { isStretchStory, nextImportedStoryId } from '../storyUtils';

type EstimatesPageProps = {
  room: Room;
  state: RoomState;
  user: User;
  focusMode?: boolean;
  saving: boolean;
  onSave: (state: RoomState) => Promise<void>;
  onVote: (manual: number | null, ai: number | null) => Promise<void>;
  onJoin: (joined: boolean) => Promise<void>;
  onClearVotes: () => Promise<void>;
  onRemoveVoter: (accountId: string) => Promise<void>;
};

type StoryQueueProps = {
  stories: Story[];
  selectedId: string;
  collapsed: boolean;
  canManage: boolean;
  aiEnabled: boolean;
  sessionActive: boolean;
  storySelectionDisabled: boolean;
  sessionPaused: boolean;
  onSelect: (id: string) => void;
  onNew: (type?: string) => void;
  onImport: () => void;
  onEdit: (story: Story) => void;
  onMove: (storyId: string, direction: -1 | 1) => void;
  onDelete: (story: Story) => void;
  onRevote: (story: Story) => void;
  onToggleCollapsed: () => void;
};

function formatStoryPoints(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function StoryQueue({ stories, selectedId, collapsed, canManage, aiEnabled, sessionActive, storySelectionDisabled, sessionPaused, onSelect, onNew, onImport, onEdit, onMove, onDelete, onRevote, onToggleCollapsed }: StoryQueueProps) {
  const epics = useMemo(() => stories.filter((story) => story.type === 'Epic'), [stories]);
  const epicGroups = useMemo(() => epics.map((epic) => ({
    key: epic.id,
    label: epic.title,
    epic,
    children: stories.filter((story) => story.type !== 'Epic' && story.epicId === epic.id),
  })), [epics, stories]);
  const groupedIds = new Set(epicGroups.flatMap((group) => group.children.map((story) => story.id)));
  const unassignedStories = stories.filter((story) => story.type !== 'Epic' && (!story.epicId || !groupedIds.has(story.id)));
  const groups = [...epicGroups, ...(unassignedStories.length ? [{ key: 'unassigned', label: 'Unassigned stories', epic: null, children: unassignedStories }] : [])];

  function storyRow(story: Story) {
    const index = stories.findIndex((candidate) => candidate.id === story.id);
    const stretch = isStretchStory(story, stories);
    return <div className={`story-row${story.id === selectedId ? ' active' : ''}`} key={story.id}>
       <button className="story-row-main" type="button" disabled={storySelectionDisabled} onClick={() => onSelect(story.id)}>
         <span className="story-number">{story.id}</span>
         <span className="story-row-copy"><strong>{story.title}</strong><span>{story.type}{story.epicId ? ' · linked to epic' : ''}{stretch ? ' · Stretch' : ''}</span></span>
         <span className="story-score" aria-label={`${story.title}: team ${story.manual ?? 'not estimated'}${aiEnabled ? `, AI ${story.ai ?? 'not estimated'}` : ''}`}><span className="story-score-item"><small>Team</small><span className={`score-pill ${story.manual === null ? 'empty' : 'manual'}`}>{story.manual ?? '—'}</span></span>{aiEnabled ? <span className="story-score-item"><small>AI</small><span className={`score-pill ${story.ai === null ? 'empty' : 'ai'}`}>{story.ai ?? '—'}</span></span> : null}</span>
       </button>
       {canManage ? <div className="story-row-actions"><button className="story-action-button" type="button" disabled={sessionActive} onClick={() => onEdit(story)} aria-label={`Edit ${story.title}`}><AppIcon name="pencil" size={13} /></button><button className="story-action-button" type="button" disabled={sessionActive || index <= 0} onClick={() => onMove(story.id, -1)} aria-label={`Move ${story.title} up`}><AppIcon name="arrowUp" size={13} /></button><button className="story-action-button" type="button" disabled={sessionActive || index >= stories.length - 1} onClick={() => onMove(story.id, 1)} aria-label={`Move ${story.title} down`}><AppIcon name="arrowDown" size={13} /></button>{story.manual !== null ? <button className="story-action-button" type="button" disabled={sessionActive} onClick={() => onRevote(story)} aria-label={`Revote ${story.title}`}><AppIcon name="refresh" size={13} /></button> : null}<button className="story-action-button danger-action" type="button" disabled={sessionActive || stories.length <= 1} onClick={() => onDelete(story)} aria-label={`Delete ${story.title}`}><AppIcon name="trash" size={13} /></button></div> : null}
    </div>;
  }

  const estimableCount = stories.filter((story) => story.type !== 'Epic').length;
  const estimatedCount = stories.filter((story) => story.type !== 'Epic' && story.manual !== null).length;
  const commitment = useMemo(() => stories.reduce((totals, story) => {
    if (story.type === 'Epic' || story.manual === null) return totals;
    const key = isStretchStory(story, stories) ? 'stretch' : 'committed';
    totals[key] += story.manual;
    return totals;
  }, { committed: 0, stretch: 0 }), [stories]);

  return <section className={`card queue-card${collapsed ? ' queue-card-collapsed' : ''}`}>
     <div className="queue-header"><div><h2>Story queue</h2><p>{estimableCount} {estimableCount === 1 ? 'story' : 'stories'} · {estimatedCount} estimated</p><p className="queue-commitment">Committed to <strong>{formatStoryPoints(commitment.committed)} SPs</strong> / <strong>{formatStoryPoints(commitment.stretch)} SPs</strong> stretch</p></div><div className="queue-header-actions">{canManage ? <><button className="outline-button import-button" type="button" disabled={sessionActive} onClick={() => onNew()}><AppIcon name="plus" size={13} /> Story</button><button className="outline-button import-button" type="button" disabled={sessionActive} onClick={() => onNew('Epic')}><AppIcon name="plus" size={13} /> Epic</button><button className="outline-button import-button" type="button" disabled={sessionActive} onClick={onImport}><AppIcon name="upload" size={13} /> Import</button></> : null}<button className="queue-toggle" type="button" aria-expanded={!collapsed} aria-controls="story-queue-content" onClick={onToggleCollapsed}><AppIcon name={collapsed ? 'chevronDown' : 'chevronUp'} size={14} /> {collapsed ? 'Show queue' : 'Hide queue'}</button></div></div>
     {!collapsed ? <div id="story-queue-content"><div className="story-queues">{groups.map((group) => <div className="story-queue-group" key={group.key}><div className="story-queue-group-heading"><div><span className="queue-group-icon"><AppIcon name="listChecks" size={13} /></span><span><strong>{group.label}</strong><small>{group.children.filter((story) => story.manual !== null).length}/{group.children.length} estimated{group.epic?.stretch ? ' · Stretch' : ''}</small></span></div>{canManage && group.epic ? <div className="story-queue-group-heading-actions"><button className="story-action-button" type="button" disabled={sessionActive} onClick={() => onEdit(group.epic)} aria-label={`Edit ${group.epic.title}`}><AppIcon name="pencil" size={13} /></button><button className="story-action-button danger-action" type="button" disabled={sessionActive || stories.length <= 1} onClick={() => onDelete(group.epic)} aria-label={`Delete ${group.epic.title}`}><AppIcon name="trash" size={13} /></button></div> : null}</div><div className="story-list">{group.children.length ? group.children.map(storyRow) : <p className="empty-manager">No stories linked to this epic yet.</p>}</div></div>)}</div><div className="queue-footer"><span className="icon"><AppIcon name={sessionPaused ? 'pause' : 'clock'} size={14} /></span>{sessionActive ? canManage ? 'Select any story to switch the active vote.' : 'The room manager controls the active story.' : sessionPaused ? 'Session paused. Add or edit stories, then resume when the queue is ready.' : 'Select a story from the queue, or add more work.'}</div></div> : null}
  </section>;
}

function EstimateField({ label, helper, values, value, disabled, ai, onChange }: { label: string; helper: string; values: readonly number[]; value: number | null; disabled?: boolean; ai?: boolean; onChange: (value: number | null) => void }) {
  const id = label.replace(/\s+/g, '-').toLowerCase();
  return <div className={`estimate-field${value !== null ? ' has-selection' : ''}${ai ? ' ai-field' : ''}${disabled ? ' is-disabled' : ''}`}>
    <div className="field-label-row"><div className="field-label-copy"><span className="icon" aria-hidden="true"><AppIcon name={ai ? 'sparkles' : 'circleDot'} size={14} /></span><strong>{label}</strong></div>{value !== null ? <strong>{value}</strong> : null}</div>
    <p className="field-helper">{helper}</p>
    <div className="point-options">{values.map((point) => <button key={point} className={`point-button${value === point ? ' selected' : ''}`} type="button" disabled={disabled} onClick={() => onChange(value === point ? null : point)}>{point}</button>)}</div>
    <div className="field-bottom-row"><label className="custom-label" htmlFor={`${id}-custom`}>Custom value</label><input id={`${id}-custom`} className="field-input" type="number" min="0" step="0.5" value={value ?? ''} disabled={disabled} onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))} /></div>
  </div>;
}

function formatDuration(startedAt: string | null, now: number): string {
  if (!startedAt) return '00:00';
  const seconds = Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function displayVote(value: number | null, submitted: boolean, revealed: boolean): string {
  if (value !== null) return String(value);
  if (revealed) return '—';
  return submitted ? 'Hidden' : 'Waiting';
}

export function EstimatesPage({ room, state, user, focusMode = false, saving, onSave, onVote, onJoin, onClearVotes, onRemoveVoter }: EstimatesPageProps) {
  const firstEstimableStory = state.stories.find((story) => story.type !== 'Epic');
  const initialStory = state.stories.find((story) => story.id === state.selectedStoryId && story.type !== 'Epic') || firstEstimableStory;
  const [selectedId, setSelectedId] = useState(initialStory?.id || '');
  const [manual, setManual] = useState<number | null>(null);
  const [ai, setAi] = useState<number | null>(null);
  const [modal, setModal] = useState<{ kind: 'edit'; story: Story | null; type?: string } | { kind: 'import' } | null>(null);
  const [queueCollapsed, setQueueCollapsed] = useState(true);
  const [now, setNow] = useState(Date.now());
  const selectedStory = state.stories.find((story) => story.id === selectedId && story.type !== 'Epic') || firstEstimableStory;
  const values = sequences[state.sequence].values;
  const canManage = room.role === 'owner' || room.role === 'admin' || user.role === 'admin';
  const aiEnabled = state.roomSettings.aiEnabled;
  const round = state.round;
  const currentPlayer = round.players.find((player) => player.id === user.id);
  const currentVote = round.votes[user.id];
  const isObserver = currentPlayer?.role === 'observer';
  const isVoting = round.phase === 'voting' && round.storyId === selectedStory?.id;
  const isRevealed = round.phase === 'revealed' && round.storyId === selectedStory?.id;
  const isPaused = round.phase === 'paused';
  const sessionActive = round.phase === 'voting' || round.phase === 'revealed';
  const joinedPlayers = round.players.filter((player) => player.joined && player.role !== 'observer');
  const observerPlayers = round.players.filter((player) => player.role === 'observer');
  const countVisible = !round.hideVoteCountUntilComplete || !joinedPlayers.length || round.submittedCount >= joinedPlayers.length;

  useEffect(() => {
    if (isObserver) return;
    const synchronizedStoryId = round.phase === 'idle' || round.phase === 'paused' ? state.selectedStoryId : round.storyId;
    if (synchronizedStoryId && synchronizedStoryId !== selectedId && state.stories.some((story) => story.id === synchronizedStoryId && story.type !== 'Epic')) {
      setSelectedId(synchronizedStoryId);
    }
  }, [isObserver, round.phase, round.storyId, selectedId, state.selectedStoryId, state.stories]);

  useEffect(() => {
    if (!round.timerStartedAt || round.phase !== 'voting') return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [round.phase, round.timerStartedAt]);

  useEffect(() => {
    if (!selectedStory) return;
    if (selectedId !== selectedStory.id) setSelectedId(selectedStory.id);
    if (isVoting) {
      setManual(currentPlayer?.manual ?? currentVote?.manual ?? null);
      setAi(aiEnabled ? currentPlayer?.ai ?? currentVote?.ai ?? null : null);
    } else {
      setManual(selectedStory.manual);
      setAi(aiEnabled ? selectedStory.ai : null);
    }
  }, [aiEnabled, currentPlayer?.ai, currentPlayer?.manual, currentVote?.ai, currentVote?.manual, isVoting, selectedId, selectedStory?.ai, selectedStory?.aiEnabled, selectedStory?.id, selectedStory?.manual]);

  const estimableStories = state.stories.filter((story) => story.type !== 'Epic');
  const progressLabel = useMemo(() => `${estimableStories.filter((story) => story.manual !== null).length} of ${estimableStories.length} estimated`, [estimableStories]);
  if (!selectedStory) return <div className="empty-state"><div className="empty-state-icon"><AppIcon name="listChecks" size={24} /></div><h2>No stories yet</h2><p>Create or import a story to begin planning.</p></div>;
  const currentStory = selectedStory;
  const nextStoryInSequence = estimableStories[estimableStories.findIndex((story) => story.id === currentStory.id) + 1] || null;

  async function saveEstimate() {
    const next = cloneState(state);
    next.selectedStoryId = currentStory.id;
    next.round.storyId = currentStory.id;
    const nextAi = aiEnabled ? ai : null;
    next.stories = next.stories.map((story) => story.id === currentStory.id ? { ...story, manual, ai: nextAi, aiEnabled: nextAi !== null, saved: manual !== null } : story);
    await onSave(next);
  }

  async function startRoundForStory(storyId: string, roundNumber = 1) {
    const next = cloneState(state);
    next.selectedStoryId = storyId;
    next.round = { ...next.round, phase: 'voting', mode: state.roomSettings.voteMode, hideVoteCountUntilComplete: state.roomSettings.hideVoteCountUntilComplete, storyId, roundNumber: Math.max(1, roundNumber), submittedCount: 0, votes: {}, cardFlipped: false, revealedAt: null, timerStartedAt: new Date().toISOString(), timerEndsAt: null };
    setSelectedId(storyId);
    await onSave(next);
  }

  async function startRound() {
    await startRoundForStory(currentStory.id, Math.max(1, state.round.roundNumber));
  }

  async function pauseSession() {
    const next = cloneState(state);
    next.round = { ...next.round, phase: 'paused' };
    await onSave(next);
  }

  async function resumeSession() {
    const storyId = state.round.storyId || currentStory.id;
    const next = cloneState(state);
    next.selectedStoryId = storyId;
    next.round = { ...next.round, phase: next.round.revealedAt ? 'revealed' : 'voting', cardFlipped: Boolean(next.round.revealedAt), storyId };
    setSelectedId(storyId);
    await onSave(next);
  }

  async function revealRound() {
    const next = cloneState(state);
    next.round = { ...next.round, phase: 'revealed', cardFlipped: true, revealedAt: new Date().toISOString() };
    await onSave(next);
  }

  async function resetRound() {
    const next = cloneState(state);
    next.round = { ...next.round, phase: 'idle', roundNumber: state.round.roundNumber + 1, submittedCount: 0, votes: {}, cardFlipped: false, revealedAt: null, timerStartedAt: null, timerEndsAt: null };
    await onSave(next);
  }

  async function setVoteMode(mode: 'hidden' | 'open') {
    const next = cloneState(state);
    next.roomSettings.voteMode = mode;
    next.round.mode = mode;
    await onSave(next);
  }

  async function resetTimer() {
    const next = cloneState(state);
    next.round.timerStartedAt = new Date().toISOString();
    await onSave(next);
  }

  async function nextStory() {
    if (nextStoryInSequence) await startRoundForStory(nextStoryInSequence.id, nextRoundNumberForStory(nextStoryInSequence.id));
  }

  function nextRoundNumberForStory(storyId: string) {
    const latestRound = state.voteHistory
      .filter((entry) => entry.storyId === storyId)
      .reduce((highest, entry) => Math.max(highest, entry.roundNumber), 0);
    return Math.max(1, latestRound + 1);
  }

  function selectStory(id: string) {
    if (id === selectedId) return;
    if (sessionActive) {
      if (!canManage) return;
      void startRoundForStory(id, nextRoundNumberForStory(id));
      return;
    }
    setSelectedId(id);
    if (isObserver) return;
    const next = cloneState(state);
    next.selectedStoryId = id;
    if (round.phase !== 'paused') next.round.storyId = id;
    void onSave(next);
  }

  function editStory(story: Story | null, type = 'Feature') {
    setModal({ kind: 'edit', story, type });
  }

  async function saveStory(draft: Story) {
    const next = cloneState(state);
    const sessionPaused = state.round.phase === 'paused';
    let id = draft.id;
    if (!id || !next.stories.some((story) => story.id === id)) {
      id = nextImportedStoryId(next.stories);
      while (next.stories.some((story) => story.id === id)) id = nextImportedStoryId([...next.stories, { ...draft, id }]);
      next.stories.push({ ...draft, id });
    } else {
      next.stories = next.stories.map((story) => story.id === id ? { ...draft, id } : story);
    }
    const nextSelectedStory = sessionPaused
      ? next.stories.find((candidate) => candidate.id === state.selectedStoryId && candidate.type !== 'Epic') || next.stories.find((candidate) => candidate.type !== 'Epic')
      : next.stories.find((candidate) => candidate.id === id && candidate.type !== 'Epic') || next.stories.find((candidate) => candidate.id === selectedId && candidate.type !== 'Epic') || next.stories.find((candidate) => candidate.type !== 'Epic');
    next.selectedStoryId = nextSelectedStory?.id || null;
    if (!sessionPaused) next.round.storyId = nextSelectedStory?.id || null;
    setSelectedId(nextSelectedStory?.id || '');
    await onSave(next);
    setModal(null);
  }

  async function importStories(imported: Story[], epicId: string | null) {
    const next = cloneState(state);
    const sessionPaused = state.round.phase === 'paused';
    const existing = new Set(next.stories.map((story) => story.id));
    let nextId = nextImportedStoryId(next.stories);
    const added = imported.map((story) => {
      let id = story.id;
      while (!id || existing.has(id)) {
        id = nextId;
        nextId = `PL-${Number(nextId.replace(/\D/g, '')) + 1}`;
      }
      existing.add(id);
      return { ...story, id, epicId: story.type === 'Epic' ? null : epicId };
    });
    next.stories.push(...added);
    const firstAddedStory = added.find((story) => story.type !== 'Epic');
    const nextSelectedStory = sessionPaused
      ? next.stories.find((story) => story.id === state.selectedStoryId && story.type !== 'Epic') || next.stories.find((story) => story.type !== 'Epic')
      : firstAddedStory || next.stories.find((story) => story.id === selectedId && story.type !== 'Epic') || next.stories.find((story) => story.type !== 'Epic');
    next.selectedStoryId = nextSelectedStory?.id || null;
    if (!sessionPaused) next.round.storyId = nextSelectedStory?.id || null;
    setSelectedId(nextSelectedStory?.id || '');
    await onSave(next);
    setModal(null);
  }

  async function deleteStory(story: Story) {
    if (state.stories.length <= 1 || !window.confirm(`Delete ${story.title}?`)) return;
    const next = cloneState(state);
    next.stories = next.stories.filter((candidate) => candidate.id !== story.id).map((candidate) => candidate.epicId === story.id ? { ...candidate, epicId: null } : candidate);
    const fallback = next.stories.find((candidate) => candidate.type !== 'Epic') || next.stories[0];
    next.selectedStoryId = fallback?.id || null;
    if (next.round.storyId === story.id) next.round = { ...next.round, phase: 'idle', storyId: fallback?.id || null, roundNumber: 1, votes: {}, submittedCount: 0, cardFlipped: false, revealedAt: null, timerStartedAt: null, timerEndsAt: null };
    setSelectedId(fallback?.id || '');
    await onSave(next);
  }

  async function moveStory(storyId: string, direction: -1 | 1) {
    const index = state.stories.findIndex((story) => story.id === storyId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= state.stories.length) return;
    const next = cloneState(state);
    [next.stories[index], next.stories[target]] = [next.stories[target], next.stories[index]];
    await onSave(next);
  }

  async function revoteStory(story: Story) {
    if (!window.confirm(`Start a new round for ${story.title}?`)) return;
    const next = cloneState(state);
    next.selectedStoryId = story.id;
    next.round = { ...next.round, phase: 'idle', storyId: story.id, roundNumber: Math.max(1, state.round.roundNumber + 1), votes: {}, submittedCount: 0, cardFlipped: false, revealedAt: null, timerStartedAt: null, timerEndsAt: null };
    setSelectedId(story.id);
    await onSave(next);
  }

  return <>
    <div className={`hero-row${focusMode ? ' voting-page-hero' : ''}`}><div><p className="eyebrow">{focusMode ? 'Focused voting' : `${room.piLabel} · planning room`}</p><h1>{focusMode ? 'Vote on the current story.' : 'Make the estimate visible.'}</h1><p className="hero-copy">{focusMode ? 'A focused space for choosing cards, seeing participation, and submitting the team estimate.' : 'Bring the story context, team votes, and final point value into one shared workspace.'}</p></div><div className="pi-meta"><div className="pi-meta-icon">PI</div><div className="pi-meta-copy"><span>Current room</span><strong>{room.name}</strong></div></div></div>
    {!focusMode ? <div className="summary-grid"><div className="summary-card"><div className="summary-top"><span className="summary-label">Stories</span><span className="summary-icon"><AppIcon name="listChecks" size={16} /></span></div><div className="summary-value">{estimableStories.length}</div><div className="summary-foot">Ready for the next discussion</div></div><div className="summary-card"><div className="summary-top"><span className="summary-label">Estimated</span><span className="summary-icon"><AppIcon name="check" size={16} /></span></div><div className="summary-value">{estimableStories.filter((story) => story.manual !== null).length}<small>/ {estimableStories.length}</small></div><div className="progress-bar"><span style={{ width: `${estimableStories.length ? (estimableStories.filter((story) => story.manual !== null).length / estimableStories.length) * 100 : 0}%` }} /></div></div><div className="summary-card"><div className="summary-top"><span className="summary-label">Planners</span><span className="summary-icon"><AppIcon name="users" size={16} /></span></div><div className="summary-value">{room.memberCount}</div><div className="summary-foot">People in this room</div></div><div className="summary-card"><div className="summary-top"><span className="summary-label">Round</span><span className="summary-icon"><AppIcon name={isPaused ? 'pause' : 'clock'} size={16} /></span></div><div className="summary-value">{round.phase === 'voting' ? 'Live' : round.phase === 'revealed' ? 'Done' : isPaused ? 'Paused' : 'Idle'}</div><div className="summary-foot">{round.phase === 'voting' ? (countVisible ? `${round.submittedCount} vote${round.submittedCount === 1 ? '' : 's'} submitted` : 'Submitted values appear as voters submit') : isPaused ? 'Queue editing is unlocked' : progressLabel}</div></div></div> : null}
     <div className={`workspace-grid${focusMode ? ` voting-page-grid${queueCollapsed ? ' queue-is-collapsed' : ''}` : ''}`}>
       <section className="card estimator-card">
         <div className="card-heading"><div><span className="story-progress">{selectedStory.id} · {selectedStory.type}</span><h2>{focusMode ? 'Vote on this story' : 'Estimate this story'}</h2></div><div className="card-heading-controls"><label className="sequence-control">Sequence<select value={state.sequence} disabled={!canManage || saving} onChange={(event) => { const next = cloneState(state); next.sequence = event.target.value as RoomState['sequence']; void onSave(next); }}><option value="sequential">Sequential</option><option value="fibonacci">Fibonacci</option><option value="modified">Modified Fibonacci</option></select></label></div></div>
         {round.phase === 'idle' ? <div className="session-gate"><div className="session-gate-icon"><AppIcon name="clock" size={22} /></div><div><p className="section-kicker">Estimation session</p><h3>Start a session to estimate this story</h3><p>{canManage ? 'Choose the story context, then open a live round so members can join and vote together.' : 'The room owner will start an estimation session before voting opens.'}</p></div>{canManage ? <button className="primary-button" type="button" disabled={saving} onClick={() => void startRound()}>Start estimation session</button> : null}</div> : isPaused ? <div className="session-gate session-paused"><div className="session-gate-icon"><AppIcon name="pause" size={22} /></div><div><p className="section-kicker">Estimation session</p><h3>Session paused</h3><p>{canManage ? `Queue editing is unlocked. Resume when you are ready to continue ${state.stories.find((story) => story.id === round.storyId)?.title || 'the current story'}.` : 'The room owner paused this session. You can review the queue while the round is paused.'}</p></div>{canManage ? <button className="primary-button" type="button" disabled={saving} onClick={() => void resumeSession()}><AppIcon name="play" size={14} /> Resume session</button> : null}</div> : <>
           <div className="story-detail"><div className="story-detail-top"><span className="story-type">{selectedStory.type}</span>{selectedStory.url ? <a className="outline-button" href={selectedStory.url} target="_blank" rel="noreferrer">Open story <AppIcon name="externalLink" size={13} /></a> : null}</div><h3>{selectedStory.title}</h3><p className="story-description">{selectedStory.description}</p><div className="acceptance-list">{selectedStory.acceptance.map((item) => <span className="acceptance-chip" key={item}><AppIcon name="check" size={12} /> {item}</span>)}</div></div>
           <div className="estimate-section"><div className="estimate-section-heading"><div><h3>{isVoting ? isObserver ? 'Watch the live round' : 'Choose your cards' : 'Round result'}</h3><p>{isVoting ? isObserver ? 'Observers can watch the round but cannot submit votes.' : currentPlayer?.joined ? 'Submit one or both estimates when you are ready. Submitted values are visible to the room.' : 'Join this round before choosing cards.' : `${round.submittedCount} submitted · cards are flipped`}</p></div><div className="estimate-heading-tools"><span className={`round-badge${round.cardFlipped ? ' is-flipped' : ''}`}>{round.cardFlipped ? 'Cards flipped' : round.mode === 'open' ? 'Cards open' : 'Private until submitted'} · Round {round.roundNumber} · {formatDuration(round.timerStartedAt, now)}</span>{isVoting && canManage ? <select className="round-mode-select" value={state.roomSettings.voteMode} onChange={(event) => void setVoteMode(event.target.value as 'hidden' | 'open')}><option value="hidden">Private until submitted</option><option value="open">Open votes</option></select> : null}</div></div>
             <div className={`estimate-fields${aiEnabled ? '' : ' team-only'}`}><EstimateField label="Manual estimate" helper="The team’s delivery estimate" values={values} value={manual} disabled={isObserver || (isVoting && !currentPlayer?.joined) || (!isVoting && !canManage)} onChange={setManual} />{aiEnabled ? <EstimateField label="AI comparison" helper="Optional comparison point" values={values} value={ai} ai disabled={isObserver || (isVoting && !currentPlayer?.joined) || (!isVoting && !canManage)} onChange={setAi} /> : null}</div>
           </div>
           <div className="estimator-footer"><div className="status-message"><span className="icon"><AppIcon name="clock" size={14} /></span>{isVoting ? isObserver ? 'Observer · view only' : currentPlayer?.joined ? (countVisible ? `${round.submittedCount} vote${round.submittedCount === 1 ? '' : 's'} submitted` : 'Submitted values appear as voters submit') : 'You have not joined this round' : selectedStory.manual === null ? 'No final estimate saved' : `Final estimate: ${selectedStory.manual}`}</div><div className="footer-actions">{isVoting && !isObserver && !currentPlayer?.joined ? <button className="outline-button" type="button" disabled={saving} onClick={() => void onJoin(true)}>Join round</button> : null}{isVoting && !isObserver && currentPlayer?.joined ? <><button className="outline-button" type="button" disabled={saving} onClick={() => void onJoin(false)}>Leave round</button><button className="primary-button" type="button" disabled={saving || (manual === null && (!aiEnabled || ai === null))} onClick={() => void onVote(manual, aiEnabled ? ai : null)}>Submit vote</button></> : null}{isVoting && canManage ? <><button className="outline-button" type="button" disabled={saving} onClick={() => void revealRound()}>Flip cards</button><button className="outline-button" type="button" disabled={saving} onClick={() => void onClearVotes()}>Clear votes</button><button className="outline-button" type="button" disabled={saving} onClick={() => void resetTimer()}>Reset timer</button><button className="outline-button" type="button" disabled={saving} onClick={() => void pauseSession()}><AppIcon name="pause" size={13} /> Pause session</button></> : null}{isRevealed && canManage ? <>{nextStoryInSequence ? <button className="outline-button" type="button" disabled={saving} onClick={() => void nextStory()}>Next story</button> : <span className="round-next-copy">Last story in this sequence</span>}<button className="outline-button" type="button" disabled={saving} onClick={() => void resetRound()}>Restart story</button><button className="primary-button" type="button" disabled={saving} onClick={() => void saveEstimate()}>Save final estimate</button><button className="outline-button" type="button" disabled={saving} onClick={() => void pauseSession()}><AppIcon name="pause" size={13} /> Pause session</button></> : null}</div></div>
           {observerPlayers.length ? <div className="observer-presence" aria-label={`${observerPlayers.length} observer${observerPlayers.length === 1 ? '' : 's'} in this room`}><span className="observer-presence-label"><AppIcon name="users" size={14} /> Observers</span><div className="observer-avatar-stack">{observerPlayers.map((player) => <span className="observer-avatar" key={player.id} role="img" aria-label={`${player.name}, observer`} title={`${player.name} · view only`}>{initials(player.name)}</span>)}</div><span className="observer-presence-count">{observerPlayers.length}</span></div> : null}
           <div className="voting-roster"><div className="voting-roster-heading"><div><strong>Joined voters</strong><span>{joinedPlayers.length} {joinedPlayers.length === 1 ? 'voter' : 'voters'} in this round</span></div><span>{countVisible ? `${round.submittedCount} submitted` : 'Values visible as submitted'}</span></div><div className={`pl-vote-summary${round.cardFlipped ? ' cards-flipped' : ''}`}>{joinedPlayers.length ? joinedPlayers.map((player) => {
             const teamEstimate = displayVote(player.manual, player.manualSubmitted, isRevealed);
             const aiEstimate = displayVote(player.ai, player.aiSubmitted, isRevealed);
             return <div className={`pl-vote-row${player.hasVoted ? ' has-submitted-vote' : ''}`} key={player.id}>
               <div className="pl-vote-person"><span>{player.name}{player.id === user.id ? ' · You' : ''}</span><small className={player.hasVoted ? 'is-submitted' : ''}>{player.hasVoted ? 'Vote submitted' : 'Waiting for vote'}</small></div>
               <div className={`pl-vote-estimates${aiEnabled ? '' : ' team-only'}`}><span className={`pl-vote-estimate${teamEstimate === 'Hidden' || teamEstimate === 'Waiting' ? ' is-pending' : ''}`}><small>Team</small><strong>{teamEstimate}</strong></span>{aiEnabled ? <span className={`pl-vote-estimate${aiEstimate === 'Hidden' || aiEstimate === 'Waiting' ? ' is-pending' : ''}`}><small>AI</small><strong>{aiEstimate}</strong></span> : null}</div>
               {canManage && player.id !== user.id ? <button className="story-action-button danger-action" type="button" onClick={() => void onRemoveVoter(player.id)} aria-label={`Remove ${player.name}`}><AppIcon name="x" size={13} /></button> : null}
             </div>;
           }) : <div className="voting-roster-empty">No one has joined this round yet.</div>}</div></div>
         </>}
       </section>
       <StoryQueue stories={state.stories} selectedId={selectedStory.id} collapsed={queueCollapsed} canManage={canManage} aiEnabled={aiEnabled} sessionActive={sessionActive} storySelectionDisabled={sessionActive && !canManage} sessionPaused={isPaused} onSelect={selectStory} onNew={(type) => editStory(null, type)} onImport={() => setModal({ kind: 'import' })} onEdit={(story) => editStory(story)} onMove={(id, direction) => void moveStory(id, direction)} onDelete={(story) => void deleteStory(story)} onRevote={(story) => void revoteStory(story)} onToggleCollapsed={() => setQueueCollapsed((current) => !current)} />
     </div>
    {modal?.kind === 'edit' ? <StoryEditorModal key={`${modal.story?.id || 'new'}-${modal.type || ''}`} state={state} story={modal.story} initialType={modal.type} saving={saving} onClose={() => setModal(null)} onSave={saveStory} /> : null}
    {modal?.kind === 'import' ? <ImportStoriesModal epics={state.stories.filter((story) => story.type === 'Epic')} saving={saving} onClose={() => setModal(null)} onImport={importStories} /> : null}
  </>;
}

