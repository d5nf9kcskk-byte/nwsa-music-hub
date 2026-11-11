/**
 * Pins the Gradebook (#gradebook). Run:
 *   npx tsx src/director/grades/gradeTable.selfcheck.ts
 *
 * The world is the real Q1 2026 calendar in miniature: a Symphony member
 * performs at Pops, Festival I and the Midnight Ball (none marked Required),
 * sits in the audience at the College Chamber Orchestra concert and the
 * faculty recital (both Required), and a senior is excused from the audience
 * one. Sections A1-A7 are the acceptance tests of the Nov 2026 rebuild,
 * word for word; the rest are rules a tidy-up could break while the screen
 * still looked right.
 */
import { readFileSync } from 'node:fs';
import {
  TABLE_DOC, buildTable, gridRows, offKey, rosterFor, tableSpecs, type TableInput, type TableModel,
} from './gradeTable';
import { itemKey, tallyGrade, type GradeCategory } from '../../shared/ensembleGrades';
import { buildTable as buildReport, type ReportLayout } from '../../shared/interimReport';
import type { Assignment, AttendanceRecord, CalendarEvent, Student } from '../types';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

const SYM = 'symphony-orchestra';
const CAM = 'camerata-string-orchestra';
const CCO = 'college-chamber-orchestra';

const PLAN: GradeCategory[] = [
  { id: 'attendance', label: 'Attendance & Punctuality', weight: 30, showsRoll: true },
  { id: 'prep', label: 'Preparation & Participation', weight: 10 },
  { id: 'exams', label: 'Playing Exams', weight: 15, suggest: 'exams', assignmentTypes: ['Playing Exam', 'Written Test', 'Other'] },
  { id: 'performance', label: 'Performance', weight: 20, assignmentTypes: ['Performance'] },
  { id: 'concerts', label: 'Required Performance Attendance', weight: 15, suggest: 'concerts' },
  { id: 'professionalism', label: 'Professionalism', weight: 10 },
];
const APPLIED: GradeCategory[] = [{ id: 'lessons', label: 'Lesson average', weight: 100, suggest: 'lessons' }];

const student = (id: string, ensembleIds: string[], grade = '10'): Student =>
  ({ id, name: id, status: 'Active', ensembleIds, grade }) as unknown as Student;
const s1 = student('s1', [SYM]);
const s2 = student('s2', [SYM]);
const s3 = student('s3', [SYM], '12');           // a senior
const roster = [s1, s2, s3].map(s => ({ student: s, instrument: 'Violin' }));

const ev = (id: string, date: string, extra: Partial<CalendarEvent> = {}): CalendarEvent =>
  ({ id, type: 'Concert', ensembleIds: [], date, status: 'Scheduled', ...extra }) as unknown as CalendarEvent;

const events: CalendarEvent[] = [
  ev('recital', '2026-08-31', {
    attendanceEnsembleIds: [SYM, CAM], concertAttendance: 'required', checkin: { entryOnly: true, enabled: true },
  } as Partial<CalendarEvent>),
  ev('pops', '2026-09-28', { ensembleIds: [SYM, 'wind'] }),
  ev('cco', '2026-09-29', {
    ensembleIds: [CCO], attendanceEnsembleIds: [SYM, CAM], attendanceExcusedGrades: ['12'], concertAttendance: 'required',
  } as Partial<CalendarEvent>),
  ev('fest', '2026-10-03', { ensembleIds: [SYM], rollTaken: { [SYM]: { at: 1, absent: 1 } } } as Partial<CalendarEvent>),
  ev('ball', '2026-10-06', { ensembleIds: [SYM] }),
  ev('wind-only', '2026-09-30', { ensembleIds: ['wind'] }),
  ev('cancelled', '2026-09-15', { ensembleIds: [SYM], status: 'Cancelled' }),
  ev('later', '2026-10-26', { ensembleIds: [SYM] }),                       // next quarter
  { id: 'reh1', type: 'Rehearsal', ensembleIds: [SYM], date: '2026-09-01', rollTaken: { [SYM]: { at: 1, absent: 0 } } } as unknown as CalendarEvent,
  { id: 'reh2', type: 'Rehearsal', ensembleIds: [SYM], date: '2026-09-02', rollTaken: { [SYM]: { at: 1, absent: 0 } } } as unknown as CalendarEvent,
];

