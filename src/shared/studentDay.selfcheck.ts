/**
 * Pins "what does this student have" (#student-day) — src/shared/studentDay.ts.
 *
 * Run: node src/shared/studentDay.selfcheck.ts
 *
 * PLAIN `node`, on purpose, not tsx and not the Vite defines shim. The feed
 * generator loads studentDay.ts under Node's type-stripping loader, so the
 * first promise this file keeps is simply that it starts: if anyone adds an
 * extensionless import or reaches the org config from that module, this fails
 * before the first assertion, in a pull request, instead of in the hourly
 * deploy where a failed feed run publishes no student calendars at all.
 *
 * What it pins:
 *   1. The module's answer equals what the student page computed BEFORE the
 *      logic was lifted out of it — the old page formula is kept below,
 *      verbatim, as the reference — for every student in the fixtures.
 *   2. Each case that has ever gone wrong, by name: a pull-out, a sub, a
 *      concert excusal, an audience-only concert, a booked master class slot,
 *      an academic class, a rotation, and the two readings the calendar feed
 *      used to get differently from the page.
 *   3. The short path (only this student's record and their own pull-outs)
 *      gives the same answer as the full roster.
 *   4. The page and the feed script both call the module and neither keeps a
 *      copy of the rule.
 *
 * Every person here is fictional (#privacy).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { studentDay, type StudentDayRecords, type StudentDayWindow } from './studentDay.ts';
import { studentExpectation } from '../director/rosterResolver.ts';
import { isMasterClass } from '../director/groupKind.ts';
import { bookedPerformersForEvent } from './eventPerformers.ts';
import { studentEventPieces } from './studentRepertoire.ts';
import { isAssignmentOpen, studentHasAssignment, byDueDateOpenFirst } from './pureRules.ts';
import type {
  Assignment, CalendarEvent, Ensemble, RepertoirePiece, RosterOverride,
  SignupForm, SignupSlotBooking, Student,
} from '../director/types.ts';
import type { PublicLesson } from './publicLesson.ts';

// ── Fixtures ───────────────────────────────────────────────────────────
// "Today" is Monday 2026-10-05.
const TODAY = '2026-10-05';
const NOW = Date.parse('2026-10-05T12:00:00Z');

const ensembles = [
  { id: 'symphony', name: 'Symphony' },
  { id: 'chamber', name: 'Chamber' },
  { id: 'jazz-ensemble', name: 'Jazz' },
  { id: 'violin-mc', name: 'Violin Masterclass', kind: 'masterclass' },
  { id: 'theory-10', name: 'Theory 10', kind: 'class' },
] as unknown as Ensemble[];

const student = (id: string, name: string, grade: string, ensembleIds: string[], status = 'Active') =>
  ({ id, name, grade, ensembleIds, status, instrument: 'Violin' }) as unknown as Student;
const students = [
  student('ada', 'Ada Example', '10', ['symphony']),
  student('ben', 'Ben Sample', '11', ['chamber']),
  student('cy', 'Cy Placeholder', '12', ['symphony', 'chamber']),
  student('dee', 'Dee Fixture', '9', ['symphony', 'jazz-ensemble']),
  student('eli', 'Eli Madeup', '12', ['symphony'], 'Graduated'),
];

const ev = (id: string, date: string, type: string, ensembleIds: string[], extra: Partial<CalendarEvent> = {}) =>
  ({ id, date, type, ensembleIds, status: 'Scheduled', ...extra }) as unknown as CalendarEvent;
const events = [
  ev('past', '2026-10-01', 'Rehearsal', ['symphony'], { startTime: '13:00', endTime: '14:30' }),
  // Deliberately out of order, and one with no time, to pin the sort.
  ev('notime', '2026-10-05', 'Event', ['symphony']),
  ev('r1', '2026-10-05', 'Rehearsal', ['symphony'], { startTime: '13:00', endTime: '14:30' }),
  ev('r3', '2026-10-06', 'Rehearsal', ['chamber'], { startTime: '13:00', endTime: '14:30' }),
  ev('r2', '2026-10-06', 'Rehearsal', ['symphony'], { startTime: '13:00', endTime: '14:30' }),
  ev('j1', '2026-10-06', 'Rehearsal', ['jazz-ensemble'], { startTime: '15:00', endTime: '16:00' }),
  ev('mc1', '2026-10-07', 'Class', ['violin-mc'], { startTime: '15:00', endTime: '16:00' }),
  // Academic classes: one school-wide, one filed under a class group that the
  // student is not a member of. Both reach a 10th grader by the enrollment rule.
  ev('t10', '2026-10-08', 'Class', [], { title: 'Theory — 10th Grade', startTime: '09:00', endTime: '10:00' }),
  ev('t10g', '2026-10-09', 'Class', ['theory-10'], { title: 'Theory — 10th Grade', startTime: '09:00', endTime: '10:00' }),
  ev('c1', '2026-10-10', 'Concert', ['symphony', 'chamber'], { startTime: '19:00', pieceIds: ['nutcracker', 'souvenir'] }),
  // A Tuesday concert: a weekday rotation says nothing about a performance.
  ev('c3', '2026-10-13', 'Concert', ['symphony'], { startTime: '19:00' }),
  // Chamber plays; Symphony is required in the audience.
  ev('c2', '2026-10-17', 'Concert', ['chamber'], { startTime: '19:00', pieceIds: ['souvenir'], attendanceEnsembleIds: ['symphony'] }),
];

const ov = (id: string, o: Partial<RosterOverride>) => ({ id, ...o }) as RosterOverride;
const overrides = [
  // A pull-out: Ada is off Tuesday's rehearsal.
  ov('o-pull', { studentId: 'ada', ensembleId: 'symphony', action: 'remove', scope: 'event', eventId: 'r2' }),
  // A sub: Ben sits in with Symphony on Monday.
  ov('o-sub', { studentId: 'ben', ensembleId: 'symphony', action: 'add', scope: 'event', eventId: 'r1' }),
  // Pulled from Chamber's Tuesday rehearsal INTO Symphony. The pull-out names
  // r3; the Symphony rehearsal it sends him to is a different event the same
  // day. (The old feed copy matched the event id only and missed this.)
  ov('o-dest', { studentId: 'ben', ensembleId: 'chamber', action: 'remove', scope: 'event', eventId: 'r3', destEnsembleId: 'symphony' }),
  // A concert excusal (#concert-excusals): one pull-out per ensemble he plays with on it.
  ov('o-exc-1', { studentId: 'cy', ensembleId: 'symphony', action: 'remove', scope: 'event', eventId: 'c1', reason: 'Excused from this concert' }),
  ov('o-exc-2', { studentId: 'cy', ensembleId: 'chamber', action: 'remove', scope: 'event', eventId: 'c1', reason: 'Excused from this concert' }),
  // A range pull-out with NO end date. The resolver refuses a range it cannot
  // bound; the old feed copy read it as open-ended and dropped every rehearsal.
  ov('o-open', { studentId: 'cy', ensembleId: 'symphony', action: 'remove', scope: 'range', startDate: '2026-10-01' }),
  // A standing rotation: Dee is with Jazz, not Symphony, on Tuesdays.
  ov('o-rot', { studentId: 'dee', ensembleId: 'symphony', action: 'remove', scope: 'range', kind: 'rotation', days: [2], startDate: '2026-08-17', endDate: '2027-06-01' }),
  // A lesson pull-out is PARTIAL: it never takes a rehearsal off a schedule.
  ov('o-lesson', { studentId: 'ada', ensembleId: 'symphony', action: 'remove', scope: 'range', kind: 'lesson', startDate: TODAY, endDate: TODAY, startTime: '13:00', endTime: '13:30' }),
];

const forms = [{
  id: 'f1', title: 'Violin Master Class — pick a time', ownerName: 'Director', ensembleIds: [],
  questions: [{
    id: 'q1', label: 'Pick a time', type: 'timeslot', options: ['3:15', '5:30'],
    slotDefs: [
      { date: '2026-10-07', startMin: 915, endMin: 930 },   // 15:15 — inside mc1
      { date: '2026-10-07', startMin: 1050, endMin: 1065 }, // 17:30 — after it
    ],
  }],
}] as unknown as SignupForm[];
const booking = (id: string, studentId: string, studentName: string, slotIndex: number) =>
  ({ id, formId: 'f1', questionId: 'q1', slotIndex, slotLabel: '', studentId, studentName, submittedAt: 0 }) as unknown as SignupSlotBooking;
const bookings = [
  booking('b1', 'ada', 'Ada Example', 0), // plays in the class; not on its roster
  booking('b2', 'ben', 'Ben Sample', 1),  // booked a time after the class ended
];

const pieces = [
  { id: 'nutcracker', title: 'Nutcracker', ensembleIds: ['symphony'], order: 0 },
  { id: 'souvenir', title: 'Souvenir', ensembleIds: ['chamber'], order: 1 },
] as unknown as RepertoirePiece[];

const lessons = [
  { id: 'l-undated', studentId: 'ada' },
  { id: 'l-tue', studentId: 'ada', date: '2026-10-06', startTime: '10:00', status: 'Scheduled' },
  { id: 'l-past', studentId: 'ada', date: '2026-09-30', startTime: '10:00', status: 'Scheduled' },
  { id: 'l-today-pm', studentId: 'ada', date: TODAY, startTime: '15:00', status: 'Scheduled' },
  { id: 'l-today-am', studentId: 'ada', date: TODAY, startTime: '08:00', status: 'Cancelled' },
  { id: 'l-ben', studentId: 'ben', date: TODAY, startTime: '09:00', status: 'Scheduled' },
] as unknown as PublicLesson[];

const asg = (id: string, dueDate: string, o: Partial<Assignment> = {}) =>
  ({ id, title: id, type: 'Playing Exam', dueDate, ensembleIds: ['symphony'], ...o }) as unknown as Assignment;
const assignments = [
  asg('a-fri', '2026-10-09'),
  asg('a-mine', '2026-10-07', { ensembleIds: [], studentIds: ['ada'] }),
  asg('a-chamber', '2026-10-08', { ensembleIds: ['chamber'] }),
  asg('a-scheduled', '2026-10-08', { publishAt: NOW + 86_400_000 }),   // posts tomorrow
  asg('a-late-open', '2026-10-01', { acceptsQuizSubmissions: true }),  // overdue, still taking answers
  asg('a-late-closed', '2026-10-01'),
];

const records: StudentDayRecords = { students, events, overrides, ensembles, forms, bookings, pieces, charts: [], lessons, assignments };
const when: StudentDayWindow = { from: TODAY, now: NOW };

// ── 1. The page, as it was ─────────────────────────────────────────────
// PublicSchedule.tsx before #student-day, kept verbatim as the reference:
// whole roster, every override, the booked-event set built across all events.
function pageBefore(id: string) {
  const me = students.find(s => s.id === id);
  const ensembleMap = Object.fromEntries(ensembles.map(e => [e.id, e]));
  const eventsById = Object.fromEntries(events.map(e => [e.id, e]));
  const piecesById = Object.fromEntries(pieces.map(p => [p.id, p]));
  const myBookings = bookings.filter(b => b.studentId === id); // useStudentSlotBookings(id)
  const myBookedEventIds = new Set<string>();
  for (const e of events) {
    if (!e.ensembleIds.some(eid => ensembleMap[eid] && isMasterClass(ensembleMap[eid]))) continue;
    if (bookedPerformersForEvent(e, forms, myBookings).some(p => p.studentId === id)) myBookedEventIds.add(e.id);
  }
  const mySchedule = !me ? [] : events
    .filter(e => e.date >= TODAY)
    .map(e => ({ event: e, exp: studentExpectation(id, e, students, overrides, eventsById, myBookedEventIds) }))
    .filter(x => x.exp.expected)
    .sort((a, b) => a.event.date.localeCompare(b.event.date) || (a.event.startTime ?? '99').localeCompare(b.event.startTime ?? '99'));
  const myAssignments = me
    ? assignments
        .filter(a => isAssignmentOpen(a, TODAY, NOW) && studentHasAssignment(a, me.id, me.ensembleIds))
        .sort(byDueDateOpenFirst(TODAY))
    : [];
  // useStudentLessons(id): this student's dated lessons, by date then time.
  const myLessons = lessons
    .filter(l => l.studentId === id && !!l.date)
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || (a.startTime ?? '').localeCompare(b.startTime ?? ''));
  return {
    events: mySchedule.map(({ event, exp }) => ({
      id: event.id, exp, pieces: studentEventPieces(id, event, exp, piecesById, []).map(p => p.id),
    })),
    lessons: myLessons.filter(l => (l.date ?? '') >= TODAY).map(l => l.id), // lessonsToday + lessonsUpcoming
    assignments: myAssignments.map(a => a.id),
  };
}
const shape = (day: ReturnType<typeof studentDay>) => ({
  events: day.events.map(x => ({ id: x.event.id, exp: x.exp, pieces: x.pieces.map(p => p.id) })),
  lessons: day.lessons.map(l => l.id),
  assignments: day.assignments.map(a => a.id),
});

const before = JSON.stringify(records);
for (const s of [...students, { id: 'nobody' }]) {
  assert.deepEqual(shape(studentDay(s.id, when, records)), pageBefore(s.id),
    `studentDay differs from what the student page showed, for fixture student "${s.id}"`);
}
assert.equal(JSON.stringify(records), before, 'studentDay must not change the records it is handed');

// ── 2. The cases, by name ──────────────────────────────────────────────
const day = (id: string, w = when, r = records) => studentDay(id, w, r);
const ids = (id: string) => day(id).events.map(x => x.event.id);
const at = (id: string, eventId: string) => day(id).events.find(x => x.event.id === eventId);

// Order: by date, then start time, an untimed event last in its day.
assert.deepEqual(ids('ada'), ['r1', 'notime', 'mc1', 't10', 't10g', 'c1', 'c3', 'c2']);
// The range: nothing before `from`; `to` closes the other end.
assert.ok(!ids('ada').includes('past'), 'an event before the range start is not in it');
assert.deepEqual(day('ada', { from: TODAY, to: '2026-10-07', now: NOW }).events.map(x => x.event.id), ['r1', 'notime', 'mc1']);
assert.ok(day('ada', { now: NOW }).events.some(x => x.event.id === 'past'), 'no `from` means no lower bound (the calendar feed keeps history)');

// A pull-out takes the event off; a lesson pull-out (partial) does not.
assert.ok(!ids('ada').includes('r2'), 'pulled from Tuesday: it is off the schedule');
assert.ok(ids('ada').includes('r1'), 'a lesson during a rehearsal never removes the rehearsal');

// A sub is on the event, and marked as one.
assert.equal(at('ben', 'r1')?.exp.isSub, true, 'a sub is expected, and flagged as a sub');
// Pulled from one group into another the same day: off the first, on the second.
assert.ok(!ids('ben').includes('r3') && at('ben', 'r2')?.exp.isSub === true,
  'a pull-out naming a destination subs the student into that group\'s meeting that day');

// A concert excusal: pulled from every ensemble they play with on it.
assert.ok(!ids('cy').includes('c1'), 'excused from the concert: it is off the schedule');
assert.ok(ids('cy').includes('c3'), '...and only that concert');
// A range pull-out the resolver cannot bound is not applied.
assert.ok(ids('cy').includes('r1') && ids('cy').includes('r2'), 'a range pull-out with no end date removes nothing');

// Audience only: on the schedule, flagged, and playing nothing.
const aud = at('ada', 'c2');
assert.ok(aud && aud.exp.attendanceOnly && aud.pieces.length === 0, 'an audience-only concert is expected, flagged, with no pieces');
// A shared program: only their own ensemble's works.
assert.deepEqual(at('ada', 'c1')?.pieces.map(p => p.id), ['nutcracker']);
assert.deepEqual(at('cy', 'c2')?.pieces.map(p => p.id), ['souvenir']);

// A booked master class slot is its own way onto the schedule, with its time.
const mc = at('ada', 'mc1');
assert.ok(mc && mc.booked.length === 1 && mc.booked[0].startMin === 915, 'booking a slot puts the master class on the schedule, with the slot time');
assert.ok(!ids('ben').includes('mc1'), 'a slot that starts after the class ended is not a performance in it');
assert.ok(day('ada', when, { ...records, bookings: [] }).events.every(x => x.event.id !== 'mc1'), 'no booking, no master class');

// Academic classes reach a student by the enrollment rule, with or without a group on the event.
assert.ok(ids('ada').includes('t10') && ids('ada').includes('t10g'), 'a 10th grader has 10th grade theory');
assert.ok(!ids('ben').includes('t10') && !ids('ben').includes('t10g'), '...and an 11th grader does not');

// A weekday rotation moves a rehearsal and never a concert.
assert.ok(!ids('dee').includes('r2') && ids('dee').includes('j1'), 'on a rotation day the student is with the other group');
assert.ok(ids('dee').includes('c3'), 'a rotation says nothing about a concert on that weekday');

// Someone who is not Active is on no ensemble's roster, so performs in nothing
// (the feed script skips them altogether); someone unknown has nothing at all.
assert.deepEqual(day('eli').events.filter(x => !x.exp.attendanceOnly), []);
assert.deepEqual(day('nobody'), { events: [], lessons: [], assignments: [] });

// Lessons: this student's, dated, in range, in order — a cancelled one INCLUDED.
assert.deepEqual(day('ada').lessons.map(l => l.id), ['l-today-am', 'l-today-pm', 'l-tue']);

// Assignments: open and theirs; scheduled-for-later hidden; overdue-but-open last.
assert.deepEqual(day('ada').assignments.map(a => a.id), ['a-mine', 'a-fri', 'a-late-open']);
assert.ok(day('ada', { from: TODAY, now: NOW + 2 * 86_400_000 }).assignments.some(a => a.id === 'a-scheduled'),
  'a scheduled assignment appears once its moment has passed');

// ── 3. The short path is the same answer ───────────────────────────────
// Home's Now card loads only the saved student's own record and their own
// pull-outs. That must not be a different (staler, wronger) answer.
for (const s of students) {
  const short: StudentDayRecords = {
    ...records,
    students: [s],
    overrides: overrides.filter(o => o.studentId === s.id),
    bookings: bookings.filter(b => b.studentId === s.id),
    lessons: lessons.filter(l => l.studentId === s.id),
  };
  assert.deepEqual(shape(studentDay(s.id, when, short)), shape(studentDay(s.id, when, records)),
    `the short path disagrees with the full roster for "${s.id}"`);
}

// ── 4. One answer, no copies ───────────────────────────────────────────
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const feed = read('../../scripts/generate-feeds.mjs');
assert.ok(/from '\.\.\/src\/shared\/studentDay\.ts'/.test(feed) && /studentDay\(stu\.id/.test(feed),
  'scripts/generate-feeds.mjs must build per-student feeds from studentDay()');
for (const copy of ['expectedForStudent', 'overrideApplies', 'TAKES_ROLL']) {
  assert.ok(!feed.includes(copy), `scripts/generate-feeds.mjs has grown its own "${copy}" again — the rule lives in studentDay.ts`);
}
const page = read('../public/PublicSchedule.tsx');
assert.ok(/studentDay\(id,/.test(page), 'PublicSchedule.tsx must read the schedule from studentDay()');
for (const copy of ['studentExpectation(', 'bookedPerformersForEvent(', 'studentEventPieces(', 'isAssignmentOpen(']) {
  assert.ok(!page.includes(copy), `PublicSchedule.tsx calls ${copy}...) itself again — that is studentDay.ts's job`);
}

console.log('studentDay self-check: ok');
