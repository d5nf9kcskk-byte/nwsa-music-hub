/**
 * Pins the standing weekly lesson slot (#applied) — both halves of it.
 *
 * EXPANDING one: it lands on the right weekday (a slot that drifts a day puts
 * a student in the wrong room all year), a date that already HAS a lesson is
 * never re-created (that would silently resurrect a cancelled lesson and
 * duplicate a graded one), the walk is bounded (a bad horizon must not spin),
 * and generation skips MDCPS no-school days (a lesson must never land on a
 * day off, holiday, or break).
 *
 * CHANGING one: the change reaches the lessons already on the calendar, it
 * never overrules a lesson somebody decided about (graded, cancelled, typed
 * by hand), a weekday change moves a lesson inside its own week rather than
 * to a later one, and "every week is scheduled" stays distinguishable from
 * "every week is scheduled at the WRONG time". That last one is not
 * hypothetical: the panel counted dates only, so re-timing a lesson left it
 * announcing that the whole year was handled.
 */
import {
  doubledUpOffSlot, isLessonSlot, lessonMatchesSlot, lessonsOffSlot, pendingSlotDates, planHasWork, schoolYearEnd,
  skippedNoSchoolDates, slotChangePlan, slotDates, slotSentence, type LessonSlot,
} from './lessonSchedule';
import { MDCPS_NO_SCHOOL } from '../shared/academicCalendars.ts';
import type { Lesson } from './types';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

// 2026-09-01 is a Tuesday; 2026-09-04 is the first Friday on or after it.
const friday: LessonSlot = { weekday: 5, startTime: '14:00', endTime: '14:45', location: 'Room 214' };

const sept = slotDates(friday, '2026-09-01', '2026-09-30');
assert(sept[0] === '2026-09-04', `first Friday on/after Sep 1 is Sep 4, got ${sept[0]}`);
assert(sept.length === 4 && sept[3] === '2026-09-25', `four Fridays in Sept 2026, got ${sept.join(',')}`);
assert(sept.every(d => new Date(`${d}T00:00:00Z`).getUTCDay() === 5), 'every generated date is a Friday');

// `from` that IS the weekday counts itself — a teacher setting a slot on
// Friday morning expects that afternoon's lesson, not next week's.
assert(slotDates(friday, '2026-09-04', '2026-09-04')[0] === '2026-09-04', 'from-day inclusive');
// Both ends inclusive.
assert(slotDates(friday, '2026-09-01', '2026-09-03').length === 0, 'no Friday before Sep 4');

// Bounded: an absurd horizon returns a capped list rather than running away.
// Starts after the last MDCPS_NO_SCHOOL entry so the cap is measured on its
// own, with no no-school skips in the way.
assert(slotDates(friday, '2027-06-01', '2099-01-01').length === 120, 'walk is capped at 120 weeks');
assert(slotDates(friday, '2026-09-30', '2026-09-01').length === 0, 'reversed range is empty');

// MDCPS no-school days are skipped — a lesson never lands on a day off.
// 2026-09-07 (Labor Day) is itself the first Monday on/after Sep 1, so the
// walk's very first candidate is the one that must be dropped.
const monday: LessonSlot = { weekday: 1, startTime: '14:00', endTime: '14:45' };
assert(MDCPS_NO_SCHOOL.has('2026-09-07'), 'fixture assumption: Labor Day is in MDCPS_NO_SCHOOL');
const laborWeek = slotDates(monday, '2026-09-01', '2026-09-14');
assert(laborWeek.join(',') === '2026-09-14', `Labor Day Monday is skipped, got ${laborWeek.join(',')}`);

// ...and the skip is COUNTABLE. Dropping a week silently reads as a broken
// generator, so every consumer can say how many and why.
const laborSkips = skippedNoSchoolDates(monday, [], '2026-09-01', '2026-09-14');
assert(laborSkips.join(',') === '2026-09-07', `Labor Day is reported as skipped, got ${laborSkips.join(',')}`);

