/**
 * Pins playing-exam rubric grading (#exam-rubric). Five promises here are
 * one-liners to break by accident, and every one of them changes a student's
 * grade if it goes:
 *
 *   1. A half-filled rubric produces NO grade. An unscored line is not a zero.
 *   2. `Assignment.rubric` has three states and an EMPTY list is not "absent"
 *      — it is the director turning rubric grading off for that exam.
 *   3. A grade snapshots the lines it was given, so re-weighting the exam's
 *      rubric afterwards cannot rewrite a grade already confirmed.
 *   4. The percent is rounded in exactly one place, so no two screens can
 *      show 89 and 90 for the same student.
 *   5. A rubric that does not total 100 still grades — the total is a nudge
 *      in the editor, never a gate.
 */
import {
  DEFAULT_EXAM_RUBRIC, RUBRIC_TARGET_TOTAL, MAX_RUBRIC_CRITERIA,
  criterionPointValue, tallyRubric, rubricScores, tallyScores, scoresToPicks,
  rubricChangedSince, rubricProblem, rubricMax, newCriterionId, normalizeRubric,
  resolveRubric, rubricForAssignment,
  type RubricCriterion,
} from './examRubric';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

// ── The shipped default is the director's rubric, and it totals 100 ──
assert(rubricMax(DEFAULT_EXAM_RUBRIC) === RUBRIC_TARGET_TOTAL, 'the shipped rubric totals 100');
assert(DEFAULT_EXAM_RUBRIC.length === 6, 'six lines');
assert(DEFAULT_EXAM_RUBRIC[0].id === 'intonation' && DEFAULT_EXAM_RUBRIC[0].max === 25,
  'intonation leads at 25 — the heaviest line');
assert(new Set(DEFAULT_EXAM_RUBRIC.map(c => c.id)).size === 6, 'ids are unique');
assert(rubricProblem(DEFAULT_EXAM_RUBRIC) === null, 'the shipped rubric is valid');

// ── 2. Three states of Assignment.rubric ──
const mine: RubricCriterion[] = [{ id: 'c1', label: 'Tone', max: 60 }, { id: 'c2', label: 'Rhythm', max: 40 }];
assert(resolveRubric(undefined, mine) === mine, 'absent falls back to the grader’s own default');
assert(resolveRubric(undefined, undefined) === DEFAULT_EXAM_RUBRIC, 'and to the shipped rubric when they have none');
assert(resolveRubric(undefined, []) === DEFAULT_EXAM_RUBRIC, 'an empty personal default is no default');
const ownRubric: RubricCriterion[] = [{ id: 'c1', label: 'Scales', max: 100 }];
assert(resolveRubric(ownRubric, mine) === ownRubric, 'the exam’s own rubric wins over the default');
assert(resolveRubric([], mine).length === 0,
  'an EMPTY rubric on the exam means rubric grading is OFF — never re-defaulted');

// A Playing Exam made before this feature existed grades with the director's
// rubric the moment they open it — that is the whole migration.
assert(rubricForAssignment({ type: 'Playing Exam' }, mine) === mine,
  'an existing playing exam adapts to the grader’s rubric with no migration');
assert(rubricForAssignment({ type: 'Playing Exam' }, undefined) === DEFAULT_EXAM_RUBRIC,
  'and to the shipped one when they have no default');
assert(rubricForAssignment({ type: 'Written Test' }, mine).length === 0,
  'a written test does NOT sprout a playing-exam rubric');
assert(rubricForAssignment({ type: 'Written Test', rubric: ownRubric }, mine) === ownRubric,
  'but any type may be given a rubric on purpose');
assert(rubricForAssignment({ type: 'Playing Exam', rubric: [] }, mine).length === 0,
  'and any exam may have rubric grading turned off');

// ── 1. A partial rubric is not a grade, and a blank line is not a zero ──
const partial = tallyRubric(DEFAULT_EXAM_RUBRIC, { intonation: 25, rhythm: 20 });
assert(partial.scored === 2 && partial.of === 6, 'the tally counts what is scored');
assert(!partial.complete, 'two of six is not complete');
assert(rubricScores(DEFAULT_EXAM_RUBRIC, { intonation: 25, rhythm: 20 }) === null,
  'a partial rubric saves NOTHING — an unscored line is not a zero');
assert(rubricScores(DEFAULT_EXAM_RUBRIC, {}) === null, 'an untouched rubric saves nothing');

// A real zero is a score, and it completes the rubric.
const zeroed = tallyRubric(DEFAULT_EXAM_RUBRIC,
  { intonation: 0, rhythm: 0, musicality: 0, character: 0, tempo: 0, conduct: 0 });
assert(zeroed.complete && zeroed.points === 0 && zeroed.percent === 0,
  'all zeros is a complete rubric worth zero — the director said so');
assert(rubricScores(DEFAULT_EXAM_RUBRIC,
  { intonation: 0, rhythm: 0, musicality: 0, character: 0, tempo: 0, conduct: 0 })?.length === 6,
  'and it saves');

// ── What a picked value may be ──
assert(criterionPointValue(25, 25) === 25 && criterionPointValue('25', 25) === 25, 'a whole number in range');
assert(criterionPointValue(' 12 ', 25) === 12, 'surrounding space is trimmed');
assert(criterionPointValue(26, 25) === null, 'above the line’s worth is not a score');
assert(criterionPointValue('12.5', 25) === null, 'a fraction is not a score');
assert(criterionPointValue('-3', 25) === null, 'negative is not a score');
assert(criterionPointValue('', 25) === null && criterionPointValue(undefined, 25) === null, 'blank is not a score');
assert(criterionPointValue('A', 25) === null, 'a letter is not a score');

