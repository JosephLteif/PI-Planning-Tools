import { AppIcon } from './AppIcon';
import type { Room, RoomState, Story } from '../types';
import { isStretchStory } from '../storyUtils';

type DashboardPageProps = {
  room: Room;
  state: RoomState;
};

type StoryMetrics = {
  count: number;
  estimated: number;
  points: number;
};

function formatPoints(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function percentage(value: number, total: number) {
  return total ? Math.round((value / total) * 100) : 0;
}

function storyMetrics(stories: Story[]): StoryMetrics {
  return {
    count: stories.length,
    estimated: stories.filter((story) => story.manual !== null).length,
    points: stories.reduce((sum, story) => sum + (story.manual || 0), 0),
  };
}

function metricLabel(metrics: StoryMetrics) {
  return `${metrics.estimated}/${metrics.count} estimated · ${formatPoints(metrics.points)} SP`;
}

export function DashboardPage({ room, state }: DashboardPageProps) {
  const stories = state.stories.filter((story) => story.type !== 'Epic');
  const epics = state.stories.filter((story) => story.type === 'Epic');
  const overall = storyMetrics(stories);
  const unestimated = overall.count - overall.estimated;
  const committedStories = stories.filter((story) => !isStretchStory(story, state.stories));
  const stretchStories = stories.filter((story) => isStretchStory(story, state.stories));
  const committed = storyMetrics(committedStories);
  const stretch = storyMetrics(stretchStories);
  const typeRows = [...new Set(stories.map((story) => story.type))]
    .map((type) => ({ type, ...storyMetrics(stories.filter((story) => story.type === type)) }))
    .sort((left, right) => right.points - left.points || left.type.localeCompare(right.type));
  const epicRows = [
    ...epics.map((epic) => ({ id: epic.id, name: epic.title, stretch: epic.stretch, metrics: storyMetrics(stories.filter((story) => story.epicId === epic.id)) })),
    ...(stories.some((story) => !story.epicId || !epics.some((epic) => epic.id === story.epicId)) ? [{ id: 'unassigned', name: 'Unassigned stories', stretch: false, metrics: storyMetrics(stories.filter((story) => !story.epicId || !epics.some((epic) => epic.id === story.epicId))) }] : []),
  ];
  const aiStories = state.roomSettings.aiEnabled ? stories.filter((story) => story.ai !== null) : [];
  const pairedStories = aiStories.filter((story) => story.manual !== null);
  const aiPoints = aiStories.reduce((sum, story) => sum + (story.ai || 0), 0);
  const pairedTeamPoints = pairedStories.reduce((sum, story) => sum + (story.manual || 0), 0);
  const pairedAiPoints = pairedStories.reduce((sum, story) => sum + (story.ai || 0), 0);
  const aiDelta = pairedTeamPoints ? Math.round(((pairedTeamPoints - pairedAiPoints) / pairedTeamPoints) * 100) : null;
  const currentStory = state.stories.find((story) => story.id === state.round.storyId || story.id === state.selectedStoryId);

  return <>
    <div className="hero-row dashboard-hero"><div><p className="eyebrow">{room.piLabel} · global dashboard</p><h1>See the whole plan at a glance.</h1><p className="hero-copy">Track estimation progress, delivery scope, and epic health across the room before opening the focused voting workspace.</p></div><div className="pi-meta"><div className="pi-meta-icon">PI</div><div className="pi-meta-copy"><span>Current room</span><strong>{room.name}</strong></div></div></div>

    <div className="dashboard-summary-grid">
      <article className="dashboard-stat-card"><div className="dashboard-stat-top"><span>Stories</span><span className="summary-icon"><AppIcon name="listChecks" size={16} /></span></div><strong>{overall.count}</strong><small>{unestimated ? `${unestimated} still need an estimate` : 'All stories estimated'}</small></article>
      <article className="dashboard-stat-card"><div className="dashboard-stat-top"><span>Team points</span><span className="summary-icon"><AppIcon name="check" size={16} /></span></div><strong>{formatPoints(overall.points)}</strong><small>{overall.estimated} stories with a saved estimate</small></article>
      <article className="dashboard-stat-card"><div className="dashboard-stat-top"><span>Committed scope</span><span className="summary-icon"><AppIcon name="briefcase" size={16} /></span></div><strong>{formatPoints(committed.points)}</strong><small>{committed.count} committed stories · {formatPoints(stretch.points)} SP stretch</small></article>
      <article className="dashboard-stat-card dashboard-stat-primary"><div className="dashboard-stat-top"><span>Progress</span><span className="summary-icon"><AppIcon name="gauge" size={16} /></span></div><strong>{percentage(overall.estimated, overall.count)}%</strong><small>{overall.estimated} of {overall.count} stories estimated</small></article>
    </div>

    <div className="dashboard-overview-grid">
      <section className="card dashboard-card"><div className="dashboard-card-heading"><div><p className="section-kicker">Global progress</p><h2>Estimation coverage</h2><p>Every story contributes to this room-wide view.</p></div><span className="dashboard-card-total">{formatPoints(overall.points)} SP</span></div><div className="dashboard-progress-value"><strong>{percentage(overall.estimated, overall.count)}%</strong><span>{overall.estimated} estimated · {unestimated} remaining</span></div><div className="dashboard-progress-bar"><span style={{ width: `${percentage(overall.estimated, overall.count)}%` }} /></div><div className="dashboard-detail-grid"><div><span>Committed</span><strong>{formatPoints(committed.points)} SP</strong><small>{committed.estimated}/{committed.count} estimated</small></div><div className="dashboard-detail-stretch"><span>Stretch</span><strong>{formatPoints(stretch.points)} SP</strong><small>{stretch.estimated}/{stretch.count} estimated</small></div><div><span>Current round</span><strong>{state.round.phase === 'voting' ? 'Live' : state.round.phase === 'revealed' ? 'Revealed' : state.round.phase === 'paused' ? 'Paused' : 'Idle'}</strong><small>{currentStory?.title || 'No story selected'}</small></div></div></section>

      <section className="card dashboard-card"><div className="dashboard-card-heading"><div><p className="section-kicker">Story mix</p><h2>Scope by type</h2><p>Where the room’s estimated points sit.</p></div></div><div className="dashboard-type-list">{typeRows.length ? typeRows.map((row) => <div className="dashboard-type-row" key={row.type}><div className="dashboard-type-row-top"><span>{row.type}</span><strong>{formatPoints(row.points)} SP</strong></div><div className="dashboard-mini-bar"><span style={{ width: `${overall.points ? (row.points / overall.points) * 100 : 0}%` }} /></div><small>{metricLabel(row)}</small></div>) : <p className="dashboard-empty">Add stories to see the global type mix.</p>}</div></section>
    </div>

    <section className="card dashboard-card dashboard-epic-card"><div className="dashboard-card-heading"><div><p className="section-kicker">Epic health</p><h2>Progress by epic</h2><p>See which groups are ready for discussion and which still need estimates.</p></div><span className="dashboard-card-total">{epicRows.length} groups</span></div><div className="dashboard-epic-list">{epicRows.length ? epicRows.map((row) => <div className="dashboard-epic-row" key={row.id}><div className="dashboard-epic-row-top"><div><strong>{row.name}</strong><small>{row.stretch ? 'Stretch epic · ' : ''}{row.metrics.estimated}/{row.metrics.count} stories estimated</small></div><span>{percentage(row.metrics.estimated, row.metrics.count)}%</span></div><div className="dashboard-mini-bar"><span style={{ width: `${percentage(row.metrics.estimated, row.metrics.count)}%` }} /></div><div className="dashboard-epic-row-foot"><span>{formatPoints(row.metrics.points)} team SP</span><span>{row.metrics.count ? `${row.metrics.count - row.metrics.estimated} remaining` : 'No stories linked'}</span></div></div>) : <p className="dashboard-empty">Create an epic or add stories to see epic health here.</p>}</div></section>

    {state.roomSettings.aiEnabled ? <section className="card dashboard-card dashboard-ai-card"><div className="dashboard-card-heading"><div><p className="section-kicker">Optional comparison</p><h2>Team and AI estimates</h2><p>Compare global totals without changing the team’s saved estimate.</p></div><span className="dashboard-card-total">{aiStories.length}/{stories.length} AI covered</span></div><div className="dashboard-ai-grid"><div><span>AI points</span><strong>{formatPoints(aiPoints)} SP</strong><small>{aiStories.length} stories with AI estimates</small></div><div><span>Paired team points</span><strong>{formatPoints(pairedTeamPoints)} SP</strong><small>{pairedStories.length} stories with both values</small></div><div className={aiDelta === null ? '' : aiDelta > 0 ? 'is-positive' : aiDelta < 0 ? 'is-negative' : ''}><span>AI difference</span><strong>{aiDelta === null ? '—' : `${aiDelta > 0 ? '-' : aiDelta < 0 ? '+' : ''}${Math.abs(aiDelta)}%`}</strong><small>{aiDelta === null ? 'Add both values to compare' : aiDelta === 0 ? 'AI matches the team' : aiDelta > 0 ? 'AI is lower than the team' : 'AI is higher than the team'}</small></div></div></section> : null}
  </>;
}