// The two halves partition the walk: every weekday the slot lands on is
// either generated or reported as skipped, never both and never neither.
// This is what a second, independent walk would eventually break.
{
  const from = '2026-09-01';
  const through = '2027-05-31';
  const kept = slotDates(monday, from, through);
  const dropped = skippedNoSchoolDates(monday, [], from, through);
  const all = new Set([...kept, ...dropped]);
  assert(all.size === kept.length + dropped.length, 'kept and skipped never overlap');
  assert(kept.every(d => !dropped.includes(d)), 'a generated date is never also reported skipped');
  assert(dropped.length > 0, 'a full school year hits at least one MDCPS closure');
  assert(dropped.every(d => MDCPS_NO_SCHOOL.has(d)), 'every skipped date is a real MDCPS closure');
}

// A date that already HAS a lesson was not skipped — the teacher put it there
// on purpose, and some studios do teach through a planning day. Counting it
// as skipped would tell them the Hub refused something it never touched.
assert(skippedNoSchoolDates(monday, [{ date: '2026-09-07' }], '2026-09-01', '2026-09-14').length === 0,
  'a hand-made lesson on a closure day is not a skip');

// A date that already has a lesson is never offered again — cancelled included.
const existing: Pick<Lesson, 'date'>[] = [{ date: '2026-09-04' }, { date: '2026-09-18' }];
const pending = pendingSlotDates(friday, existing, '2026-09-01', '2026-09-30');
assert(pending.join(',') === '2026-09-11,2026-09-25', `pending skips taken dates, got ${pending.join(',')}`);
assert(pendingSlotDates(friday, sept.map(date => ({ date })), '2026-09-01', '2026-09-30').length === 0,
  'a fully-scheduled month has nothing pending');

// School year ends the following May for August-or-later dates.
assert(schoolYearEnd('2026-09-01') === '2027-05-31', 'Sept 2026 → May 2027');
assert(schoolYearEnd('2027-02-01') === '2027-05-31', 'Feb 2027 → May 2027');

// Malformed slots fail closed rather than generating garbage dates.
assert(!isLessonSlot({ weekday: 7, startTime: '14:00', endTime: '14:45' }), 'weekday 7 is not a day');
assert(!isLessonSlot({ weekday: 5, startTime: '2pm', endTime: '14:45' }), 'times must be HH:MM');
assert(slotDates({ weekday: 9, startTime: 'x', endTime: 'y' } as LessonSlot, '2026-09-01', '2026-09-30').length === 0,
  'invalid slot generates nothing');

assert(slotSentence(friday) === 'Fridays, 2:00 PM – 2:45 PM · Room 214', `sentence, got "${slotSentence(friday)}"`);
assert(slotSentence({ weekday: 1, startTime: '00:30', endTime: '12:05' }) === 'Mondays, 12:30 AM – 12:05 PM',
  `midnight and noon read correctly, got "${slotSentence({ weekday: 1, startTime: '00:30', endTime: '12:05' })}"`);
assert(slotSentence({ weekday: 3, startTime: '14:00', endTime: '14:45' }) === 'Wednesdays, 2:00 PM – 2:45 PM',
  'no location, no trailing separator');

// ── Changing a standing time ───────────────────────────────────────────
// Four more promises, and every one of them was broken by the version that
// simply saved the new recipe: a time change reaches the lessons already on
// the calendar, it never touches a lesson somebody decided about (graded,
// cancelled, typed by hand), a weekday change moves a lesson within its OWN
// week rather than to some later one, and the panel can tell "every week is
// scheduled" apart from "every week is scheduled at the WRONG time".

const lesson = (over: Partial<Lesson>): Lesson => ({
  id: over.date ?? 'x', teacherEmail: 't@e.org', studentId: 's1',
  date: '2026-09-04', startTime: '14:00', endTime: '14:45', location: 'Room 214',
  status: 'Scheduled', createdAt: 0, ...over,
});

