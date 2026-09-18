import type { Ensemble } from '../types';
import {
  classGroups, collegeClasses, collegeEnsembles, highSchoolClasses,
  highSchoolEnsembles, isMasterClass, musicEnsembles,
} from '../utils';

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
 * is chosen, holding a checkbox list split into the buckets `utils.ts`
 * already defines. Native on purpose — `<select multiple>` is the other
 * option and it is the flimsier one: one stray tap on an option clears every
 * other selection, which is the same lose-your-work failure the drawer bug
 * was. Checkboxes cannot do that, and a disclosure needs no click-outside
 * handler, no portal and no focus trap.
 */
interface Bucket {
  label: string;
  groups: Ensemble[];
}

/** The buckets, in the order a director reads them. `utils.ts` owns every one
 *  of these predicates — this adds no second answer to "is it a class". */
function groupBuckets(ensembles: Ensemble[]): Bucket[] {
  const list = musicEnsembles([...ensembles].sort((a, b) => a.order - b.order));
  const classes = classGroups(list);
  return [
    { label: 'Ensembles',        groups: highSchoolEnsembles(list) },
    { label: 'Master classes',   groups: classes.filter(isMasterClass) },
    { label: 'Classes',          groups: highSchoolClasses(list).filter(e => !isMasterClass(e)) },
    { label: 'College ensembles', groups: collegeEnsembles(list) },
    { label: 'College classes',  groups: collegeClasses(list).filter(e => !isMasterClass(e)) },
  ].filter(b => b.groups.length > 0);
}

export function GroupPicker({ ensembles, value, onChange, label = 'Ensembles & classes' }: {
  ensembles: Ensemble[];
  value: string[];
  onChange: (ids: string[]) => void;
  label?: string;
}) {
  const buckets = groupBuckets(ensembles);
  const byId = new Map(ensembles.map(e => [e.id, e]));
  const chosen = value.map(id => byId.get(id)?.name).filter(Boolean) as string[];

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter(v => v !== id) : [...value, id]);
  }

  const summary = chosen.length === 0
    ? 'None chosen — tap to pick'
    : chosen.length <= 3
      ? chosen.join(', ')
      : `${chosen.slice(0, 2).join(', ')} +${chosen.length - 2} more`;

  return (
    <details className="dir-group-picker">
      <summary className="dir-group-picker-summary">
        <span className="dir-group-picker-count">{chosen.length || '—'}</span>
        <span className="dir-group-picker-names">{summary}</span>
      </summary>
      <div className="dir-group-picker-list" role="group" aria-label={label}>
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
        {value.length > 0 && (
          <button type="button" className="dir-group-picker-clear" onClick={() => onChange([])}>
            Clear all
          </button>
        )}
      </div>
    </details>
  );
}
