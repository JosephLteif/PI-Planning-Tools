import { createPortal } from 'react-dom';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { sprintCapacity } from '../capacityUtils';
import type { RoomState, Story } from '../types';
import { cloneState } from '../state';
import { isStretchStory } from '../storyUtils';
import { AppIcon } from './AppIcon';
import { EpicResourceSearch, matchesEpicSearch, type EpicSearchOption } from './EpicResourceSearch';
import { StoryEditorModal } from './StoryEditorModal';

type ResourcesPageProps = { state: RoomState; saving: boolean; readOnly?: boolean; onSave: (state: RoomState) => Promise<void> };
type ResourceTab = 'service' | 'domain' | 'epic';
type ResourceView = ResourceTab | 'catalog';
type EstimateSource = 'team' | 'ai';
type EstimateView = EstimateSource | 'gain';
type EpicResourceRow = {
  id: string;
  name: string;
  points: number;
  teamPoints: number;
  aiPoints: number;
  comparisonTeamPoints: number;
  comparisonAiPoints: number;
  stories: RoomState['stories'];
};
type AllocationComparisonRow = {
  id: string;
  name: string;
  teamPoints: number;
  aiPoints: number;
};
type ReportBreakdownRow = Omit<AllocationComparisonRow, 'aiPoints'> & {
  aiPoints: number | null;
  comparisonTeamPoints: number;
  comparisonAiPoints: number;
};
type AccountCapacityRow = {
  id: string;
  name: string;
  office: string;
  featureCapacity: number;
  totalCapacity: number;
  sprintCount: number;
};

function effectiveServiceLinks(state: RoomState, story: RoomState['stories'][number]) {
  if (story.type !== 'Epic' && story.epicId) {
    return state.stories.find((candidate) => candidate.id === story.epicId && candidate.type === 'Epic')?.serviceLinks || [];
  }
  return story.serviceLinks;
}

function estimateValue(story: RoomState['stories'][number], source: EstimateSource) {
  return source === 'ai' ? story.ai : story.manual;
}

function allocationRows(state: RoomState, tab: ResourceTab, source: EstimateSource, stories = state.stories) {
  const savedStories = stories.filter((story) => story.type !== 'Epic' && estimateValue(story, source) !== null);
  const serviceNames = new Map(state.services.map((service) => [service.id, service.name]));
  const domainNames = new Map(state.domains.map((domain) => [domain.id, domain.name]));
  const totals = new Map<string, number>();
  savedStories.forEach((story) => {
    const links = effectiveServiceLinks(state, story);
    const totalAllocation = links.reduce((sum, link) => sum + link.allocation, 0);
    const denominator = totalAllocation > 100 ? totalAllocation : 100;
    links.forEach((link) => {
      const service = state.services.find((candidate) => candidate.id === link.serviceId);
      const key = tab === 'service'
        ? serviceNames.has(link.serviceId) ? link.serviceId : 'unassigned'
        : tab === 'domain'
          ? service?.domainId && domainNames.has(service.domainId) ? service.domainId : 'unassigned'
          : story.epicId || 'unassigned';
      totals.set(key, (totals.get(key) || 0) + (estimateValue(story, source) || 0) * (link.allocation / denominator));
    });
    if (totalAllocation < 100 || !links.length) {
      const key = tab === 'epic' ? story.epicId || 'unassigned' : 'unassigned';
      totals.set(key, (totals.get(key) || 0) + (estimateValue(story, source) || 0) * ((100 - totalAllocation) / 100 || 1));
    }
  });
  const labels = tab === 'service' ? serviceNames : tab === 'domain' ? domainNames : new Map(state.stories.filter((story) => story.type === 'Epic').map((story) => [story.id, story.title]));
  return [...totals.entries()].map(([key, points]) => ({ id: key, name: labels.get(key) || 'Unassigned', points })).sort((left, right) => right.points - left.points);
}

function comparisonStories(state: RoomState, stories = state.stories) {
  return stories.filter((story) => story.type !== 'Epic' && story.manual !== null && story.ai !== null);
}

function comparisonAllocationRows(state: RoomState, tab: ResourceTab, stories = state.stories): AllocationComparisonRow[] {
  const pairedStories = comparisonStories(state, stories);
  const teamRows = new Map(allocationRows(state, tab, 'team', pairedStories).map((row) => [row.id, row]));
  const aiRows = new Map(allocationRows(state, tab, 'ai', pairedStories).map((row) => [row.id, row]));
  const keys = new Set([...teamRows.keys(), ...aiRows.keys()]);
  return [...keys]
    .map((id) => ({
      id,
      name: teamRows.get(id)?.name || aiRows.get(id)?.name || 'Unassigned',
      teamPoints: teamRows.get(id)?.points || 0,
      aiPoints: aiRows.get(id)?.points || 0,
    }))
    .sort((left, right) => right.teamPoints - left.teamPoints || left.name.localeCompare(right.name));
}

function gainPercent(teamPoints: number, aiPoints: number) {
  if (teamPoints <= 0) return null;
  return ((teamPoints - aiPoints) / teamPoints) * 100;
}

function formatGain(teamPoints: number, aiPoints: number) {
  const gain = gainPercent(teamPoints, aiPoints);
  return gain === null ? '—' : `${Math.round(gain)}%`;
}

function gainTone(teamPoints: number, aiPoints: number) {
  const gain = gainPercent(teamPoints, aiPoints);
  return gain === null ? 'empty' : gain > 0.05 ? 'positive' : gain < -0.05 ? 'negative' : 'neutral';
}