// Same weekday, new time — the case that silently did nothing.
const later: LessonSlot = { weekday: 5, startTime: '15:00', endTime: '15:45', location: 'Room 214' };
const fourFridays = sept.map(date => lesson({ id: date, date }));
const retime = slotChangePlan(friday, later, fourFridays, '2026-09-01', '2026-09-30');
assert(retime.move.length === 4, `all four Fridays move to the new time, got ${retime.move.length}`);
assert(retime.move.every(m => m.toDate === m.fromDate), 'same weekday keeps the date');
assert(retime.create.length === 0, 'nothing to create — the dates already have lessons');
assert(planHasWork(retime), 'a pure re-time is work');

// Weekday change — each lesson moves inside its own week, not to the next one.
const wednesday: LessonSlot = { weekday: 3, startTime: '14:00', endTime: '14:45' };
const toWed = slotChangePlan(friday, wednesday, fourFridays, '2026-09-01', '2026-09-30');
assert(toWed.move.length === 4, `four lessons move day, got ${toWed.move.length}`);
assert(toWed.move[0].fromDate === '2026-09-04' && toWed.move[0].toDate === '2026-09-02',
  `Fri Sep 4 moves back to Wed Sep 2 in the SAME week, got ${toWed.move[0].toDate}`);
assert(toWed.move.every(m => m.toDate < m.fromDate), 'every move stays in its own week');
// Moving the weekday can uncover a week the old day never reached: September
// 2026 has five Wednesdays and four Fridays, so Wed Sep 30 is genuinely a new
// lesson. `create` is computed AFTER the moves land, or it would offer to add
// a lesson on a date a move is about to fill.
assert(toWed.create.join(',') === '2026-09-30',
  `only the uncovered fifth Wednesday is left to create, got ${toWed.create.join(',') || 'none'}`);

// Decisions somebody already made are never overruled by a recipe edit.
const mixed = [
  lesson({ id: 'graded', date: '2026-09-04', grade: '92' }),
  lesson({ id: 'cancelled', date: '2026-09-11', status: 'Cancelled' }),
  lesson({ id: 'byHand', date: '2026-09-15', startTime: '09:00', endTime: '09:45' }),
  lesson({ id: 'plain', date: '2026-09-18' }),
];
const careful = slotChangePlan(friday, later, mixed, '2026-09-01', '2026-09-30');
assert(careful.move.length === 1 && careful.move[0].id === 'plain',
  `only the untouched Friday moves, got ${careful.move.map(m => m.id).join(',') || 'none'}`);
assert(careful.keptGraded === 1 && careful.keptCancelled === 1 && careful.keptOther === 1,
  `each kind is counted and reported, got ${JSON.stringify(careful)}`);

// TWO PARALLEL SERIES. The reported case: the old weekly time still had a full
// series, the new time already had one too (Add ran before Move), and every
// move was refused as a collision and filed as "set by hand" — leaving the
// student down for two lessons a week with nothing on screen offering a way
// out. A blocked move whose blocker sits ON THE NEW TIME is the old series
// left behind, and is offered for removal instead.
{
  const oldMon: LessonSlot = { weekday: 1, startTime: '15:30', endTime: '16:20', location: '4103' };
  const newTue: LessonSlot = { weekday: 2, startTime: '18:00', endTime: '18:50' };
  const both = [
    lesson({ id: 'mon-04', date: '2027-01-04', startTime: '15:30', endTime: '16:20', location: '4103' }),
    lesson({ id: 'tue-05', date: '2027-01-05', startTime: '18:00', endTime: '18:50', location: undefined }),
    lesson({ id: 'mon-11', date: '2027-01-11', startTime: '15:30', endTime: '16:20', location: '4103' }),
    lesson({ id: 'tue-12', date: '2027-01-12', startTime: '18:00', endTime: '18:50', location: undefined }),
  ];
  const p = slotChangePlan(oldMon, newTue, both, '2027-01-01', '2027-01-31');
  assert(p.move.length === 0, `nothing can move, the new days are taken, got ${p.move.length}`);
  assert(p.supersede.map(s => s.id).sort().join(',') === 'mon-04,mon-11',
    `both Mondays are superseded, got ${p.supersede.map(s => s.id).join(',') || 'none'}`);
  assert(p.keptOther === 0, `a superseded lesson is NOT "set by hand", got keptOther ${p.keptOther}`);
  assert(p.supersede[0].coveredBy === '2027-01-05', 'names the lesson that covers that week');
  assert(planHasWork(p), 'a plan that only removes doubles is still work to offer');
}

