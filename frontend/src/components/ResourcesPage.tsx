import { useMemo, useState, type FormEvent } from 'react';
import type { RoomState } from '../types';
import { cloneState } from '../state';

type ResourcesPageProps = { state: RoomState; saving: boolean; readOnly?: boolean; onSave: (state: RoomState) => Promise<void> };
type ResourceTab = 'service' | 'domain' | 'epic';
type EstimateSource = 'team' | 'ai';
type EpicResourceRow = {
  id: string;
  name: string;
  points: number;
  teamPoints: number;
  aiPoints: number;
  stories: RoomState['stories'];
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

function allocationRows(state: RoomState, tab: ResourceTab, source: EstimateSource) {
  const savedStories = state.stories.filter((story) => story.type !== 'Epic' && estimateValue(story, source) !== null);
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

function epicResourceRows(state: RoomState, source: EstimateSource): EpicResourceRow[] {
  const teamAllocations = new Map(allocationRows(state, 'epic', 'team').map((row) => [row.id, row]));
  const aiAllocations = new Map(allocationRows(state, 'epic', 'ai').map((row) => [row.id, row]));
  const allocationById = source === 'team' ? teamAllocations : aiAllocations;
  const childrenByEpic = new Map<string, RoomState['stories']>();
  state.stories.filter((story) => story.type !== 'Epic').forEach((story) => {
    const key = story.epicId || 'unassigned';
    const stories = childrenByEpic.get(key) || [];
    stories.push(story);
    childrenByEpic.set(key, stories);
  });

  const epicNames = new Map(state.stories.filter((story) => story.type === 'Epic').map((story) => [story.id, story.title]));
  const keys = new Set([...teamAllocations.keys(), ...aiAllocations.keys(), ...childrenByEpic.keys()]);
  return [...keys]
    .map((id) => ({
      id,
      name: epicNames.get(id) || allocationById.get(id)?.name || 'Unassigned',
      points: allocationById.get(id)?.points || 0,
      teamPoints: teamAllocations.get(id)?.points || 0,
      aiPoints: aiAllocations.get(id)?.points || 0,
      stories: childrenByEpic.get(id) || [],
    }))
    .filter((row) => row.stories.length > 0 || row.points > 0)
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

export function ResourcesPage({ state, saving, readOnly = false, onSave }: ResourcesPageProps) {
  const [tab, setTab] = useState<ResourceTab>('service');
  const [estimateSource, setEstimateSource] = useState<EstimateSource>('team');
  const [expandedEpics, setExpandedEpics] = useState<Record<string, boolean>>({});
  const [domainName, setDomainName] = useState('');
  const [serviceName, setServiceName] = useState('');
  const [serviceDomain, setServiceDomain] = useState('');
  const rows = useMemo(() => allocationRows(state, tab, estimateSource), [state, tab, estimateSource]);
  const epicRows = useMemo(() => epicResourceRows(state, estimateSource), [state, estimateSource]);
  const estimatedStories = state.stories.filter((story) => story.type !== 'Epic' && estimateValue(story, estimateSource) !== null);
  const total = estimatedStories.reduce((sum, story) => sum + (estimateValue(story, estimateSource) || 0), 0);

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

  function toggleEpic(epicId: string) {
    setExpandedEpics((current) => ({ ...current, [epicId]: !current[epicId] }));
  }

  return (
    <div className="management-content">
      <div className="hero-row">
        <div>
          <p className="eyebrow">Workspace · resources</p>
          <h1>See where the work lands.</h1>
          <p className="hero-copy">Use saved story estimates to understand how the planned work rolls up across services, domains, and epics.</p>
        </div>
      </div>

      <section className="card allocation-card pl-allocation-card">
        <div className="lower-card-heading">
          <div>
            <h2>Resource allocation</h2>
            <p>{formatEstimate(total)} {estimateSource === 'team' ? 'saved team points' : 'AI points'} across {estimatedStories.length} stories.</p>
          </div>
          <div className="allocation-estimate-toggle" role="group" aria-label="Estimate source">
            <span className="allocation-estimate-toggle-label">Show</span>
            {(['team', 'ai'] as const).map((source) => (
              <button key={source} className={`allocation-estimate-option${estimateSource === source ? ' active' : ''}`} type="button" aria-pressed={estimateSource === source} onClick={() => setEstimateSource(source)}>
                {source === 'team' ? 'Team' : 'AI'}
              </button>
            ))}
          </div>
        </div>

        <div className="allocation-tabs" role="tablist" aria-label="Resource breakdown">
          {(['service', 'domain', 'epic'] as const).map((item) => (
            <button key={item} className={`allocation-tab${tab === item ? ' active' : ''}`} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)}>
              {item === 'service' ? 'By service' : item === 'domain' ? 'By domain' : 'By epic'}
            </button>
          ))}
        </div>

        <div className="allocation-breakdown">
          {tab === 'epic' ? (
            <div className="epic-resource-list">
              {epicRows.length ? epicRows.map((row) => {
                const expanded = expandedEpics[row.id] === true;
                const teamStories = row.stories.filter((story) => story.manual !== null);
                const aiStories = row.stories.filter((story) => story.ai !== null);
                const selectedStories = estimateSource === 'team' ? teamStories : aiStories;
                const progress = row.stories.length ? (selectedStories.length / row.stories.length) * 100 : 0;
                return (
                  <article className={`epic-resource-card${expanded ? ' expanded' : ''}`} key={row.id}>
                    <div className="epic-resource-heading">
                      <div className="epic-resource-title">
                        <button className="epic-resource-toggle" type="button" aria-expanded={expanded} onClick={() => toggleEpic(row.id)}>
                          <span className="epic-resource-chevron" aria-hidden="true">{expanded ? '⌄' : '›'}</span>
                          <span>
                            <span className="section-kicker">Epic</span>
                            <h3>{row.name}</h3>
                            <p>{row.stories.length} {row.stories.length === 1 ? 'individual story' : 'individual stories'} · click to {expanded ? 'collapse' : 'expand'}</p>
                          </span>
                        </button>
                      </div>
                      <div className="epic-resource-actions">
                        <span className="epic-resource-progress">{selectedStories.length}/{row.stories.length} {estimateSource === 'team' ? 'team' : 'AI'} estimates</span>
                      </div>
                    </div>

                    <div className="epic-resource-metrics">
                      <div className={estimateSource === 'team' ? 'selected' : ''}><span>Team estimate</span><strong>{formatEstimate(row.teamPoints)}</strong><small>saved allocation · pts</small></div>
                      <div className={estimateSource === 'ai' ? 'selected' : ''}><span>AI estimate</span><strong>{formatEstimate(row.aiPoints)}</strong><small>{aiStories.length ? `${aiStories.length} ${aiStories.length === 1 ? 'story' : 'stories'} with AI` : 'No AI estimates yet'}</small></div>
                      <div><span>Stories</span><strong>{row.stories.length}</strong><small>{teamStories.length} team-estimated</small></div>
                      <div><span>Comparison</span><strong>{expanded ? 'Open' : 'Closed'}</strong><small>individual estimates below</small></div>
                    </div>

                    <div className="epic-resource-progress-bar" aria-label={`${selectedStories.length} of ${row.stories.length} stories have ${estimateSource === 'team' ? 'team' : 'AI'} estimates`}>
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
                                  <span className={`epic-story-estimate${estimateSource === 'team' ? ' selected' : ''}`}><small>Team</small><strong>{formatEstimate(story.manual)}</strong></span>
                                  <span className={`epic-story-estimate${estimateSource === 'ai' ? ' selected' : ''}`}><small>AI</small><strong>{formatEstimate(story.ai)}</strong></span>
                                </div>
                              </div>
                            )) : <p className="empty-manager">No stories are linked to this epic yet.</p>}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              }) : <div className="empty-state"><h2>No epic allocation data yet</h2><p>Link stories to an epic and add a {estimateSource === 'team' ? 'team' : 'AI'} estimate to see the breakdown here.</p></div>}
            </div>
          ) : (
            <div className="breakdown-list">
              {rows.length ? rows.map((row) => (
                <div className="breakdown-row" key={row.id}>
                  <div className="breakdown-row-top"><strong>{row.name}</strong><span>{row.points.toFixed(1)} pts</span></div>
                  <div className="breakdown-bar"><span style={{ width: `${total ? (row.points / total) * 100 : 0}%` }} /></div>
                  <div className="breakdown-row-foot">{total ? Math.round((row.points / total) * 100) : 0}% of saved points</div>
                </div>
              )) : <div className="empty-state"><h2>No allocation data yet</h2><p>Save a story estimate to see its resource roll-up here.</p></div>}
            </div>
          )}
        </div>
        <p className="allocation-note">Use the Team / AI toggle to switch every allocation tab. Expanded epics always show both estimates for each individual story.</p>
      </section>

      <section className="card service-manager-card">
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
            <div className="manager-list">{state.domains.length ? state.domains.map((domain) => <div className="manager-row" key={domain.id}><span className="manager-dot" /><span><strong>{domain.name}</strong></span><button className="icon-button compact-icon" type="button" disabled={readOnly} onClick={() => void removeDomain(domain.id)} aria-label={`Remove ${domain.name}`}>×</button></div>) : <p className="empty-manager">No domains yet.</p>}</div>
          </div>
          <div className="service-manager-column">
            <div className="manager-heading"><div><strong>Services</strong><span>{state.services.length} configured</span></div></div>
            <form className="manager-form manager-service-form" onSubmit={(event) => void addService(event)}><input className="modal-input" value={serviceName} onChange={(event) => setServiceName(event.target.value)} maxLength={80} placeholder="Core API" aria-label="Service name" required disabled={readOnly} /><select className="modal-input" value={serviceDomain} onChange={(event) => setServiceDomain(event.target.value)} aria-label="Service domain" disabled={readOnly}><option value="">No domain yet</option>{state.domains.map((domain) => <option value={domain.id} key={domain.id}>{domain.name}</option>)}</select><button className="primary-button" type="submit" disabled={saving || readOnly}>Add</button></form>
            <div className="manager-list">{state.services.length ? state.services.map((service) => <div className="manager-row manager-service-row" key={service.id}><span><strong>{service.name}</strong><small>{state.domains.find((domain) => domain.id === service.domainId)?.name || 'No domain'}</small></span><select className="manager-domain-select" value={service.domainId} onChange={(event) => void updateServiceDomain(service.id, event.target.value)} aria-label={`Domain for ${service.name}`} disabled={readOnly}><option value="">No domain yet</option>{state.domains.map((domain) => <option value={domain.id} key={domain.id}>{domain.name}</option>)}</select><button className="icon-button compact-icon" type="button" disabled={readOnly} onClick={() => void removeService(service.id)} aria-label={`Remove ${service.name}`}>×</button></div>) : <p className="empty-manager">No services yet.</p>}</div>
          </div>
        </div>
      </section>
    </div>
  );
}
