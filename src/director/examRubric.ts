/**
 * Playing-exam rubric (#exam-rubric). A director watches the video and scores
 * a handful of named lines; the Hub adds them up and files one grade.
 *
 * The rubric is a PER-ASSIGNMENT field, not a constant. The six lines below
 * are one director's rubric, shipped as the starting point; another director
 * weights a playing exam differently, and the same director weights a scale
 * check differently from a concerto jury. So the criteria travel on the
 * `Assignment` doc, each staff member keeps their own default on their own
 * `directors/{email}` doc, and this module is the ONE place the resolution
 * order, the arithmetic, and the validation live.
 *
 * Three states for `Assignment.rubric`, and all three mean something:
 *   • absent  — nobody has chosen. Fall back to the grader's own default,
 *               then to `DEFAULT_EXAM_RUBRIC`. This is what every assignment
 *               created before the feature carries, which is why there is no
 *               migration: an existing playing exam simply grades with your
 *               rubric the first time you open it.
 *   • a list  — this exam's rubric, as edited on the assignment.
 *   • EMPTY   — rubric grading is off for this exam on purpose; the plain
 *               score box comes back. Do not "helpfully" treat [] as absent.
 *
 * A grade snapshots the lines it was given (`RubricScore[]` on the result),
 * so re-weighting an assignment later never silently rewrites a grade that
 * was already confirmed. It only makes the old one say so.
 */

/** One line of a rubric: what it is called and what it is worth. */
export interface RubricCriterion {
  /** Stable key, independent of the label so renaming a line keeps its score. */
  id: string;
  label: string;
  /** Points this line is worth. A whole number, 1–100. */
  max: number;
}

/** A scored line, snapshotted onto the result at Confirm. */
export interface RubricScore extends RubricCriterion {
  points: number;
}

/** The shipped starting point (director's own weighting, Sept 2026).
 *  Intonation leads because bad intonation is the first thing anyone hears
 *  and it undermines everything after it. */
export const DEFAULT_EXAM_RUBRIC: RubricCriterion[] = [
  { id: 'intonation', label: 'Intonation', max: 25 },
  { id: 'rhythm',     label: 'Rhythm',     max: 20 },
  { id: 'musicality', label: 'Musicality', max: 20 },
  { id: 'character',  label: 'Character',  max: 15 },
  { id: 'tempo',      label: 'Tempo',      max: 10 },
  { id: 'conduct',    label: 'Conduct',    max: 10 },
];

/** Most rubrics are built to total this, and the editor says so when one
 *  doesn't. It is a nudge, never a rule — a 60-point scale still grades. */
export const RUBRIC_TARGET_TOTAL = 100;
export const MAX_RUBRIC_CRITERIA = 12;
export const MAX_CRITERION_POINTS = 100;
export const MAX_CRITERION_LABEL = 40;

/**
 * Which rubric grades this assignment. `undefined` on the assignment means
 * nobody chose, so the grader's own default answers; an empty array means the
 * director turned rubric grading off for this exam and stays empty.
 */
export function resolveRubric(
  assignmentRubric: RubricCriterion[] | undefined,
  myDefault?: RubricCriterion[] | null,
): RubricCriterion[] {
  if (assignmentRubric) return assignmentRubric;
  return myDefault?.length ? myDefault : DEFAULT_EXAM_RUBRIC;
}

/**
 * Which rubric an ASSIGNMENT grades with — the resolution the grade sheet and
 * the assignment editor must agree on.
 *
 * A Playing Exam that never chose one grades with the director's default,
 * which is what "the existing exams adapt to this" means in practice: no
 * migration script, no backfill, nothing to run. Any other type stays
 * rubric-free until someone deliberately adds lines to it, so a Written Test
 * does not sprout Intonation.
 */
export function rubricForAssignment(
  assignment: { type: string; rubric?: RubricCriterion[] },
  myDefault?: RubricCriterion[] | null,
): RubricCriterion[] {
  if (assignment.rubric) return assignment.rubric;
  return assignment.type === 'Playing Exam' ? resolveRubric(undefined, myDefault) : [];
}

/**
 * The ONE reader of a picked value. Anything that is not a whole number
 * within the line's range reads as NOT SCORED rather than as a zero — same
 * fail-closed posture as `lessonGradeValue`, and the reason a half-filled
 * rubric can never quietly produce a failing total.
 */
export function criterionPointValue(v: unknown, max: number): number | null {
  const s = typeof v === 'number' ? String(v) : typeof v === 'string' ? v.trim() : '';
  if (!/^\d{1,3}$/.test(s)) return null;
  const n = Number(s);
  return n >= 0 && n <= max ? n : null;
}