// A blocker that is NOT on the new time is somebody's own arrangement: the old
// lesson stays put and is reported as such, never silently deleted.
{
  const oldMon: LessonSlot = { weekday: 1, startTime: '15:30', endTime: '16:20' };
  const newTue: LessonSlot = { weekday: 2, startTime: '18:00', endTime: '18:50' };
  const p = slotChangePlan(oldMon, newTue, [
    lesson({ id: 'mon', date: '2027-01-04', startTime: '15:30', endTime: '16:20' }),
    lesson({ id: 'makeup', date: '2027-01-05', startTime: '09:00', endTime: '09:45' }),
  ], '2027-01-01', '2027-01-10');
  assert(p.supersede.length === 0, 'a 9am makeup does not supersede anything');
  // Two, and both are right: the Monday because its target week is blocked by
  // something that is not the standing time, and the makeup because it belongs
  // to neither recipe. Both are somebody's own arrangement.
  assert(p.keptOther === 2, `the Monday and the makeup are both left alone, got ${p.keptOther}`);
}

// Never a graded or cancelled lesson, however doubled up it looks.
{
  const oldMon: LessonSlot = { weekday: 1, startTime: '15:30', endTime: '16:20' };
  const newTue: LessonSlot = { weekday: 2, startTime: '18:00', endTime: '18:50' };
  const p = slotChangePlan(oldMon, newTue, [
    lesson({ id: 'graded', date: '2027-01-04', startTime: '15:30', endTime: '16:20', grade: '95' }),
    lesson({ id: 'cancelled', date: '2027-01-11', startTime: '15:30', endTime: '16:20', status: 'Cancelled' }),
    lesson({ id: 'tue-05', date: '2027-01-05', startTime: '18:00', endTime: '18:50' }),
    lesson({ id: 'tue-12', date: '2027-01-12', startTime: '18:00', endTime: '18:50' }),
  ], '2027-01-01', '2027-01-31');
  assert(p.supersede.length === 0, 'a graded or cancelled lesson is never offered for removal');
  assert(p.keptGraded === 1 && p.keptCancelled === 1, 'both are reported in their own bucket');
}

// The standing version, keyed on the CURRENT time alone. This is the one that
// rescues a sheet where the stored recipe already matches the series being
// kept, so "what was the old recipe" can no longer answer anything.
{
  const monday: LessonSlot = { weekday: 1, startTime: '15:30', endTime: '16:20', location: '4103' };
  const twoSeries = [
    lesson({ id: 'mon-04', date: '2027-01-04', startTime: '15:30', endTime: '16:20', location: '4103' }),
    lesson({ id: 'tue-05', date: '2027-01-05', startTime: '18:00', endTime: '18:50', location: undefined }),
    lesson({ id: 'mon-11', date: '2027-01-11', startTime: '15:30', endTime: '16:20', location: '4103' }),
    lesson({ id: 'tue-12', date: '2027-01-12', startTime: '18:00', endTime: '18:50', location: undefined }),
  ];
  const dup = doubledUpOffSlot(monday, twoSeries, '2027-01-01');
  assert(dup.map(d => d.id).join(',') === 'tue-05,tue-12',
    `the off-slot series is offered, oldest first, got ${dup.map(d => d.id).join(',') || 'none'}`);
  assert(dup[0].coveredBy === '2027-01-04', 'names the lesson being kept that week');
  // A week with only the off-slot lesson is NOT doubled up — there is nothing
  // covering it, and removing it would leave that week with no lesson at all.
  assert(doubledUpOffSlot(monday, [twoSeries[1]], '2027-01-01').length === 0,
    'a lone off-slot lesson is never offered for removal');
  // The keeper itself is never offered.
  assert(!dup.some(d => d.id.startsWith('mon-')), 'the lesson on the standing time is kept');
  assert(doubledUpOffSlot(undefined, twoSeries, '2027-01-01').length === 0, 'no slot, no opinion');
  assert(doubledUpOffSlot(monday, twoSeries, '2027-02-01').length === 0, 'the past is never touched');
}