const checkins = [
  { eventId: 'cco', studentId: 's1', kind: 'in' }, { eventId: 'cco', studentId: 's1', kind: 'out' },
  { eventId: 'cco', studentId: 's2', kind: 'in' },
  { eventId: 'recital', studentId: 's1', kind: 'in' },
];
const records = [
  { id: 'r1', studentId: 's2', ensembleId: SYM, eventId: 'fest', date: '2026-10-03', status: 'Absent' },
  { id: 'r2', studentId: 's2', ensembleId: SYM, eventId: 'reh1', date: '2026-09-01', status: 'Late' },
] as unknown as AttendanceRecord[];

const exam = (id: string, due: string, extra: Partial<Assignment> = {}): Assignment =>
  ({ id, title: id, type: 'Playing Exam', dueDate: due, ensembleIds: [SYM], ...extra }) as unknown as Assignment;
const assignments: Assignment[] = [
  exam('ex1', '2026-09-10'),
  exam('ex2', '2026-09-23'),
  exam('wt', '2026-09-20', { type: 'Written Test' }),
  exam('other-group', '2026-09-12', { ensembleIds: [CAM] }),
  exam('next-quarter', '2026-11-02'),
];
const results = [
  { assignmentId: 'ex1', studentId: 's1', score: '90' }, { assignmentId: 'ex2', studentId: 's1', score: '80' },
  { assignmentId: 'ex1', studentId: 's2', score: '70' }, { assignmentId: 'ex2', studentId: 's2', score: '88.5' },
  { assignmentId: 'other-group', studentId: 's1', score: '10' },
  { assignmentId: 'next-quarter', studentId: 's1', score: '10' },
];

const base: TableInput = {
  ensembleId: SYM,
  plan: PLAN,
  span: { from: '2026-08-13', through: '2026-10-14' },
  period: { start: '2026-08-13', end: '2026-10-16' },
  today: '2026-10-14',
  roster,
  marks: {},
  events, records, checkins, assignments, results,
  lessonAverages: {},
  pulledFrom: () => false,
};
const table = (over: Partial<TableInput> = {}) => buildTable({ ...base, ...over });
const row = (t: TableModel, id: string) => t.rows.find(r => r.student.id === id)!;
const keys = (t: TableModel, kind?: string) => t.columns.filter(c => !kind || c.kind === kind).map(c => c.key).join();
const K = (kind: 'exam' | 'concert', id: string) => itemKey(kind, id);

/* ── 1. Hub grades arrive by themselves, as columns in date order ──────── */

const t0 = table();
assert(keys(t0, 'exam') === `${K('exam', 'ex1')},${K('exam', 'ex2')}`,
  'every graded assignment of the quarter is a column with nobody adding it; an ungraded written test, another '
  + 'group\'s exam and next quarter\'s are not');
assert(keys(t0, 'concert') === ['recital', 'pops', 'cco', 'fest', 'ball'].map(id => K('concert', id)).join(),
  'every concert required of someone on the table is a column, in date order — not a cancelled one, a Wind-only one '
  + 'or next quarter\'s');
assert(t0.columns.every(c => c.counting), 'every Hub column counts until someone switches it off');
const ex1Col = t0.columns.find(c => c.key === K('exam', 'ex1'))!;
assert(ex1Col.graded === 2 && ex1Col.of === 3 && ex1Col.categoryId === 'exams', 'its header can say "Graded 2 of 3"');
const ex2Col = t0.columns.find(c => c.key === K('exam', 'ex2'))!;
assert(ex2Col.graded === 1, 'a score the Hub cannot read as a whole 0-100 is not "graded"');
assert(row(t0, 's2').cells[K('exam', 'ex2')].value === null && row(t0, 's2').cells[K('exam', 'ex2')].raw === '88.5'
  && row(t0, 's2').cells[K('exam', 'ex2')].blank === 'unreadable', 'and the cell says what the Hub holds instead');
assert(row(t0, 's1').cats.exams.value === 85 && row(t0, 's2').cats.exams.value === 70,
  'a category is the mean of the items actually graded for THAT student');

