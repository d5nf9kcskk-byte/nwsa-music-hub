/**
 * Pins ensemble grading (#gradebook). Run:
 *   npx tsx src/shared/ensembleGrades.selfcheck.ts
 *
 * What is pinned here is what a wrong answer costs: a grade in a district
 * gradebook. Every assertion below is a rule somebody could "simplify" in an
 * afternoon and nobody would notice until a parent asked.
 */
import {
  COVERAGE_FLOOR, FULL_MARKS, attendanceByStudent, byLastName, commentReasons, concertSuggestion,
  conductValue, effortValue, examEvidence, fillValueFor, gradeValue, lastFirst, lastName,
  displayName, meetingsHeld, parseName, planProblem, rowReadiness, tallyGrade,
  type GradeCategory, type MarkLike,
} from './ensembleGrades.ts';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

/** The NWSA orchestra plan, as config carries it. */
const PLAN: GradeCategory[] = [
  { id: 'attendance', label: 'Attendance & Punctuality', weight: 30 },
  { id: 'prep', label: 'Preparation & Participation', weight: 10 },
  { id: 'exams', label: 'Playing Exams', weight: 15, suggest: 'exams' },
  { id: 'performance', label: 'Performance', weight: 20 },
  { id: 'concerts', label: 'Required Performance Attendance', weight: 15, suggest: 'concerts' },
  { id: 'professionalism', label: 'Professionalism', weight: 10 },
];

assert(PLAN.reduce((s, c) => s + c.weight, 0) === 100, 'the shipped plan totals 100');

/* ── a blank is never a zero ───────────────────────────────────────────── */

assert(gradeValue('86') === 86, 'a whole number reads');
assert(gradeValue(86) === 86, 'a number reads');
assert(gradeValue(' 0 ') === 0, 'zero is a real grade, not a blank');
assert(gradeValue('') === null, 'blank is not scored');
assert(gradeValue('B') === null, 'a letter is not scored — this is a 0-100 scale');
assert(gradeValue('95.5') === null, 'a fraction is not scored');
assert(gradeValue('-5') === null && gradeValue('1000') === null, 'out of range is not scored');
assert(gradeValue(null) === null && gradeValue(undefined) === null, 'nothing is not scored');

/* ── the weighted grade re-normalizes over what is scored ──────────────── */

const full = tallyGrade(PLAN, {
  attendance: 100, prep: 71, exams: 88, performance: 95, concerts: 100, professionalism: 90,
});
assert(full.complete, 'every category scored is complete');
assert(full.scoredWeight === 100 && full.totalWeight === 100, 'all the weight is scored');
assert(
  full.percent === Math.round((100 * 30 + 71 * 10 + 88 * 15 + 95 * 20 + 100 * 15 + 90 * 10) / 100),
  'the weighted mean is the workbook formula, verbatim',
);

const partial = tallyGrade(PLAN, { attendance: 100, prep: 80, performance: 90 });
assert(!partial.complete, 'a partial plan is not complete');
assert(partial.scoredWeight === 60, 'only the scored categories carry weight');
assert(
  partial.percent === Math.round((100 * 30 + 80 * 10 + 90 * 20) / 60),
  'an unscored category leaves the numerator AND the denominator — an interim is not '
  + 'punished for an exam that has not happened yet',
);

const zeros = tallyGrade(PLAN, { attendance: 0, prep: 0, exams: 0, performance: 0, concerts: 0, professionalism: 0 });
assert(zeros.percent === 0, 'a real row of zeros is a real zero — only BLANKS drop out');

/* ── the coverage floor ────────────────────────────────────────────────── */

const thin = tallyGrade(PLAN, { attendance: 94 });
assert(thin.scoredWeight === 30, 'one category out of six');
assert(
  thin.percent === null,
  'below the coverage floor there is NO percent: a confident 94 built from attendance alone, '
  + 'arriving in a district gradebook, is the worst thing this module could produce',
);
assert(tallyGrade(PLAN, {}).percent === null, 'nothing scored is not a zero');
assert(COVERAGE_FLOOR === 0.5, 'the floor is half the plan');
assert(
  tallyGrade(PLAN, { attendance: 90, performance: 90 }).percent === 90,
  'exactly at the floor (50 of 100) does produce a grade',
);

/* ── what the Fill button writes ───────────────────────────────────────── */

const attendanceCat = PLAN[0];
const examsCat = PLAN[2];

