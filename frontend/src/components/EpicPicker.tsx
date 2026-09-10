import { useEffect, useMemo, useRef, useState } from 'react';
import type { Story } from '../types';
import { AppIcon } from './AppIcon';

type EpicPickerProps = {
  epics: Story[];
  value: string;
  onChange: (epicId: string) => void;
  ariaLabel: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
  optionMeta?: (epic: Story) => string;
  className?: string;
  disabled?: boolean;
};

export function EpicPicker({ epics, value, onChange, ariaLabel, allowEmpty = false, emptyLabel = 'No epic', optionMeta, className = '', disabled = false }: EpicPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const selectedEpic = epics.find((epic) => epic.id === value);
  const filteredEpics = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return normalizedQuery ? epics.filter((epic) => epic.title.toLowerCase().includes(normalizedQuery)) : epics;
  }, [epics, query]);

  useEffect(() => {
    if (!open) return undefined;
    function closeOnOutsidePointer(event: PointerEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setOpen(false);
        setQuery('');
      }
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  function choose(epicId: string) {
    onChange(epicId);
    setOpen(false);
    setQuery('');
  }

  return (
    <div ref={rootRef} className={`epic-picker${open ? ' open' : ''}${disabled ? ' disabled' : ''}${className ? ` ${className}` : ''}`}>
      <button className="epic-picker-trigger" type="button" aria-haspopup="listbox" aria-expanded={open} aria-label={ariaLabel} disabled={disabled} onClick={() => setOpen((current) => !current)}>
        <span className="epic-picker-trigger-copy">
          <strong>{selectedEpic?.title || (value && !allowEmpty ? 'Select an epic' : emptyLabel)}</strong>
          {selectedEpic && optionMeta ? <small>{optionMeta(selectedEpic)}</small> : null}
        </span>
        <AppIcon name="chevronDown" size={14} />
      </button>
      {open ? (
        <div className="epic-picker-menu" role="listbox" aria-label={`${ariaLabel} options`}>
          <label className="epic-picker-search"><AppIcon name="search" size={13} /><input ref={searchRef} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search epics" aria-label={`Search ${ariaLabel.toLowerCase()}`} /></label>
          <div className="epic-picker-options">
            {allowEmpty ? <button className="epic-picker-option" type="button" role="option" aria-selected={!value} onClick={() => choose('')}><span className="epic-picker-option-copy"><strong>{emptyLabel}</strong></span>{!value ? <AppIcon name="check" size={14} /> : null}</button> : null}
            {filteredEpics.map((epic) => <button className="epic-picker-option" type="button" role="option" aria-selected={epic.id === value} key={epic.id} onClick={() => choose(epic.id)}><span className="epic-picker-option-copy"><strong>{epic.title}</strong>{optionMeta ? <small>{optionMeta(epic)}</small> : null}</span>{epic.id === value ? <AppIcon name="check" size={14} /> : null}</button>)}
            {!filteredEpics.length ? <p className="epic-picker-empty">{query ? `No epics match “${query}”.` : 'No epics yet.'}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