// Concerts, unchanged rules (#concert-roll).
assert(row(t0, 's1').cats.concerts.value === 100, 'a student present at everything reads 100');
assert(row(t0, 's2').cats.concerts.value === 50, 'mean of 0, 100, 50, 0, 100 — a missed concert is a real zero');
assert(row(t0, 's3').cells[K('concert', 'cco')].value === null && row(t0, 's3').cells[K('concert', 'cco')].blank === 'excused',
  'a senior excused from the audience requirement is blank for it, and the cell says excused');
const ccoCol = t0.columns.find(c => c.key === K('concert', 'cco'))!;
assert(ccoCol.graded === 2 && ccoCol.of === 3, 'graded 2 of the 3 it was required of');

assert(row(t0, 's1').cats.prep.value === null && !('prep' in row(t0, 's1').scores),
  'a judgement box nobody filled is NOT scored — a blank is never a zero');
assert(t0.judgement.has('prep') && t0.judgement.has('performance') && !t0.judgement.has('exams')
  && !t0.judgement.has('concerts'), 'Fill reaches only the boxes a person fills — never exams or concerts, graded or not');
assert(row(t0, 's2').att.late === 1 && row(t0, 's2').att.meetings === 2, 'the roll is there to read beside Attendance');

/* ── A1. Grade 1 student of 78 on a new playing exam ──────────────────── */

const big = Array.from({ length: 78 }, (_, n) => student(`m${n}`, [SYM]));
const bigRoster = big.map(s => ({ student: s, instrument: 'Viola' }));
const bigBase: Partial<TableInput> = { roster: bigRoster, checkins: [], records: [], events: [], results: [] };
const before = table({ ...bigBase, assignments: [...assignments, exam('new', '2026-10-01')] });
assert(!before.columns.some(c => c.refId === 'new'), 'an exam nobody is graded on yet has no column');
const after = table({
  ...bigBase, assignments: [...assignments, exam('new', '2026-10-01')],
  results: [{ assignmentId: 'new', studentId: 'm7', score: '93' }],
});
const newCol = after.columns.find(c => c.refId === 'new')!;
assert(newCol && newCol.graded === 1 && newCol.of === 78, 'A1: the column exists the moment ONE student is graded: 1 of 78');
assert(row(after, 'm7').cells[newCol.key].value === 93, 'A1: that cell shows the grade');
assert(after.rows.filter(r => r.cells[newCol.key].value === null && r.cells[newCol.key].blank === 'not-graded').length === 77,
  'A1: the other 77 cells are blank, "not graded yet"');
assert(row(after, 'm7').cats.exams.value === 93, 'A1: that student\'s exam average is that one grade');
assert(after.rows.filter(r => r.student.id !== 'm7').every(r => {
  const b = row(before, r.student.id);
  return JSON.stringify(b.cats) === JSON.stringify(r.cats) && b.final === r.final;
}), 'A1: no other student\'s numbers moved');

/* ── A2. A college student, graded on an exam given through the Hub ───── */

const c1 = { ...student('c1', [SYM, CCO], 'College Sophomore'), name: 'Rivera, Ana' } as Student;
const h1 = { ...student('h1', [SYM]), name: 'Bloom, Eli' } as Student;
const people = [c1, h1];
const orchestra: ReportLayout = {
  id: 'orchestra', title: 'Orchestra', source: { kind: 'ensemble', ensembleId: SYM },
  headerColor: '#4472c4', conductLabel: 'Conduct', columns: ['fullName', 'grade', 'effort', 'conduct', 'codes'],
};
const symExam = exam('sym-ex', '2026-09-30');
const graded = [{ assignmentId: 'sym-ex', studentId: 'c1', score: '88' }, { assignmentId: 'sym-ex', studentId: 'h1', score: '75' }];
const specs = tableSpecs({
  reports: [orchestra],
  ensembles: [
    { id: SYM, name: 'Symphony Orchestra' },
    { id: CCO, name: 'College Chamber Orchestra', collegeLevel: true },
  ],
  students: people, assignments: [symExam], results: graded,
  period: base.period, assigned: null,
});
const hsSpec = specs.find(t => t.id === 'orchestra')!;
const colSpec = specs.find(t => t.id === `college:${SYM}`)!;
assert(hsSpec.world === 'hs' && colSpec?.world === 'college' && colSpec.groupKey === `college:${SYM}`,
  'A2: a college student in Symphony gets a "Symphony · College" table, filed under its own group key');