// ── 4. One rounding, and the percent is out of what the rubric is worth ──
const full = tallyRubric(DEFAULT_EXAM_RUBRIC,
  { intonation: 25, rhythm: 20, musicality: 20, character: 15, tempo: 10, conduct: 10 });
assert(full.complete && full.points === 100 && full.percent === 100, 'full marks is 100');
const good = tallyRubric(DEFAULT_EXAM_RUBRIC,
  { intonation: 22, rhythm: 18, musicality: 17, character: 13, tempo: 9, conduct: 10 });
assert(good.points === 89 && good.percent === 89, 'a 100-point rubric scores its points directly');

// ── 5. A rubric that does not total 100 still grades, out of its own total ──
const sixty: RubricCriterion[] = [{ id: 'c1', label: 'Tone', max: 40 }, { id: 'c2', label: 'Rhythm', max: 20 }];
assert(rubricProblem(sixty) === null, 'a 60-point rubric is valid — the total is a nudge, not a gate');
const outOf60 = tallyRubric(sixty, { c1: 30, c2: 15 });
assert(outOf60.points === 45 && outOf60.max === 60 && outOf60.percent === 75,
  '45 of 60 is 75% — the gradebook number, not the raw points');
const rounds = tallyRubric(sixty, { c1: 30, c2: 14 });
assert(rounds.percent === 73, '44/60 rounds once, to 73');

// ── 3. A grade snapshots its own lines ──
const scores = rubricScores(DEFAULT_EXAM_RUBRIC,
  { intonation: 22, rhythm: 18, musicality: 17, character: 13, tempo: 9, conduct: 10 })!;
assert(scores.length === 6, 'every line is snapshotted');
assert(scores[0].label === 'Intonation' && scores[0].max === 25 && scores[0].points === 22,
  'each line carries its name AND its worth, not just the points');
const readBack = tallyScores(scores)!;
assert(readBack.points === 89 && readBack.percent === 89 && readBack.complete,
  'a stored breakdown reads back to the same number it was saved as');
assert(tallyScores([]) === null && tallyScores(undefined) === null, 'no breakdown, no tally');
assert(scoresToPicks(scores).intonation === 22, 'a stored grade reopens as picks');

// Re-weighting the assignment afterwards leaves the old grade alone and says so.
const reweighted: RubricCriterion[] = [
  { id: 'intonation', label: 'Intonation', max: 30 },
  ...DEFAULT_EXAM_RUBRIC.slice(1),
];
assert(rubricChangedSince(scores, reweighted), 'a changed weight is flagged on the old grade');
assert(rubricChangedSince(scores, DEFAULT_EXAM_RUBRIC.slice(0, 5)), 'a dropped line is flagged too');
assert(!rubricChangedSince(scores, DEFAULT_EXAM_RUBRIC), 'an unchanged rubric is not flagged');
assert(!rubricChangedSince(undefined, DEFAULT_EXAM_RUBRIC), 'an ungraded row is not flagged');
// A renamed line is NOT a different rubric — the id and the worth are what
// the points hang on, and results carry their own labels anyway.
const renamed: RubricCriterion[] = [
  { id: 'intonation', label: 'Pitch', max: 25 },
  ...DEFAULT_EXAM_RUBRIC.slice(1),
];
assert(!rubricChangedSince(scores, renamed), 'renaming a line does not invalidate a grade');
assert(tallyScores(scores)!.points === 89, 'and the old grade still adds up to what it did');

// ── The editor's guard rails ──
assert(rubricProblem([]) === null, 'an empty rubric is allowed — it means "no rubric"');
assert(rubricProblem([{ id: 'c1', label: '  ', max: 10 }]) !== null, 'a nameless line is refused');
assert(rubricProblem([{ id: 'c1', label: 'Tone', max: 0 }]) !== null, 'a zero-point line is refused');
assert(rubricProblem([{ id: 'c1', label: 'Tone', max: 10.5 }]) !== null, 'a fractional worth is refused');
assert(rubricProblem([{ id: 'c1', label: 'Tone', max: 101 }]) !== null, 'over 100 points on one line is refused');
assert(rubricProblem([{ id: 'c1', label: 'A', max: 5 }, { id: 'c1', label: 'B', max: 5 }]) !== null,
  'duplicate ids are refused — they would share a score');
assert(rubricProblem(Array.from({ length: MAX_RUBRIC_CRITERIA + 1 },
  (_, i) => ({ id: `c${i}`, label: `L${i}`, max: 5 }))) !== null, 'too many lines is refused');
assert(newCriterionId(DEFAULT_EXAM_RUBRIC) === 'c1', 'a fresh id avoids the ones in use');
assert(newCriterionId([{ id: 'c1', label: 'A', max: 5 }]) === 'c2', 'and keeps counting');
assert(normalizeRubric([{ id: 'c1', label: '  Tone  ', max: 10.4 }])[0].label === 'Tone',
  'labels are trimmed on save');
assert(normalizeRubric([{ id: 'c1', label: 'Tone', max: 10.4 }])[0].max === 10,
  'points are stored whole');

console.log('examRubric.selfcheck: OK');
