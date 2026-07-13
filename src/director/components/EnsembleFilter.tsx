import type { CSSProperties } from 'react';
import type { Ensemble } from '../types';
import { musicEnsembles } from '../utils';

/**
 * Compact, music-only ensemble filter — one dropdown that replaces the bulky
 * wrapping chip rows. value '' = all ensembles. Dance/Theater/Visual Arts are
 * calendar-only divisions and never appear here.
 */
export function EnsembleFilter({ ensembles, value, onChange, allLabel = 'All ensembles', label = 'Ensemble', extraOptions, style }: {
  ensembles: Ensemble[];
  value: string;
  onChange: (id: string) => void;
  allLabel?: string;
  label?: string;
  /** Non-ensemble options appended after "All" (e.g. a "School events" filter). */
  extraOptions?: { value: string; label: string }[];
  style?: CSSProperties;
}) {
  const music = musicEnsembles([...ensembles].sort((a, b) => a.order - b.order));
  if (music.length === 0 && !(extraOptions && extraOptions.length)) return null;
  return (
    <div className="dir-ens-filter" style={style}>
      {label && <label className="dir-ens-filter-label">{label}</label>}
      <select
        className="dir-select dir-ens-filter-select"
        value={value}
        onChange={e => onChange(e.target.value)}
        aria-label="Filter by ensemble"
      >
        <option value="">{allLabel}</option>
        {music.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        {extraOptions?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
