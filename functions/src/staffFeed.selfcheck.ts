/**
 * Self-check for the "my calendar" endpoint (#my-calendar).
 * Run: node --experimental-strip-types functions/src/staffFeed.selfcheck.ts
 *
 * Runs in deploy-functions.yml BEFORE any credential is written, for the same
 * reason its two siblings do: a broken guard must fail the build, not deploy
 * and then fail.
 *
 * The promise this file exists to pin is a FAIL-CLOSED one. The view is
 * derived, not chosen, so nobody ever sees the filters that produced their
 * calendar — if the derivation widens, the first person to notice would be
 * whoever reads someone else's schedule.
 */
import type { Firestore } from 'firebase-admin/firestore';
import { buildStaffIcs, isoOffset, myCalendarView, staffTokenDocId, withinWindow } from './staffFeed.ts';
import {
  assignmentMatchesView, eventMatchesView, isEveryEnsemble,
} from '../../src/shared/calendarView.ts';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

const ENSEMBLES = [
  { id: 'symphony', name: 'Symphony Orchestra' },
  { id: 'phil', name: 'Philharmonic' },
  { id: 'theory-1', name: 'Music Theory I' },
  { id: 'combo-1', name: 'Jazz Combo #1' },
  { id: 'combo-2', name: 'Jazz Combo #2' },
];

// ── The token doc id matches what firestore.rules pins ────────────────
// The rule reads:  doc == 'staff__' + request.auth.token.email
// If this format moves, every staff member silently loses their own token.
assert(staffTokenDocId('dir@nwsa.edu') === 'staff__dir@nwsa.edu',
  'token doc id format is the one firestore.rules compares against');
assert(staffTokenDocId('dir@nwsa.edu') !== 'appointments__dir@nwsa.edu',
  'and it is NOT the appointments token — resetting one must not revoke the other');

// ── NO ASSIGNMENTS MUST NEVER MEAN "EVERYTHING" ───────────────────────
// This is the whole reason `school` is hardcoded true. With school:false and
// an empty ensemble list, isEveryEnsemble() is true and eventMatchesView()
// matches every event in the school — so an applied teacher, who legitimately
// has no ensembles, would be handed the entire calendar.
{
  const none = myCalendarView(null, ENSEMBLES);
  assert(none.ensembleIds.length === 0, 'no assignments → no ensembles');
  assert(none.school === true, 'school is always true');
  assert(!isEveryEnsemble(none), 'an unassigned person does NOT get every ensemble');

  assert(!eventMatchesView({ type: 'Rehearsal', ensembleIds: ['symphony'] }, none),
    "someone else's rehearsal stays out");
  assert(!eventMatchesView({ type: 'Class', ensembleIds: ['theory-1'] }, none),
    "someone else's class stays out");
  assert(eventMatchesView({ type: 'Event', ensembleIds: [] }, none),
    'a school-wide day still reaches them — it changes everyone’s day');
  assert(!assignmentMatchesView({ ensembleIds: ['theory-1'] }, none),
    "and none of anyone's assignments");

  // Same for an empty doc and an empty array — the three ways "unassigned"
  // reaches this function.
  for (const d of [undefined, {}, { assignedEnsembleIds: [] }]) {
    assert(!isEveryEnsemble(myCalendarView(d, ENSEMBLES)), 'every empty shape fails closed');
  }
}

// ── A director gets THEIR ensembles and classes, and nobody else's ────
{
  const mine = myCalendarView({ assignedEnsembleIds: ['symphony', 'theory-1'] }, ENSEMBLES);
  assert(!isEveryEnsemble(mine), 'a narrowed view is never "everything"');

  assert(eventMatchesView({ type: 'Rehearsal', ensembleIds: ['symphony'] }, mine), 'my rehearsal');
  assert(eventMatchesView({ type: 'Class', ensembleIds: ['theory-1'] }, mine), 'my class meeting');
  assert(eventMatchesView({ type: 'Concert', ensembleIds: ['symphony', 'phil'] }, mine),
    'a shared concert — my ensemble is on it');
  assert(!eventMatchesView({ type: 'Rehearsal', ensembleIds: ['phil'] }, mine),
    "the other director's rehearsal stays out — this is the whole request");
  assert(!eventMatchesView({ type: 'Class', ensembleIds: ['combo-1'] }, mine),
    "a class I don't teach stays out");
  assert(eventMatchesView({ type: 'Event', ensembleIds: [] }, mine),
    'school-wide days ride along, as they do on every filtered view');

  assert(assignmentMatchesView({ ensembleIds: ['theory-1'] }, mine), 'my class’s due dates');
  assert(!assignmentMatchesView({ ensembleIds: ['combo-1'] }, mine), 'nobody else’s');
}

// ── Name patterns expand, so a new combo joins on its own ─────────────
// The reason this feed is derived rather than a saved filter: a hash-addressed
// view-<slug>.ics would need a new subscription every time the assignment
// changed.
{
  const combos = myCalendarView({ assignedEnsemblePatterns: ['^jazz\\s*combo'] }, ENSEMBLES);
  assert(combos.ensembleIds.includes('combo-1') && combos.ensembleIds.includes('combo-2'),
    'both combos resolved from the pattern');
  assert(!combos.ensembleIds.includes('symphony'), 'and nothing else');
  assert(eventMatchesView({ type: 'Rehearsal', ensembleIds: ['combo-2'] }, combos),
    'a combo created later is already in the calendar');

  // A malformed pattern must not take the whole calendar down with it.
  const broken = myCalendarView({ assignedEnsembleIds: ['symphony'], assignedEnsemblePatterns: ['('] }, ENSEMBLES);
  assert(broken.ensembleIds.join(',') === 'symphony', 'a bad pattern is skipped, not thrown');
}

