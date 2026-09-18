import { useState, type ReactNode } from 'react';
import type { Ensemble } from '../types';
import { groupBuckets } from '../groupBuckets';

/**
 * Pick any number of groups — a dropdown list, not a wall of pills.
 *
 * The forty-odd groups this school runs rendered as forty-odd wrapping
 * checkbox tags: a block of buttons you had to read end to end to find
 * "Symphony Orchestra", with nothing saying which of them were ensembles and
 * which were classes. They are not all ensembles — AP Theory, Opera Workshop
 * and the string master classes sit in the same collection (#classes).
 *
 * So: a native `<details>` disclosure, closed by default and summarising what
 * is chosen, holding a checkbox list split into the sections `groupBuckets`
 * defines. Native on purpose — `<select multiple>` is the other option and it
 * is the flimsier one: one stray tap on an option clears every other
 * selection, which is the same lose-your-work failure the drawer bug was.
 * Checkboxes cannot do that, and a disclosure needs no click-outside handler,
 * no portal and no focus trap. `FilterMenu` is not this: there empty means
 * ALL, which in an editor field would read as "every group" when the director
 * meant "school-wide".
 *
 * **It offers exactly the list it is handed** — see `groupBuckets`. Each
 * screen still decides what belongs in its own picker.
 */
export function GroupPicker({
  ensembles, value, onChange,
  label = 'Ensembles & classes',
  emptyLabel = 'None chosen — tap to pick',
  tools,
}: {
  ensembles: Ensemble[];
  value: string[];
  onChange: (ids: string[]) => void;
  label?: string;
  /** What the closed row says when nothing is picked. The Documents and Event
   *  forms mean something specific by empty ("school-wide"), and a picker that
   *  says so is one less hint to read. */
  emptyLabel?: string;
  /** Screen-specific controls pinned above the list — the Event form's
   *  "Whole Music Division" button lives here rather than being rebuilt. */
  tools?: ReactNode;
}) {
  // Forty groups in a scroller is navigable by section; it is still faster to
  // type "symph". Local to the open panel — it filters nothing when closed and
  // selects nothing by itself.
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const shown = q ? ensembles.filter(e => e.name.toLowerCase().includes(q)) : ensembles;
  const buckets = groupBuckets(shown);

  const byId = new Map(ensembles.map(e => [e.id, e]));
  // Ids with no group behind them are dropped from the SUMMARY only — never
  // from `value`. A stale id belongs to a group that was renamed or removed,
  // and quietly rewriting the saved field to "fix" the display would be an
  // edit nobody asked for.
  const chosen = value.map(id => byId.get(id)?.name).filter((n): n is string => !!n);

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter(v => v !== id) : [...value, id]);
  }

  const summary = chosen.length === 0
    ? emptyLabel
    : chosen.length <= 3
      ? chosen.join(', ')
      : `${chosen.slice(0, 2).join(', ')} +${chosen.length - 2} more`;

  return (
    <details className="dir-group-picker">
      <summary className="dir-group-picker-summary">
        <span className="dir-group-picker-count">{chosen.length || '—'}</span>
        <span className="dir-group-picker-names">{summary}</span>
      </summary>
      <div className="dir-group-picker-panel" role="group" aria-label={label}>
        {tools && <div className="dir-group-picker-tools">{tools}</div>}
        {ensembles.length > 8 && (
          <input
            className="dir-input dir-group-picker-search"
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search groups…"
            aria-label={`Search ${label}`}
          />
        )}
        <div className="dir-group-picker-list">
          {buckets.map(b => (
            <div key={b.label} className="dir-group-picker-bucket">
              <div className="dir-group-picker-bucket-label">{b.label}</div>
              {b.groups.map(e => (
                <label key={e.id} className="dir-group-picker-row">
                  <input
                    type="checkbox"
                    checked={value.includes(e.id)}
                    onChange={() => toggle(e.id)}
                  />
                  <span className="dir-group-picker-name">{e.name}</span>
                </label>
              ))}
            </div>
          ))}
          {buckets.length === 0 && (
            <div className="dir-group-picker-none">
              {q ? `Nothing matches “${query}”.` : 'No groups to choose from.'}
            </div>
          )}
        </div>
        {value.length > 0 && (
          <button type="button" className="dir-group-picker-clear" onClick={() => onChange([])}>
            Clear all
          </button>
        )}
      </div>
    </details>
  );
}
