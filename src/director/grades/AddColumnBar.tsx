import { useState } from 'react';
import { Plus } from 'lucide-react';
import { cleanLabel, customKey, itemKey, tallyKey, type GradeCategory } from '../../shared/ensembleGrades';
import { concertLabel, type ConcertOption, type ExamOption, type GradeColumn } from './gradeTable';

/**
 * "Add a column" for the Gradebook (#gradebook-columns): one bar, four kinds.
 *
 *   an exam from the Hub        the live confirmed grade, one column per exam
 *   a concert from the calendar the live scans + roll, one column per concert
 *   a grade of my own           typed 0-100, averaged into a category
 *   something that costs points  an incident count (a phone out, acting out);
 *                                each one takes N points off a category
 *
 * The bar only decides WHICH column keys to add; the screen writes them. It
 * offers every exam and concert of the quarter — it used to offer only
 * concerts marked Required, so a Symphony concert nobody had ticked was
 * simply not on the list, with nothing to say why.
 */

type What = 'exam' | 'concert' | 'own' | 'tally';

const ALL = '__all';

interface Props {
  plan: GradeCategory[];
  /** What the table's group is called — "Orchestra", "Camerata". */
  groupTitle: string;
  concertOptions: ConcertOption[];
  examOptions: ExamOption[];
  /** The plan has a category for linked exams / concerts to roll up into. */
  canLinkExams: boolean;
  canLinkConcerts: boolean;
  existing: GradeColumn[];
  /** Add these column keys (each one a `null` marker for the roster). */
  onAdd: (keys: string[]) => Promise<void>;
}

const md = (iso: string) => {
  const [, m, d] = iso.split('-');
  return `${Number(m)}/${Number(d)}`;
};

export function AddColumnBar({
  plan, groupTitle, concertOptions, examOptions, canLinkExams, canLinkConcerts, existing, onAdd,
}: Props) {
  const first: What = canLinkExams ? 'exam' : canLinkConcerts ? 'concert' : 'own';
  const [what, setWhat] = useState<What>(first);
  const [pick, setPick] = useState('');
  const [catId, setCatId] = useState(plan[0]?.id ?? '');
  const [name, setName] = useState('');
  const [points, setPoints] = useState('2');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const playsOrNeeded = concertOptions.filter(o => o.relation !== 'other');
  const byRelation = (r: ConcertOption['relation']) => concertOptions.filter(o => o.relation === r);

  function describe(o: ConcertOption): string {
    const flag = o.event.concertAttendance === 'required' ? ' · Required'
      : o.event.concertAttendance === 'optional' ? ' · Optional' : '';
    return `${concertLabel(o.event)}${flag}`;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    let keys: string[];
    if (what === 'exam') {
      if (!pick) { setError('Choose an exam first.'); return; }
      keys = (pick === ALL ? examOptions : examOptions.filter(o => o.assignment.id === pick))
        .map(o => itemKey('exam', o.assignment.id));
    } else if (what === 'concert') {
      if (!pick) { setError('Choose a concert first.'); return; }
      keys = (pick === ALL ? playsOrNeeded : concertOptions.filter(o => o.event.id === pick))
        .map(o => itemKey('concert', o.event.id));
    } else {
      const label = cleanLabel(name);
      if (!label) { setError('Give the column a name.'); return; }
      if (!catId) { setError('Choose which box it belongs to.'); return; }
      const clash = existing.some(c => c.categoryId === catId && c.label.toLowerCase() === label.toLowerCase()
        && (c.kind === 'custom' || c.kind === 'tally'));
      if (clash) { setError('There is already a column with that name in that box.'); return; }
      const cost = Number(points);
      const key = what === 'tally' ? tallyKey(catId, cost, label) : customKey(catId, label);
      if (!key) { setError('Each one has to cost a whole number of points, 1 to 100.'); return; }
      keys = [key];
    }
    if (keys.length === 0) { setError('Nothing to add.'); return; }
    setBusy(true);
    try {
      await onAdd(keys);
      setPick('');
      setName('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="dir-gb-addbar" onSubmit={e => void submit(e)}>
      <span className="dir-gb-addlabel">Add a column</span>

      <select
        className="dir-gb-pick"
        value={what}
        aria-label="What kind of column"
        onChange={e => { setWhat(e.target.value as What); setPick(''); setError(''); }}
      >
        {canLinkExams && <option value="exam">An exam from the Hub</option>}
        {canLinkConcerts && <option value="concert">A concert from the calendar</option>}
        <option value="own">A grade of my own</option>
        <option value="tally">Something that costs points</option>
      </select>

      {what === 'exam' && (
        <select className="dir-gb-pick" value={pick} aria-label="Which exam" onChange={e => setPick(e.target.value)}>
          <option value="">{examOptions.length ? 'Choose an exam…' : 'Every exam this quarter is already a column'}</option>
          {examOptions.length > 1 && <option value={ALL}>All {examOptions.length} exams this quarter</option>}
          {examOptions.map(o => (
            <option key={o.assignment.id} value={o.assignment.id}>
              {o.assignment.title} · {md(o.assignment.dueDate)} · {o.graded} of {o.of} graded
              {o.unreadable ? ` · ${o.unreadable} unreadable` : ''}
            </option>
          ))}
        </select>
      )}

      {what === 'concert' && (
        <select className="dir-gb-pick" value={pick} aria-label="Which concert" onChange={e => setPick(e.target.value)}>
          <option value="">{concertOptions.length ? 'Choose a concert…' : 'Every concert this quarter is already a column'}</option>
          {playsOrNeeded.length > 1 && <option value={ALL}>All {playsOrNeeded.length} that {groupTitle} plays or must attend</option>}
          {byRelation('performs').length > 0 && (
            <optgroup label={`${groupTitle} plays`}>
              {byRelation('performs').map(o => <option key={o.event.id} value={o.event.id}>{describe(o)}</option>)}
            </optgroup>
          )}
          {byRelation('required').length > 0 && (
            <optgroup label={`Required of ${groupTitle} in the audience`}>
              {byRelation('required').map(o => <option key={o.event.id} value={o.event.id}>{describe(o)}</option>)}
            </optgroup>
          )}
          {byRelation('other').length > 0 && (
            <optgroup label="Other concerts this quarter">
              {byRelation('other').map(o => <option key={o.event.id} value={o.event.id}>{describe(o)}</option>)}
            </optgroup>
          )}
        </select>
      )}

      {(what === 'own' || what === 'tally') && (
        <>
          <select className="dir-gb-pick" value={catId} aria-label="Which box it counts toward" onChange={e => setCatId(e.target.value)}>
            {plan.map(c => <option key={c.id} value={c.id}>in {c.label}</option>)}
          </select>
          <input
            className="dir-input dir-gb-addname"
            value={name}
            maxLength={40}
            aria-label="Column name"
            placeholder={what === 'tally' ? 'What happened — e.g. Phone out in class' : 'Name — e.g. Sight reading'}
            onChange={e => setName(e.target.value)}
          />
          {what === 'tally' && (
            <label className="dir-gb-addcost">
              each one costs
              <input
                className="dir-input"
                type="number"
                min={1}
                max={100}
                inputMode="numeric"
                value={points}
                aria-label="Points each one costs"
                onChange={e => setPoints(e.target.value)}
              />
              points
            </label>
          )}
        </>
      )}

      <button className="dir-tool-btn" type="submit" disabled={busy}>
        <Plus size={14} /> {busy ? 'Adding…' : 'Add column'}
      </button>
      {error && <span className="dir-gb-adderr" role="alert">{error}</span>}
    </form>
  );
}
