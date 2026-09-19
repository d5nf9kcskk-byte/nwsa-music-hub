/**
 * Self-check for campusCalendar.ts — which academic calendar governs a group
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
 * 2. COLLEGE-LEVEL DECIDES, AND NOTHING ELSE DOES. MDC governs college, MDCPS
 *    governs high school, and there is no crossover: College Chamber
 *    Orchestra is a college ENSEMBLE and follows MDC, a master class is a high
 *    school class and follows MDCPS. An earlier pass keyed this on `kind` too
 *    and put College Chamber Orchestra on the MDCPS calendar — so these
 *    assertions name both groups explicitly.
 *
 * 3. A GROUP HAS EXACTLY ONE CALENDAR. Every group answers `mdc` or `mdcps`,
 *    the two are complements, and the answer agrees with `isCollegeGroup` —
 *    the app's ONE spelling of college-ness — for every shape of group.
 *
 * 4. AN UNKNOWN GROUP FAILS TOWARDS MDCPS. The two ways to be wrong are not
 *    symmetric: reading it as college would leave a high school block running
 *    on a day the director just cancelled, and families would arrive to a
 *    locked room.
 *
 * Run: npx tsx src/director/campusCalendar.selfcheck.ts
 */
import {
  campusForEvent, campusForGroup, campusForGroupId, isCampusClosed, splitClosure,
  LESSON_CAMPUS, CAMPUS_FULL_NAME,
} from './campusCalendar';
import { isCollegeGroup } from './groupKind';
import { COLLEGE_GROUP_IDS } from './collegeClasses';
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

eq(splitClosure('2026-09-07'), null, 'Labor Day closes both — no split, nothing for a screen to warn about');
eq(splitClosure('2026-09-22'), null, 'an ordinary Tuesday closes neither');

// Regression guard for the shape of the original bug: if MDC's set were ever
// re-derived from the MDCPS one, every MDCPS-only closure would start reading
// as a college closure too. The Thanksgiving days are the sharpest of these —
// MDCPS takes the whole week, MDC closes for the Thursday and Friday only.
const MDCPS_ONLY = [
  '2026-09-21', '2026-11-03', '2026-11-23', '2026-11-24', '2026-11-25',
  '2027-01-15', '2027-03-10',
];
eq(MDCPS_ONLY.filter(d => isCampusClosed('mdcps', d) && !isCampusClosed('mdc', d)).length,
  MDCPS_ONLY.length,
  'every MDCPS-only closure — planning days, the professional learning day, the extra Thanksgiving recess days — is a NORMAL day at MDC');

// ── 2. college-level decides, and nothing else does ───────────────────
eq(campusForGroup({ kind: 'ensemble', collegeLevel: true } as G), 'mdc',
  'College Chamber Orchestra is a COLLEGE ensemble — it follows MDC, not the high school');
eq(campusForGroup({ kind: 'class', collegeLevel: true } as G), 'mdc',
  'a dual-enrollment course follows MDC');
eq(campusForGroup({ kind: 'masterclass' } as G), 'mdcps',
  'a master class is a HIGH SCHOOL class — it follows MDCPS and has no college connection');
eq(campusForGroup({ kind: 'class' } as G), 'mdcps', 'AP Theory is a high school class');
eq(campusForGroup({ kind: 'ensemble' } as G), 'mdcps', 'Symphony Orchestra is a high school ensemble');
eq(campusForGroup({} as G), 'mdcps',
  'a group with no kind and no flag (absent = high school ensemble) follows MDCPS');

// The exact pairing that was wrong before: same `kind`, opposite calendars,
// decided by the college flag alone.
eq(campusForGroup({ kind: 'ensemble', collegeLevel: true } as G) === campusForGroup({ kind: 'ensemble' } as G),
  false, 'two ensembles differing ONLY in collegeLevel must land on different calendars');
eq(campusForGroup({ kind: 'masterclass' } as G) === campusForGroup({ kind: 'class', collegeLevel: true } as G),
  false, 'a master class and a college class must land on different calendars');

// ── 3. one calendar per group, agreeing with isCollegeGroup ───────────
const SHAPES: G[] = [
  {} as G,
  { kind: 'ensemble' } as G,
  { kind: 'class' } as G,
  { kind: 'masterclass' } as G,
  { kind: 'ensemble', collegeLevel: true } as G,
  { kind: 'class', collegeLevel: true } as G,
  { kind: 'masterclass', collegeLevel: true } as G,
  { kind: 'ensemble', collegeLevel: false } as G,
];
assert(
  SHAPES.every(g => campusForGroup(g) === (isCollegeGroup(g) ? 'mdc' : 'mdcps')),
  'the campus is exactly isCollegeGroup — the app\'s ONE spelling of college-ness, never a second one',
);