assert(
  fillValueFor(attendanceCat, null) === FULL_MARKS,
  'a judgement category fills at FULL MARKS, and the director adjusts down — the same '
  + 'exception-only shape as taking roll',
);
assert(FULL_MARKS === 100, 'full marks is 100');
assert(
  fillValueFor({ ...attendanceCat, fillWith: 85 }, null) === 85,
  'a category can name its own starting value',
);
assert(
  fillValueFor({ ...attendanceCat, fillWith: 0 }, null) === 0,
  'including zero, which must not be read as "unset"',
);
assert(
  fillValueFor(examsCat, 88) === 88,
  'a computed category fills with its suggestion, never with full marks',
);
assert(
  fillValueFor(examsCat, null) === null,
  'and fills NOTHING when there is no suggestion — an ungraded exam must never be '
  + 'filled at 100 any more than it is counted as a zero',
);

/* ── effort and conduct read the district's scales, and nothing else ───── */

assert(effortValue('1') === '1' && effortValue(3) === '3', 'effort is 1 to 3');
assert(effortValue('0') === null && effortValue('4') === null, 'and nothing outside it');
assert(conductValue('a') === 'A', 'conduct is case-insensitive on the way in');
assert(conductValue('E') === null, 'there is no conduct grade E');
assert(conductValue('') === null, 'blank conduct is not a grade');

/* ── the district's comment triggers ───────────────────────────────────── */

const reasons = (percent: number | null, effort: string | null, conduct: string | null) =>
  commentReasons({
    percent,
    effort: effortValue(effort),
    conduct: conductValue(conduct),
  }).join(',');

assert(reasons(79, '2', 'A') === 'Academic', '79 needs a reason');
assert(reasons(80, '2', 'A') === '', '80 does not');
assert(reasons(90, '3', 'A') === 'Effort', 'effort 3 needs a reason');
assert(reasons(90, '2', 'C') === 'Conduct', 'conduct C needs a reason');
assert(reasons(90, '2', 'F') === 'Conduct', 'and so does anything below it');
assert(reasons(90, '2', 'B') === '', 'B does not');
assert(reasons(70, '3', 'D') === 'Academic,Effort,Conduct', 'all three can fire at once');
assert(
  reasons(null, '2', 'A') === '',
  'a student with no grade yet does NOT trip the academic rule — an ungraded student is not a failing one',
);

/* ── readiness ─────────────────────────────────────────────────────────── */

const ready = (percent: number | null, effort: string | null, conduct: string | null, codes: string[]) =>
  rowReadiness({ percent, effort: effortValue(effort), conduct: conductValue(conduct), codes });

assert(ready(null, '1', 'A', []) === 'no-grade', 'no grade is not ready');
assert(ready(90, null, 'A', []) === 'missing-effort-conduct', 'effort is required on every row');
assert(ready(90, '1', null, []) === 'missing-effort-conduct', 'so is conduct');
assert(ready(75, '1', 'A', []) === 'needs-code', 'a 75 with no code is not ready');
assert(ready(75, '1', 'A', ['14']) === 'ok', 'a 75 with a code is');
assert(ready(90, '1', 'A', []) === 'ok', 'an ordinary row needs no code');

/* ── attendance evidence: four buckets, kept apart ─────────────────────── */

const mark = (studentId: string, date: string, status: string, ensembleId = 'cam'): MarkLike =>
  ({ studentId, ensembleId, date, status });

const WINDOW = { from: '2026-08-13', through: '2026-09-15' };
const marks: MarkLike[] = [
  mark('s1', '2026-08-20', 'Absent'),
  mark('s1', '2026-08-21', 'Absent'),
  mark('s1', '2026-08-24', 'Excused'),
  mark('s1', '2026-08-25', 'Late'),
  mark('s1', '2026-08-26', 'LateExcused'),
  mark('s1', '2026-08-27', 'Lesson'),
  mark('s1', '2026-09-20', 'Absent'),               // after the cutoff
  mark('s1', '2026-08-01', 'Absent'),               // before the quarter
  mark('s1', '2026-08-28', 'Absent', 'symphony'),   // another group
  mark('s2', '2026-08-20', 'Excused'),
];
const tally = attendanceByStudent(marks, 'cam', WINDOW);

assert(tally.s1.absent === 2, 'unexcused absences inside the window, in this group, only');
assert(tally.s1.excused === 1, 'excused absences are counted SEPARATELY — they cost nothing');
assert(tally.s1.late === 1, 'unexcused lateness has its own bucket');
assert(tally.s1.lateExcused === 1, 'and so does excused lateness');
assert(
  tally.s1.lesson === 1 && tally.s1.absent === 2,
  'a lesson pull-out is never an absence (#applied)',
);
assert(tally.s2.absent === 0 && tally.s2.excused === 1, 'a second student tallies independently');

/* ── meetings held is the ROLL RECEIPT, not the calendar ───────────────── */

