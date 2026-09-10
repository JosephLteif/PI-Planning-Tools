import { useEffect, useMemo, useState } from 'react';
import { ImportStoriesModal } from './ImportStoriesModal';
import { EpicPicker } from './EpicPicker';
import { StoryEditorModal } from './StoryEditorModal';
import { AppIcon } from './AppIcon';
import type { Room, RoomState, Story, User } from '../types';
import { cloneState, sequences } from '../state';
import { isStretchStory, nextImportedStoryId } from '../storyUtils';

type EstimatesPageProps = {
  room: Room;
  state: RoomState;
  user: User;
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
  canManage: boolean;
  voting: boolean;
  onSelect: (id: string) => void;
  onNew: (type?: string) => void;
  onImport: () => void;
  onEdit: (story: Story) => void;
  onMove: (storyId: string, direction: -1 | 1) => void;
  onDelete: (story: Story) => void;
  onRevote: (story: Story) => void;
};

function formatStoryPoints(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function StoryQueue({ stories, selectedId, canManage, voting, onSelect, onNew, onImport, onEdit, onMove, onDelete, onRevote }: StoryQueueProps) {
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
  const selectedStory = stories.find((story) => story.id === selectedId);
  const selectedStoryEpicId = selectedStory?.type !== 'Epic' ? selectedStory?.epicId : null;
  const [focusedEpicId, setFocusedEpicId] = useState(() => selectedStoryEpicId && epics.some((epic) => epic.id === selectedStoryEpicId) ? selectedStoryEpicId : epics[0]?.id || '');

  useEffect(() => {
    if (!focusedEpicId || !epics.some((epic) => epic.id === focusedEpicId)) setFocusedEpicId(selectedStoryEpicId && epics.some((epic) => epic.id === selectedStoryEpicId) ? selectedStoryEpicId : epics[0]?.id || '');
  }, [epics, focusedEpicId, selectedStoryEpicId]);

  const focusedGroup = epicGroups.find((group) => group.epic.id === focusedEpicId);
  const focusedEpic = focusedGroup?.epic;
  const focusedDone = focusedGroup?.children.filter((story) => story.manual !== null).length || 0;
  const focusedTotal = focusedGroup?.children.length || 0;

  function selectEpic(epicId: string) {
    setFocusedEpicId(epicId);
    const group = epicGroups.find((candidate) => candidate.epic.id === epicId);
    const nextStory = group?.children.find((story) => story.manual === null) || group?.children[0];
    if (nextStory) onSelect(nextStory.id);
  }

  function storyRow(story: Story) {
    const index = stories.findIndex((candidate) => candidate.id === story.id);
    const stretch = isStretchStory(story, stories);
    return <div className={`story-row${story.id === selectedId ? ' active' : ''}`} key={story.id}>
      <button className="story-row-main" type="button" onClick={() => onSelect(story.id)}>
        <span className="story-number">{story.id}</span>
        <span className="story-row-copy"><strong>{story.title}</strong><span>{story.type}{story.epicId ? ' · linked to epic' : ''}{stretch ? ' · Stretch' : ''}</span></span>
        <span className="story-score" aria-label={`${story.title}: team ${story.manual ?? 'not estimated'}, AI ${story.ai ?? 'not estimated'}`}><span className="story-score-item"><small>Team</small><span className={`score-pill ${story.manual === null ? 'empty' : 'manual'}`}>{story.manual ?? '—'}</span></span><span className="story-score-item"><small>AI</small><span className={`score-pill ${story.ai === null ? 'empty' : 'ai'}`}>{story.ai ?? '—'}</span></span></span>
      </button>
      {canManage ? <div className="story-row-actions"><button className="story-action-button" type="button" disabled={voting} onClick={() => onEdit(story)} aria-label={`Edit ${story.title}`}><AppIcon name="pencil" size={13} /></button><button className="story-action-button" type="button" disabled={voting || index <= 0} onClick={() => onMove(story.id, -1)} aria-label={`Move ${story.title} up`}><AppIcon name="arrowUp" size={13} /></button><button className="story-action-button" type="button" disabled={voting || index >= stories.length - 1} onClick={() => onMove(story.id, 1)} aria-label={`Move ${story.title} down`}><AppIcon name="arrowDown" size={13} /></button>{story.manual !== null ? <button className="story-action-button" type="button" disabled={voting} onClick={() => onRevote(story)} aria-label={`Revote ${story.title}`}><AppIcon name="refresh" size={13} /></button> : null}<button className="story-action-button danger-action" type="button" disabled={voting || stories.length <= 1} onClick={() => onDelete(story)} aria-label={`Delete ${story.title}`}><AppIcon name="trash" size={13} /></button></div> : null}
    </div>;
  }

  const visibleGroups = focusedEpicId ? groups.filter((group) => group.epic?.id === focusedEpicId || group.key === 'unassigned') : groups;
  const estimableCount = stories.filter((story) => story.type !== 'Epic').length;
  const estimatedCount = stories.filter((story) => story.type !== 'Epic' && story.manual !== null).length;
  const commitment = useMemo(() => stories.reduce((totals, story) => {
    if (story.type === 'Epic' || story.manual === null) return totals;
    const key = isStretchStory(story, stories) ? 'stretch' : 'committed';
    totals[key] += story.manual;
    return totals;
  }, { committed: 0, stretch: 0 }), [stories]);

  return <section className="card queue-card">
    <div className="queue-header"><div><h2>Story queue</h2><p>{estimableCount} {estimableCount === 1 ? 'story' : 'stories'} · {estimatedCount} estimated</p><p className="queue-commitment">Committed to <strong>{formatStoryPoints(commitment.committed)} SPs</strong> / <strong>{formatStoryPoints(commitment.stretch)} SPs</strong> stretch</p></div>{canManage ? <div className="queue-header-actions"><button className="outline-button import-button" type="button" disabled={voting} onClick={() => onNew()}><AppIcon name="plus" size={13} /> Story</button><button className="outline-button import-button" type="button" disabled={voting} onClick={() => onNew('Epic')}><AppIcon name="plus" size={13} /> Epic</button><button className="outline-button import-button" type="button" disabled={voting} onClick={onImport}><AppIcon name="upload" size={13} /> Import</button></div> : null}</div>
    {focusedEpic ? <div className="epic-selector"><span className={`epic-selector-mark${focusedTotal > 0 && focusedDone === focusedTotal ? ' is-complete' : ''}`} aria-hidden="true"><AppIcon name={focusedTotal > 0 && focusedDone === focusedTotal ? 'check' : 'clock'} size={15} /></span><div className="epic-selector-copy"><span>Epic needing work{focusedEpic.stretch ? ' · Stretch' : ''}</span><div className="epic-selector-select-row"><EpicPicker epics={epics} value={focusedEpicId} onChange={selectEpic} ariaLabel="Epic needing work" optionMeta={(epic) => { const children = epicGroups.find((group) => group.epic.id === epic.id)?.children || []; return `${children.filter((story) => story.manual !== null).length}/${children.length} done`; }} />{canManage ? <div className="epic-selector-actions"><button className="story-action-button" type="button" disabled={voting} onClick={() => onEdit(focusedEpic)} aria-label={`Edit ${focusedEpic.title}`}><AppIcon name="pencil" size={13} /></button><button className="story-action-button danger-action" type="button" disabled={voting || stories.length <= 1} onClick={() => onDelete(focusedEpic)} aria-label={`Delete ${focusedEpic.title}`}><AppIcon name="trash" size={13} /></button></div> : null}</div></div><span className="epic-selector-progress">{focusedDone}/{focusedTotal}</span><span className="epic-selector-status">{focusedTotal > 0 && focusedDone === focusedTotal ? 'Done' : focusedTotal ? 'In progress' : 'No stories'}</span></div> : null}
    <div className="story-queues">{visibleGroups.map((group) => group.epic ? <div className="story-queue-group" key={group.key}><div className="story-list">{group.children.length ? group.children.map(storyRow) : <p className="empty-manager">No stories linked to this epic yet.</p>}</div></div> : <div className="story-list" key={group.key}>{group.children.map(storyRow)}</div>)}</div>
    <div className="queue-footer"><span className="icon"><AppIcon name="clock" size={14} /></span>{voting ? 'Queue actions are paused while the round is live.' : 'Select a story to estimate, edit, reorder, or import more work.'}</div>
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

export function EstimatesPage({ room, state, user, saving, onSave, onVote, onJoin, onClearVotes, onRemoveVoter }: EstimatesPageProps) {
  const firstEstimableStory = state.stories.find((story) => story.type !== 'Epic');
  const initialStory = state.stories.find((story) => story.id === state.selectedStoryId && story.type !== 'Epic') || firstEstimableStory;
  const [selectedId, setSelectedId] = useState(initialStory?.id || '');
  const [manual, setManual] = useState<number | null>(null);
  const [ai, setAi] = useState<number | null>(null);
  const [modal, setModal] = useState<{ kind: 'edit'; story: Story | null; type?: string } | { kind: 'import' } | null>(null);
  const [now, setNow] = useState(Date.now());
  const selectedStory = state.stories.find((story) => story.id === selectedId && story.type !== 'Epic') || firstEstimableStory;
  const values = sequences[state.sequence].values;
  const canManage = room.role === 'owner' || room.role === 'admin' || user.role === 'admin';
  const round = state.round;
  const currentPlayer = round.players.find((player) => player.id === user.id);
  const currentVote = round.votes[user.id];
  const isObserver = currentPlayer?.role === 'observer';
  const isVoting = round.phase === 'voting' && round.storyId === selectedStory?.id;
  const isRevealed = round.phase === 'revealed' && round.storyId === selectedStory?.id;
  const joinedPlayers = round.players.filter((player) => player.joined && player.role !== 'observer');
  const countVisible = !round.hideVoteCountUntilComplete || !joinedPlayers.length || round.submittedCount >= joinedPlayers.length;

  useEffect(() => {
    if (isObserver) return;
    const synchronizedStoryId = round.phase === 'idle' ? state.selectedStoryId : round.storyId;
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
      setAi(currentPlayer?.ai ?? currentVote?.ai ?? null);
    } else {
      setManual(selectedStory.manual);
      setAi(selectedStory.ai);
    }
  }, [currentPlayer?.ai, currentPlayer?.manual, currentVote?.ai, currentVote?.manual, isVoting, selectedId, selectedStory?.ai, selectedStory?.aiEnabled, selectedStory?.id, selectedStory?.manual]);

  const estimableStories = state.stories.filter((story) => story.type !== 'Epic');
  const progressLabel = useMemo(() => `${estimableStories.filter((story) => story.manual !== null).length} of ${estimableStories.length} estimated`, [estimableStories]);
  if (!selectedStory) return <div className="empty-state"><div className="empty-state-icon"><AppIcon name="listChecks" size={24} /></div><h2>No stories yet</h2><p>Create or import a story to begin planning.</p></div>;
  const currentStory = selectedStory;

  async function saveEstimate() {
    const next = cloneState(state);
    next.selectedStoryId = currentStory.id;
    next.round.storyId = currentStory.id;
    next.stories = next.stories.map((story) => story.id === currentStory.id ? { ...story, manual, ai, aiEnabled: ai !== null, saved: manual !== null } : story);
    await onSave(next);
  }

  async function startRound() {
    const next = cloneState(state);
    next.selectedStoryId = currentStory.id;
    next.round = { ...next.round, phase: 'voting', mode: state.roomSettings.voteMode, hideVoteCountUntilComplete: state.roomSettings.hideVoteCountUntilComplete, storyId: currentStory.id, roundNumber: Math.max(1, state.round.roundNumber), submittedCount: 0, votes: {}, cardFlipped: false, revealedAt: null, timerStartedAt: new Date().toISOString(), timerEndsAt: null };
    await onSave(next);
  }

  async function revealRound() {
    const next = cloneState(state);
    next.round = { ...next.round, phase: 'revealed', revealedAt: new Date().toISOString() };
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

  async function skipStory() {
    const nextStory = state.stories.find((story) => story.manual === null && story.type !== 'Epic' && story.id !== currentStory.id);
    if (!nextStory) return;
    const next = cloneState(state);
    next.selectedStoryId = nextStory.id;
    next.round = { ...next.round, phase: 'idle', storyId: nextStory.id, roundNumber: 1, votes: {}, submittedCount: 0, revealedAt: null, timerStartedAt: null, timerEndsAt: null };
    setSelectedId(nextStory.id);
    await onSave(next);
  }

  function selectStory(id: string) {
    if (isVoting && id !== selectedStory.id) return;
    setSelectedId(id);
    if (isObserver) return;
    const next = cloneState(state);
    next.selectedStoryId = id;
    next.round.storyId = id;
    void onSave(next);
  }

  function editStory(story: Story | null, type = 'Feature') {
    setModal({ kind: 'edit', story, type });
  }

  async function saveStory(draft: Story) {
    const next = cloneState(state);
    let id = draft.id;
    if (!id || !next.stories.some((story) => story.id === id)) {
      id = nextImportedStoryId(next.stories);
      while (next.stories.some((story) => story.id === id)) id = nextImportedStoryId([...next.stories, { ...draft, id }]);
      next.stories.push({ ...draft, id });
    } else {
      next.stories = next.stories.map((story) => story.id === id ? { ...draft, id } : story);
    }
    const nextSelectedStory = next.stories.find((candidate) => candidate.id === id && candidate.type !== 'Epic') || next.stories.find((candidate) => candidate.id === selectedId && candidate.type !== 'Epic') || next.stories.find((candidate) => candidate.type !== 'Epic');
    next.selectedStoryId = nextSelectedStory?.id || null;
    next.round.storyId = nextSelectedStory?.id || null;
    setSelectedId(nextSelectedStory?.id || '');
    await onSave(next);
    setModal(null);
  }

  async function importStories(imported: Story[], epicId: string | null) {
    const next = cloneState(state);
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
    const nextSelectedStory = firstAddedStory || next.stories.find((story) => story.id === selectedId && story.type !== 'Epic') || next.stories.find((story) => story.type !== 'Epic');
    next.selectedStoryId = nextSelectedStory?.id || null;
    next.round.storyId = nextSelectedStory?.id || null;
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
    if (next.round.storyId === story.id) next.round = { ...next.round, phase: 'idle', storyId: fallback?.id || null, roundNumber: 1, votes: {}, submittedCount: 0, revealedAt: null, timerStartedAt: null, timerEndsAt: null };
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
    next.round = { ...next.round, phase: 'idle', storyId: story.id, roundNumber: Math.max(1, state.round.roundNumber + 1), votes: {}, submittedCount: 0, revealedAt: null, timerStartedAt: null, timerEndsAt: null };
    setSelectedId(story.id);
    await onSave(next);
  }

  return <>
    <div className="hero-row"><div><p className="eyebrow">{room.piLabel} · planning room</p><h1>Make the estimate visible.</h1><p className="hero-copy">Bring the story context, team votes, and final point value into one shared workspace.</p></div><div className="pi-meta"><div className="pi-meta-icon">PI</div><div className="pi-meta-copy"><span>Current room</span><strong>{room.name}</strong></div></div></div>
    <div className="summary-grid"><div className="summary-card"><div className="summary-top"><span className="summary-label">Stories</span><span className="summary-icon"><AppIcon name="listChecks" size={16} /></span></div><div className="summary-value">{estimableStories.length}</div><div className="summary-foot">Ready for the next discussion</div></div><div className="summary-card"><div className="summary-top"><span className="summary-label">Estimated</span><span className="summary-icon"><AppIcon name="check" size={16} /></span></div><div className="summary-value">{estimableStories.filter((story) => story.manual !== null).length}<small>/ {estimableStories.length}</small></div><div className="progress-bar"><span style={{ width: `${estimableStories.length ? (estimableStories.filter((story) => story.manual !== null).length / estimableStories.length) * 100 : 0}%` }} /></div></div><div className="summary-card"><div className="summary-top"><span className="summary-label">Planners</span><span className="summary-icon"><AppIcon name="users" size={16} /></span></div><div className="summary-value">{room.memberCount}</div><div className="summary-foot">People in this room</div></div><div className="summary-card"><div className="summary-top"><span className="summary-label">Round</span><span className="summary-icon"><AppIcon name="clock" size={16} /></span></div><div className="summary-value">{round.phase === 'voting' ? 'Live' : round.phase === 'revealed' ? 'Done' : 'Idle'}</div><div className="summary-foot">{round.phase === 'voting' ? (countVisible ? `${round.submittedCount} vote${round.submittedCount === 1 ? '' : 's'} submitted` : 'Votes are hidden until everyone submits') : progressLabel}</div></div></div>
    <div className="workspace-grid">
      <section className="card estimator-card">
        <div className="card-heading"><div><span className="story-progress">{selectedStory.id} · {selectedStory.type}</span><h2>Estimate this story</h2></div><label className="sequence-control">Sequence<select value={state.sequence} disabled={!canManage || saving} onChange={(event) => { const next = cloneState(state); next.sequence = event.target.value as RoomState['sequence']; void onSave(next); }}><option value="sequential">Sequential</option><option value="fibonacci">Fibonacci</option><option value="modified">Modified Fibonacci</option></select></label></div>
        <div className="story-detail"><div className="story-detail-top"><span className="story-type">{selectedStory.type}</span>{selectedStory.url ? <a className="outline-button" href={selectedStory.url} target="_blank" rel="noreferrer">Open story <AppIcon name="externalLink" size={13} /></a> : null}</div><h3>{selectedStory.title}</h3><p className="story-description">{selectedStory.description}</p><div className="acceptance-list">{selectedStory.acceptance.map((item) => <span className="acceptance-chip" key={item}><AppIcon name="check" size={12} /> {item}</span>)}</div></div>
        <div className="estimate-section"><div className="estimate-section-heading"><div><h3>{isVoting ? isObserver ? 'Watch the live round' : 'Choose your cards' : isRevealed ? 'Round result' : 'Working estimate'}</h3><p>{isVoting ? isObserver ? 'Observers can watch the round but cannot submit votes.' : currentPlayer?.joined ? 'Submit one or both estimates when you are ready.' : 'Join this round before choosing cards.' : isRevealed ? `${round.submittedCount} submitted · votes are visible` : canManage ? 'Set a shared estimate or start a live round.' : 'The room owner controls the shared estimate.'}</p></div><div className="estimate-heading-tools">{isVoting || isRevealed ? <span className="round-badge">Round {round.roundNumber} · {formatDuration(round.timerStartedAt, now)}</span> : null}{isVoting && canManage ? <select className="round-mode-select" value={state.roomSettings.voteMode} onChange={(event) => void setVoteMode(event.target.value as 'hidden' | 'open')}><option value="hidden">Hidden votes</option><option value="open">Open votes</option></select> : null}</div></div>
          <div className="estimate-fields"><EstimateField label="Manual estimate" helper="The team’s delivery estimate" values={values} value={manual} disabled={isObserver || (isVoting && !currentPlayer?.joined) || (!isVoting && !canManage)} onChange={setManual} /><EstimateField label="AI comparison" helper={state.roomSettings.aiEnabled ? 'Optional comparison point' : 'AI comparison is disabled for this room'} values={values} value={ai} ai disabled={isObserver || !state.roomSettings.aiEnabled || (isVoting && !currentPlayer?.joined) || (!isVoting && !canManage)} onChange={setAi} /></div>
        </div>
        <div className="estimator-footer"><div className="status-message"><span className="icon"><AppIcon name="clock" size={14} /></span>{isVoting ? isObserver ? 'Observer · view only' : currentPlayer?.joined ? (countVisible ? `${round.submittedCount} vote${round.submittedCount === 1 ? '' : 's'} submitted` : 'Votes hidden until complete') : 'You have not joined this round' : selectedStory.manual === null ? 'No final estimate saved' : `Final estimate: ${selectedStory.manual}`}</div><div className="footer-actions">{isVoting && !isObserver && !currentPlayer?.joined ? <button className="outline-button" type="button" disabled={saving} onClick={() => void onJoin(true)}>Join round</button> : null}{isVoting && !isObserver && currentPlayer?.joined ? <><button className="outline-button" type="button" disabled={saving} onClick={() => void onJoin(false)}>Leave round</button><button className="primary-button" type="button" disabled={saving || (manual === null && ai === null)} onClick={() => void onVote(manual, ai)}>Submit vote</button></> : null}{round.phase === 'idle' && canManage ? <><button className="primary-button" type="button" disabled={saving} onClick={() => void startRound()}>Start round</button><button className="outline-button" type="button" disabled={saving} onClick={() => void saveEstimate()}>Save estimate</button></> : null}{isVoting && canManage ? <><button className="outline-button" type="button" disabled={saving} onClick={() => void revealRound()}>Reveal votes</button><button className="outline-button" type="button" disabled={saving} onClick={() => void onClearVotes()}>Clear votes</button><button className="outline-button" type="button" disabled={saving} onClick={() => void resetTimer()}>Reset timer</button><button className="outline-button" type="button" disabled={saving} onClick={() => void skipStory()}>Skip story</button></> : null}{isRevealed && canManage ? <><button className="outline-button" type="button" disabled={saving} onClick={() => void resetRound()}>Next round</button><button className="primary-button" type="button" disabled={saving} onClick={() => void saveEstimate()}>Save final estimate</button></> : null}</div></div>
        {isRevealed || isVoting ? <div className="pl-vote-summary">{round.players.map((player) => {
          const observer = player.role === 'observer';
          const teamEstimate = observer ? '—' : displayVote(player.manual, player.manualSubmitted, isRevealed);
          const aiEstimate = observer ? '—' : state.roomSettings.aiEnabled ? displayVote(player.ai, player.aiSubmitted, isRevealed) : 'Disabled';
          return <div className="pl-vote-row" key={player.id}>
            <div className="pl-vote-person"><span>{player.name}{player.id === user.id ? ' · You' : ''}</span><small>{observer ? 'Observer · view only' : player.joined ? (player.hasVoted ? 'Vote submitted' : 'Waiting for vote') : 'Not joined'}</small></div>
            <div className="pl-vote-estimates"><span className={`pl-vote-estimate${teamEstimate === 'Hidden' || teamEstimate === 'Waiting' ? ' is-pending' : ''}`}><small>Team</small><strong>{teamEstimate}</strong></span><span className={`pl-vote-estimate${aiEstimate === 'Hidden' || aiEstimate === 'Waiting' ? ' is-pending' : ''}`}><small>AI</small><strong>{aiEstimate}</strong></span></div>
            {canManage && player.id !== user.id && player.joined ? <button className="story-action-button danger-action" type="button" onClick={() => void onRemoveVoter(player.id)} aria-label={`Remove ${player.name}`}><AppIcon name="x" size={13} /></button> : null}
          </div>;
        })}</div> : null}
      </section>
      <StoryQueue stories={state.stories} selectedId={selectedStory.id} canManage={canManage} voting={isVoting} onSelect={selectStory} onNew={(type) => editStory(null, type)} onImport={() => setModal({ kind: 'import' })} onEdit={(story) => editStory(story)} onMove={(id, direction) => void moveStory(id, direction)} onDelete={(story) => void deleteStory(story)} onRevote={(story) => void revoteStory(story)} />
    </div>
    {state.voteHistory.length ? <section className="card history-card" style={{ marginTop: 18 }}><div className="lower-card-heading"><div><h2>Vote history</h2><p>Revealed rounds saved for this planning room.</p></div><span>{state.voteHistory.length} votes</span></div><div className="table-scroll"><table className="history-table"><thead><tr><th>Story</th><th>Round</th><th>Planner</th><th>Manual</th><th>AI</th></tr></thead><tbody>{[...state.voteHistory].sort((left, right) => right.updatedAt?.localeCompare(left.updatedAt || '') || 0).slice(0, 30).map((entry) => <tr key={`${entry.storyId}-${entry.roundNumber}-${entry.voterId}`}><td>{state.stories.find((story) => story.id === entry.storyId)?.title || entry.storyId}</td><td>#{entry.roundNumber}</td><td>{entry.voterId === user.id ? 'You' : entry.voterName}</td><td className="table-score">{entry.manual ?? '—'}</td><td className="table-score">{entry.ai ?? '—'}</td></tr>)}</tbody></table></div></section> : null}
    {modal?.kind === 'edit' ? <StoryEditorModal key={`${modal.story?.id || 'new'}-${modal.type || ''}`} state={state} story={modal.story} initialType={modal.type} saving={saving} onClose={() => setModal(null)} onSave={saveStory} /> : null}
    {modal?.kind === 'import' ? <ImportStoriesModal epics={state.stories.filter((story) => story.type === 'Epic')} saving={saving} onClose={() => setModal(null)} onImport={importStories} /> : null}
  </>;
}

