import type { CSSProperties } from 'react';
import type { Ensemble } from '../../director/types';
import { musicEnsembles, ensembleDisplayName } from '../../director/utils';
import { t } from '../../shared/i18n';

/**
 * Compact, music-only ensemble dropdown for the family-facing pages — replaces
 * the wrapping rows of filter chips. value '' = all. Dance/Theater/Visual Arts
 * are calendar-only and never appear.
 */
export function PubEnsembleSelect({ ensembles, value, onChange, allLabel, extraOptions, style }: {
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
      aria-label={t('cal.filterByEnsemble')}
      style={style}
    >
      <option value="">{allLabel ?? t('nav.allEnsembles')}</option>
      {music.map(e => <option key={e.id} value={e.id}>{ensembleDisplayName(e)}</option>)}
      {extraOptions?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