// ── No type filter: every kind of my day is on it ─────────────────────
{
  const mine = myCalendarView({ assignedEnsembleIds: ['symphony'] }, ENSEMBLES);
  assert(mine.types.length === 0, 'no type narrowing');
  for (const type of ['Rehearsal', 'Sectional', 'Concert', 'Class', 'Event']) {
    assert(eventMatchesView({ type, ensembleIds: ['symphony'] }, mine), `${type} is mine too`);
  }
}

// ── The window is bounded on BOTH sides ───────────────────────────────
{
  const now = new Date('2026-09-01T12:00:00Z');
  const from = isoOffset(-60, now);
  const to = isoOffset(400, now);
  assert(from === '2026-07-03', 'from = 60 days back');
  assert(to === '2027-10-06', 'to = 400 days ahead');
  assert(withinWindow('2026-09-01', from, to), 'today is in the window');
  assert(withinWindow(from, from, to) && withinWindow(to, from, to), 'both ends inclusive');
  assert(!withinWindow('2026-07-02', from, to), 'older than the window is out');
  assert(!withinWindow('2027-10-07', from, to), 'further ahead than the window is out');
  assert(!withinWindow('', from, to), 'a lesson with no date is out, not in');
}

// ── End to end, over a fake Firestore ─────────────────────────────────
// The view checks above pin what "mine" MEANS; this pins that the assembled
// calendar actually honours it. The one that matters most is the lessons
// scoping: `myCalendarView` knows nothing about lessons, so a regression that
// dropped `where('teacherEmail', '==', email)` would put every teacher's
// studio — who takes lessons with whom, and when — into one person's feed and
// every assertion above would still pass.
{
  const today = new Date().toISOString().slice(0, 10);

  const DATA: Record<string, Record<string, Record<string, unknown>>> = {
    directors: {
      'dir@nwsa.edu': { assignedEnsembleIds: ['symphony'] },
      'teach@nwsa.edu': { assignedStudentIds: ['stu-1'] },
    },
    ensembles: { symphony: { name: 'Symphony Orchestra' }, phil: { name: 'Philharmonic' } },
    events: {
      'ev-mine': { type: 'Rehearsal', date: today, startTime: '09:00', endTime: '10:00', title: 'Symphony Rehearsal', ensembleIds: ['symphony'] },
      'ev-theirs': { type: 'Rehearsal', date: today, startTime: '09:00', endTime: '10:00', title: 'Phil Rehearsal', ensembleIds: ['phil'] },
      'ev-school': { type: 'Event', date: today, title: 'Teacher Planning Day', ensembleIds: [] },
    },
    assignments: {},
    lessons: {
      'les-mine': { teacherEmail: 'teach@nwsa.edu', studentId: 'stu-1', date: today, startTime: '15:00', endTime: '15:30' },
      'les-theirs': { teacherEmail: 'other@nwsa.edu', studentId: 'stu-2', date: today, startTime: '16:00', endTime: '16:30' },
    },
    studentsPublic: { 'stu-1': { name: 'Ana Reyes' }, 'stu-2': { name: 'Ben Ortiz' } },
    repertoire: {},
  };

  const snapOf = (name: string, filter?: (d: Record<string, unknown>) => boolean) => {
    const docs = Object.entries(DATA[name] ?? {})
      .filter(([, v]) => !filter || filter(v))
      .map(([id, v]) => ({ id, data: () => v, get: (f: string) => v[f] }));
    return { docs, forEach: (fn: (d: (typeof docs)[number]) => void) => docs.forEach(fn) };
  };

  const db = {
    doc: (path: string) => {
      const [coll, id] = path.split('/');
      const v = DATA[coll]?.[id];
      return { get: async () => ({ exists: Boolean(v), data: () => v, get: (f: string) => v?.[f] }) };
    },
    collection: (name: string) => {
      // Only equality on teacherEmail changes the result set here; the date
      // range is applied by the real query and re-applied in JS by
      // withinWindow, which the fixtures all sit inside.
      let eq: { field: string; value: unknown } | null = null;
      const q = {
        where(field: string, op: string, value: unknown) {
          if (op === '==') eq = { field, value };
          return q;
        },
        get: async () => snapOf(name, eq ? d => d[eq!.field] === eq!.value : undefined),
      };
      return q;
    },
  } as unknown as Firestore;

  const forDirector = await buildStaffIcs(db, 'dir@nwsa.edu');
  assert(forDirector.includes('Symphony Rehearsal'), 'the director gets their own rehearsal');
  assert(!forDirector.includes('Phil Rehearsal'), "and NOT the other director's — the whole request");
  assert(forDirector.includes('Teacher Planning Day'), 'school-wide days ride along');
  assert(!forDirector.includes('Ana Reyes'), 'a director who teaches no lessons gets none');
  assert(forDirector.includes('My schedule'), 'calendar is named for its owner’s week');

  const forTeacher = await buildStaffIcs(db, 'teach@nwsa.edu');
  assert(forTeacher.includes('Ana Reyes'), 'the applied teacher gets their own student’s lesson');
  assert(!forTeacher.includes('Ben Ortiz'), "and NEVER another teacher's studio");
  assert(!forTeacher.includes('Symphony Rehearsal') && !forTeacher.includes('Phil Rehearsal'),
    'an unassigned teacher gets nobody’s rehearsals — not even by the school-wide ride-along');
  assert(forTeacher.includes('Teacher Planning Day'), 'but still the days that move everyone');

  assert(forTeacher.startsWith('BEGIN:VCALENDAR'), 'a real calendar comes out the other end');
  assert(forTeacher.trimEnd().endsWith('END:VCALENDAR'), 'and it is closed');
}

console.log('staffFeed.selfcheck: OK');
