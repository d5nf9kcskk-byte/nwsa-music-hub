/**
 * Pins the Gradebook's table arithmetic (#gradebook). Run:
 *   npx tsx src/director/grades/gradeTable.selfcheck.ts
 *
 * The world below is the real Q1 2026 calendar in miniature: a Symphony member
 * performs at the Pops concert, Festival I and the Midnight Ball (none of them
 * marked Required), sits in the audience at the College Chamber Orchestra
 * concert and the faculty recital (both marked Required), and a senior is
 * excused from the audience one. Every assertion is a rule a "tidy-up" could
 * break while the screen still looked right.
 */
import { buildTable, concertLabel, type TableInput } from './gradeTable';
import { itemKey, tallyGrade, type GradeCategory } from '../../shared/ensembleGrades';
import type { Assignment, AttendanceRecord, CalendarEvent, Student } from '../types';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

const SYM = 'symphony-orchestra';
const CAM = 'camerata-string-orchestra';
const CCO = 'college-chamber-orchestra';

const PLAN: GradeCategory[] = [
  { id: 'attendance', label: 'Attendance & Punctuality', weight: 30 },
  { id: 'prep', label: 'Preparation & Participation', weight: 10 },
  { id: 'exams', label: 'Playing Exams', weight: 15, suggest: 'exams' },
  { id: 'performance', label: 'Performance', weight: 20 },
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
const row = (t: ReturnType<typeof table>, id: string) => t.rows.find(r => r.student.id === id)!;

/* ── 1. With nothing typed, the Hub speaks for the boxes ───────────────── */

const t0 = table();
assert(t0.columns.length === 0, 'no columns until a director adds one');

// s1: recital 100 (entry-only, arrival scan), pops 100 (performer, no roll), cco 100 (both scans),
//     fest 100 (rolled, no mark), ball 100 (performer, no roll).
assert(row(t0, 's1').cats.concerts.value === 100, 'a student present at everything reads 100');
// s2: recital 0 (never scanned), pops 100, cco 50 (checked in, never out), fest 0 (marked Absent), ball 100.
assert(row(t0, 's2').cats.concerts.value === 50, 'mean of 0, 100, 50, 0, 100 — a missed concert is a real zero');
assert(row(t0, 's2').concerts.held === 5 && row(t0, 's2').concerts.credited === 2
  && row(t0, 's2').concerts.incomplete === 1, 'the evidence line: 2 credited of 5, one with no check-out');
// s3 is a senior: excused from the CCO concert, so it LEAVES their denominator.
assert(row(t0, 's3').concerts.excused === 1 && row(t0, 's3').concerts.held === 4,
  'a senior excused from the audience requirement is out of the denominator, not a zero');
assert(t0.requiredConcerts.map(e => e.id).join() === 'recital,pops,cco,fest,ball',
  'the concerts that count are the ones required of someone on the table, in date order — a cancelled one, '
  + 'a Wind-only one and next quarter\'s are not among them');

assert(row(t0, 's1').cats.exams.value === 85, 'with no exam columns the box averages every graded Playing Exam');
assert(row(t0, 's2').cats.exams.value === 70,
  'an exam whose score cannot be read as a whole 0-100 is left out, never counted as a zero');
const ex2 = t0.windowExams.find(o => o.assignment.id === 'ex2')!;
assert(ex2.graded === 1 && ex2.unreadable === 1 && ex2.of === 3,
  'and the screen can say so: 1 graded, 1 the Hub could not read, of 3');

assert(row(t0, 's1').scores.prep === undefined && row(t0, 's1').cats.prep.value === null,
  'a judgement category nobody has filled is NOT scored — a blank is never a zero');
assert(!('prep' in row(t0, 's1').scores), 'and it is absent from the scores the grade reads');

/* ── 2. Linked columns follow the Hub until a number is typed over them ─── */

const ex1Key = itemKey('exam', 'ex1');
const popsKey = itemKey('concert', 'pops');
const t1 = table({
  marks: {
    s1: { scores: { [ex1Key]: null, [popsKey]: null } },
    s2: { scores: { [ex1Key]: 50, [popsKey]: null } },     // s2: a typed 50 over a live 70
  },
});
assert(t1.columns.map(c => c.key).join() === `${ex1Key},${popsKey}`,
  'both columns exist although some cells are null, in the plan\'s category order (exams, then concerts)');
assert(t1.columns.find(c => c.key === ex1Key)?.categoryId === 'exams'
  && t1.columns.find(c => c.key === popsKey)?.categoryId === 'concerts', 'each lands under its own category');
assert(row(t1, 's1').cells[ex1Key].value === 90 && row(t1, 's1').cells[ex1Key].typed === null,
  'a blank cell is the live grade');
assert(row(t1, 's2').cells[ex1Key].value === 50 && row(t1, 's2').cells[ex1Key].live === 70,
  'a typed cell overrides the live one, and the live one is still known');
assert(row(t1, 's1').cats.exams.value === 90,
  'once a category has exam columns it averages THEM — only the exam added, not every exam in the quarter');
assert(row(t1, 's2').cats.exams.value === 50, 'and a typed cell is what the box then adds up');
assert(t1.pinned.exams.cells.length === 1 && t1.pinned.exams.cells[0].studentId === 's2'
  && t1.pinned.exams.cells[0].key === ex1Key, 'the typed cell over a live one is reported as pinned');
assert(row(t1, 's1').cats.concerts.value === 100, 'a concert column is the concert\'s own number');

// A column whose exam was deleted still draws, and still says so.
const tGone = table({ marks: { s1: { scores: { [itemKey('exam', 'gone')]: 77 } } } });
assert(tGone.columns[0].label === 'Deleted exam' && row(tGone, 's1').cells[itemKey('exam', 'gone')].value === 77,
  'a typed number under a deleted exam is kept and labelled, not dropped');

/* ── 3. Columns of the director\'s own ───────────────────────────────── */

const sight = 'x:prep:Sight reading';
const t2 = table({ marks: { s1: { scores: { [sight]: 80 } }, s2: { scores: { [sight]: null } } } });
assert(t2.columns.length === 1 && t2.columns[0].kind === 'custom' && t2.columns[0].label === 'Sight reading'
  && t2.columns[0].categoryId === 'prep', 'a column of one\'s own appears under its category');
assert(row(t2, 's1').cats.prep.value === 80, 'the box is the average of its columns');
assert(row(t2, 's2').cats.prep.value === null, 'a student nobody scored on the column has no number — not a zero');

const t2b = table({ marks: { s1: { scores: { [sight]: 80, prep: 100 } } } });
assert(row(t2b, 's1').cats.prep.value === 100 && row(t2b, 's1').cats.prep.derived === 80,
  'a number typed into the box beats the columns, and the columns\' answer is still known');
assert(t2b.pinned.prep.students.join() === 's1', 'so the screen can offer to follow the columns again');

const t2c = table({ marks: { s1: { scores: { 'x:nowhere:Ghost': 90 } } } });
assert(t2c.columns.length === 0, 'a column filed under a category this plan does not have is ignored, not crashed on');

/* ── 4. Things that cost points ──────────────────────────────────────── */

const phone = 'd:professionalism:2:Phone out in class';
const t3 = table({
  marks: {
    s1: { scores: { professionalism: 100, [phone]: 3 } },
    s2: { scores: { [phone]: 3 } },                      // incidents, and nothing else to grade
    s3: { scores: { professionalism: 100, [phone]: null } },
  },
});
assert(t3.columns[0].kind === 'tally' && t3.columns[0].points === 2, 'an incident column knows what each one costs');
assert(row(t3, 's1').cats.professionalism.value === 94,
  'filled at 100, three phones at 2 points each: 94 — the penalty comes off a typed number too');
assert(row(t3, 's1').cats.professionalism.penalty === 6 && row(t3, 's1').cats.professionalism.base === 100,
  'and the screen can show "−6 → 94"');
assert(row(t3, 's2').cats.professionalism.value === null,
  'incidents alone never CREATE a grade: three phones and nothing else is not a 94');
assert(row(t3, 's3').cats.professionalism.value === 100, 'a blank count is no incident');
assert(row(t3, 's1').counts[phone] === 3 && row(t3, 's3').counts[phone] === 0, 'counts are read per student');
assert(t3.pinned.professionalism.students.length === 0,
  'a typed number with nothing for the Hub to say is not "pinned" — there is no live number to follow');

const withBoth = table({
  marks: { s1: { scores: { [sight]: 90, [phone.replace('professionalism', 'prep')]: 2 } } },
});
assert(row(withBoth, 's1').cats.prep.value === 86, 'a graded column and an incident column on one category: 90 − 2×2');

/* ── 5. The applied lesson average is live ──────────────────────────── */

const live = table({
  ensembleId: '', plan: APPLIED, lessonAverages: { s1: 91 },
  marks: { s1: { scores: {} } },
});
assert(row(live, 's1').cats.lessons.value === 91, 'the lesson average comes straight from the lessons');
const later = table({ ensembleId: '', plan: APPLIED, lessonAverages: { s1: 88 }, marks: { s1: { scores: {} } } });
assert(row(later, 's1').cats.lessons.value === 88,
  'and moves when another lesson is graded — nothing was copied into a box');
assert(row(live, 's2').cats.lessons.value === null, 'a student with no graded lessons has no number, not a zero');

const frozen = table({ ensembleId: '', plan: APPLIED, lessonAverages: { s1: 88 }, marks: { s1: { scores: { lessons: 91 } } } });
assert(row(frozen, 's1').cats.lessons.value === 91 && row(frozen, 's1').cats.lessons.derived === 88,
  'an old snapshot typed into the box still wins — until the director follows the Hub again');
assert(frozen.pinned.lessons.students.join() === 's1', 'and it is reported, so "follow the Hub" can find it');

const jury = table({
  ensembleId: '', plan: APPLIED, lessonAverages: { s1: 91 },
  marks: { s1: { scores: { 'x:lessons:Jury': 79 } } },
});
assert(row(jury, 's1').cats.lessons.value === 85, 'the lesson average and a jury grade are averaged: 91 and 79 → 85');
assert(table({ ensembleId: '', plan: APPLIED }).concertOptions.length === 0
  && table({ ensembleId: '', plan: APPLIED }).examOptions.length === 0, 'the applied table offers no concerts or exams');

/* ── 6. What "+ Add" offers ─────────────────────────────────────────── */

const opts = table({ marks: { s1: { scores: { [popsKey]: null } } } });
assert(opts.concertOptions.every(o => o.event.id !== 'pops'), 'a concert already a column is not offered twice');
assert(!opts.concertOptions.some(o => o.event.id === 'cancelled'), 'a cancelled concert is not offered');
assert(!opts.concertOptions.some(o => o.event.id === 'later'), 'a concert outside the quarter is not offered');
assert(opts.concertOptions.find(o => o.event.id === 'fest')?.relation === 'performs',
  'a concert the Symphony plays is offered although nobody marked it Required');
assert(opts.concertOptions.find(o => o.event.id === 'cco')?.relation === 'required',
  'the audience concert is offered as required');
assert(opts.concertOptions.find(o => o.event.id === 'wind-only')?.relation === 'other',
  'another group\'s concert is offered last, as "other" — the director decides');

// A drummer in two groups: the Wind concert is theirs to attend, but it is never "the Symphony's".
const drummer = student('drummer', [SYM, 'wind']);
const tDual = table({ roster: [...roster, { student: drummer, instrument: 'Percussion' }] });
assert(tDual.concertOptions.find(o => o.event.id === 'wind-only')?.relation === 'other'
  && !tDual.requiredConcerts.some(e => e.id === 'wind-only'),
  'one student who also plays in another group must not turn that group\'s concert into the Symphony\'s');
assert(row(tDual, 'drummer').concerts.held === 6 && row(tDual, 'drummer').concerts.credited === 4,
  'but it still counts for THEM: required at both groups\' concerts (4 of 6 credited, the recital and the CCO concert unscanned)');
assert(row(tDual, 's1').concerts.held === 5, 'and nobody else on the table is affected');

const early = table({ today: '2026-09-29', span: { from: '2026-08-13', through: '2026-09-29' } });
assert(!early.concertOptions.some(o => o.event.id === 'fest') && early.concertOptions.some(o => o.event.id === 'cco'),
  'a concert that has not happened by the cutoff cannot be added yet');

assert(table().examOptions.map(o => o.assignment.id).join() === 'ex1,wt,ex2',
  'every assignment this group has this quarter is offered, whatever its type, by due date — '
  + 'not the Camerata\'s, and not next quarter\'s');
const optEx = table({ marks: { s1: { scores: { [ex1Key]: null } } } }).examOptions;
assert(!optEx.some(o => o.assignment.id === 'ex1'), 'an exam already a column is not offered twice');
assert(concertLabel({ date: '2026-10-03', title: 'Festival I' }) === 'Festival I · 10/3', 'a concert column heading');

/* ── 7. The email reads the same numbers ─────────────────────────────── */

const grade = (t: ReturnType<typeof table>, id: string) => tallyGrade(PLAN, row(t, id).scores).percent;
const full = table({
  marks: {
    s1: { scores: { attendance: 100, prep: 100, performance: 95, professionalism: 100 } },
    s2: { scores: { attendance: 90 } },
  },
});
// s1: attendance 100×30, prep 100×10, exams 85×15, performance 95×20, concerts 100×15, professionalism 100×10
assert(grade(full, 's1') === Math.round((100 * 30 + 100 * 10 + 85 * 15 + 95 * 20 + 100 * 15 + 100 * 10) / 100),
  'live exams and concerts count toward the grade with nothing copied into a box');
// s2: attendance 90×30, exams 70×15 (the one exam that reads), concerts 50×15 = 60 of 100 points scored.
assert(grade(full, 's2') === Math.round((90 * 30 + 70 * 15 + 50 * 15) / 60),
  'a student exactly past the coverage floor gets the re-normalized grade');
assert(grade(table(), 's1') === null,
  'a student with only live sources — 30 of 100 points — gets NO percent: below the floor, no grade');

/* ── 8. Excusals, whoever decides them ──────────────────────────────── */

const pulled = table({ pulledFrom: (s, e) => s.id === 's1' && e.id === 'fest' });
assert(row(pulled, 's1').concerts.excused === 1 && row(pulled, 's1').concerts.held === 4
  && row(pulled, 's1').cats.concerts.value === 100,
  'a student pulled from a concert is blank for it and out of the denominator');

const seniorPerforms = ev('senior-perf', '2026-09-20', { ensembleIds: [SYM], attendanceExcusedGrades: ['12'] } as Partial<CalendarEvent>);
const tSenior = table({
  events: [...events, seniorPerforms],
  marks: { s3: { scores: { [itemKey('concert', 'senior-perf')]: null } } },
});
assert(row(tSenior, 's3').cells[itemKey('concert', 'senior-perf')].value === 100,
  'a senior excused from an AUDIENCE requirement still plays when they perform on it');

/* ── 9. What an independent review found ─────────────────────────────── */

// (a) A drummer in two groups: the roll that counts at the Wind concert is the
// Wind roll, on EITHER group's table. Reading only the table's own group made
// the two district tables disagree about one student at one concert.
const WIND = 'wind';
const windGig = ev('wind-gig', '2026-09-30', { ensembleIds: [WIND], rollTaken: { [WIND]: { at: 1, absent: 1 } } } as Partial<CalendarEvent>);
const drummer2 = student('drummer2', [SYM, WIND]);
const windAbsent = [{ id: 'w1', studentId: 'drummer2', ensembleId: WIND, eventId: 'wind-gig', date: '2026-09-30', status: 'Absent' }] as unknown as AttendanceRecord[];
const gigKey = itemKey('concert', 'wind-gig');
const dual = {
  events: [...events, windGig],
  records: [...records, ...windAbsent],
  roster: [{ student: drummer2, instrument: 'Percussion' }],
  marks: { drummer2: { scores: { [gigKey]: null } } },
};
assert(row(table(dual), 'drummer2').cells[gigKey].live === 0,
  'marked Absent on the Wind roll: a zero on the Symphony table, where the drummer is also a member');
assert(row(buildTable({ ...base, ...dual, ensembleId: WIND }), 'drummer2').cells[gigKey].live === 0,
  'and the same zero on the Wind table — the two district tables cannot disagree about one student at one concert');

// (b) A cancelled concert says nothing about anyone, and its column says so.
const cancelledKey = itemKey('concert', 'cancelled');
const tCancelled = table({ marks: { s1: { scores: { [cancelledKey]: null } } } });
assert(row(tCancelled, 's1').cells[cancelledKey].live === null,
  'a column for a concert that was later cancelled reads blank — never 100 for a performer, never 0 for the audience');
assert(tCancelled.columns[0].label.includes('(cancelled)'), 'and its heading says it was cancelled');
assert(row(tCancelled, 's1').cats.concerts.value === null, 'so it adds nothing to the box');

// (c) The Gradebook has always counted any event marked Required, whatever its type.
const assembly = { id: 'assembly', type: 'Event', ensembleIds: [], attendanceEnsembleIds: [SYM], date: '2026-09-17', status: 'Scheduled', concertAttendance: 'required', checkin: { enabled: true } } as unknown as CalendarEvent;
const club = { id: 'club', type: 'Event', ensembleIds: [SYM], date: '2026-09-18', status: 'Scheduled' } as unknown as CalendarEvent;
const tEvent = table({ events: [...events, assembly, club] });
assert(tEvent.requiredConcerts.some(e => e.id === 'assembly')
  && tEvent.concertOptions.find(o => o.event.id === 'assembly')?.relation === 'required',
  'an Event-typed item marked Required still counts and is still offered (the student\'s own tally counts its scans too)');
assert(!tEvent.requiredConcerts.some(e => e.id === 'club') && !tEvent.concertOptions.some(o => o.event.id === 'club'),
  'while an ordinary unflagged Event is not a concert at all');

// (d) A column respects the report's "as of" date, like the live fallback does.
const ex3 = exam('ex3', '2026-10-10');
const tInterim = table({
  span: { from: '2026-08-13', through: '2026-10-01' },
  assignments: [...assignments, ex3],
  marks: {
    s1: { scores: { [itemKey('concert', 'ball')]: null, [itemKey('concert', 'fest')]: null, [itemKey('exam', 'ex2')]: null } },
    s2: { scores: { [itemKey('concert', 'ball')]: 77 } },
  },
});
assert(row(tInterim, 's1').cells[itemKey('concert', 'ball')].live === null
  && row(tInterim, 's1').cells[itemKey('concert', 'fest')].live === null,
  'an interim as of Oct 1 does not already hold the Oct 3 and Oct 6 concerts');
assert(row(tInterim, 's1').cells[itemKey('exam', 'ex2')].live === 80, 'but an exam due before the cutoff is live');
assert(row(tInterim, 's2').cells[itemKey('concert', 'ball')].value === 77,
  'and a number TYPED into a cell past the cutoff is still the director\'s number');
assert(!tInterim.examOptions.some(o => o.assignment.id === 'ex3')
  && table({ assignments: [...assignments, ex3] }).examOptions.some(o => o.assignment.id === 'ex3'),
  'the exam menu stops at the cutoff the way the concert menu does');

// (e) Someone in the AUDIENCE is measurable only when the concert is marked Required.
const unflagged = ev('aud-unflagged', '2026-09-12', { ensembleIds: [CCO], attendanceEnsembleIds: [SYM] } as Partial<CalendarEvent>);
const unflaggedKey = itemKey('concert', 'aud-unflagged');
const tAudience = table({ events: [...events, unflagged], marks: { s1: { scores: { [unflaggedKey]: null } } } });
assert(row(tAudience, 's1').cells[unflaggedKey].live === null,
  'no Required flag means no door station, so "no scan" is blank — it must not read as "did not come"');
assert(row(table({ marks: { s2: { scores: { [itemKey('concert', 'recital')]: null } } } }), 's2').cells[itemKey('concert', 'recital')].live === 0,
  'while a Required concert with no scan is a real zero');

console.log('gradeTable self-check: ok');
