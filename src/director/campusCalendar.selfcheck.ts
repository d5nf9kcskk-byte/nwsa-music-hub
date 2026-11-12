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
 * 5. THE COLLEGE'S DATES ARE MDC'S OWN. The spring term ends April 30, 2027,
 *    spring break is March 22 to 28, and March 4 has no classes, each pinned
 *    from both sides against MDC's published calendar and final exam
 *    schedule. The code once used the high school's last day (June 3) and an
 *    MDCPS planning day (March 29) for the college.
 *
 * Run: npx tsx src/director/campusCalendar.selfcheck.ts
 */
import {
  campusForEvent, campusForGroup, campusForGroupId, isCampusClosed, splitClosure,
  LESSON_CAMPUS, CAMPUS_FULL_NAME,
} from './campusCalendar';
import { isCollegeGroup } from './groupKind';
import { COLLEGE_GROUP_IDS } from './collegeClasses';
import { isCollegeSessionDay, collegeClassEventDocs, collegeChamberRehearsalPatches } from './collegeSchedule';
import { MDC_YEAR, MDC_NO_SCHOOL, MDCPS_NO_SCHOOL, MDCPS_YEAR } from '../shared/academicCalendars';
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
  '2027-01-15', '2027-03-10', '2027-03-29',
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

// ── the year the college calendar covers ──────────────────────────────
// Ask answers "is there school" only inside MDC_YEAR. Outside it the list of
// closures knows nothing, so a wrong edge here would have it say the college
// is in session on a day nobody stored anything about.
assert(isCollegeSessionDay(MDC_YEAR.from) && isCollegeSessionDay(MDC_YEAR.to),
  'the first and the last day of MDC_YEAR are days the college is in session');
const shift = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
for (let n = 1; n <= 7; n++) {
  assert(!isCollegeSessionDay(shift(MDC_YEAR.from, -n)), `${n} days before MDC_YEAR the college is not in session`);
  assert(!isCollegeSessionDay(shift(MDC_YEAR.to, n)), `${n} days after MDC_YEAR the college is not in session`);
}

// ── MDC's spring 2027, from MDC's own documents ───────────────────────
//
// Sources, checked 2026-11-12 (the URLs are in src/shared/academicCalendars.ts):
//   1. MDC Final Exam Schedule, Spring 2027 (Term 2273): the term is
//      1/04/27 to 4/30/27, exams April 28 to 30.
//   2. MDC Academic Calendar: classes begin Jan. 4; Mar. 4 Employee Retreat,
//      no classes; spring break Mar. 22 to 28; April 30 last day of classes
//      and final exams.
//   3. MDC Holidays 2027: MLK Jan. 16 to 18, Presidents' Day Feb. 13 to 15.
//
// Each fact is pinned from both sides. The code once ended the college's
// spring on June 3 (the HIGH SCHOOL's last day) and kept spring break going
// through March 29 (an MDCPS teacher planning day), which put 155 college
// meetings on the calendar after the term was over.
eq(MDC_YEAR.from, '2026-08-24', 'MDC fall classes begin Aug 24, 2026');
eq(MDC_YEAR.to, '2027-04-30', "MDC's spring ends April 30, 2027, the last day of classes and final exams");
assert(MDC_YEAR.to < MDCPS_YEAR.to,
  'the college finishes before the high school does. Its last day is never the MDCPS last day');

eq(isCollegeSessionDay('2027-01-04'), true, 'Jan 4, 2027: spring classes begin');
eq(isCollegeSessionDay('2027-01-03'), false, 'Jan 3, 2027 is still winter recess');

eq(isCollegeSessionDay('2027-04-30'), true, 'April 30, 2027 is the last day of classes and finals');
eq(isCollegeSessionDay('2027-05-03'), false, 'May 3, 2027: the term is over (grades are posted that day)');
eq(isCollegeSessionDay('2027-06-03'), false, "June 3, 2027 is the high school's last day, not a college day");
eq(splitClosure('2027-05-03'), 'mdc', 'May 3 splits: the college is done, the high school is in session');

eq(isCollegeSessionDay('2027-03-26'), false, 'March 26, 2027 is inside spring break (Mar 22 to 28)');
eq(isCollegeSessionDay('2027-03-29'), true, 'March 29, 2027: classes resume after spring break');
eq(splitClosure('2027-03-29'), 'mdcps',
  'March 29 splits: it is an MDCPS teacher planning day and an ordinary Monday at the college');

eq(isCollegeSessionDay('2027-03-04'), false, 'March 4, 2027 is the Employee Retreat: no classes');
eq(isCollegeSessionDay('2027-03-03'), true, 'March 3, 2027 is an ordinary Wednesday');
eq(isCollegeSessionDay('2027-03-05'), true, 'March 5, 2027 is an ordinary Friday');
eq(splitClosure('2027-03-04'), 'mdc', 'March 4 splits: the college has no classes, the high school does');

// Every entry in MDC_NO_SCHOOL sits inside a term, so taking it out would
// change an answer. A date outside the terms (Memorial Day was one) is a
// leftover from the other calendar and says nothing.
const inTerm = (d: string) =>
  (d >= MDC_YEAR.from && d <= '2026-12-11')
  || (d >= '2027-01-04' && d <= MDC_YEAR.to && !(d >= '2027-03-22' && d <= '2027-03-28'));
eq([...MDC_NO_SCHOOL].filter(d => !inTerm(d)).join(', '), '',
  'every MDC_NO_SCHOOL date falls inside a term');
// The two sets are sourced apart. Mar 4 is the proof on MDC's side: the
// college has no classes and MDCPS has never heard of the day.
assert(MDC_NO_SCHOOL.has('2027-03-04') && !MDCPS_NO_SCHOOL.has('2027-03-04'),
  'the Employee Retreat is an MDC-only day');

// The generators follow. No class meeting and no College Chamber Orchestra
// room patch is generated outside a session day, after April 30, or on
// March 4, and the Monday classes are generated on March 29.
const generated = [...collegeClassEventDocs().map(d => d.data.date as string),
  ...collegeChamberRehearsalPatches().map(d => d.id.slice(4, 14))];
assert(generated.length > 0 && generated.every(isCollegeSessionDay),
  'every generated college meeting is on a day the college is in session');
eq(generated.filter(d => d > '2027-04-30').length, 0, 'nothing is generated after April 30, 2027');
eq(generated.filter(d => d === '2027-03-04').length, 0, 'nothing is generated on March 4, 2027');
eq(collegeClassEventDocs().filter(d => d.data.date === '2027-03-29').length, 9,
  'the nine Monday classes are generated on March 29, 2027');
eq(collegeClassEventDocs().filter(d => d.data.date === '2027-04-30').length, 1,
  'the one Friday class (Opera Workshop) meets on April 30, 2027');

// Thrown, not process.exit()'d: this file is compiled by tsconfig.app.json,
// which has no node types, and every other self-check under src/ fails the
// same way.
if (failures > 0) throw new Error(`campusCalendar selfcheck: ${failures} failure(s)`);
console.log('campusCalendar selfcheck: all checks passed');
