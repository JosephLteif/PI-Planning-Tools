import { useMemo, useState, type CSSProperties, type DragEvent } from 'react';
import type { CapacitySprint, Room, RoomState, Story, User } from '../types';
import { cloneState } from '../state';
import { sprintFeatureCapacity } from '../capacityUtils';
import { AppIcon } from './AppIcon';

type DeliveryBoardPageProps = {
  room: Room;
  state: RoomState;
  user: User;
  saving: boolean;
  readOnly?: boolean;
  onSave: (state: RoomState) => Promise<void>;
};

const EPIC_COLORS = ['#4968d8', '#b061d5', '#d47449', '#28a58b', '#c59b32', '#d95570', '#448ab9', '#7d8b3e'];
type EstimateSource = 'team' | 'ai';

function formatPoints(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatDate(value: string) {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date) : value;
}

function epicStyle(color: string): CSSProperties {
  return { '--delivery-epic-color': color } as CSSProperties;
}

type DeliveryStoryCardProps = {
  story: Story;
  epic: Story | null;
  epicColor: string;
  sprintId: string | null;
  sprints: CapacitySprint[];
  canEdit: boolean;
  saving: boolean;
  estimateSource: EstimateSource;
  dragging: boolean;
  onMove: (storyId: string, sprintId: string | null) => void;
  onDragStart: (event: DragEvent<HTMLElement>, storyId: string) => void;
  onDragEnd: () => void;
};

function DeliveryStoryCard({ story, epic, epicColor, sprintId, sprints, canEdit, saving, estimateSource, dragging, onMove, onDragStart, onDragEnd }: DeliveryStoryCardProps) {
  const estimate = estimateSource === 'ai' ? story.ai : story.manual;
  return (
    <article
      className={`delivery-story-card${dragging ? ' is-dragging' : ''}`}
      style={epicStyle(epicColor)}
      draggable={canEdit && !saving}
      data-story-id={story.id}
      onDragStart={(event) => onDragStart(event, story.id)}
      onDragEnd={onDragEnd}
    >
      <div className="delivery-story-heading">
        <span className="delivery-story-id">{story.id}</span>
        <span className={`delivery-story-points${estimate === null ? ' is-empty' : ''}`}>{estimate === null ? 'No estimate' : `${formatPoints(estimate)} SP`}</span>
      </div>
      <strong className="delivery-story-title">{story.title}</strong>
      <div className="delivery-story-meta">
        <span className="delivery-epic-label" style={epicStyle(epicColor)}><span className="delivery-epic-dot" />{epic?.title || 'No epic'}</span>
        {story.stretch ? <span className="stretch-tag">Stretch</span> : null}
      </div>
      {canEdit ? (
        <label className="delivery-story-move">
          <span>Move to</span>
          <select value={sprintId || ''} disabled={saving} onChange={(event) => onMove(story.id, event.target.value || null)} aria-label={`Move ${story.title} to sprint`}>
            <option value="">Unplanned</option>
            {sprints.map((sprint) => <option key={sprint.id} value={sprint.id}>{sprint.name}</option>)}
          </select>
        </label>
      ) : null}
    </article>
  );
}

