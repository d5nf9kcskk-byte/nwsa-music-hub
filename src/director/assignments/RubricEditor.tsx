import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import {
  DEFAULT_EXAM_RUBRIC, MAX_CRITERION_LABEL, MAX_CRITERION_POINTS, MAX_RUBRIC_CRITERIA,
  RUBRIC_TARGET_TOTAL, newCriterionId, resolveRubric, rubricMax, rubricProblem,
  type RubricCriterion,
} from '../examRubric';

interface Props {
  /** The exam's lines. Empty means rubric grading is off for this exam. */
  value: RubricCriterion[];
  onChange: (next: RubricCriterion[]) => void;
  /** This director's own saved rubric, if they have one. */
  myDefault?: RubricCriterion[];
  /** Save the lines on screen as this director's default for future exams. */
  onSaveDefault?: (criteria: RubricCriterion[]) => Promise<void>;
  savingDefault?: boolean;
  savedDefault?: boolean;
}

/**
 * The per-exam rubric (#exam-rubric). A rubric belongs to the EXAM, not to
 * the app: another director weights a playing exam their own way, and the
 * same director weights a scale check differently from a concerto jury. So
 * this edits the lines on the assignment, seeded from whatever the grader
 * uses by default, with one press to make the lines on screen that default.
 */
export function RubricEditor({
  value, onChange, myDefault, onSaveDefault, savingDefault, savedDefault,
}: Props) {
  const total = rubricMax(value);
  const problem = rubricProblem(value);
  const fallback = resolveRubric(undefined, myDefault);
  const full = value.length >= MAX_RUBRIC_CRITERIA;

  function setLine(i: number, patch: Partial<RubricCriterion>) {
    onChange(value.map((c, n) => (n === i ? { ...c, ...patch } : c)));
  }
  function addLine() {
    if (full) return;
    onChange([...value, { id: newCriterionId(value), label: '', max: 10 }]);
  }
  function removeLine(i: number) {
    onChange(value.filter((_, n) => n !== i));
  }

  if (value.length === 0) {
    return (
      <div className="dir-field">
        <label className="dir-label">
          Grading rubric <span className="dir-label-hint">off — this exam takes a plain score</span>
        </label>
        <button type="button" className="dir-tool-btn" onClick={() => onChange(fallback.map(c => ({ ...c })))}>
          <Plus size={13} /> Add a rubric
        </button>
      </div>
    );
  }

  return (
    <div className="dir-field">
      <label className="dir-label">
        Grading rubric <span className="dir-label-hint">scored while you watch, on the grade sheet</span>
      </label>

      <div className="dir-rubric-edit">
        {value.map((c, i) => (
          <div key={c.id} className="dir-rubric-edit-row">
            <input
              className="dir-input dir-rubric-edit-label"
              value={c.label}
              maxLength={MAX_CRITERION_LABEL}
              placeholder="What you're scoring"
              aria-label={`Rubric line ${i + 1} name`}
              onChange={e => setLine(i, { label: e.target.value })}
            />
            <input
              className="dir-input dir-rubric-edit-pts"
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_CRITERION_POINTS}
              step={1}
              value={Number.isFinite(c.max) ? c.max : ''}
              aria-label={`Points for ${c.label || `line ${i + 1}`}`}
              onChange={e => setLine(i, { max: Math.round(Number(e.target.value)) })}
            />
            <button
              type="button"
              className="dir-rubric-edit-x"
              aria-label={`Remove ${c.label || `line ${i + 1}`}`}
              onClick={() => removeLine(i)}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}

        <div className="dir-rubric-edit-foot">
          <button type="button" className="dir-tool-btn" onClick={addLine} disabled={full}>
            <Plus size={13} /> Add a line
          </button>
          <span className={`dir-rubric-total ${total === RUBRIC_TARGET_TOTAL ? 'ok' : 'off'}`}>
            {total} point{total === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      {problem ? (
        <div className="dir-field-hint dir-rubric-problem">⚠ {problem}</div>
      ) : total !== RUBRIC_TARGET_TOTAL ? (
        // A nudge, never a gate: a 60-point rubric grades perfectly well and
        // the grade sheet files the percent it works out to.
        <div className="dir-field-hint">
          This adds up to {total}, not {RUBRIC_TARGET_TOTAL}. That still works — a grade is filed as the
          percent of {total} the student earns.
        </div>
      ) : null}

      <div className="dir-rubric-edit-actions">
        <button
          type="button"
          className="dir-tool-btn"
          onClick={() => onChange(fallback.map(c => ({ ...c })))}
        >
          <RotateCcw size={13} /> Reset to {myDefault?.length ? 'my rubric' : 'the standard rubric'}
        </button>
        {onSaveDefault && (
          <button
            type="button"
            className="dir-tool-btn"
            disabled={!!problem || savingDefault}
            onClick={() => { void onSaveDefault(value); }}
          >
            {savedDefault ? '✓ Saved as my default' : savingDefault ? 'Saving…' : 'Save as my default'}
          </button>
        )}
        <button type="button" className="dir-tool-btn" onClick={() => onChange([])}>
          Grade without a rubric
        </button>
      </div>
      <div className="dir-field-hint">
        Yours only. Other staff keep their own default, and changing this exam's lines never touches
        theirs. {myDefault?.length ? '' : `Starts from the standard ${DEFAULT_EXAM_RUBRIC.length}-line rubric until you save your own.`}
      </div>
    </div>
  );
}
