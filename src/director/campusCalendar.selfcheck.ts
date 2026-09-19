/**
 * Self-check for campusCalendar.ts — which campus's calendar governs a block
 * (#college-hs-calendar-deps).
 *
 * Four promises, each of which was wrong in production at least once.
 *
 * 1. THE TWO CALENDARS DISAGREE, IN BOTH DIRECTIONS. 2026-09-21 is an MDCPS
 *    teacher planning day and an ordinary Monday at Miami Dade College;
 *    2026-12-14 is a normal MDCPS school day and MDC's fall term is already
 *    over. Neither set can be derived from the other, and a check that only
 *    proved the first direction would pass on "MDC is closed whenever MDCPS
 *    is", which is the shape of the original bug.
 *
 * 2. THE CAMPUS COMES FROM THE ROOM, NOT FROM THE WORD "COLLEGE". A College
 *    Chamber Orchestra rehearsal happens on NWSA's campus during the high
 *    school's own afternoon, so MDCPS closes it. Picking by `collegeLevel`
 *    alone is the mistake this module exists to make impossible.
 *
 * 3. A SHARED BLOCK IS AN NWSA BLOCK. One high school ensemble on the event
 *    means the room is the high school's, whoever else is in it.
 *
 * 4. AN UNKNOWN GROUP FAILS TOWARDS MDCPS. The two ways to be wrong are not
 *    symmetric: reading it as college would leave a high school block running
 *    on a day the director just cancelled, and families would show up to a
 *    locked room.
 *
 * Run: npx tsx src/director/campusCalendar.selfcheck.ts
 */
import {
  campusForEvent, campusForGroup, isCampusClosed, splitClosure,
  LESSON_CAMPUS, CAMPUS_FULL_NAME,
} from './campusCalendar';
import type { CalendarEvent, Ensemble } from './types';

// Failures are collected rather than thrown one at a time: when the two
// calendars are edited for a new school year, several of these go at once and
// seeing only the first one would mean four more runs to find the rest.
let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { console.error('FAIL:', msg); failures++; }
}
function eq<T>(actual: T, expected: T, msg: string) {
  if (actual !== expected) {
    console.error(`FAIL: ${msg}\n   expected: ${String(expected)}\n   actual:   ${String(actual)}`);
    failures++;
  }
}

type G = Pick<Ensemble, 'kind' | 'collegeLevel'>;
const ev = (ensembleIds: string[]): Pick<CalendarEvent, 'ensembleIds'> => ({ ensembleIds });

// ── 1. the calendars disagree, both ways ──────────────────────────────
eq(isCampusClosed('mdcps', '2026-09-21'), true, 'Sep 21 2026 is an MDCPS teacher planning day');
eq(isCampusClosed('mdc', '2026-09-21'), false, 'Miami Dade College is in full session that same Monday');
eq(splitClosure('2026-09-21'), 'mdcps', 'Sep 21 splits: the high school is off, the college is not');

eq(isCampusClosed('mdcps', '2026-12-14'), false, 'MDCPS runs to Dec 17, so Dec 14 is a school day');
eq(isCampusClosed('mdc', '2026-12-14'), true, "MDC's fall term ended Dec 11 — the split runs the other way too");
eq(splitClosure('2026-12-14'), 'mdc', 'Dec 14 splits the other way: the college is off, the high school is not');

eq(splitClosure('2026-09-07'), null, 'Labor Day closes both campuses — no split, nothing for a screen to warn about');
eq(splitClosure('2026-09-22'), null, 'an ordinary Tuesday closes neither');

// Regression guard for the shape of the original bug: if MDC's set were ever
// re-derived from the MDCPS one, every MDCPS-only closure would start reading
// as a college closure too and this count would collapse to zero.
// The Thanksgiving days are the sharpest of these: MDCPS takes the whole
// week, MDC closes for the Thursday and Friday only.
const MDCPS_ONLY = [
  '2026-09-21', '2026-11-03', '2026-11-23', '2026-11-24', '2026-11-25',
  '2027-01-15', '2027-03-10',
];
eq(MDCPS_ONLY.filter(d => isCampusClosed('mdcps', d) && !isCampusClosed('mdc', d)).length,
  MDCPS_ONLY.length,
  'every MDCPS-only closure — planning days, the professional learning day, the extra Thanksgiving recess days — is a NORMAL day at MDC');

// ── 2. the campus comes from the room ─────────────────────────────────
eq(campusForGroup({ kind: 'class', collegeLevel: true } as G), 'mdc',
  'an actual MDC course meets on the MDC schedule');
eq(campusForGroup({ kind: 'ensemble', collegeLevel: true } as G), 'mdcps',
  'College Chamber Orchestra rehearses in an NWSA room — MDCPS governs it');
eq(campusForGroup({ kind: 'masterclass', collegeLevel: true } as G), 'mdcps',
  'a college master class is still on NWSA\'s campus');
eq(campusForGroup({ kind: 'class' } as G), 'mdcps', 'AP Theory is a high school class');
eq(campusForGroup({ name: 'Symphony Orchestra' } as G), 'mdcps',
  'a group with no kind at all is an ensemble (absent = ensemble) and MDCPS\'s');

// ── 3. a shared block is an NWSA block ────────────────────────────────
const groups: Record<string, G | undefined> = {
  'class-college-piano-1': { kind: 'class', collegeLevel: true },
  'class-college-theory-1': { kind: 'class', collegeLevel: true },
  'symphony-orchestra': { kind: 'ensemble' },
  'college-chamber-orchestra': { kind: 'ensemble', collegeLevel: true },
};
eq(campusForEvent(ev(['class-college-piano-1']), groups), 'mdc', 'one MDC course is the college\'s');
eq(campusForEvent(ev(['class-college-piano-1', 'class-college-theory-1']), groups), 'mdc',
  'two MDC courses on one block are still the college\'s');
eq(campusForEvent(ev(['class-college-piano-1', 'symphony-orchestra']), groups), 'mdcps',
  'one high school ensemble on the block makes it an NWSA room');
eq(campusForEvent(ev(['college-chamber-orchestra']), groups), 'mdcps',
  'the college ensemble\'s rehearsal follows MDCPS');
eq(campusForEvent(ev([]), groups), 'mdcps',
  'a school-wide marker belongs to the high school calendar');

// ── 4. unknown groups fail towards MDCPS ──────────────────────────────
eq(campusForGroup(undefined), 'mdcps', 'a group that could not be resolved reads as MDCPS');
eq(campusForEvent(ev(['deleted-group']), groups), 'mdcps',
  'an id with no group doc left reads as MDCPS — over-cancelling is visible, under-cancelling is not');
eq(campusForEvent(ev(['class-college-piano-1', 'deleted-group']), groups), 'mdcps',
  'one unresolvable id is enough to keep the block on the high school calendar');

// ── lessons ───────────────────────────────────────────────────────────
eq(LESSON_CAMPUS, 'mdcps',
  'an applied lesson is taught in an NWSA room, so MDCPS governs it — the same set slotDates() generates against');

// ── the labels a director actually reads ──────────────────────────────
assert(CAMPUS_FULL_NAME.mdcps.includes('MDCPS') && CAMPUS_FULL_NAME.mdc.includes('Miami Dade'),
  'each campus label names the district or the college outright — "college day" alone is what got misread');

// Thrown, not process.exit()'d: this file is compiled by tsconfig.app.json,
// which has no node types, and every other self-check under src/ fails the
// same way.
if (failures > 0) throw new Error(`campusCalendar selfcheck: ${failures} failure(s)`);
console.log('campusCalendar selfcheck: all checks passed');