// THE PLAN REMEMBERS WHAT IT WAS COMPUTED AGAINST. This is not decoration.
// saveSlot() writes the new time onto the director doc before the offer is
// drawn, so any apply path that re-reads "the current slot" to learn the OLD
// one gets the new time back, compares it against itself, recognises nothing,
// and silently does nothing. That shipped in #147 and broke the move button
// outright. Carrying `before` on the plan is what makes the correct value
// travel to the press.
{
  const oldMon: LessonSlot = { weekday: 1, startTime: '15:30', endTime: '16:20' };
  const newThu: LessonSlot = { weekday: 4, startTime: '11:30', endTime: '12:20' };
  const mondays = [
    lesson({ id: 'm1', date: '2026-09-14', startTime: '15:30', endTime: '16:20' }),
    lesson({ id: 'm2', date: '2026-09-28', startTime: '15:30', endTime: '16:20' }),
  ];
  const p = slotChangePlan(oldMon, newThu, mondays, '2026-09-08', '2026-10-31');
  assert(p.before === oldMon, 'the plan carries the recipe it was computed against');
  assert(p.move.length === 2, `both Mondays move to Thursday, got ${p.move.length}`);
  // The exact shape of the bug: recomputing with the NEW slot as `before`
  // finds nothing, which is why re-deriving it is never allowed.
  const wrong = slotChangePlan(newThu, newThu, mondays, '2026-09-08', '2026-10-31');
  assert(wrong.move.length === 0,
    'comparing the new time against itself moves nothing — the regression, pinned');
}

// A move never lands on a date that already holds a lesson.
const collide = slotChangePlan(friday, wednesday, [
  lesson({ id: 'fri', date: '2026-09-04' }),
  lesson({ id: 'wed', date: '2026-09-02', startTime: '08:00', endTime: '08:45' }),
], '2026-09-01', '2026-09-07');
assert(collide.move.length === 0, 'Wed Sep 2 is taken, so Fri Sep 4 stays put');

// The past is a record, not a schedule.
assert(slotChangePlan(friday, later, fourFridays, '2026-09-30', '2026-10-31').move.length === 0,
  'lessons before `from` are never re-timed');

// Without the OLD recipe nothing is movable — fail closed rather than guess.
assert(slotChangePlan(undefined, later, fourFridays, '2026-09-01', '2026-09-30').move.length === 0,
  'no previous slot means nothing is recognisably the slot’s to move');

// The number the panel needs: scheduled but in the wrong place.
assert(lessonsOffSlot(later, fourFridays, '2026-09-01').length === 4,
  'four Fridays at 2:00 are all off a 3:00 slot');
assert(lessonsOffSlot(friday, fourFridays, '2026-09-01').length === 0, 'on-slot lessons are not flagged');
assert(lessonsOffSlot(later, [lesson({ status: 'Cancelled' }), lesson({ grade: '88' })], '2026-09-01').length === 0,
  'a settled lesson is never counted as needing a fix');
assert(lessonMatchesSlot(friday, { date: '2026-09-04', startTime: '14:00', endTime: '14:45', location: 'Room 214' }),
  'a lesson on the slot matches');
assert(!lessonMatchesSlot(friday, { date: '2026-09-04', startTime: '14:00', endTime: '14:45', location: 'Room 9' }),
  'a different room is a different time slot as far as the student is concerned');

console.log('lessonSchedule.selfcheck: OK');