assert(specs.some(t => t.id === `college:${CCO}`), 'A2: and every college ensemble gets one');
const rosterOf = (spec: typeof hsSpec) => rosterFor({
  spec, students: people, lessons: [], assignedStudentIds: [], span: base.span,
});
assert(rosterOf(hsSpec).map(r => r.student.id).join() === 'h1', 'A2: a high school table never holds a college student');
assert(rosterOf(colSpec).map(r => r.student.id).join() === 'c1', 'A2: a college table never holds a high schooler');

const collegeTable = (res: typeof graded) => table({
  roster: rosterOf(colSpec), assignments: [symExam], results: res, checkins: [], records: [], events: [],
  marks: { c1: { scores: { attendance: 100, prep: 100, performance: 100, professionalism: 100 } } },
});
const cBefore = collegeTable([]);
const cAfter = collegeTable(graded);
assert(row(cAfter, 'c1').cells[K('exam', 'sym-ex')].value === 88,
  'A2: the Symphony exam lands in the college student\'s college table — the grade follows the student');
assert(row(cBefore, 'c1').final !== row(cAfter, 'c1').final && row(cAfter, 'c1').final === Math.round((100 * 70 + 88 * 15) / 85),
  'A2: and moves their college final grade');
const hsModel = table({ roster: rosterOf(hsSpec), assignments: [symExam], results: graded, checkins: [], records: [], events: [] });
assert(hsModel.rows.every(r => r.student.id !== 'c1'), 'A2: it is in no high school table');
const email = buildReport(orchestra, 'Q1i', hsModel.rows.map(r => ({
  studentId: r.student.id, name: r.student.name, percent: r.final, effort: null, conduct: null, codes: [],
})));
assert(!JSON.stringify(email).includes('Rivera'), 'A2: and not in the high school email');

/* ── A3. A regrade reaches everything with no manual step ──────────────── */

const regraded = collegeTable([{ assignmentId: 'sym-ex', studentId: 'c1', score: '60' }]);
const grid = gridRows(regraded, PLAN, s => s.name);
assert(row(regraded, 'c1').cells[K('exam', 'sym-ex')].value === 60 && row(regraded, 'c1').cats.exams.value === 60,
  'A3: the cell and the category show the new grade');
assert(row(regraded, 'c1').final === Math.round((100 * 70 + 60 * 15) / 85), 'A3: so does the final grade');
assert(grid[1].includes('60') && grid[1][grid[1].length - 1] === String(row(regraded, 'c1').final),
  'A3: and the export, read from the same model');

/* ── A4. A hand-made column never changes which Hub items count ───────── */

const sight = 'x:exams:Sight reading';
const withOwn = table({ marks: { [TABLE_DOC]: { scores: { [sight]: null } }, s1: { scores: { [sight]: 70 } } } });
assert(keys(withOwn, 'exam') === keys(t0, 'exam') && keys(withOwn, 'concert') === keys(t0, 'concert')
  && withOwn.columns.filter(c => c.kind !== 'custom').every(c => c.counting),
  'A4: adding a column of one\'s own adds that column and nothing starts or stops counting');
assert(row(withOwn, 's2').cats.exams.value === row(t0, 's2').cats.exams.value,
  'A4: a student with nothing typed in it keeps exactly the same average');
assert(row(withOwn, 's1').cats.exams.value === Math.round((90 + 80 + 70) / 3), 'A4: a typed one is one more item');
// The old mode flip: an exam column for ex1 alone used to drop ex2 out of the box.
const legacyOne = table({ marks: { s1: { scores: { [K('exam', 'ex1')]: null } } } });
assert(row(legacyOne, 's1').cats.exams.value === 85, 'A4: an old one-exam column no longer drops the other exam');

/* ── A5. An ungraded item is never a zero, anywhere ───────────────────── */

const g0 = gridRows(t0, PLAN, s => s.name);
const s3line = g0.find(r => r[0] === 's3')!;
const exIdx = g0[0].indexOf('ex1');
assert(s3line[exIdx] === '' && s3line[g0[0].indexOf('Playing Exams')] === '',
  'A5: an ungraded exam is an empty cell in the export, and so is the average built on nothing');