function gainDescription(teamPoints: number, aiPoints: number, pairedCount: number) {
  if (!pairedCount) return 'Add both team and AI estimates to compare';
  const gain = gainPercent(teamPoints, aiPoints);
  if (gain === null) return 'Team estimate is zero; percentage unavailable';
  if (Math.abs(gain) <= 0.05) return 'AI matches the team estimate';
  return gain > 0 ? `AI is ${Math.round(gain)}% lower than team` : `AI is ${Math.round(Math.abs(gain))}% higher than team`;
}

function reportBreakdownRows(state: RoomState, tab: ResourceTab, aiEnabled: boolean, stories = state.stories): ReportBreakdownRow[] {
  const teamRows = new Map(allocationRows(state, tab, 'team', stories).map((row) => [row.id, row]));
  const aiRows = aiEnabled ? new Map(allocationRows(state, tab, 'ai', stories).map((row) => [row.id, row])) : new Map();
  const comparisonRows = aiEnabled ? new Map(comparisonAllocationRows(state, tab, stories).map((row) => [row.id, row])) : new Map();
  const keys = new Set([...teamRows.keys(), ...aiRows.keys()]);
  return [...keys]
    .map((id) => ({
      id,
      name: teamRows.get(id)?.name || aiRows.get(id)?.name || 'Unassigned',
      teamPoints: teamRows.get(id)?.points || 0,
      aiPoints: aiRows.has(id) ? aiRows.get(id)?.points || 0 : null,
      comparisonTeamPoints: comparisonRows.get(id)?.teamPoints || 0,
      comparisonAiPoints: comparisonRows.get(id)?.aiPoints || 0,
    }))
    .sort((left, right) => right.teamPoints - left.teamPoints || (right.aiPoints || 0) - (left.aiPoints || 0) || left.name.localeCompare(right.name));
}

function accountCapacityRows(state: RoomState): AccountCapacityRow[] {
  const sprints = state.capacity.sprints.filter((sprint) => !sprint.excludeFromTotal);
  return state.capacity.members
    .map((member) => {
      const totals = sprints.reduce((sum, sprint) => {
        const details = sprintCapacity(member, sprint, state.capacity.defaults);
        return { feature: sum.feature + details.feature, total: sum.total + details.total };
      }, { feature: 0, total: 0 });
      return {
        id: member.id,
        name: member.name || 'Unnamed account',
        office: member.office === 'beirut' ? 'Beirut' : 'Cyprus',
        featureCapacity: totals.feature,
        totalCapacity: totals.total,
        sprintCount: sprints.length,
      };
    })
    .sort((left, right) => right.featureCapacity - left.featureCapacity || left.name.localeCompare(right.name));
}

function storiesForResourceScope(state: RoomState, includeStretch: boolean) {
  if (includeStretch) return state.stories;
  return state.stories.filter((story) => story.type === 'Epic' ? !story.stretch : !isStretchStory(story, state.stories));
}

function epicResourceRows(state: RoomState, view: EstimateView, stories = state.stories): EpicResourceRow[] {
  const source: EstimateSource = view === 'ai' ? 'ai' : 'team';
  const teamAllocations = new Map(allocationRows(state, 'epic', 'team', stories).map((row) => [row.id, row]));
  const aiAllocations = new Map(allocationRows(state, 'epic', 'ai', stories).map((row) => [row.id, row]));
  const comparisonRows = comparisonAllocationRows(state, 'epic', stories);
  const comparisonTeamAllocations = new Map(comparisonRows.map((row) => [row.id, row.teamPoints]));
  const comparisonAiAllocations = new Map(comparisonRows.map((row) => [row.id, row.aiPoints]));
  const comparisonAllocations = new Map(comparisonRows.map((row) => [row.id, { id: row.id, name: row.name, points: row.teamPoints }]));
  const allocationById = view === 'gain' ? comparisonAllocations : source === 'team' ? teamAllocations : aiAllocations;
  const childrenByEpic = new Map<string, RoomState['stories']>();
  stories.filter((story) => story.type !== 'Epic').forEach((story) => {
    const key = story.epicId || 'unassigned';
    const stories = childrenByEpic.get(key) || [];
    stories.push(story);
    childrenByEpic.set(key, stories);
  });

  const epicNames = new Map(state.stories.filter((story) => story.type === 'Epic').map((story) => [story.id, story.title]));
  const epicIds = stories.filter((story) => story.type === 'Epic').map((story) => story.id);
  const keys = new Set([...epicIds, ...teamAllocations.keys(), ...aiAllocations.keys(), ...childrenByEpic.keys()]);
  return [...keys]
    .map((id) => ({
      id,
      name: epicNames.get(id) || allocationById.get(id)?.name || 'Unassigned',
      points: allocationById.get(id)?.points || 0,
      teamPoints: teamAllocations.get(id)?.points || 0,
      aiPoints: aiAllocations.get(id)?.points || 0,
      comparisonTeamPoints: comparisonTeamAllocations.get(id) || 0,
      comparisonAiPoints: comparisonAiAllocations.get(id) || 0,
      stories: childrenByEpic.get(id) || [],
    }))
    .filter((row) => row.id !== 'unassigned' || row.stories.length > 0 || row.points > 0)
    .sort((left, right) => right.points - left.points || left.name.localeCompare(right.name));
}

