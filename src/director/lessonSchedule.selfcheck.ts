/**
 * Pins the standing weekly lesson slot (#applied). Three promises are easy to
 * break by accident and expensive when broken: expansion lands on the right
 * weekday (a slot that drifts a day puts a student in the wrong room all
 * year), a date that already HAS a lesson is never re-created (that would
 * silently resurrect a cancelled lesson and duplicate a graded one), and the
 * walk is bounded (a bad horizon must not spin).
 */
import { pendingSlotDates, schoolYearEnd, slotDates, slotSentence, isLessonSlot, type LessonSlot } from './lessonSchedule';
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

console.log('lessonSchedule.selfcheck: OK');