assert(s3line[s3line.length - 1] === '', 'A5: a student below the coverage floor has a blank final, not a zero');
assert(!t0.rows.some(r => Object.values(r.cells).some(c => c.value === 0 && c.typed === null && c.live === null)),
  'A5: no cell reads zero without the Hub or a person saying zero');
const emailBlank = buildReport(orchestra, 'Q1i', [{ studentId: 's3', name: 's3', percent: row(t0, 's3').final, effort: null, conduct: null, codes: [] }]);
assert(emailBlank.rows[0][1] === '', 'A5: and the email cell is blank');

/* ── 2. Typing over the Hub, and going back ──────────────────────────── */

const typed = table({ marks: { s2: { scores: { [K('exam', 'ex1')]: 50, exams: 99 } } } });
const cell = row(typed, 's2').cells[K('exam', 'ex1')];
assert(cell.typed === 50 && cell.live === 70 && cell.value === 50,
  'a typed cell wins and the Hub\'s number is still known ("You typed 50. The Hub says 70.")');
assert(row(typed, 's2').cats.exams.typed === 99 && row(typed, 's2').cats.exams.derived === 50
  && row(typed, 's2').cats.exams.value === 99, 'a number typed into the box wins over its columns, which are still known');
const typedOnGone = table({ marks: { s1: { scores: { [K('exam', 'gone')]: 77 } } } });
assert(typedOnGone.columns.some(c => c.label === 'Deleted assignment') && row(typedOnGone, 's1').cats.exams.value === Math.round((90 + 80 + 77) / 3),
  'a number typed under a deleted assignment is kept, labelled, and still counts');
const nullOnly = table({ marks: { s1: { scores: { [K('concert', 'wind-only')]: null } } } });
assert(!nullOnly.columns.some(c => c.refId === 'wind-only'), 'an old empty column marker for a non-required concert draws nothing');

/* ── 3. "Not counting" — visible, greyed, and out of the average ──────── */

const off = table({ marks: { [TABLE_DOC]: { scores: { [offKey(K('exam', 'ex2'))]: 1 } } } });
const offCol = off.columns.find(c => c.key === K('exam', 'ex2'))!;
assert(offCol && !offCol.counting, 'a switched-off Hub column is still on the table');
assert(row(off, 's1').cats.exams.value === 90, 'and leaves the average: only ex1 (90) counts for s1');
assert(row(off, 's1').cells[K('exam', 'ex2')].value === 80, 'while its grade is still shown');
assert(gridRows(off, PLAN, s => s.name)[0].includes('ex2 (not counting)'), 'and the export says so');

/* ── 4. Columns of one's own, and penalties ───────────────────────────── */

const phone = 'd:professionalism:2:Phone out in class';
const t3 = table({
  marks: {
    [TABLE_DOC]: { scores: { [phone]: null } },
    s1: { scores: { professionalism: 100, [phone]: 3 } },
    s2: { scores: { [phone]: 3 } },
  },
});
const ph = t3.columns.find(c => c.key === phone)!;
assert(ph.kind === 'tally' && ph.points === 2 && ph.categoryId === 'professionalism', 'a penalty column knows its cost and category');
assert(row(t3, 's1').cats.professionalism.value === 94, 'filled at 100, three at 2 points each: 94');
assert(row(t3, 's2').cats.professionalism.value === null, 'penalties alone never CREATE a grade');
assert(row(t3, 's3').counts[phone] === 0, 'a blank count is none');
assert(t3.judgement.has('professionalism'), 'a box with only a penalty column is still one a person fills');
const ghost = table({ marks: { s1: { scores: { 'x:nowhere:Ghost': 90 } } } });
assert(!ghost.columns.some(c => c.label === 'Ghost'), 'a column filed under a category this plan lacks is ignored');

/* ── 5. Lessons are live ─────────────────────────────────────────────── */

const live = table({ ensembleId: '', plan: APPLIED, lessonAverages: { s1: 91 } });
assert(live.columns.map(c => c.kind).join() === 'lessons' && row(live, 's1').cats.lessons.value === 91,
  'the lesson average is its own column and the box follows it');
