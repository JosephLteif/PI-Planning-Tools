import { useMemo, useState, type FormEvent } from 'react';
import type { RoomState } from '../types';
import { cloneState } from '../state';

type ResourcesPageProps = { state: RoomState; saving: boolean; onSave: (state: RoomState) => Promise<void> };
type ResourceTab = 'service' | 'domain' | 'epic';

function effectiveServiceLinks(state: RoomState, story: RoomState['stories'][number]) {
  if (story.type !== 'Epic' && story.epicId) {
    return state.stories.find((candidate) => candidate.id === story.epicId && candidate.type === 'Epic')?.serviceLinks || [];
  }
  return story.serviceLinks;
}

function allocationRows(state: RoomState, tab: ResourceTab) {
  const savedStories = state.stories.filter((story) => story.type !== 'Epic' && story.manual !== null);
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
      totals.set(key, (totals.get(key) || 0) + (story.manual || 0) * (link.allocation / denominator));
    });
    if (totalAllocation < 100 || !links.length) {
      const key = tab === 'epic' ? story.epicId || 'unassigned' : 'unassigned';
      totals.set(key, (totals.get(key) || 0) + (story.manual || 0) * ((100 - totalAllocation) / 100 || 1));
    }
  });
  const labels = tab === 'service' ? serviceNames : tab === 'domain' ? domainNames : new Map(state.stories.filter((story) => story.type === 'Epic').map((story) => [story.id, story.title]));
  return [...totals.entries()].map(([key, points]) => ({ id: key, name: labels.get(key) || 'Unassigned', points })).sort((left, right) => right.points - left.points);
}

function entityId(prefix: string, ids: string[]) {
  let id = `${prefix}-${Date.now().toString(36)}`;
  let suffix = 1;
  while (ids.includes(id)) id = `${prefix}-${Date.now().toString(36)}-${suffix++}`;
  return id;
}