export function DeliveryBoardPage({ room, state, user, saving, readOnly = false, onSave }: DeliveryBoardPageProps) {
  const [draggingStoryId, setDraggingStoryId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [estimateSource, setEstimateSource] = useState<EstimateSource>('team');
  const canEdit = !readOnly && (room.role === 'owner' || room.role === 'admin' || user.role === 'admin');
  const aiEnabled = state.roomSettings.aiEnabled;
  const visibleEstimateSource: EstimateSource = aiEnabled ? estimateSource : 'team';
  const sprints = state.capacity.sprints;
  const assignments = state.capacity.storySprintIds || {};
  const stories = useMemo(() => state.stories.filter((story) => story.type !== 'Epic'), [state.stories]);
  const epics = useMemo(() => state.stories.filter((story) => story.type === 'Epic'), [state.stories]);
  const epicColors = useMemo(() => new Map(epics.map((epic, index) => [epic.id, EPIC_COLORS[index % EPIC_COLORS.length]])), [epics]);
  const sprintIndex = useMemo(() => new Map(sprints.map((sprint, index) => [sprint.id, index])), [sprints]);
  const storiesBySprint = useMemo(() => {
    const result = new Map<string, Story[]>();
    sprints.forEach((sprint) => result.set(sprint.id, []));
    stories.forEach((story) => {
      const sprintId = assignments[story.id];
      if (sprintId && result.has(sprintId)) result.get(sprintId)!.push(story);
    });
    return result;
  }, [assignments, sprints, stories]);
  const unplannedStories = useMemo(() => stories.filter((story) => !assignments[story.id] || !sprintIndex.has(assignments[story.id])), [assignments, sprintIndex, stories]);
  const epicDelivery = useMemo(() => epics.map((epic, index) => {
    const children = stories.filter((story) => story.epicId === epic.id);
    const plannedChildren = children.filter((story) => assignments[story.id] && sprintIndex.has(assignments[story.id]));
    const deliveryIndex = plannedChildren.reduce((latest, story) => Math.max(latest, sprintIndex.get(assignments[story.id]) ?? -1), -1);
    return {
      epic,
      children,
      plannedCount: plannedChildren.length,
      deliverySprint: deliveryIndex >= 0 ? sprints[deliveryIndex] : null,
      color: EPIC_COLORS[index % EPIC_COLORS.length],
    };
  }), [assignments, epics, sprintIndex, sprints, stories]);
  const sprintMetrics = useMemo(() => new Map(sprints.map((sprint) => {
    const sprintStories = storiesBySprint.get(sprint.id) || [];
    const load = sprintStories.reduce((total, story) => total + ((visibleEstimateSource === 'ai' ? story.ai : story.manual) ?? 0), 0);
    const capacity = sprintFeatureCapacity(state.capacity, sprint);
    return [sprint.id, { load, capacity, overloaded: load > capacity + 0.01 }];
  })), [sprints, state.capacity, storiesBySprint, visibleEstimateSource]);
  const plannedLoad = [...sprintMetrics.values()].reduce((total, metric) => total + metric.load, 0);
  const overloadedCount = [...sprintMetrics.values()].filter((metric) => metric.overloaded).length;

  async function moveStory(storyId: string, sprintId: string | null) {
    if (!canEdit || saving) return;
    const currentSprintId = assignments[storyId] || null;
    if (currentSprintId === sprintId) return;
    const next = cloneState(state);
    const nextAssignments = { ...(next.capacity.storySprintIds || {}) };
    if (sprintId) nextAssignments[storyId] = sprintId;
    else delete nextAssignments[storyId];
    next.capacity.storySprintIds = nextAssignments;
    await onSave(next);
  }

  function handleDragStart(event: DragEvent<HTMLElement>, storyId: string) {
    if (!canEdit || saving) return;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', storyId);
    setDraggingStoryId(storyId);
  }

  function handleDrop(event: DragEvent<HTMLElement>, sprintId: string | null) {
    event.preventDefault();
    if (!canEdit || saving) return;
    const storyId = event.dataTransfer.getData('text/plain') || draggingStoryId;
    setDragOverId(null);
    setDraggingStoryId(null);
    if (storyId) void moveStory(storyId, sprintId);
  }

  function columnStories(sprintId: string | null) {
    return sprintId ? storiesBySprint.get(sprintId) || [] : unplannedStories;
  }

  function renderColumn(sprint: CapacitySprint | null) {
    const sprintId = sprint?.id || null;
    const columnStoriesValue = columnStories(sprintId);
    const metric = sprintId ? sprintMetrics.get(sprintId) : null;
    const load = metric?.load ?? columnStoriesValue.reduce((total, story) => total + ((visibleEstimateSource === 'ai' ? story.ai : story.manual) ?? 0), 0);
    const capacity = metric?.capacity ?? null;
    const overloaded = metric?.overloaded === true;
    const unestimatedCount = columnStoriesValue.filter((story) => (visibleEstimateSource === 'ai' ? story.ai : story.manual) === null).length;
    const loadPercent = capacity && capacity > 0 ? Math.min(100, (load / capacity) * 100) : load > 0 ? 100 : 0;
    return (
      <section
        className={`delivery-column${overloaded ? ' is-overloaded' : ''}${dragOverId === (sprintId || 'unplanned') ? ' is-drag-over' : ''}`}
        key={sprintId || 'unplanned'}
        onDragOver={(event) => { if (!canEdit) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDragOverId(sprintId || 'unplanned'); }}
        onDragLeave={(event) => { if (event.currentTarget === event.target) setDragOverId(null); }}
        onDrop={(event) => handleDrop(event, sprintId)}
        data-sprint-id={sprintId || 'unplanned'}
      >
        <div className="delivery-column-header">
          <div className="delivery-column-title">
            <span className={`delivery-column-icon${sprint ? '' : ' is-unplanned'}`}><AppIcon name={sprint ? 'columns3' : 'inbox'} size={15} /></span>
            <div><span className="section-kicker">{sprint ? 'Sprint' : 'Parking lane'}</span><h3>{sprint?.name || 'Unplanned stories'}</h3>{sprint ? <span>{formatDate(sprint.startDate)}{sprint.endDate ? ` → ${formatDate(sprint.endDate)}` : ''}</span> : <span>Drag stories here until they have a delivery sprint.</span>}</div>
          </div>
          <div className="delivery-column-stats">
            <div><span>Capacity</span><strong>{capacity === null ? '—' : `${formatPoints(capacity)} SP`}</strong></div>
            <div className={overloaded ? 'is-overloaded' : ''}><span>Load</span><strong>{formatPoints(load)} SP</strong></div>
          </div>
          {sprint ? <div className="delivery-load-track" aria-label={`${formatPoints(load)} of ${formatPoints(capacity || 0)} story points loaded`}><span style={{ width: `${loadPercent}%` }} /></div> : null}
          <div className={`delivery-column-status${overloaded ? ' is-overloaded' : ''}`}>{overloaded ? 'Over capacity' : sprint ? `${formatPoints(Math.max(0, (capacity || 0) - load))} SP remaining${unestimatedCount ? ` · ${unestimatedCount} unestimated` : ''}` : `${columnStoriesValue.length} stories to place`}</div>
        </div>
        <div className="delivery-column-cards">
          {columnStoriesValue.length ? columnStoriesValue.map((story) => {
            const epic = story.epicId ? epics.find((candidate) => candidate.id === story.epicId) || null : null;
            const color = epic ? epicColors.get(epic.id) || EPIC_COLORS[0] : '#9aa7b8';
            return <DeliveryStoryCard key={story.id} story={story} epic={epic} epicColor={color} sprintId={sprintId} sprints={sprints} canEdit={canEdit} saving={saving} estimateSource={visibleEstimateSource} dragging={draggingStoryId === story.id} onMove={(storyId, nextSprintId) => void moveStory(storyId, nextSprintId)} onDragStart={handleDragStart} onDragEnd={() => { setDraggingStoryId(null); setDragOverId(null); }} />;
          }) : <div className="delivery-column-empty"><AppIcon name={sprint ? 'move' : 'inbox'} size={19} /><span>{sprint ? 'Drop stories here' : 'All stories are planned'}</span></div>}
        </div>
      </section>
    );
  }

  return (
    <div className="management-content delivery-board-page">
      <div className="hero-row delivery-board-hero">
        <div><p className="eyebrow">Workspace · delivery planning</p><h1>Shape the delivery plan.</h1><p className="hero-copy">Place estimated stories into capacity sprints, keep load visible, and see when each epic will finish.</p>{readOnly ? <p className="modal-hint">Observers can view the board but cannot move stories.</p> : null}</div>
        <div className="delivery-board-hero-note"><AppIcon name="kanban" size={19} /><span><strong>{canEdit ? 'Drag a story between sprints' : 'Delivery plan'}</strong><small>{saving ? 'Saving the latest move…' : 'Capacity is calculated from the room capacity plan.'}</small></span></div>
      </div>

      <section className="card delivery-epic-card">
        <div className="lower-card-heading"><div><p className="section-kicker">Epic forecast</p><h2>Delivery sprint by epic</h2><p>The delivery sprint is the latest sprint containing one of the epic’s stories.</p></div><span className="story-progress">{epics.length} {epics.length === 1 ? 'epic' : 'epics'}</span></div>
        {epicDelivery.length ? <div className="delivery-epic-list">{epicDelivery.map(({ epic, children, plannedCount, deliverySprint, color }) => (
          <div className="delivery-epic-row" key={epic.id} style={epicStyle(color)}>
            <div className="delivery-epic-name"><span className="delivery-epic-swatch" /><div><strong>{epic.title}</strong><span>{plannedCount}/{children.length} stories placed</span></div></div>
            <div className="delivery-epic-sprint"><span>Delivery sprint</span><strong>{deliverySprint?.name || (children.length ? 'Not planned' : 'No stories')}</strong><small>{deliverySprint ? `${formatDate(deliverySprint.startDate)}${deliverySprint.endDate ? ` → ${formatDate(deliverySprint.endDate)}` : ''}` : 'Place a story to forecast this epic.'}</small></div>
          </div>
        ))}</div> : <div className="delivery-empty-inline">Create an Epic and link stories to it to see its delivery sprint here.</div>}
      </section>

      {aiEnabled ? <div className="delivery-board-toolbar">
        <div><span className="section-kicker">Story points</span><p>Switch the board load and cards between Team and AI estimates.</p></div>
        <div className="allocation-estimate-toggle" role="group" aria-label="Delivery board estimate source">
          <span className="allocation-estimate-toggle-label">Show</span>
          {(['team', 'ai'] as const).map((source) => <button key={source} className={`allocation-estimate-option${visibleEstimateSource === source ? ' active' : ''}`} type="button" aria-pressed={visibleEstimateSource === source} onClick={() => setEstimateSource(source)}>{source === 'team' ? 'Team' : 'AI'}</button>)}
        </div>
      </div> : null}
      <div className="delivery-board-summary" aria-label="Delivery plan summary">
        <div><span>Sprints</span><strong>{sprints.length}</strong><small>from capacity</small></div>
        <div><span>Planned load</span><strong>{formatPoints(plannedLoad)} SP</strong><small>{visibleEstimateSource === 'team' ? 'team estimates' : 'AI estimates'}</small></div>
        <div><span>Unplanned</span><strong>{unplannedStories.length}</strong><small>{formatPoints(unplannedStories.reduce((total, story) => total + ((visibleEstimateSource === 'ai' ? story.ai : story.manual) ?? 0), 0))} SP to place</small></div>
        <div className={overloadedCount ? 'is-overloaded' : ''}><span>Over capacity</span><strong>{overloadedCount}</strong><small>{overloadedCount ? 'sprint needs attention' : 'all sprint loads fit'}</small></div>
      </div>

      {sprints.length ? <div className="delivery-board-scroll"><div className="delivery-board-columns">{renderColumn(null)}{sprints.map((sprint) => renderColumn(sprint))}</div></div> : <section className="card empty-state delivery-no-sprints"><span className="empty-state-icon"><AppIcon name="gauge" size={22} /></span><h2>Add capacity sprints first</h2><p>Every capacity sprint will appear here as a delivery column. Open Capacity to add the first one.</p></section>}
    </div>
  );
}