assert(row(table({ ensembleId: '', plan: APPLIED, lessonAverages: { s1: 88 } }), 's1').cats.lessons.value === 88,
  'and moves when another lesson is graded');
assert(row(live, 's2').cats.lessons.value === null, 'no graded lessons is no number, not a zero');
const frozen = table({ ensembleId: '', plan: APPLIED, lessonAverages: { s1: 88 }, marks: { s1: { scores: { lessons: 91 } } } });
assert(row(frozen, 's1').cats.lessons.value === 91 && row(frozen, 's1').cats.lessons.derived === 88,
  'an old number typed into the box survives the rebuild as a typed-over number');
assert(table({ ensembleId: '', plan: APPLIED }).columns.length === 0, 'the applied table has no assignments or concerts');

/* ── 6. The "as of" date governs dated things, never grades ─────────────── */

const ex3 = exam('ex3', '2026-10-10');
const interim = table({
  span: { from: '2026-08-13', through: '2026-10-01' },
  assignments: [...assignments, ex3],
  results: [...results, { assignmentId: 'ex3', studentId: 's1', score: '60' }],
  marks: { s2: { scores: { [K('concert', 'ball')]: 77 } } },
});
assert(!interim.columns.some(c => c.refId === 'fest'), 'an interim as of Oct 1 holds no Oct 3 concert');
assert(row(interim, 's1').cells[K('exam', 'ex3')].value === 60,
  'but a grade entered for an exam due after the "as of" date still shows and counts');
assert(row(interim, 's2').cells[K('concert', 'ball')].value === 77, 'and a number TYPED for a later concert is still the director\'s');
const tomorrow = table({ today: '2026-10-05' });
assert(!tomorrow.columns.some(c => c.refId === 'ball'), 'a concert that has not happened yet credits nobody');

/* ── 7. Excusals and the concert rules an earlier review found ────────── */

const pulled = table({ pulledFrom: (s, e) => s.id === 's1' && e.id === 'fest' });
assert(row(pulled, 's1').cells[K('concert', 'fest')].value === null && row(pulled, 's1').cats.concerts.value === 100,
  'a student pulled from a concert is blank for it, never a zero');
const WIND = 'wind';
const windGig = ev('wind-gig', '2026-09-30', { ensembleIds: [WIND], rollTaken: { [WIND]: { at: 1, absent: 1 } } } as Partial<CalendarEvent>);
const drummer = student('drummer', [SYM, WIND]);
const dual = {
  events: [...events, windGig],
  records: [...records, { id: 'w1', studentId: 'drummer', ensembleId: WIND, eventId: 'wind-gig', date: '2026-09-30', status: 'Absent' }] as unknown as AttendanceRecord[],
  roster: [{ student: drummer, instrument: 'Percussion' }],
};
assert(row(table(dual), 'drummer').cells[K('concert', 'wind-gig')].value === 0
  && row(buildTable({ ...base, ...dual, ensembleId: WIND }), 'drummer').cells[K('concert', 'wind-gig')].value === 0,
  'a drummer marked Absent on the Wind roll reads 0 on BOTH tables — they cannot disagree');
assert(table(dual).rows.length === 1 && !t0.columns.some(c => c.refId === 'wind-gig'),
  'and the Wind gig is a column only where someone it is required of sits');
const assembly = { id: 'assembly', type: 'Event', ensembleIds: [], attendanceEnsembleIds: [SYM], date: '2026-09-17', status: 'Scheduled', concertAttendance: 'required', checkin: { enabled: true } } as unknown as CalendarEvent;
const club = { id: 'club', type: 'Event', ensembleIds: [SYM], date: '2026-09-18', status: 'Scheduled' } as unknown as CalendarEvent;
const tEvent = table({ events: [...events, assembly, club] });
assert(tEvent.columns.some(c => c.refId === 'assembly') && !tEvent.columns.some(c => c.refId === 'club'),
  'an Event marked Required counts like a concert; an ordinary Event does not');
const unflagged = ev('aud-unflagged', '2026-09-12', { ensembleIds: [CCO], attendanceEnsembleIds: [SYM] } as Partial<CalendarEvent>);
assert(!table({ events: [...events, unflagged] }).columns.some(c => c.refId === 'aud-unflagged'),
  'an audience concert without the Required flag has no door station, so it is nobody\'s column');

