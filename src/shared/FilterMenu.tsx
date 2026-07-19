import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface FilterOption {
  value: string;
  label: string;
  /** Optional swatch shown next to the label (ensemble color / type color). */
  color?: string;
}

/**
 * A compact multi-select filter — a single button that opens a checklist
 * popover, so a student can pick "Symphony + Camerata" and "Rehearsals +
 * Concerts" without a wall of chips. Empty selection === "all" (the first row
 * clears it). Closes on outside-click or Escape.
 *
 * Theme-agnostic by design: every class is prefixed with `pub` (family site) or
 * `dir` (director app), and each surface styles its own `.<prefix>-fm*` rules,
 * so one component serves both the public calendar and the director schedule.
 */
export function FilterMenu({
  prefix,
  allLabel,
  options,
  selected,
  onChange,
  ariaLabel,
}: {
  prefix: 'pub' | 'dir';
  /** Label shown on the button (and as the top "clear" row) when nothing is picked. */
  allLabel: string;
  options: FilterOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const selectedSet = new Set(selected);
  const chosen = options.filter(o => selectedSet.has(o.value));
  const summary =
    chosen.length === 0 ? allLabel
      : chosen.length === 1 ? chosen[0].label
        : `${chosen[0].label} +${chosen.length - 1}`;

  function toggle(v: string) {
    onChange(selectedSet.has(v) ? selected.filter(x => x !== v) : [...selected, v]);
  }

  return (
    <div className={`${prefix}-fm`} ref={rootRef}>
      <button
        type="button"
        className={`${prefix}-fm-btn${chosen.length ? ' active' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen(o => !o)}
      >
        <span className={`${prefix}-fm-btn-label`}>{summary}</span>
        <ChevronDown size={15} className={`${prefix}-fm-caret`} style={open ? { transform: 'rotate(180deg)' } : undefined} />
      </button>
      {open && (
        <div className={`${prefix}-fm-panel`} role="listbox" aria-multiselectable="true" aria-label={ariaLabel}>
          <button
            type="button"
            className={`${prefix}-fm-opt${chosen.length === 0 ? ' checked' : ''}`}
            role="option"
            aria-selected={chosen.length === 0}
            onClick={() => onChange([])}
          >
            <span className={`${prefix}-fm-box`}>{chosen.length === 0 && <Check size={13} strokeWidth={3} />}</span>
            <span className={`${prefix}-fm-opt-label`}>{allLabel}</span>
          </button>
          {options.map(o => {
            const on = selectedSet.has(o.value);
            return (
              <button
                key={o.value}
                type="button"
                className={`${prefix}-fm-opt${on ? ' checked' : ''}`}
                role="option"
                aria-selected={on}
                onClick={() => toggle(o.value)}
              >
                <span className={`${prefix}-fm-box`}>{on && <Check size={13} strokeWidth={3} />}</span>
                {o.color && <span className={`${prefix}-fm-dot`} style={{ background: o.color }} />}
                <span className={`${prefix}-fm-opt-label`}>{o.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
