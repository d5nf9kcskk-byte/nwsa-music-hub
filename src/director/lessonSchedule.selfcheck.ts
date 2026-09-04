/**
 * Pins the standing weekly lesson slot (#applied) — both halves of it.
 *
 * EXPANDING one: it lands on the right weekday (a slot that drifts a day puts
 * a student in the wrong room all year), a date that already HAS a lesson is
 * never re-created (that would silently resurrect a cancelled lesson and
 * duplicate a graded one), and the walk is bounded (a bad horizon must not
 * spin).
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
  isLessonSlot, lessonMatchesSlot, lessonsOffSlot, pendingSlotDates, planHasWork, schoolYearEnd,
  slotChangePlan, slotDates, slotSentence, type LessonSlot,
} from './lessonSchedule';
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
assert(slotDates(friday, '2026-09-01', '2099-01-01').length === 120, 'walk is capped at 120 weeks');
assert(slotDates(friday, '2026-09-30', '2026-09-01').length === 0, 'reversed range is empty');

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