/* ── 8. The final grade is the workbook's formula over the same numbers ── */

const full = table({
  marks: { s1: { scores: { attendance: 100, prep: 100, performance: 95, professionalism: 100 } } },
});
assert(row(full, 's1').final === Math.round((100 * 30 + 100 * 10 + 85 * 15 + 95 * 20 + 100 * 15 + 100 * 10) / 100)
  && row(full, 's1').final === tallyGrade(PLAN, row(full, 's1').scores).percent,
  'live exams and concerts count toward the grade with nothing copied into a box');

/* ── A6. Old marks survive: every stored key reads back where it was ───── */

const legacy = table({
  marks: {
    s1: { scores: { prep: 90, exams: 83, [K('exam', 'ex1')]: 95, 'x:prep:Sight reading': 80, 'd:professionalism:2:Cell phone violations': 1, professionalism: 100 } },
  },
});
const L = row(legacy, 's1');
assert(L.cats.exams.typed === 83 && L.cells[K('exam', 'ex1')].typed === 95 && L.cells['x:prep:Sight reading'].value === 80
  && L.counts['d:professionalism:2:Cell phone violations'] === 1 && L.cats.professionalism.value === 98,
  'A6: typed boxes, typed cells, own columns and penalty columns all read back on the same student');
// (The before/after comparison against live data is scripts/gradebook-before-after.ts.)

/* ── A7. The words on the screen ─────────────────────────────────────── */

const ui = ['./GradebookView.tsx', './OwnColumnForm.tsx']
  .map(f => readFileSync(new URL(f, import.meta.url), 'utf8')).join('\n');
// Words a person reads: JSX text, and the strings in title / aria / placeholder / confirm.
// JSX text is what sits between tags and reads like prose rather than code.
const shown = [
  ...[...ui.matchAll(/>([^<>{}]*[A-Za-z][^<>{}]*)</g)].map(m => m[1]).filter(t => !/[=;(]/.test(t)),
  ...[...ui.matchAll(/`([^`]*)`/g)].map(m => m[1].replace(/\$\{[^}]*\}/g, ' ')),
  ...[...ui.matchAll(/(?:title|aria-label|placeholder)=["']([^"']+)["']/g)].map(m => m[1]),
  ...[...ui.matchAll(/'([A-Z][^']{6,})'/g)].map(m => m[1]),
];
for (const word of ['pinned', 'tally', 'suggest', 'Follow the Hub', 'Use the average']) {
  const hit = shown.find(t => t.toLowerCase().includes(word.toLowerCase()));
  assert(!hit, `A7: "${word}" appears in the UI: ${hit}`);
}
const ALLOWED = new Set([
  'Fill empty boxes with 100', 'Add my own column', 'Add a penalty', 'Copy the email', 'Copy the table',
  'Remove this column', 'Undo: use the Hub number', 'Add the column', 'Cancel',
]);
/** Each `<button …>label</button>`: the opening tag ends at the first `>`
 *  outside braces, so an arrow function in an attribute does not end it. */
function buttons(src: string): [string, string][] {
  const out: [string, string][] = [];
  for (let at = src.indexOf('<button'); at >= 0; at = src.indexOf('<button', at + 1)) {
    let depth = 0;
    let n = at + 7;
    for (; n < src.length; n++) {
      if (src[n] === '{') depth++;
      else if (src[n] === '}') depth--;
      else if (src[n] === '>' && depth === 0) break;
    }
    out.push([src.slice(at + 7, n), src.slice(n + 1, src.indexOf('</button>', n))]);
  }
  return out;
}
for (const [attrs, label] of buttons(ui)) {
  const text = label.replace(/\{[^}]*\}/g, '').replace(/<[^>]+>/g, '').replace(/&times;/g, '').trim();
  if (/role="tab"/.test(attrs)) continue;                       // a tab is the class's name
  if (text === '' || /^\W*$/.test(text)) {
    assert(/aria-label=\{?`Remove /.test(attrs), `A7: a button with no words must say what it does: ${attrs.slice(0, 80)}`);
    continue;
  }
  assert(ALLOWED.has(text), `A7: button "${text}" is not one of the plain verb phrases`);
}

console.log('gradeTable self-check: ok');
