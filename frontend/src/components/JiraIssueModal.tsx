import { useState } from 'react';
import type { JiraIssue } from '../types';
import { AppIcon } from './AppIcon';

type Props = {
  saving: boolean;
  onClose: () => void;
  onSearch: (query: string) => Promise<JiraIssue[]>;
  onImport: (issueKey: string) => Promise<void>;
  onCreate: (input: { projectKey: string; title: string; description: string; epicKey?: string }) => Promise<void>;
};

export function JiraIssueModal({ saving, onClose, onSearch, onImport, onCreate }: Props) {
  const [mode, setMode] = useState<'search' | 'create'>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<JiraIssue[]>([]);
  const [searched, setSearched] = useState(false);
  const [projectKey, setProjectKey] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  async function search() {
    setResults(await onSearch(query));
    setSearched(true);
  }

  return <div className="modal-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal modal-wide" role="dialog" aria-modal="true" aria-labelledby="jira-issue-title">
      <div className="modal-header"><div><p className="section-kicker">Jira integration</p><h2 id="jira-issue-title">Bring Jira work into the room.</h2><p>Search across projects, import an existing issue, or create a Jira Story.</p></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close"><AppIcon name="x" size={16} /></button></div>
      <div className="import-tabs" role="tablist"><button className={`import-tab${mode === 'search' ? ' active' : ''}`} type="button" onClick={() => setMode('search')}>Search Jira</button><button className={`import-tab${mode === 'create' ? ' active' : ''}`} type="button" onClick={() => setMode('create')}>Create Story</button></div>
      {mode === 'search' ? <>
        <div className="jira-search-row"><input className="modal-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, key, or text" onKeyDown={(event) => { if (event.key === 'Enter') void search(); }} /><button className="primary-button" type="button" disabled={saving} onClick={() => void search()}><AppIcon name="search" size={14} /> Search</button></div>
        <div className="jira-search-results">{results.map((issue) => <div className="manager-row" key={issue.jiraKey}><span><strong>{issue.jiraKey} · {issue.title}</strong><small>{issue.type}{issue.epicId ? ` · Epic ${issue.epicId}` : ''}</small></span><button className="outline-button" type="button" disabled={saving} onClick={() => void onImport(issue.jiraKey)}>Add to room</button></div>)}{searched && !results.length ? <p className="empty-manager">No Jira issues matched this search.</p> : null}</div>
      </> : <form className="modal-form" onSubmit={(event) => { event.preventDefault(); void onCreate({ projectKey: projectKey.trim(), title: title.trim(), description: description.trim() }); }}>
        <label className="modal-field"><span>Jira project key</span><input className="modal-input" value={projectKey} onChange={(event) => setProjectKey(event.target.value)} placeholder="PLN" required /></label>
        <label className="modal-field"><span>Story title</span><input className="modal-input" value={title} onChange={(event) => setTitle(event.target.value)} required /></label>
        <label className="modal-field"><span>Description</span><textarea className="modal-input" value={description} onChange={(event) => setDescription(event.target.value)} /></label>
        <div className="modal-footer"><button className="outline-button" type="button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit" disabled={saving}>Create Jira Story</button></div>
      </form>}
    </section>
  </div>;
}
