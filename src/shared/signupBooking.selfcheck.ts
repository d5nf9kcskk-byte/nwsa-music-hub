/**
 * Self-check for showing a booked time slot back to the student (#signups).
 * Run: npx tsx --import ./scripts/vite-defines-shim.mjs src/shared/signupBooking.selfcheck.ts
 *
 * Pins the three promises the feature rests on:
 *   1. a hand-typed slot never invents a date (no wrong calendar entry),
 *   2. the calendar entry's id IS the booking's doc id (re-adding updates,
 *      never duplicates),
 *   3. sorting a student's times loses nobody — an undated slot moves to the
 *      end rather than vanishing off their schedule.
 */
import {
  slotDefAt, slotCalendarEvent, resolveBookedSlots, sortBookedSlots,
  upcomingBookedSlots, type BookedSlot,
} from './signupBooking.ts';
import { slotBookingId } from './signupSlots.ts';
import { formatClock24 } from './signupSlotTimes.ts';
import type { SignupForm, SignupSlotBooking } from '../director/types.ts';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

// ── 24-hour clock ────────────────────────────────────────────────────────
assert(formatClock24(0) === '00:00', 'midnight');
assert(formatClock24(9 * 60 + 5) === '09:05', 'morning pads both parts');
assert(formatClock24(15 * 60 + 30) === '15:30', 'afternoon is 24h, not 3:30');
assert(formatClock24(23 * 60 + 59) === '23:59', 'last minute of the day');
assert(formatClock24(-30) === '00:00' && formatClock24(9999) === '23:59', 'clamped');

// A form built with the slot builder (dated defs) plus one typed by hand.
const built: SignupForm = {
  id: 'form1',
  title: 'Senior Recital Hearings',
  questions: [
    {
      id: 'q1', label: 'Pick a time', type: 'timeslot',
      options: ['Sep 8 · 3:00 PM', 'Sep 8 · 3:30 PM'],
      slotDefs: [
        { date: '2026-09-08', startMin: 15 * 60, endMin: 15 * 60 + 30 },
        { date: '2026-09-08', startMin: 15 * 60 + 30, endMin: 16 * 60 },
      ],
    },
    { id: 'q2', label: 'Anything else?', type: 'text' },
  ],
} as SignupForm;

const typed: SignupForm = {
  id: 'form2',
  title: 'Pep Band',
  questions: [
    { id: 'qA', label: 'Which game?', type: 'timeslot', options: ['Monday after school'] },
  ],
} as SignupForm;

// ── slotDefAt ────────────────────────────────────────────────────────────
assert(slotDefAt(built, 'q1', 0)?.startMin === 900, 'finds the built slot def');
assert(slotDefAt(built, 'q1', 5) === null, 'index past the end → null');
assert(slotDefAt(built, 'q2', 0) === null, 'non-timeslot question → null');
assert(slotDefAt(built, 'gone', 0) === null, 'deleted question → null');
assert(slotDefAt(typed, 'qA', 0) === null, 'hand-typed slot has no def');

// ── slotCalendarEvent ────────────────────────────────────────────────────
const ev = slotCalendarEvent(built, 'q1', 1);
assert(ev !== null, 'built slot yields an event');
assert(ev!.date === '2026-09-08', 'event carries the slot date');
assert(ev!.startTime === '15:30' && ev!.endTime === '16:00', 'event carries 24h clock times');
assert(ev!.title === 'Senior Recital Hearings', 'event titled with the form');
assert(ev!.id === slotBookingId('form1', 'q1', 1), 'event id IS the booking doc id');
// The whole point of case 1: a free-text slot must never become a dated entry.
assert(slotCalendarEvent(typed, 'qA', 0) === null, 'hand-typed slot offers no calendar entry');

// ── resolveBookedSlots ───────────────────────────────────────────────────
function booking(
  formId: string, questionId: string, slotIndex: number, slotLabel: string,
): SignupSlotBooking {
  return {
    id: slotBookingId(formId, questionId, slotIndex),
    formId, questionId, slotIndex, slotLabel,
    studentId: 'stu1', studentName: 'Maya Ruiz', submittedAt: 1,
  };
}

const resolved = resolveBookedSlots([built, typed], [
  booking('form2', 'qA', 0, 'Monday after school'),
  booking('form1', 'q1', 1, 'Sep 8 · 3:30 PM'),
  booking('form1', 'q1', 0, 'Sep 8 · 3:00 PM'),
  booking('ghost', 'qZ', 0, 'Deleted form'),
]);
assert(resolved.length === 3, 'a booking whose form is gone is dropped');
assert(resolved[0].label === 'Sep 8 · 3:00 PM', 'earliest dated slot first');
assert(resolved[1].label === 'Sep 8 · 3:30 PM', 'then the later one');
// Case 3: the undated slot is last, and still THERE.
assert(resolved[2].label === 'Monday after school', 'undated slot sorts to the end, not away');
assert(resolved[2].def === null, 'undated slot keeps a null def');
assert(resolved[0].form.title === 'Senior Recital Hearings', 'slot carries its form');

// Sorting is stable for two undated slots — neither may be dropped.
const twoUndated: BookedSlot[] = [
  { booking: booking('form2', 'qA', 0, 'B'), form: typed, def: null, label: 'B' },
  { booking: booking('form2', 'qA', 1, 'A'), form: typed, def: null, label: 'A' },
];
assert(sortBookedSlots(twoUndated).map(s => s.label).join('') === 'BA', 'undated order preserved');

// ── upcomingBookedSlots ──────────────────────────────────────────────────
assert(upcomingBookedSlots(resolved, '2026-09-08').length === 3, 'today counts as upcoming');
assert(upcomingBookedSlots(resolved, '2026-09-09').length === 1, 'past dated slots drop off');
assert(
  upcomingBookedSlots(resolved, '2099-01-01')[0].def === null,
  'the undated slot survives any date — never silently hidden',
);

console.log('signupBooking.selfcheck: ok');
