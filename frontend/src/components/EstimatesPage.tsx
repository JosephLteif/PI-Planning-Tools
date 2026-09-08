import { useEffect, useMemo, useState } from 'react';
import { ImportStoriesModal } from './ImportStoriesModal';
import { StoryEditorModal } from './StoryEditorModal';
import type { Room, RoomState, Story, User } from '../types';
import { cloneState, sequences } from '../state';
import { nextImportedStoryId } from '../storyUtils';

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

function StoryQueue({ stories, selectedId, canManage, voting, onSelect, onNew, onImport, onEdit, onMove, onDelete, onRevote }: StoryQueueProps) {
  const epics = stories.filter((story) => story.type === 'Epic');
  const groupedIds = new Set(epics.flatMap((epic) => stories.filter((story) => story.epicId === epic.id).map((story) => story.id)));
  const groups = [
    ...epics.map((epic) => ({ key: epic.id, label: epic.title, epic, children: stories.filter((story) => story.id === epic.id || story.epicId === epic.id) })),
    { key: 'unassigned', label: 'Unassigned stories', epic: null, children: stories.filter((story) => story.type !== 'Epic' && (!story.epicId || !groupedIds.has(story.id))) },
  ].filter((group) => group.children.length);

  function storyRow(story: Story) {
    const index = stories.findIndex((candidate) => candidate.id === story.id);
    return <div className={`story-row${story.id === selectedId ? ' active' : ''}`} key={story.id}>
      <button className="story-row-main" type="button" onClick={() => onSelect(story.id)}>
        <span className="story-number">{story.id}</span>
        <span className="story-row-copy"><strong>{story.title}</strong><span>{story.type}{story.epicId ? ' · linked to epic' : ''}</span></span>
        <span className="story-score"><span className={`score-pill${story.manual === null ? ' empty' : ''}`}>{story.manual ?? '—'}</span></span>
      </button>
      {canManage ? <div className="story-row-actions"><button className="story-action-button" type="button" disabled={voting} onClick={() => onEdit(story)} aria-label={`Edit ${story.title}`}>✎</button><button className="story-action-button" type="button" disabled={voting || index <= 0} onClick={() => onMove(story.id, -1)} aria-label={`Move ${story.title} up`}>↑</button><button className="story-action-button" type="button" disabled={voting || index >= stories.length - 1} onClick={() => onMove(story.id, 1)} aria-label={`Move ${story.title} down`}>↓</button>{story.manual !== null ? <button className="story-action-button" type="button" disabled={voting} onClick={() => onRevote(story)} aria-label={`Revote ${story.title}`}>↻</button> : null}<button className="story-action-button danger-action" type="button" disabled={voting || stories.length <= 1} onClick={() => onDelete(story)} aria-label={`Delete ${story.title}`}>×</button></div> : null}
    </div>;
  }

  return <section className="card queue-card">
    <div className="queue-header"><div><h2>Story queue</h2><p>{stories.length} {stories.length === 1 ? 'story' : 'stories'} · {stories.filter((story) => story.manual !== null).length} estimated</p></div>{canManage ? <div className="queue-header-actions"><button className="outline-button import-button" type="button" disabled={voting} onClick={() => onNew()}>＋ Story</button><button className="outline-button import-button" type="button" disabled={voting} onClick={() => onNew('Epic')}>＋ Epic</button><button className="outline-button import-button" type="button" disabled={voting} onClick={onImport}>Import</button></div> : null}</div>
    <div className="story-queues">{groups.map((group) => group.epic ? <div className="story-queue-group" key={group.key}><div className="story-queue-group-heading"><div><span className="queue-group-icon">◆</span><span><strong>{group.label}</strong><small>Epic · {group.children.length - 1} linked {group.children.length - 1 === 1 ? 'story' : 'stories'}</small></span></div><span className="queue-group-count">{group.children.filter((story) => story.manual !== null).length}/{group.children.length}</span></div><div className="story-list">{group.children.map(storyRow)}</div></div> : <div className="story-list" key={group.key}>{group.children.map(storyRow)}</div>)}</div>
    <div className="queue-footer"><span className="icon">◷</span>{voting ? 'Queue actions are paused while the round is live.' : 'Select a story to estimate, edit, reorder, or import more work.'}</div>
  </section>;
}