function formatEstimate(value: number | null) {
  if (value === null) return '—';
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function entityId(prefix: string, ids: string[]) {
  let id = `${prefix}-${Date.now().toString(36)}`;
  let suffix = 1;
  while (ids.includes(id)) id = `${prefix}-${Date.now().toString(36)}-${suffix++}`;
  return id;
}

function ResourceReportChart({ rows, aiEnabled }: { rows: ReportBreakdownRow[]; aiEnabled: boolean }) {
  const chartRows = rows.filter((row) => row.teamPoints > 0 || (row.aiPoints || 0) > 0).slice(0, 8);
  const maxPoints = Math.max(1, ...chartRows.flatMap((row) => [row.teamPoints, row.aiPoints || 0]));
  const hasAiData = chartRows.some((row) => row.aiPoints !== null);

  if (!chartRows.length) return null;

  return (
    <div className="resource-report-chart">
      <div className="resource-report-chart-heading">
        <span className="section-kicker">Top allocation</span>
        <div className="resource-report-chart-legend">
          <span><i className="resource-report-chart-dot team" />Team</span>
          {aiEnabled && hasAiData ? <span><i className="resource-report-chart-dot ai" />AI</span> : null}
        </div>
      </div>
      <div className="resource-report-chart-list">
        {chartRows.map((row) => (
          <div className="resource-report-chart-row" key={row.id}>
            <span className="resource-report-chart-label" title={row.name}>{row.name}</span>
            <div className="resource-report-chart-bars">
              <span className="resource-report-chart-bar team" style={{ width: `${(row.teamPoints / maxPoints) * 100}%` }} />
              {aiEnabled && row.aiPoints !== null ? <span className="resource-report-chart-bar ai" style={{ width: `${(row.aiPoints / maxPoints) * 100}%` }} /> : null}
            </div>
            <span className="resource-report-chart-values">{formatEstimate(row.teamPoints)}{aiEnabled && row.aiPoints !== null ? ` / ${formatEstimate(row.aiPoints)}` : ''}</span>
          </div>
        ))}
      </div>
      {rows.length > chartRows.length ? <p className="resource-report-chart-note">Chart shows the top {chartRows.length} groups; the table includes every group.</p> : null}
    </div>
  );
}

function ResourceReportBreakdown({ title, description, rows, aiEnabled }: { title: string; description: string; rows: ReportBreakdownRow[]; aiEnabled: boolean }) {
  const teamTotal = rows.reduce((sum, row) => sum + row.teamPoints, 0);
  const hasAiData = rows.some((row) => row.aiPoints !== null);

  return (
    <section className="resource-report-section">
      <div className="resource-report-section-heading">
        <div>
          <span className="section-kicker">Breakdown</span>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <span className="resource-report-section-total">{formatEstimate(teamTotal)} team pts</span>
      </div>
      {rows.length ? <>
        <div className="resource-report-table-wrap">
          <table className="resource-report-table">
            <thead>
              <tr>
                <th scope="col">Group</th>
                <th scope="col">Team estimate</th>
                {aiEnabled ? <th scope="col">AI estimate</th> : null}
                {aiEnabled ? <th scope="col">AI gain</th> : null}
                <th scope="col">Share</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <th scope="row">{row.name}</th>
                  <td>{formatEstimate(row.teamPoints)}</td>
                  {aiEnabled ? <td>{formatEstimate(row.aiPoints)}</td> : null}
                  {aiEnabled ? <td className={`resource-report-gain ${gainTone(row.comparisonTeamPoints, row.comparisonAiPoints)}`}>{hasAiData ? formatGain(row.comparisonTeamPoints, row.comparisonAiPoints) : '—'}</td> : null}
                  <td>{teamTotal ? `${Math.round((row.teamPoints / teamTotal) * 100)}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ResourceReportChart rows={rows} aiEnabled={aiEnabled} />
      </> : <div className="resource-report-empty">No saved estimates are available for this breakdown.</div>}
    </section>
  );
}

function ResourceReport({ state, aiEnabled, includeStretch }: { state: RoomState; aiEnabled: boolean; includeStretch: boolean }) {
  const reportStories = storiesForResourceScope(state, includeStretch);
  const teamStories = reportStories.filter((story) => story.type !== 'Epic' && story.manual !== null);
  const aiStories = reportStories.filter((story) => story.type !== 'Epic' && story.ai !== null);
  const pairedStories = aiEnabled ? comparisonStories(state, reportStories) : [];
  const teamTotal = teamStories.reduce((sum, story) => sum + (story.manual || 0), 0);
  const aiTotal = aiStories.reduce((sum, story) => sum + (story.ai || 0), 0);
  const pairedTotals = pairedStories.reduce((totals, story) => ({
    team: totals.team + (story.manual || 0),
    ai: totals.ai + (story.ai || 0),
  }), { team: 0, ai: 0 });
  const accountRows = accountCapacityRows(state);
  const generatedAt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date());

  return (
    <div className="resource-report" role="document">
      <header className="resource-report-header">
        <div>
          <span className="resource-report-brand">POINTLINE / RESOURCE INTELLIGENCE</span>
          <h1>Resource allocation report</h1>
          <p>Story estimates rolled up by service, domain, epic, and account capacity · {includeStretch ? 'including stretch work' : 'committed work only'}.</p>
        </div>
        <div className="resource-report-meta">
          <strong>{aiEnabled ? 'Team + AI comparison' : 'Team estimates only'}</strong>
          <span>Generated {generatedAt}</span>
        </div>
      </header>

      <div className={`resource-report-summary${aiEnabled ? '' : ' team-only'}`}>
        <div><span>Team points</span><strong>{formatEstimate(teamTotal)}</strong><small>{teamStories.length} stories with estimates</small></div>
        {aiEnabled ? <div><span>AI points</span><strong>{formatEstimate(aiTotal)}</strong><small>{aiStories.length} stories with AI estimates</small></div> : null}
        {aiEnabled ? <div><span>AI gain</span><strong className={gainTone(pairedTotals.team, pairedTotals.ai)}>{formatGain(pairedTotals.team, pairedTotals.ai)}</strong><small>{pairedStories.length} stories compared</small></div> : null}
        <div><span>Groups</span><strong>{state.services.length + state.domains.length + reportStories.filter((story) => story.type === 'Epic').length}</strong><small>configured services, domains, and epics</small></div>
      </div>

      {!aiEnabled ? <div className="resource-report-callout"><strong>AI comparison is disabled for this room.</strong><span>The report intentionally uses team-only tables and charts, so there are no empty AI columns or misleading comparison visuals.</span></div> : null}

      <ResourceReportBreakdown title="By service" description="Weighted story points assigned to each service." rows={reportBreakdownRows(state, 'service', aiEnabled, reportStories)} aiEnabled={aiEnabled} />
      <ResourceReportBreakdown title="By domain" description="Service allocations rolled up to their owning domain." rows={reportBreakdownRows(state, 'domain', aiEnabled, reportStories)} aiEnabled={aiEnabled} />
      <ResourceReportBreakdown title="By epic" description="Story points grouped under each epic, including unassigned work." rows={reportBreakdownRows(state, 'epic', aiEnabled, reportStories)} aiEnabled={aiEnabled} />

      <section className="resource-report-section resource-report-account-section">
        <div className="resource-report-section-heading">
          <div>
            <span className="section-kicker">Capacity context</span>
            <h2>By account</h2>
            <p>Configured capacity by account across included sprints.</p>
          </div>
          <span className="resource-report-section-total">{accountRows.length} accounts</span>
        </div>
        {accountRows.length ? <div className="resource-report-table-wrap">
          <table className="resource-report-table">
            <thead>
              <tr><th scope="col">Account</th><th scope="col">Office</th><th scope="col">Feature capacity</th><th scope="col">Total capacity</th><th scope="col">Sprints</th></tr>
            </thead>
            <tbody>{accountRows.map((row) => <tr key={row.id}><th scope="row">{row.name}</th><td>{row.office}</td><td>{formatEstimate(row.featureCapacity)}</td><td>{formatEstimate(row.totalCapacity)}</td><td>{row.sprintCount}</td></tr>)}</tbody>
          </table>
        </div> : <div className="resource-report-empty">No account capacity is configured yet.</div>}
        <p className="resource-report-footnote">Story ownership is not assigned to accounts in the current planning model, so story points are not distributed across people. This section reports capacity context only.</p>
      </section>

      <footer className="resource-report-footer">Pointline resource report · Choose “Save as PDF” in the print dialog to export this report.</footer>
    </div>
  );
}

export function ResourcesPage({ state, saving, readOnly = false, onSave }: ResourcesPageProps) {
  const [tab, setTab] = useState<ResourceView>('service');
  const [estimateView, setEstimateView] = useState<EstimateView>('team');
  const [expandedEpics, setExpandedEpics] = useState<Record<string, boolean>>({});
  const [epicSearch, setEpicSearch] = useState('');
  const [domainName, setDomainName] = useState('');
  const [serviceName, setServiceName] = useState('');
  const [serviceDomain, setServiceDomain] = useState('');
  const [editingEpic, setEditingEpic] = useState<Story | null>(null);
  const [printingReport, setPrintingReport] = useState(false);
  const [includeStretch, setIncludeStretch] = useState(false);
  const aiEnabled = state.roomSettings.aiEnabled;
  const visibleEstimateView: EstimateView = aiEnabled ? estimateView : 'team';
  const estimateSource: EstimateSource = visibleEstimateView === 'ai' ? 'ai' : 'team';
  const allocationTab: ResourceTab = tab === 'catalog' ? 'service' : tab;
  const scopedStories = useMemo(() => storiesForResourceScope(state, includeStretch), [includeStretch, state]);
  const rows = useMemo(() => allocationRows(state, allocationTab, estimateSource, scopedStories), [allocationTab, estimateSource, scopedStories, state]);
  const comparisonRows = useMemo(() => aiEnabled ? comparisonAllocationRows(state, allocationTab, scopedStories) : [], [aiEnabled, allocationTab, scopedStories, state]);
  const epicRows = useMemo(() => epicResourceRows(state, visibleEstimateView, scopedStories), [scopedStories, state, visibleEstimateView]);
  const epicSearchOptions = useMemo<EpicSearchOption[]>(() => epicRows.map((row) => {
    const epic = state.stories.find((story) => story.id === row.id && story.type === 'Epic');
    const links = epic ? epic.serviceLinks : row.stories.flatMap((story) => effectiveServiceLinks(state, story));
    const serviceIds = [...new Set(links.map((link) => link.serviceId))];
    const products = [...new Set(serviceIds.map((serviceId) => state.services.find((service) => service.id === serviceId)?.name).filter((name): name is string => Boolean(name)))];
    const domains = [...new Set(serviceIds.map((serviceId) => {
      const service = state.services.find((candidate) => candidate.id === serviceId);
      return service ? state.domains.find((domain) => domain.id === service.domainId)?.name : undefined;
    }).filter((name): name is string => Boolean(name)))];
    return { id: row.id, name: row.name, domains, products };
  }), [epicRows, state]);
  const filteredEpicRows = useMemo(() => {
    const options = new Map(epicSearchOptions.map((option) => [option.id, option]));
    return epicRows.filter((row) => {
      const option = options.get(row.id);
      return option ? matchesEpicSearch(option, epicSearch) : true;
    });
  }, [epicRows, epicSearch, epicSearchOptions]);
  const estimatedStories = scopedStories.filter((story) => story.type !== 'Epic' && estimateValue(story, estimateSource) !== null);
  const total = estimatedStories.reduce((sum, story) => sum + (estimateValue(story, estimateSource) || 0), 0);
  const pairedStories = useMemo(() => aiEnabled ? comparisonStories(state, scopedStories) : [], [aiEnabled, scopedStories, state]);
  const comparisonTotals = useMemo(() => pairedStories.reduce((totals, story) => ({
    team: totals.team + (story.manual || 0),
    ai: totals.ai + (story.ai || 0),
  }), { team: 0, ai: 0 }), [pairedStories]);
  const stretchTotals = useMemo(() => state.stories.reduce((totals, story) => {
    if (story.type === 'Epic' || !isStretchStory(story, state.stories)) return totals;
    if (story.manual !== null) {
      totals.team += story.manual;
      totals.teamCount += 1;
    }
    if (story.ai !== null) {
      totals.ai += story.ai;
      totals.aiCount += 1;
    }
    return totals;
  }, { team: 0, ai: 0, teamCount: 0, aiCount: 0 }), [state.stories]);
  const displayRows = useMemo(() => visibleEstimateView === 'gain'
    ? comparisonRows.map((row) => ({ ...row, points: row.teamPoints }))
    : rows.map((row) => ({ ...row, teamPoints: null, aiPoints: null })), [comparisonRows, rows, visibleEstimateView]);
  const displayTotal = visibleEstimateView === 'gain' ? comparisonTotals.team : total;

  useEffect(() => {
    if (!printingReport) return;
    const previousTitle = document.title;
    document.title = 'Pointline resource allocation report';
    document.body.classList.add('printing-resource-report');
    const finish = () => {
      document.body.classList.remove('printing-resource-report');
      document.title = previousTitle;
      setPrintingReport(false);
    };
    const timer = window.setTimeout(() => window.print(), 80);
    window.addEventListener('afterprint', finish, { once: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('afterprint', finish);
      document.body.classList.remove('printing-resource-report');
      document.title = previousTitle;
    };
  }, [printingReport]);

  async function addDomain(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly) return;
    const name = domainName.trim();
    if (!name || state.domains.some((domain) => domain.name.toLowerCase() === name.toLowerCase())) return;
    const next = cloneState(state);
    next.domains.push({ id: entityId('domain', next.domains.map((domain) => domain.id)), name });
    setDomainName('');
    await onSave(next);
  }

  async function addService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly) return;
    const name = serviceName.trim();
    if (!name || state.services.some((service) => service.name.toLowerCase() === name.toLowerCase())) return;
    const next = cloneState(state);
    next.services.push({ id: entityId('service', next.services.map((service) => service.id)), name, domainId: serviceDomain });
    setServiceName('');
    await onSave(next);
  }

  async function updateServiceDomain(serviceId: string, domainId: string) {
    if (readOnly) return;
    const next = cloneState(state);
    next.services = next.services.map((service) => service.id === serviceId ? { ...service, domainId } : service);
    await onSave(next);
  }

  async function removeDomain(domainId: string) {
    if (readOnly) return;
    const domain = state.domains.find((candidate) => candidate.id === domainId);
    if (!domain || !window.confirm(`Remove ${domain.name}? Its services will remain unassigned.`)) return;
    const next = cloneState(state);
    next.domains = next.domains.filter((candidate) => candidate.id !== domainId);
    next.services = next.services.map((service) => service.domainId === domainId ? { ...service, domainId: '' } : service);
    await onSave(next);
  }

  async function removeService(serviceId: string) {
    if (readOnly) return;
    const service = state.services.find((candidate) => candidate.id === serviceId);
    if (!service || !window.confirm(`Remove ${service.name}? Story allocations to it will be cleared.`)) return;
    const next = cloneState(state);
    next.services = next.services.filter((candidate) => candidate.id !== serviceId);
    next.stories = next.stories.map((story) => ({ ...story, serviceLinks: story.serviceLinks.filter((link) => link.serviceId !== serviceId) }));
    await onSave(next);
  }

  async function saveEpic(epic: Story) {
    if (readOnly) return;
    const next = cloneState(state);
    next.stories = next.stories.map((story) => story.id === epic.id ? epic : story);
    await onSave(next);
    setEditingEpic(null);
  }

  function toggleEpic(epicId: string) {
    setExpandedEpics((current) => ({ ...current, [epicId]: !current[epicId] }));
  }

  return (
    <>
      <div className="management-content">
      <div className="hero-row">
        <div>
          <p className="eyebrow">Workspace · resources</p>
          <h1>See where the work lands.</h1>
          <p className="hero-copy">Use saved story estimates to understand how the planned work rolls up across services, domains, and epics, or export a polished PDF report for planning reviews.</p>
        </div>
      </div>

      {tab !== 'catalog' ? <div className={`allocation-impact-summary allocation-impact-summary-top${aiEnabled ? '' : ' team-only'}`} aria-label={aiEnabled ? 'Overall AI gain' : 'Team estimate summary'}>
        {aiEnabled ? <div className={`allocation-impact-item allocation-impact-primary ${gainTone(comparisonTotals.team, comparisonTotals.ai)}`}>
          <span>Overall AI gain</span>
          <strong>{formatGain(comparisonTotals.team, comparisonTotals.ai)}</strong>
          <small>{gainDescription(comparisonTotals.team, comparisonTotals.ai, pairedStories.length)} · {includeStretch ? 'with' : 'without'} stretch</small>
        </div> : null}
        <div className="allocation-impact-item">
          <span>Team estimate</span>
          <strong>{formatEstimate(aiEnabled ? (pairedStories.length ? comparisonTotals.team : null) : total)}</strong>
          <small>{aiEnabled ? `paired story points · ${includeStretch ? 'with' : 'without'} stretch` : `${estimatedStories.length} saved story points · ${includeStretch ? 'with' : 'without'} stretch`}</small>
        </div>
        {aiEnabled ? <div className="allocation-impact-item">
          <span>AI estimate</span>
          <strong>{formatEstimate(pairedStories.length ? comparisonTotals.ai : null)}</strong>
          <small>same stories as team · {includeStretch ? 'with' : 'without'} stretch</small>
        </div> : null}
        <div className="allocation-impact-item allocation-impact-stretch">
          <span>Stretch SPs</span>
          <strong>{formatEstimate(stretchTotals.team)}</strong>
          <small>{stretchTotals.teamCount} stretch {stretchTotals.teamCount === 1 ? 'story' : 'stories'}</small>
        </div>
        {aiEnabled ? <div className="allocation-impact-item allocation-impact-stretch">
          <span>AI Stretch SPs</span>
          <strong>{formatEstimate(stretchTotals.ai)}</strong>
          <small>{stretchTotals.aiCount} stretch {stretchTotals.aiCount === 1 ? 'story' : 'stories'} with AI</small>
        </div> : null}
        {aiEnabled ? <div className="allocation-impact-item">
          <span>Compared</span>
          <strong>{pairedStories.length}</strong>
          <small>{pairedStories.length === 1 ? 'story with both estimates' : 'stories with both estimates'}</small>
        </div> : null}
      </div> : null}

      <section className="card allocation-card pl-allocation-card">
        <div className="lower-card-heading">
          <div>
            <h2>{tab === 'catalog' ? 'Resource catalog' : 'Resource allocation'}</h2>
            <p>{tab === 'catalog' ? 'Manage domains and services used by the planning room.' : visibleEstimateView === 'gain' ? `${formatEstimate(comparisonTotals.team)} team points → ${formatEstimate(comparisonTotals.ai)} AI points across ${pairedStories.length} paired stories · ${includeStretch ? 'including' : 'excluding'} stretch.` : `${formatEstimate(total)} ${estimateSource === 'team' ? 'saved team points' : 'AI points'} across ${estimatedStories.length} stories · ${includeStretch ? 'including' : 'excluding'} stretch.`}</p>
          </div>
          <div className="allocation-heading-controls">
            {tab !== 'catalog' ? <label className="allocation-scope-toggle"><input type="checkbox" checked={includeStretch} onChange={(event) => setIncludeStretch(event.target.checked)} /><span><strong>Include stretch</strong><small>{includeStretch ? 'Totals include stretch work' : 'Committed work only'}</small></span></label> : null}
            {tab !== 'catalog' ? <button className="outline-button resource-export-button" type="button" onClick={() => setPrintingReport(true)} disabled={printingReport} title="Open a print-ready report and save it as PDF"><AppIcon name="download" size={14} /> Export PDF</button> : null}
            {tab !== 'catalog' && aiEnabled ? <div className="allocation-estimate-toggle" role="group" aria-label="Estimate view">
              <span className="allocation-estimate-toggle-label">Show</span>
              {(['team', 'ai', 'gain'] as const).map((view) => (
                <button key={view} className={`allocation-estimate-option${visibleEstimateView === view ? ' active' : ''}`} type="button" aria-pressed={visibleEstimateView === view} onClick={() => setEstimateView(view)}>
                  {view === 'team' ? 'Team' : view === 'ai' ? 'AI' : 'AI gain'}
                </button>
              ))}
            </div> : null}
            <div className="allocation-tabs" role="tablist" aria-label="Resource breakdown">
              {(['service', 'domain', 'epic', 'catalog'] as const).map((item) => (
                <button key={item} className={`allocation-tab${tab === item ? ' active' : ''}`} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)}>
                  {item === 'service' ? 'By service' : item === 'domain' ? 'By domain' : item === 'epic' ? 'By epic' : 'Catalog'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {tab !== 'catalog' ? <>
        <div className="allocation-breakdown">
          {tab === 'epic' ? (
            <div className="epic-resource-list">
              <div className="epic-resource-toolbar">
                <div>
                  <span className="section-kicker">Epic allocation</span>
                  <p>Search by epic name, domain, or product.</p>
                </div>
                <EpicResourceSearch options={epicSearchOptions} value={epicSearch} onChange={setEpicSearch} />
              </div>
              {filteredEpicRows.length ? filteredEpicRows.map((row) => {
                const expanded = expandedEpics[row.id] === true;
                const epic = state.stories.find((story) => story.id === row.id && story.type === 'Epic');
                const teamStories = row.stories.filter((story) => story.manual !== null);
                const aiStories = row.stories.filter((story) => story.ai !== null);
                const pairedEpicStories = row.stories.filter((story) => story.manual !== null && story.ai !== null);
                const selectedStories = visibleEstimateView === 'team' ? teamStories : visibleEstimateView === 'ai' ? aiStories : pairedEpicStories;
                const selectedLabel = visibleEstimateView === 'team' ? 'team' : visibleEstimateView === 'ai' ? 'AI' : 'paired';
                const displayedTeamPoints = visibleEstimateView === 'gain' ? row.comparisonTeamPoints : row.teamPoints;
                const displayedAiPoints = visibleEstimateView === 'gain' ? row.comparisonAiPoints : row.aiPoints;
                const progress = row.stories.length ? (selectedStories.length / row.stories.length) * 100 : 0;
                return (
                  <article className={`epic-resource-card${expanded ? ' expanded' : ''}`} key={row.id}>
                    <div className="epic-resource-heading">
                      <div className="epic-resource-title">
                        <button className="epic-resource-toggle" type="button" aria-expanded={expanded} onClick={() => toggleEpic(row.id)}>
                          <span className="epic-resource-chevron" aria-hidden="true"><AppIcon name={expanded ? 'chevronDown' : 'chevronRight'} size={14} /></span>
                          <span>
                            <span className="epic-resource-eyebrow"><span className="section-kicker">Epic</span>{epic?.stretch ? <span className="stretch-tag">Stretch</span> : null}</span>
                            <h3>{row.name}</h3>
                            <p>{row.stories.length} {row.stories.length === 1 ? 'individual story' : 'individual stories'} · click to {expanded ? 'collapse' : 'expand'}</p>
                          </span>
                        </button>
                      </div>
                      <div className="epic-resource-actions">
                        {epic && !readOnly ? <button className="story-action-button" type="button" disabled={saving} onClick={() => setEditingEpic(epic)} aria-label={`Edit ${epic.title}`}><AppIcon name="pencil" size={13} /></button> : null}
                        <span className="epic-resource-progress">{selectedStories.length}/{row.stories.length} {selectedLabel} estimates</span>
                      </div>
                    </div>

                    <div className={`epic-resource-metrics${aiEnabled ? '' : ' team-only'}`}>
                      <div className={visibleEstimateView === 'team' || visibleEstimateView === 'gain' ? 'selected' : ''}><span>Team estimate</span><strong>{formatEstimate(displayedTeamPoints)}</strong><small>{visibleEstimateView === 'gain' ? 'paired allocation · pts' : 'saved allocation · pts'}</small></div>
                      {aiEnabled ? <div className={visibleEstimateView === 'ai' || visibleEstimateView === 'gain' ? 'selected' : ''}><span>AI estimate</span><strong>{formatEstimate(displayedAiPoints)}</strong><small>{visibleEstimateView === 'gain' ? `${pairedEpicStories.length} paired ${pairedEpicStories.length === 1 ? 'story' : 'stories'}` : aiStories.length ? `${aiStories.length} ${aiStories.length === 1 ? 'story' : 'stories'} with AI` : 'No AI estimates yet'}</small></div> : null}
                      {aiEnabled ? <div className={`ai-gain-metric ${gainTone(row.comparisonTeamPoints, row.comparisonAiPoints)}`}><span>AI gain</span><strong>{formatGain(row.comparisonTeamPoints, row.comparisonAiPoints)}</strong><small>{gainDescription(row.comparisonTeamPoints, row.comparisonAiPoints, pairedEpicStories.length)}</small></div> : null}
                      <div><span>Stories</span><strong>{selectedStories.length}</strong><small>{visibleEstimateView === 'gain' ? 'with both estimates' : `${row.stories.length} linked to epic`}</small></div>
                    </div>

                    <div className="epic-resource-progress-bar" aria-label={`${selectedStories.length} of ${row.stories.length} stories have ${selectedLabel} estimates`}>
                      <span style={{ width: `${progress}%` }} />
                    </div>

                    {expanded ? (
                      <div className="epic-resource-details epic-resource-story-details">
                        <div>
                          <strong>Individual story estimates</strong>
                          <div className="epic-resource-story-list">
                            {row.stories.length ? row.stories.map((story) => (
                              <div className="epic-resource-story" key={story.id}>
                                <div>
                                  <strong>{story.title}</strong>
                                  <span>{story.id}{story.saved ? ' · Saved' : ' · Not saved'}</span>
                                </div>
                                <div className="epic-story-estimates">
                                  <span className={`epic-story-estimate${visibleEstimateView === 'team' || visibleEstimateView === 'gain' ? ' selected' : ''}`}><small>Team</small><strong>{formatEstimate(story.manual)}</strong></span>
                                  {aiEnabled ? <span className={`epic-story-estimate${visibleEstimateView === 'ai' || visibleEstimateView === 'gain' ? ' selected' : ''}`}><small>AI</small><strong>{formatEstimate(story.ai)}</strong></span> : null}
                                </div>
                              </div>
                            )) : <p className="empty-manager">No stories are linked to this epic yet.</p>}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              }) : <div className="empty-state"><h2>{epicSearch.trim() ? 'No matching epics' : 'No epic allocation data yet'}</h2><p>{epicSearch.trim() ? 'Try another name, domain, or product.' : `Link stories to an epic and add a ${visibleEstimateView === 'team' ? 'team' : visibleEstimateView === 'ai' ? 'AI' : 'team and AI'} estimate to see the breakdown here.`}</p></div>}
            </div>
          ) : (
            <div className="breakdown-list">
              {displayRows.length ? displayRows.map((row) => visibleEstimateView === 'gain' ? (
                <div className={`breakdown-row ai-gain-row ${gainTone(row.teamPoints || 0, row.aiPoints || 0)}`} key={row.id}>
                  <div className="breakdown-row-top"><strong>{row.name}</strong><span className={`ai-gain-chip ${gainTone(row.teamPoints || 0, row.aiPoints || 0)}`}>{formatGain(row.teamPoints || 0, row.aiPoints || 0)}</span></div>
                  <div className="breakdown-comparison-points"><span>Team {formatEstimate(row.teamPoints)}</span><span>AI {formatEstimate(row.aiPoints)}</span></div>
                  <div className="breakdown-bar"><span style={{ width: `${displayTotal ? (row.points / displayTotal) * 100 : 0}%` }} /></div>
                  <div className="breakdown-row-foot">{gainDescription(row.teamPoints || 0, row.aiPoints || 0, pairedStories.length)} · {displayTotal ? Math.round((row.points / displayTotal) * 100) : 0}% of team points</div>
                </div>
              ) : (
                <div className="breakdown-row" key={row.id}>
                  <div className="breakdown-row-top"><strong>{row.name}</strong><span>{row.points.toFixed(1)} pts</span></div>
                  <div className="breakdown-bar"><span style={{ width: `${displayTotal ? (row.points / displayTotal) * 100 : 0}%` }} /></div>
                  <div className="breakdown-row-foot">{displayTotal ? Math.round((row.points / displayTotal) * 100) : 0}% of saved points</div>
                </div>
              )) : <div className="empty-state"><h2>{visibleEstimateView === 'gain' ? 'No AI comparison data yet' : 'No allocation data yet'}</h2><p>{visibleEstimateView === 'gain' ? 'Add both a team and AI estimate to a story to see its gain here.' : 'Save a story estimate to see its resource roll-up here.'}</p></div>}
            </div>
          )}
        </div>
        <p className="allocation-note">{aiEnabled ? 'Use Team / AI / AI gain to switch every allocation tab. AI gain compares only stories with both estimates and uses the same service allocation weighting. Expanded epics always show both estimates for each individual story.' : 'Resource allocation currently shows saved team story points. Turn on the optional room comparison to add a second estimate view.'}</p>
        </> : null}
      </section>

      {tab === 'catalog' ? <section className="card service-manager-card">
        <div className="lower-card-heading">
          <div>
            <p className="section-kicker">Resource catalog</p>
            <h2>Manage domains and services</h2>
            <p>Keep ownership close to the stories. Removing a service clears its story allocations.</p>
            {readOnly ? <p className="modal-hint">Observers can view resources but cannot change the catalog.</p> : null}
          </div>
          <span className="story-progress">{state.services.length} services</span>
        </div>
        <div className="service-manager-grid">
          <div className="service-manager-column">
            <div className="manager-heading"><div><strong>Domains</strong><span>{state.domains.length} configured</span></div></div>
            <form className="manager-form" onSubmit={(event) => void addDomain(event)}><input className="modal-input" value={domainName} onChange={(event) => setDomainName(event.target.value)} maxLength={80} placeholder="Platform" aria-label="Domain name" required disabled={readOnly} /><button className="primary-button" type="submit" disabled={saving || readOnly}>Add</button></form>
            <div className="manager-list">{state.domains.length ? state.domains.map((domain) => <div className="manager-row" key={domain.id}><span className="manager-dot" /><span><strong>{domain.name}</strong></span><button className="icon-button compact-icon" type="button" disabled={readOnly} onClick={() => void removeDomain(domain.id)} aria-label={`Remove ${domain.name}`}><AppIcon name="x" size={14} /></button></div>) : <p className="empty-manager">No domains yet.</p>}</div>
          </div>
          <div className="service-manager-column">
            <div className="manager-heading"><div><strong>Services</strong><span>{state.services.length} configured</span></div></div>
            <form className="manager-form manager-service-form" onSubmit={(event) => void addService(event)}><input className="modal-input" value={serviceName} onChange={(event) => setServiceName(event.target.value)} maxLength={80} placeholder="Core API" aria-label="Service name" required disabled={readOnly} /><select className="modal-input" value={serviceDomain} onChange={(event) => setServiceDomain(event.target.value)} aria-label="Service domain" disabled={readOnly}><option value="">No domain yet</option>{state.domains.map((domain) => <option value={domain.id} key={domain.id}>{domain.name}</option>)}</select><button className="primary-button" type="submit" disabled={saving || readOnly}>Add</button></form>
            <div className="manager-list">{state.services.length ? state.services.map((service) => <div className="manager-row manager-service-row" key={service.id}><span><strong>{service.name}</strong><small>{state.domains.find((domain) => domain.id === service.domainId)?.name || 'No domain'}</small></span><select className="manager-domain-select" value={service.domainId} onChange={(event) => void updateServiceDomain(service.id, event.target.value)} aria-label={`Domain for ${service.name}`} disabled={readOnly}><option value="">No domain yet</option>{state.domains.map((domain) => <option value={domain.id} key={domain.id}>{domain.name}</option>)}</select><button className="icon-button compact-icon" type="button" disabled={readOnly} onClick={() => void removeService(service.id)} aria-label={`Remove ${service.name}`}><AppIcon name="x" size={14} /></button></div>) : <p className="empty-manager">No services yet.</p>}</div>
          </div>
        </div>
        </section> : null}
      </div>
      {editingEpic ? <StoryEditorModal key={editingEpic.id} state={state} story={editingEpic} saving={saving} onClose={() => setEditingEpic(null)} onSave={saveEpic} /> : null}
      {printingReport ? createPortal(<ResourceReport state={state} aiEnabled={aiEnabled} includeStretch={includeStretch} />, document.body) : null}
    </>
  );
}