export interface RubricTally {
  /** Points earned across the lines that are scored. */
  points: number;
  /** Points available across ALL lines, scored or not. */
  max: number;
  /** `points` as a whole-number percent of `max` — the gradebook number.
   *  Meaningless until `complete`; the UI shows it only then. */
  percent: number;
  scored: number;
  of: number;
  /** Every line has a number. Confirm stays disabled until this is true. */
  complete: boolean;
}

/** Add up a set of picks against a rubric. Never throws, never guesses. */
export function tallyRubric(
  criteria: RubricCriterion[],
  picks: Record<string, unknown> | undefined,
): RubricTally {
  let points = 0;
  let max = 0;
  let scored = 0;
  for (const c of criteria) {
    max += c.max;
    const v = criterionPointValue(picks?.[c.id], c.max);
    if (v === null) continue;
    points += v;
    scored += 1;
  }
  const of = criteria.length;
  return {
    points,
    max,
    percent: max > 0 ? Math.round((points / max) * 100) : 0,
    scored,
    of,
    complete: of > 0 && scored === of,
  };
}

/**
 * The snapshot to store on the result — or null when the rubric is not fully
 * scored, which is what keeps a partial rubric from ever being saved as a
 * grade. Labels and maxes ride along so the breakdown still reads correctly
 * after the assignment's rubric is re-weighted.
 */
export function rubricScores(
  criteria: RubricCriterion[],
  picks: Record<string, unknown> | undefined,
): RubricScore[] | null {
  const out: RubricScore[] = [];
  for (const c of criteria) {
    const v = criterionPointValue(picks?.[c.id], c.max);
    if (v === null) return null;
    out.push({ id: c.id, label: c.label, max: c.max, points: v });
  }
  return out.length ? out : null;
}

/** Read a stored breakdown back. Same arithmetic, so one screen can never
 *  disagree with another about what a saved grade adds up to. */
export function tallyScores(scores: RubricScore[] | undefined | null): RubricTally | null {
  if (!scores?.length) return null;
  const picks: Record<string, number> = {};
  for (const s of scores) picks[s.id] = s.points;
  return tallyRubric(scores, picks);
}

/** Turn a stored breakdown back into picks the editor can start from. */
export function scoresToPicks(scores: RubricScore[] | undefined | null): Record<string, number> {
  const picks: Record<string, number> = {};
  for (const s of scores ?? []) picks[s.id] = s.points;
  return picks;
}

/** True when a saved grade was given on a DIFFERENT set of lines than the
 *  assignment now carries, so the row can say so instead of pretending. */
export function rubricChangedSince(
  scores: RubricScore[] | undefined | null,
  criteria: RubricCriterion[],
): boolean {
  if (!scores?.length) return false;
  if (scores.length !== criteria.length) return true;
  return scores.some((s, i) => s.id !== criteria[i].id || s.max !== criteria[i].max);
}

/** A sentence naming what is wrong with an edited rubric, or null when it is
 *  saveable. Blocking problems only — a total that isn't 100 is fine. */
export function rubricProblem(criteria: RubricCriterion[]): string | null {
  if (criteria.length === 0) return null; // empty = rubric grading off, on purpose
  if (criteria.length > MAX_RUBRIC_CRITERIA) {
    return `A rubric holds at most ${MAX_RUBRIC_CRITERIA} lines.`;
  }
  const seen = new Set<string>();
  for (const c of criteria) {
    if (!c.label.trim()) return 'Every line needs a name.';
    if (c.label.trim().length > MAX_CRITERION_LABEL) {
      return `Keep a line's name under ${MAX_CRITERION_LABEL} characters.`;
    }
    if (!Number.isInteger(c.max) || c.max < 1 || c.max > MAX_CRITERION_POINTS) {
      return `"${c.label.trim()}" needs a whole number of points, 1–${MAX_CRITERION_POINTS}.`;
    }
    if (seen.has(c.id)) return 'Two lines share an id — remove one and add it again.';
    seen.add(c.id);
  }
  return null;
}

/** Points available across a rubric — shown live while it is being edited. */
export function rubricMax(criteria: RubricCriterion[]): number {
  return criteria.reduce((sum, c) => sum + (Number.isFinite(c.max) ? c.max : 0), 0);
}

/** An id no line in `existing` is using. Sequential and readable; a reused id
 *  can never corrupt an old grade because results snapshot their own lines. */
export function newCriterionId(existing: RubricCriterion[]): string {
  const taken = new Set(existing.map(c => c.id));
  for (let i = 1; i <= MAX_RUBRIC_CRITERIA + 1; i++) {
    const id = `c${i}`;
    if (!taken.has(id)) return id;
  }
  return `c${Date.now().toString(36)}`;
}

/** Strip an edited rubric down to what gets stored: trimmed labels, whole
 *  points. The editor calls this on save so no stray whitespace lands. */
export function normalizeRubric(criteria: RubricCriterion[]): RubricCriterion[] {
  return criteria.map(c => ({ id: c.id, label: c.label.trim(), max: Math.round(c.max) }));
}