function EstimateField({ label, helper, values, value, disabled, ai, onChange }: { label: string; helper: string; values: readonly number[]; value: number | null; disabled?: boolean; ai?: boolean; onChange: (value: number | null) => void }) {
  const id = label.replace(/\s+/g, '-').toLowerCase();
  return <div className={`estimate-field${value !== null ? ' has-selection' : ''}${ai ? ' ai-field' : ''}${disabled ? ' is-disabled' : ''}`}>
    <div className="field-label-row"><div className="field-label-copy"><span className="icon" aria-hidden="true">{ai ? '✦' : '◉'}</span><strong>{label}</strong></div>{value !== null ? <strong>{value}</strong> : null}</div>
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

export function EstimatesPage({ room, state, user, saving, onSave, onVote, onJoin, onClearVotes, onRemoveVoter }: EstimatesPageProps) {
  const [selectedId, setSelectedId] = useState(state.selectedStoryId || state.stories[0]?.id || '');
  const [manual, setManual] = useState<number | null>(null);
  const [ai, setAi] = useState<number | null>(null);
  const [modal, setModal] = useState<{ kind: 'edit'; story: Story | null; type?: string } | { kind: 'import' } | null>(null);
  const [now, setNow] = useState(Date.now());
  const selectedStory = state.stories.find((story) => story.id === selectedId) || state.stories[0];
  const values = sequences[state.sequence].values;
  const canManage = room.role === 'owner' || room.role === 'admin' || user.role === 'admin';
  const round = state.round;
  const currentPlayer = round.players.find((player) => player.id === user.id);
  const currentVote = round.votes[user.id];
  const isVoting = round.phase === 'voting' && round.storyId === selectedStory?.id;
  const isRevealed = round.phase === 'revealed' && round.storyId === selectedStory?.id;
  const joinedPlayers = round.players.filter((player) => player.joined);
  const countVisible = !round.hideVoteCountUntilComplete || !joinedPlayers.length || round.submittedCount >= joinedPlayers.length;

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
  }, [currentPlayer?.ai, currentPlayer?.manual, currentVote?.ai, currentVote?.manual, isVoting, selectedId, selectedStory]);

  const progressLabel = useMemo(() => `${state.stories.filter((story) => story.manual !== null).length} of ${state.stories.length} estimated`, [state.stories]);
  if (!selectedStory) return <div className="empty-state"><div className="empty-state-icon">▦</div><h2>No stories yet</h2><p>Create or import a story to begin planning.</p></div>;

  async function saveEstimate() {
    const next = cloneState(state);
    next.selectedStoryId = selectedStory.id;
    next.round.storyId = selectedStory.id;
    next.stories = next.stories.map((story) => story.id === selectedStory.id ? { ...story, manual, ai, aiEnabled: ai !== null, saved: manual !== null } : story);
    await onSave(next);
  }

  async function startRound() {
    const next = cloneState(state);
    next.selectedStoryId = selectedStory.id;
    next.round = { ...next.round, phase: 'voting', mode: state.roomSettings.voteMode, hideVoteCountUntilComplete: state.roomSettings.hideVoteCountUntilComplete, storyId: selectedStory.id, roundNumber: Math.max(1, state.round.roundNumber), submittedCount: 0, votes: {}, cardFlipped: false, revealedAt: null, timerStartedAt: new Date().toISOString(), timerEndsAt: null };
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
    const nextStory = state.stories.find((story) => story.manual === null && story.type !== 'Epic' && story.id !== selectedStory.id);
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
      if (draft.type === 'Epic') next.stories = next.stories.map((story) => story.epicId === id ? { ...story, epicId: null } : story);
    }
    next.selectedStoryId = id;
    next.round.storyId = next.round.storyId || id;
    setSelectedId(id);
    await onSave(next);
    setModal(null);
  }

  async function importStories(imported: Story[]) {
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
      return { ...story, id };
    });
    next.stories.push(...added);
    next.selectedStoryId = added[0]?.id || next.selectedStoryId;
    setSelectedId(next.selectedStoryId || '');
    await onSave(next);
    setModal(null);
  }

  async function deleteStory(story: Story) {
    if (state.stories.length <= 1 || !window.confirm(`Delete ${story.title}?`)) return;
    const next = cloneState(state);
    next.stories = next.stories.filter((candidate) => candidate.id !== story.id).map((candidate) => candidate.epicId === story.id ? { ...candidate, epicId: null } : candidate);
    const fallback = next.stories[0];
    next.selectedStoryId = fallback.id;
    if (next.round.storyId === story.id) next.round = { ...next.round, phase: 'idle', storyId: fallback.id, roundNumber: 1, votes: {}, submittedCount: 0, revealedAt: null, timerStartedAt: null, timerEndsAt: null };
    setSelectedId(fallback.id);
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
    <div className="summary-grid"><div className="summary-card"><div className="summary-top"><span className="summary-label">Stories</span><span className="summary-icon">▤</span></div><div className="summary-value">{state.stories.length}</div><div className="summary-foot">Ready for the next discussion</div></div><div className="summary-card"><div className="summary-top"><span className="summary-label">Estimated</span><span className="summary-icon">✓</span></div><div className="summary-value">{state.stories.filter((story) => story.manual !== null).length}<small>/ {state.stories.length}</small></div><div className="progress-bar"><span style={{ width: `${state.stories.length ? (state.stories.filter((story) => story.manual !== null).length / state.stories.length) * 100 : 0}%` }} /></div></div><div className="summary-card"><div className="summary-top"><span className="summary-label">Planners</span><span className="summary-icon">♟</span></div><div className="summary-value">{room.memberCount}</div><div className="summary-foot">People in this room</div></div><div className="summary-card"><div className="summary-top"><span className="summary-label">Round</span><span className="summary-icon">◷</span></div><div className="summary-value">{round.phase === 'voting' ? 'Live' : round.phase === 'revealed' ? 'Done' : 'Idle'}</div><div className="summary-foot">{round.phase === 'voting' ? (countVisible ? `${round.submittedCount} vote${round.submittedCount === 1 ? '' : 's'} submitted` : 'Votes are hidden until everyone submits') : progressLabel}</div></div></div>
    <div className="workspace-grid">
      <section className="card estimator-card">
        <div className="card-heading"><div><span className="story-progress">{selectedStory.id} · {selectedStory.type}</span><h2>Estimate this story</h2></div><label className="sequence-control">Sequence<select value={state.sequence} disabled={!canManage || saving} onChange={(event) => { const next = cloneState(state); next.sequence = event.target.value as RoomState['sequence']; void onSave(next); }}><option value="sequential">Sequential</option><option value="fibonacci">Fibonacci</option><option value="modified">Modified Fibonacci</option></select></label></div>
        <div className="story-detail"><div className="story-detail-top"><span className="story-type">{selectedStory.type}</span>{selectedStory.url ? <a className="outline-button" href={selectedStory.url} target="_blank" rel="noreferrer">Open story ↗</a> : null}</div><h3>{selectedStory.title}</h3><p className="story-description">{selectedStory.description}</p><div className="acceptance-list">{selectedStory.acceptance.map((item) => <span className="acceptance-chip" key={item}>✓ {item}</span>)}</div></div>
        <div className="estimate-section"><div className="estimate-section-heading"><div><h3>{isVoting ? 'Choose your cards' : isRevealed ? 'Round result' : 'Working estimate'}</h3><p>{isVoting ? (currentPlayer?.joined ? 'Submit one or both estimates when you are ready.' : 'Join this round before choosing cards.') : isRevealed ? `${round.submittedCount} submitted · votes are visible` : canManage ? 'Set a shared estimate or start a live round.' : 'The room owner controls the shared estimate.'}</p></div><div className="estimate-heading-tools">{isVoting || isRevealed ? <span className="round-badge">Round {round.roundNumber} · {formatDuration(round.timerStartedAt, now)}</span> : null}{isVoting && canManage ? <select className="round-mode-select" value={state.roomSettings.voteMode} onChange={(event) => void setVoteMode(event.target.value as 'hidden' | 'open')}><option value="hidden">Hidden votes</option><option value="open">Open votes</option></select> : null}</div></div>
          <div className="estimate-fields"><EstimateField label="Manual estimate" helper="The team’s delivery estimate" values={values} value={manual} disabled={(isVoting && !currentPlayer?.joined) || (!isVoting && !canManage)} onChange={setManual} /><EstimateField label="AI comparison" helper={state.roomSettings.aiEnabled ? 'Optional comparison point' : 'AI comparison is disabled for this room'} values={values} value={ai} ai disabled={!state.roomSettings.aiEnabled || (isVoting && !currentPlayer?.joined) || (!isVoting && !canManage)} onChange={setAi} /></div>
        </div>
        <div className="estimator-footer"><div className="status-message"><span className="icon">◷</span>{isVoting ? (currentPlayer?.joined ? (countVisible ? `${round.submittedCount} vote${round.submittedCount === 1 ? '' : 's'} submitted` : 'Votes hidden until complete') : 'You have not joined this round') : selectedStory.manual === null ? 'No final estimate saved' : `Final estimate: ${selectedStory.manual}`}</div><div className="footer-actions">{isVoting && !currentPlayer?.joined ? <button className="outline-button" type="button" disabled={saving} onClick={() => void onJoin(true)}>Join round</button> : null}{isVoting && currentPlayer?.joined ? <><button className="outline-button" type="button" disabled={saving} onClick={() => void onJoin(false)}>Leave round</button><button className="primary-button" type="button" disabled={saving || (manual === null && ai === null)} onClick={() => void onVote(manual, ai)}>Submit vote</button></> : null}{round.phase === 'idle' && canManage ? <><button className="primary-button" type="button" disabled={saving} onClick={() => void startRound()}>Start round</button><button className="outline-button" type="button" disabled={saving} onClick={() => void saveEstimate()}>Save estimate</button></> : null}{isVoting && canManage ? <><button className="outline-button" type="button" disabled={saving} onClick={() => void revealRound()}>Reveal votes</button><button className="outline-button" type="button" disabled={saving} onClick={() => void onClearVotes()}>Clear votes</button><button className="outline-button" type="button" disabled={saving} onClick={() => void resetTimer()}>Reset timer</button><button className="outline-button" type="button" disabled={saving} onClick={() => void skipStory()}>Skip story</button></> : null}{isRevealed && canManage ? <><button className="outline-button" type="button" disabled={saving} onClick={() => void resetRound()}>Next round</button><button className="primary-button" type="button" disabled={saving} onClick={() => void saveEstimate()}>Save final estimate</button></> : null}</div></div>
        {isRevealed ? <div className="pl-vote-summary">{Object.entries(round.votes).map(([id, vote]) => <div className="pl-vote-row" key={id}><span>{vote.name}</span><strong>{vote.manual ?? '—'}</strong>{vote.ai !== null ? <small>AI {vote.ai}</small> : null}</div>)}</div> : null}
        {isVoting ? <div className="pl-vote-summary">{round.players.filter((player) => player.joined).map((player) => <div className="pl-vote-row" key={player.id}><span>{player.name}{player.id === user.id ? ' · You' : ''}</span><strong>{player.hasVoted ? (round.mode === 'open' || player.id === user.id ? player.manual ?? '—' : 'Submitted') : 'Waiting'}</strong>{canManage && player.id !== user.id ? <button className="story-action-button danger-action" type="button" onClick={() => void onRemoveVoter(player.id)} aria-label={`Remove ${player.name}`}>×</button> : null}</div>)}</div> : null}
      </section>
      <StoryQueue stories={state.stories} selectedId={selectedStory.id} canManage={canManage} voting={isVoting} onSelect={selectStory} onNew={(type) => editStory(null, type)} onImport={() => setModal({ kind: 'import' })} onEdit={(story) => editStory(story)} onMove={(id, direction) => void moveStory(id, direction)} onDelete={(story) => void deleteStory(story)} onRevote={(story) => void revoteStory(story)} />
    </div>
    {state.voteHistory.length ? <section className="card history-card" style={{ marginTop: 18 }}><div className="lower-card-heading"><div><h2>Vote history</h2><p>Revealed rounds saved for this planning room.</p></div><span>{state.voteHistory.length} votes</span></div><div className="table-scroll"><table className="history-table"><thead><tr><th>Story</th><th>Round</th><th>Planner</th><th>Manual</th><th>AI</th></tr></thead><tbody>{[...state.voteHistory].sort((left, right) => right.updatedAt?.localeCompare(left.updatedAt || '') || 0).slice(0, 30).map((entry) => <tr key={`${entry.storyId}-${entry.roundNumber}-${entry.voterId}`}><td>{state.stories.find((story) => story.id === entry.storyId)?.title || entry.storyId}</td><td>#{entry.roundNumber}</td><td>{entry.voterId === user.id ? 'You' : entry.voterName}</td><td className="table-score">{entry.manual ?? '—'}</td><td className="table-score">{entry.ai ?? '—'}</td></tr>)}</tbody></table></div></section> : null}
    {modal?.kind === 'edit' ? <StoryEditorModal key={`${modal.story?.id || 'new'}-${modal.type || ''}`} state={state} story={modal.story} initialType={modal.type} saving={saving} onClose={() => setModal(null)} onSave={saveStory} /> : null}
    {modal?.kind === 'import' ? <ImportStoriesModal saving={saving} onClose={() => setModal(null)} onImport={importStories} /> : null}
  </>;
}