const events = [
  { date: '2026-08-20', rollTaken: { cam: { at: 1, absent: 2 } } },
  { date: '2026-08-21', rollTaken: { cam: { at: 1, absent: 0 } } },
  { date: '2026-08-24', rollTaken: { symphony: { at: 1, absent: 1 } } },
  { date: '2026-08-25' },                                  // scheduled, never rolled
  { date: '2026-08-26', rollTaken: {} },                   // rolled for nobody
  { date: '2026-09-20', rollTaken: { cam: { at: 1, absent: 0 } } },  // after the cutoff
];
assert(
  meetingsHeld(events, 'cam', WINDOW) === 2,
  'only rehearsals with a roll receipt FOR THIS GROUP inside the window count — a cancelled or '
  + 'never-rolled rehearsal is not a meeting anybody missed',
);

/* ── the two suggestions ───────────────────────────────────────────────── */

const exams = examEvidence([{ score: '88' }, { score: '' }, { score: '92' }], 3);
assert(exams.scores.join(',') === '88,92', 'only the exams that show a grade are read');
assert(exams.of === 3, 'and the screen can still say 2 of 3');
assert(exams.suggested === 90, 'the suggestion is the mean of the graded ones, not of three');
assert(examEvidence([{ score: '' }], 1).suggested === null, 'no graded exam suggests nothing, not zero');

assert(concertSuggestion(2, 3) === 67, 'credited over held');
assert(concertSuggestion(0, 3) === 0, 'none of three is a real zero');
assert(concertSuggestion(0, 0) === null, 'before any required concert is held there is nothing to suggest');
assert(concertSuggestion(4, 3) === 100, 'credit beyond the requirement does not exceed 100');

/* ── names, and the order the district asks for ────────────────────────── */

// The roster stores names BOTH ways. Verified against the live data on
// 2026-09-14: 120 of 142 active students as "Rose, William F." and 22 as
// "Vincent T. Blades", with every student on the two district tables in the
// comma form. A parser that handled only one of them put the middle initial
// in the Last Name column and sorted the whole table by it.

// "Last, First" — the form the district tables are actually stored in.
assert(parseName('Rose, William F.').last === 'Rose', 'comma form: surname before the comma');
assert(parseName('Rose, William F.').first === 'William F.', 'comma form: the rest after it');
assert(displayName('Rose, William F.') === 'William F. Rose', 'Full Name reads First Last');
assert(lastName('Beyra, Benjamin A.') === 'Beyra', 'the Last Name column is the SURNAME');
assert(
  lastName('Beyra, Benjamin A.') !== 'A.',
  'and emphatically not the middle initial, which is what the old parser printed',
);
assert(lastFirst('Rose, William F.') === 'Rose, William F.', 'already Last, First stays put');

// "First Last" — the other 22.
assert(parseName('Vincent T. Blades').last === 'Blades', 'space form: the last word is the surname');
assert(displayName('Vincent T. Blades') === 'Vincent T. Blades', 'and it displays unchanged');
assert(lastFirst('Emily Block') === 'Block, Emily', 'Last, First');
assert(lastFirst('Flavio Adamo Carrillo') === 'Carrillo, Flavio Adamo', 'middle names stay with the first');
assert(lastName('Isabella Chander') === 'Chander', 'the surname alone');

// Edges.
assert(lastFirst('Prince') === 'Prince', 'a single-word name keeps all of itself');
assert(lastName('Prince') === 'Prince', 'and sorts as a surname rather than as nothing');
assert(displayName('') === '' && lastName('') === '', 'an empty name never throws');
assert(parseName('  Rose ,  William  F.  ').first === 'William F.', 'stray spacing is forgiven');

// Both forms sort into ONE list, which is the case that actually matters: a
// mixed roster must not put every comma-stored name in a separate block.
assert(
  ['Chan, Ryu', 'David Antia', 'Block, Emily', 'Vincent T. Blades'].sort(byLastName).join(' / ')
    === 'David Antia / Vincent T. Blades / Block, Emily / Chan, Ryu',
  'alphabetical by surname across both storage forms — requirement number one',
);

/* ── plan validation ───────────────────────────────────────────────────── */

assert(planProblem(PLAN) === null, 'the shipped plan is valid');
assert(planProblem([]) === null, 'an EMPTY plan is grading turned off on purpose, not an error');
assert(planProblem([{ id: 'a', label: '', weight: 10 }]) !== null, 'a nameless category is an error');
assert(planProblem([{ id: 'a', label: 'A', weight: 0 }]) !== null, 'a zero-weight category is an error');
assert(
  planProblem([{ id: 'a', label: 'A', weight: 10 }, { id: 'a', label: 'B', weight: 10 }]) !== null,
  'two categories sharing an id would put one score in the other row',
);

console.log('ensembleGrades.selfcheck: all assertions passed');