export function ResourcesPage({ state, saving, onSave }: ResourcesPageProps) {
  const [tab, setTab] = useState<ResourceTab>('service');
  const [domainName, setDomainName] = useState('');
  const [serviceName, setServiceName] = useState('');
  const [serviceDomain, setServiceDomain] = useState('');
  const rows = useMemo(() => allocationRows(state, tab), [state, tab]);
  const total = state.stories.filter((story) => story.type !== 'Epic' && story.manual !== null).reduce((sum, story) => sum + (story.manual || 0), 0);

  async function addDomain(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = domainName.trim();
    if (!name || state.domains.some((domain) => domain.name.toLowerCase() === name.toLowerCase())) return;
    const next = cloneState(state);
    next.domains.push({ id: entityId('domain', next.domains.map((domain) => domain.id)), name });
    setDomainName('');
    await onSave(next);
  }

  async function addService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = serviceName.trim();
    if (!name || state.services.some((service) => service.name.toLowerCase() === name.toLowerCase())) return;
    const next = cloneState(state);
    next.services.push({ id: entityId('service', next.services.map((service) => service.id)), name, domainId: serviceDomain });
    setServiceName('');
    await onSave(next);
  }

  async function updateServiceDomain(serviceId: string, domainId: string) {
    const next = cloneState(state);
    next.services = next.services.map((service) => service.id === serviceId ? { ...service, domainId } : service);
    await onSave(next);
  }

  async function removeDomain(domainId: string) {
    const domain = state.domains.find((candidate) => candidate.id === domainId);
    if (!domain || !window.confirm(`Remove ${domain.name}? Its services will remain unassigned.`)) return;
    const next = cloneState(state);
    next.domains = next.domains.filter((candidate) => candidate.id !== domainId);
    next.services = next.services.map((service) => service.domainId === domainId ? { ...service, domainId: '' } : service);
    await onSave(next);
  }

  async function removeService(serviceId: string) {
    const service = state.services.find((candidate) => candidate.id === serviceId);
    if (!service || !window.confirm(`Remove ${service.name}? Story allocations to it will be cleared.`)) return;
    const next = cloneState(state);
    next.services = next.services.filter((candidate) => candidate.id !== serviceId);
    next.stories = next.stories.map((story) => ({ ...story, serviceLinks: story.serviceLinks.filter((link) => link.serviceId !== serviceId) }));
    await onSave(next);
  }

  return <div className="management-content"><div className="hero-row"><div><p className="eyebrow">Workspace · resources</p><h1>See where the work lands.</h1><p className="hero-copy">Use saved story estimates to understand how the planned work rolls up across services, domains, and epics.</p></div></div><section className="card allocation-card pl-allocation-card"><div className="lower-card-heading"><div><h2>Resource allocation</h2><p>{total} saved points across {state.stories.filter((story) => story.manual !== null).length} stories.</p></div><span className="story-progress">Saved estimates</span></div><div className="allocation-tabs" role="tablist" aria-label="Resource breakdown">{(['service', 'domain', 'epic'] as const).map((item) => <button key={item} className={`allocation-tab${tab === item ? ' active' : ''}`} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)}>{item === 'service' ? 'By service' : item === 'domain' ? 'By domain' : 'By epic'}</button>)}</div><div className="allocation-breakdown"><div className="breakdown-list">{rows.length ? rows.map((row) => <div className="breakdown-row" key={row.id}><div className="breakdown-row-top"><strong>{row.name}</strong><span>{row.points.toFixed(1)} pts</span></div><div className="breakdown-bar"><span style={{ width: `${total ? (row.points / total) * 100 : 0}%` }} /></div><div className="breakdown-row-foot">{total ? Math.round((row.points / total) * 100) : 0}% of saved points</div></div>) : <div className="empty-state"><h2>No allocation data yet</h2><p>Save a story estimate to see its resource roll-up here.</p></div>}</div></div><p className="allocation-note">Only saved manual estimates count. Incomplete service links leave the remainder unassigned.</p></section><section className="card service-manager-card"><div className="lower-card-heading"><div><p className="section-kicker">Resource catalog</p><h2>Manage domains and services</h2><p>Keep ownership close to the stories. Removing a service clears its story allocations.</p></div><span className="story-progress">{state.services.length} services</span></div><div className="service-manager-grid"><div className="service-manager-column"><div className="manager-heading"><div><strong>Domains</strong><span>{state.domains.length} configured</span></div></div><form className="manager-form" onSubmit={(event) => void addDomain(event)}><input className="modal-input" value={domainName} onChange={(event) => setDomainName(event.target.value)} maxLength={80} placeholder="Customer experience" aria-label="Domain name" required /><button className="primary-button" type="submit" disabled={saving}>Add</button></form><div className="manager-list">{state.domains.length ? state.domains.map((domain) => <div className="manager-row" key={domain.id}><span className="manager-dot" /><span><strong>{domain.name}</strong></span><button className="icon-button compact-icon" type="button" onClick={() => void removeDomain(domain.id)} aria-label={`Remove ${domain.name}`}>×</button></div>) : <p className="empty-manager">No domains yet.</p>}</div></div><div className="service-manager-column"><div className="manager-heading"><div><strong>Services</strong><span>{state.services.length} configured</span></div></div><form className="manager-form manager-service-form" onSubmit={(event) => void addService(event)}><input className="modal-input" value={serviceName} onChange={(event) => setServiceName(event.target.value)} maxLength={80} placeholder="Checkout API" aria-label="Service name" required /><select className="modal-input" value={serviceDomain} onChange={(event) => setServiceDomain(event.target.value)} aria-label="Service domain"><option value="">No domain yet</option>{state.domains.map((domain) => <option value={domain.id} key={domain.id}>{domain.name}</option>)}</select><button className="primary-button" type="submit" disabled={saving}>Add</button></form><div className="manager-list">{state.services.length ? state.services.map((service) => <div className="manager-row manager-service-row" key={service.id}><span><strong>{service.name}</strong><small>{state.domains.find((domain) => domain.id === service.domainId)?.name || 'No domain'}</small></span><select className="manager-domain-select" value={service.domainId} onChange={(event) => void updateServiceDomain(service.id, event.target.value)} aria-label={`Domain for ${service.name}`}><option value="">No domain yet</option>{state.domains.map((domain) => <option value={domain.id} key={domain.id}>{domain.name}</option>)}</select><button className="icon-button compact-icon" type="button" onClick={() => void removeService(service.id)} aria-label={`Remove ${service.name}`}>×</button></div>) : <p className="empty-manager">No services yet.</p>}</div></div></div></section></div>;
}
