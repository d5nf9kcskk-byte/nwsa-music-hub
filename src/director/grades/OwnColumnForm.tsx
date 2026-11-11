import { useState } from 'react';
import { customKey, tallyKey, TALLY_POINTS_MAX, type GradeCategory } from '../../shared/ensembleGrades';

/**
 * The two columns a director can add by hand (#gradebook): a grade that does
 * not come from the Hub (a paper quiz, extra credit), or a penalty — a count
 * of something, where each one takes a fixed number of points off a category.
 * Hub grades are never added here: they arrive by themselves.
 */
export function OwnColumnForm({ mode, plan, onAdd, onCancel }: {
  mode: 'grade' | 'penalty';
  plan: GradeCategory[];
  onAdd: (key: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [catId, setCatId] = useState(plan[plan.length - 1]?.id ?? '');
  const [points, setPoints] = useState('2');
  const pts = Number(points);
  const catLabel = plan.find(c => c.id === catId)?.label ?? '';
  const key = mode === 'grade' ? customKey(catId, name) : tallyKey(catId, pts, name);

  return (
    <form className="gb-form" onSubmit={e => { e.preventDefault(); if (key) onAdd(key); }}>
      <label className="gb-field">
        <span>{mode === 'grade' ? 'Column name' : 'What is being counted'}</span>
        <input className="dir-input" value={name} maxLength={40} autoFocus
          placeholder={mode === 'grade' ? 'Sight-reading quiz' : 'Cell phone violations'}
          onChange={e => setName(e.target.value)} />
      </label>
      {mode === 'penalty' && (
        <label className="gb-field gb-narrow">
          <span>Points off for each one</span>
          <input className="dir-input" inputMode="numeric" value={points} onChange={e => setPoints(e.target.value)} />
        </label>
      )}
      <label className="gb-field">
        <span>{mode === 'grade' ? 'Counts toward' : 'Taken off'}</span>
        <select className="dir-input" value={catId} onChange={e => setCatId(e.target.value)}>
          {plan.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </label>
      <p className="gb-form-says">
        {mode === 'grade'
          ? `A new column of grades 0 to 100 that you type in. It is averaged with the other columns in ${catLabel}.`
          : Number.isInteger(pts) && pts >= 1 && pts <= TALLY_POINTS_MAX
            ? `Each one you record takes ${pts} point${pts === 1 ? '' : 's'} off that student's ${catLabel} grade.`
            : `Points off must be a whole number from 1 to ${TALLY_POINTS_MAX}.`}
      </p>
      <div className="gb-form-buttons">
        <button type="submit" className="dir-tool-btn primary" disabled={!key}>Add the column</button>
        <button type="button" className="dir-tool-btn" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
