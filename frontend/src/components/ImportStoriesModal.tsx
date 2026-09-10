import { useMemo, useState } from 'react';
import { parseCsvList, parseTextList } from '../storyUtils';
import type { Story } from '../types';
import { AppIcon } from './AppIcon';
import { EpicPicker } from './EpicPicker';

type ImportStoriesModalProps = {
  epics: Story[];
  saving: boolean;
  onClose: () => void;
  onImport: (stories: Story[], epicId: string | null) => Promise<void>;
};

export function ImportStoriesModal({ epics, saving, onClose, onImport }: ImportStoriesModalProps) {
  const [mode, setMode] = useState<'text' | 'file'>('text');
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [epicId, setEpicId] = useState('');
  const stories = useMemo(() => mode === 'file' && /\.csv$/i.test(fileName) ? parseCsvList(text) : parseTextList(text), [fileName, mode, text]);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    setText(await file.text());
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="import-stories-title">
        <div className="modal-header"><div><h2 id="import-stories-title">Import stories</h2><p>Bring in a backlog from a text list or CSV file. Estimates start blank.</p></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close"><AppIcon name="x" size={16} /></button></div>
        <div className="import-tabs" role="tablist" aria-label="Import source"><button className={`import-tab${mode === 'text' ? ' active' : ''}`} type="button" onClick={() => { setMode('text'); setFileName(''); setText(''); }}>Paste text list</button><button className={`import-tab${mode === 'file' ? ' active' : ''}`} type="button" onClick={() => { setMode('file'); setText(''); setFileName(''); }}>Upload CSV / TXT</button></div>
        {mode === 'text' ? <div className="import-panel"><label className="modal-field"><span>Story list</span><textarea className="modal-input import-textarea" value={text} onChange={(event) => setText(event.target.value)} placeholder={'- Add audit history\n- Let owners archive a workspace\n- Export PI estimates'} /><small className="import-hint">One story per line. Optional: <code>Title | Description | Type | Acceptance</code>.</small></label></div> : <div className="import-panel"><label className="file-drop" htmlFor="import-file"><input id="import-file" type="file" accept=".csv,.txt,text/csv,text/plain" onChange={(event) => void handleFile(event.target.files?.[0])} /><span><span className="file-drop-icon"><AppIcon name="upload" size={18} /></span><strong>{fileName || 'Choose a CSV or text file'}</strong><span>{fileName ? 'File loaded' : 'CSV headers: title, description, type, acceptance, id'}</span></span></label><p className="import-hint">A TXT file uses one story per line. Quoted CSV values and commas are supported.</p></div>}
        {epics.length ? <div className="modal-field import-epic-field"><span>Link imported stories to an epic <small>(optional)</small></span><EpicPicker className="modal-epic-picker" epics={epics} value={epicId} onChange={setEpicId} ariaLabel="Import epic" allowEmpty emptyLabel="Leave stories unlinked" /><small className="modal-hint">All imported non-epic stories will use this epic link.</small></div> : null}
        <div className="import-preview"><div className="import-preview-header"><strong>Import preview</strong><span className={`import-preview-count${stories.length ? '' : ' empty'}`}>{stories.length ? `${stories.length} ready` : 'No stories yet'}</span></div><ul className="import-preview-list">{stories.length ? <>{stories.slice(0, 4).map((story) => <li key={`${story.id}-${story.title}`}>{story.title}</li>)}{stories.length > 4 ? <li className="more">+ {stories.length - 4} more</li> : null}</> : <li className="more">Add a line or choose a file to preview stories.</li>}</ul></div>
        <div className="modal-footer"><button className="outline-button" type="button" onClick={onClose}>Cancel</button><button className="primary-button" type="button" disabled={saving || !stories.length} onClick={() => void onImport(stories, epicId || null)}><AppIcon name="upload" size={14} /> Import stories</button></div>
      </section>
    </div>
  );
}

