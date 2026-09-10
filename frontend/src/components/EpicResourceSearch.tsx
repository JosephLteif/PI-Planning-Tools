import { useEffect, useMemo, useRef, useState } from 'react';
import { AppIcon } from './AppIcon';

export type EpicSearchOption = {
  id: string;
  name: string;
  domains: string[];
  products: string[];
};

export function matchesEpicSearch(option: EpicSearchOption, query: string) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const haystack = [option.name, ...option.domains, ...option.products].join(' ').toLocaleLowerCase();
  return terms.every((term) => haystack.includes(term));
}

export function EpicResourceSearch({ options, value, onChange }: { options: EpicSearchOption[]; value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const filteredOptions = useMemo(() => options.filter((option) => matchesEpicSearch(option, value)).slice(0, 8), [options, value]);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <div className="epic-resource-search" ref={rootRef}>
      <div className="epic-resource-search-input">
        <AppIcon name="search" size={14} />
        <input
          type="search"
          value={value}
          placeholder="Search by epic, domain, or product"
          aria-label="Search epics by name, domain, or product"
          aria-autocomplete="list"
          aria-expanded={open}
          onFocus={() => setOpen(true)}
          onChange={(event) => { onChange(event.target.value); setOpen(true); }}
        />
        {value ? <button className="epic-resource-search-clear" type="button" onClick={() => onChange('')} aria-label="Clear Epic search"><AppIcon name="x" size={13} /></button> : null}
      </div>
      {open ? <div className="epic-resource-search-menu" role="listbox" aria-label="Epic suggestions">
        {filteredOptions.length ? filteredOptions.map((option) => (
          <button className="epic-resource-search-option" type="button" role="option" key={option.id} onClick={() => { onChange(option.name); setOpen(false); }}>
            <span><strong>{option.name}</strong><small>{option.domains.length ? option.domains.join(', ') : 'No domain'} · {option.products.length ? option.products.join(', ') : 'No product'}</small></span>
            <AppIcon name="arrowDown" size={12} />
          </button>
        )) : <p className="epic-resource-search-empty">No matching epics.</p>}
      </div> : null}
    </div>
  );
}