// ── 4. events, and unknown groups ─────────────────────────────────────
const groups: Record<string, G | undefined> = {
  'class-college-piano-1': { kind: 'class', collegeLevel: true } as G,
  'class-college-theory-1': { kind: 'class', collegeLevel: true } as G,
  'college-chamber-orchestra': { kind: 'ensemble', collegeLevel: true } as G,
  'symphony-orchestra': { kind: 'ensemble' } as G,
  'masterclass-violin': { kind: 'masterclass' } as G,
};
eq(campusForEvent(ev(['class-college-piano-1']), groups), 'mdc', 'one college class is the college\'s');
eq(campusForEvent(ev(['college-chamber-orchestra']), groups), 'mdc',
  'the College Chamber Orchestra rehearsal is the college\'s — an MDCPS planning day must not cancel it');
eq(campusForEvent(ev(['masterclass-violin']), groups), 'mdcps',
  'the violin master class is the high school\'s — an MDC closure must not cancel it');
eq(campusForEvent(ev(['class-college-piano-1', 'class-college-theory-1']), groups), 'mdc',
  'two college groups on one block are still the college\'s');
eq(campusForEvent(ev([]), groups), 'mdcps',
  'a school-wide marker belongs to the high school calendar');
// Should not exist — the two programs are separate — so this is a fail-safe.
eq(campusForEvent(ev(['college-chamber-orchestra', 'symphony-orchestra']), groups), 'mdcps',
  'a block that somehow mixes the two programs falls back to MDCPS rather than guessing');

eq(campusForGroup(undefined), 'mdcps', 'a group that could not be resolved reads as MDCPS');
eq(campusForEvent(ev(['deleted-group']), groups), 'mdcps',
  'an id with no group doc left reads as MDCPS — over-cancelling is visible, under-cancelling is not');
eq(campusForEvent(ev(['class-college-piano-1', 'deleted-group']), groups), 'mdcps',
  'one unresolvable id is enough to keep the block on the high school calendar');

// ── lessons ───────────────────────────────────────────────────────────
eq(LESSON_CAMPUS, 'mdcps',
  'the applied lesson program is the high school one — the same set slotDates() generates against');

// ── the generators agree with the app ─────────────────────────────────
//
// The seeds build from the hardcoded program specs, before any `ensembles`
// doc exists, so they ask `campusForGroupId`. If that ever disagreed with
// `campusForGroup` on a seeded group, a rehearsal would be CREATED on one
// calendar and CANCELLED on the other, which is how College Chamber
// Orchestra came to be generated against MDCPS while
// `collegeChamberRehearsalPatches()` patched it against MDC.
assert(COLLEGE_GROUP_IDS.size > 0, 'the college program has groups in it at all');
assert(
  [...COLLEGE_GROUP_IDS].every(id =>
    campusForGroupId(id) === 'mdc'
    && campusForGroup({ collegeLevel: true } as G) === campusForGroupId(id)),
  'every seeded college group answers MDC by id, the same answer its `collegeLevel` doc gives',
);
eq(campusForGroupId('college-chamber-orchestra'), 'mdc',
  'the College Chamber Orchestra rehearsal is generated on MDC\'s calendar, not the high school\'s');
eq(campusForGroupId('symphony-orchestra'), 'mdcps', 'a high school ensemble seeds against MDCPS');
eq(campusForGroupId('masterclass-violin'), 'mdcps', 'a master class seeds against MDCPS');
eq(campusForGroupId('high-school-choir'), 'mdcps', 'HS Choir seeds against MDCPS');
assert(!COLLEGE_GROUP_IDS.has('masterclass-violin') && !COLLEGE_GROUP_IDS.has('masterclass-cello'),
  'no master class is in the college program — they are high school classes');

// ── the labels a director actually reads ──────────────────────────────
assert(CAMPUS_FULL_NAME.mdcps.includes('MDCPS') && CAMPUS_FULL_NAME.mdc.includes('Miami Dade'),
  'each campus label names the district or the college outright — "college day" alone is what got misread');

// Thrown, not process.exit()'d: this file is compiled by tsconfig.app.json,
// which has no node types, and every other self-check under src/ fails the
// same way.
if (failures > 0) throw new Error(`campusCalendar selfcheck: ${failures} failure(s)`);
console.log('campusCalendar selfcheck: all checks passed');
