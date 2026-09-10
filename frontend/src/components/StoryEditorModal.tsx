import { useMemo, useState, type FormEvent } from 'react';
import { emptyStory } from '../storyUtils';
import type { RoomState, Story } from '../types';
import { EpicPicker } from './EpicPicker';
import { AppIcon } from './AppIcon';

type StoryEditorModalProps = {
  state: RoomState;
  story: Story | null;
  initialType?: string;
  saving: boolean;
  onClose: () => void;
  onSave: (story: Story) => Promise<void>;
};

type StoryDraft = Story & { manualText: string; aiText: string; acceptanceText: string };

function toDraft(story: Story | null, initialType: string): StoryDraft {
  const value = story || emptyStory({ type: initialType });
  return {
    ...value,
    manualText: value.manual === null ? '' : String(value.manual),
    aiText: value.ai === null ? '' : String(value.ai),
    acceptanceText: value.acceptance.join('\n'),
    serviceLinks: value.serviceLinks.map((link) => ({ ...link })),
  };
}

function parseEstimate(value: string): number | null | undefined {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export function StoryEditorModal({ state, story, initialType = 'Feature', saving, onClose, onSave }: StoryEditorModalProps) {
  const [draft, setDraft] = useState<StoryDraft>(() => toDraft(story, initialType));
  const epics = useMemo(() => state.stories.filter((candidate) => candidate.type === 'Epic' && candidate.id !== story?.id), [state.stories, story?.id]);
  const entityLabel = draft.type === 'Epic' ? 'epic' : 'story';
  const canMarkStretch = draft.type === 'Epic' || draft.type === 'Feature';
  const canEditServices = draft.type === 'Epic' || !draft.epicId;
  const aiEnabled = state.roomSettings.aiEnabled;
  const availableServices = state.services.filter((service) => !draft.serviceLinks.some((link) => link.serviceId === service.id));

  function update<K extends keyof StoryDraft>(key: K, value: StoryDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function updateType(type: string) {
    setDraft((current) => ({ ...current, type, stretch: type === 'Epic' || type === 'Feature' ? current.stretch : false, epicId: type === 'Epic' ? null : current.epicId, serviceLinks: type === 'Epic' ? current.serviceLinks : current.epicId ? [] : current.serviceLinks }));
  }

  function addService(serviceId: string) {
    if (!serviceId || draft.serviceLinks.some((link) => link.serviceId === serviceId)) return;
    const used = draft.serviceLinks.reduce((sum, link) => sum + link.allocation, 0);
    setDraft((current) => ({ ...current, serviceLinks: [...current.serviceLinks, { serviceId, allocation: Math.max(0, 100 - used) }] }));
  }

  function updateService(serviceId: string, nextServiceId: string) {
    if (!nextServiceId || draft.serviceLinks.some((link) => link.serviceId === nextServiceId && link.serviceId !== serviceId)) return;
    setDraft((current) => ({ ...current, serviceLinks: current.serviceLinks.map((link) => link.serviceId === serviceId ? { ...link, serviceId: nextServiceId } : link) }));
  }

  function updateAllocation(serviceId: string, value: string) {
    const parsed = Math.min(100, Math.max(0, Number(value) || 0));
    const otherTotal = draft.serviceLinks.filter((link) => link.serviceId !== serviceId).reduce((sum, link) => sum + link.allocation, 0);
    setDraft((current) => ({ ...current, serviceLinks: current.serviceLinks.map((link) => link.serviceId === serviceId ? { ...link, allocation: Math.min(parsed, Math.max(0, 100 - otherTotal)) } : link) }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = draft.title.trim();
    if (!title) return;
    const url = draft.url.trim();
    if (url) {
      try {
        const parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('invalid');
      } catch {
        return;
      }
    }
    const manual = draft.type === 'Epic' ? null : parseEstimate(draft.manualText);
    const ai = draft.type === 'Epic' || !aiEnabled ? null : parseEstimate(draft.aiText);
    if (manual === undefined || ai === undefined) return;
    const acceptance = draft.acceptanceText.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    await onSave({
      id: draft.id,
      type: draft.type,
      epicId: draft.type === 'Epic' ? null : epics.some((epic) => epic.id === draft.epicId) ? draft.epicId : null,
      title,
      url,
      description: draft.description.trim() || 'A new story ready for the team to shape and estimate together.',
      acceptance: acceptance.length ? acceptance : ['Ready for discussion'],
      manual,
      ai,
      aiEnabled: ai !== null,
      saved: draft.type !== 'Epic' && manual !== null,
      stretch: canMarkStretch && draft.stretch,
      serviceLinks: canEditServices ? draft.serviceLinks : [],
    });
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal modal-wide story-editor-modal" role="dialog" aria-modal="true" aria-labelledby="story-editor-title">
        <div className="modal-header"><div><p className="section-kicker">{story ? `Edit ${entityLabel}` : 'Story queue'}</p><h2 id="story-editor-title">{story ? `Edit ${entityLabel}` : 'Add a story'}</h2><p>{story ? `Update the ${entityLabel} details, epic link, and service assignment.` : 'Capture the story, choose an epic, and assign the delivering services.'}</p></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close"><AppIcon name="x" size={16} /></button></div>
        <form className="modal-form" onSubmit={(event) => void submit(event)}>
          <div className="story-editor-fields"><label className="modal-field"><span>Story title</span><input className="modal-input" value={draft.title} maxLength={120} onChange={(event) => update('title', event.target.value)} placeholder="Add audit history to project changes" required /></label><label className="modal-field"><span>Type</span><select className="modal-input" value={draft.type} onChange={(event) => updateType(event.target.value)}><option>Feature</option><option>Improvement</option><option>Tech debt</option><option>Epic</option></select></label></div>
          <label className="modal-field"><span>Description <small>(optional)</small></span><textarea className="modal-input" maxLength={280} value={draft.description} onChange={(event) => update('description', event.target.value)} placeholder="As a… I want… so that…" /></label>
          <label className="modal-field"><span>Acceptance criteria <small>(one per line)</small></span><textarea className="modal-input acceptance-editor" maxLength={500} value={draft.acceptanceText} onChange={(event) => update('acceptanceText', event.target.value)} placeholder="Ready for discussion" /></label>
          <label className="modal-field"><span>Story link <small>(optional)</small></span><input className="modal-input" type="url" maxLength={2048} value={draft.url} onChange={(event) => update('url', event.target.value)} placeholder="https://tracker.example.com/story/123" /><small className="modal-hint">Use an http or https link to the source ticket.</small></label>
           {draft.type !== 'Epic' ? <div className="story-editor-fields story-editor-points"><label className="modal-field"><span>Team story points <small>(optional)</small></span><input className="modal-input" type="number" min="0" step="0.5" value={draft.manualText} onChange={(event) => update('manualText', event.target.value)} placeholder="Not estimated" /></label>{aiEnabled ? <label className="modal-field"><span>AI story points <small>(optional)</small></span><input className="modal-input" type="number" min="0" step="0.5" value={draft.aiText} onChange={(event) => update('aiText', event.target.value)} placeholder="Not estimated" /></label> : null}</div> : null}
          {canMarkStretch ? <label className="room-setting-checkbox story-stretch-checkbox"><input type="checkbox" checked={draft.stretch} onChange={(event) => update('stretch', event.target.checked)} /><span><strong>Mark as stretch work</strong><small>Keep this epic or feature outside the committed total.</small></span></label> : null}
          {draft.type === 'Epic' ? <p className="modal-hint">Epics are roll-ups. Link estimable stories to this epic after creating it.</p> : <div className="modal-field"><span>Epic <small>(optional)</small></span><EpicPicker className="modal-epic-picker" epics={epics} value={draft.epicId || ''} onChange={(epicId) => update('epicId', epicId || null)} ariaLabel="Epic" allowEmpty emptyLabel="No epic" /><small className="modal-hint">Stories linked to an epic inherit its service assignment.</small></div>}
          {canEditServices ? <div className="story-editor-services"><div className="modal-section-heading"><div><strong>{draft.type === 'Epic' ? 'Epic services' : 'Story services'}</strong><span>{draft.type === 'Epic' ? 'Child stories inherit these assignments.' : 'Use this for stories without an epic.'}</span></div></div>{draft.serviceLinks.map((link) => <div className="editor-service-row" key={link.serviceId}><select className="modal-input" value={link.serviceId} onChange={(event) => updateService(link.serviceId, event.target.value)} aria-label="Story service">{state.services.filter((service) => service.id === link.serviceId || !draft.serviceLinks.some((candidate) => candidate.serviceId === service.id)).map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select><label className="allocation-input"><input type="number" min="0" max="100" step="5" value={link.allocation} onChange={(event) => updateAllocation(link.serviceId, event.target.value)} aria-label="Allocation percentage" /><span>%</span></label><button className="icon-button compact-icon" type="button" onClick={() => setDraft((current) => ({ ...current, serviceLinks: current.serviceLinks.filter((candidate) => candidate.serviceId !== link.serviceId) }))} aria-label="Remove service link"><AppIcon name="x" size={14} /></button></div>)}{availableServices.length ? <select className="modal-input editor-add-service" value="" onChange={(event) => addService(event.target.value)} aria-label="Add service"><option value="">Add service…</option>{availableServices.map((service) => <option value={service.id} key={service.id}>{service.name}</option>)}</select> : state.services.length ? <p className="modal-hint">All configured services are already linked.</p> : <p className="modal-hint">Add services from Resources first.</p>}<p className="modal-hint">Use 100% across linked services. Any remainder stays unassigned.</p></div> : <div className="story-editor-services"><div className="modal-section-heading"><div><strong>Inherited services</strong><span>Managed by the selected epic.</span></div></div>{state.stories.find((candidate) => candidate.id === draft.epicId)?.serviceLinks.length ? state.stories.find((candidate) => candidate.id === draft.epicId)?.serviceLinks.map((link) => <div className="manager-row" key={link.serviceId}><span><strong>{state.services.find((service) => service.id === link.serviceId)?.name || 'Missing service'}</strong><small>{link.allocation}% allocation</small></span></div>) : <p className="empty-manager">Assign services on the epic to pass them to this story.</p>}</div>}
          <div className="modal-footer"><button className="outline-button" type="button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit" disabled={saving}>{story ? 'Save changes' : 'Add story'}</button></div>
        </form>
      </section>
    </div>
  );
}

