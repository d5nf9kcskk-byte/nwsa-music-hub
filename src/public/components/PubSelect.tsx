import type { CSSProperties } from 'react';

/**
 * Compact labeled dropdown for the family-facing pages — the type/sort sibling
 * of PubEnsembleSelect. Replaces the wrapping rows of filter chips (Everything /
 * Rehearsals / Concerts / …) with a single tap-to-open control.
 */
export function PubSelect({ value, onChange, options, ariaLabel, className = '', style }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  ariaLabel?: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <select
      className={`pub-ens-select pub-type-select ${className}`.trim()}
      value={value}
      onChange={e => onChange(e.target.value)}
      aria-label={ariaLabel}
      style={style}
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
