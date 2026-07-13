import type { CSSProperties } from 'react';
import type { Ensemble } from '../../director/types';
import { musicEnsembles } from '../../director/utils';

/**
 * Compact, music-only ensemble dropdown for the family-facing pages — replaces
 * the wrapping rows of filter chips. value '' = all. Dance/Theater/Visual Arts
 * are calendar-only and never appear.
 */
export function PubEnsembleSelect({ ensembles, value, onChange, allLabel = 'All ensembles', extraOptions, style }: {
  ensembles: Ensemble[];
  value: string;
  onChange: (id: string) => void;
  allLabel?: string;
  extraOptions?: { value: string; label: string }[];
  style?: CSSProperties;
}) {
  const music = musicEnsembles([...ensembles].sort((a, b) => a.order - b.order));
  if (music.length === 0 && !(extraOptions && extraOptions.length)) return null;
  return (
    <select
      className="pub-ens-select"
      value={value}
      onChange={e => onChange(e.target.value)}
      aria-label="Filter by ensemble"
      style={style}
    >
      <option value="">{allLabel}</option>
      {music.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
      {extraOptions?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
