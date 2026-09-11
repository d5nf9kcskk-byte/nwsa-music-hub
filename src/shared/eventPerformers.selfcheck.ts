/**
 * Pins "who is playing at this event" (#masterclass-performers).
 *
 * The join is by the CLOCK and by nothing else, which buys the feature its
 * no-migration start and is also the only thing that could put a wrong name on
 * a running order. These five promises are what keep that trade honest.
 */
import { performersForEvent, bookedPerformersForEvent, clockToMinutes } from './eventPerformers.ts';
import type { SignupForm, SignupSlotBooking } from '../director/types.ts';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

const form = {
  id: 'f1',
  title: 'Violin Master Class — pick a time',
  ownerName: 'Director',
  ensembleIds: [],
  questions: [{
    id: 'q1', label: 'Pick a time', type: 'timeslot' as const,
    options: ['3:00', '3:15', '4:30'],
    slotDefs: [
      { date: '2026-10-01', startMin: 900, endMin: 915 },  // 15:00 — inside
      { date: '2026-10-01', startMin: 915, endMin: 930 },  // 15:15 — inside
      { date: '2026-10-01', startMin: 1050, endMin: 1065 }, // 17:30 — after
    ],
  }],
} as unknown as SignupForm;

const booking = (over: Partial<SignupSlotBooking>): SignupSlotBooking => ({
  id: 'b', formId: 'f1', questionId: 'q1', slotIndex: 0,
  slotLabel: '3:00', studentId: 's1', studentName: 'Ana Reyes',
  submittedAt: 0, ...over,
} as SignupSlotBooking);

// The master class itself: 15:00–16:00 on Oct 1.
const event = {
  date: '2026-10-01', startTime: '15:00', endTime: '16:00',
};

const names = (ctxOver: Partial<Parameters<typeof performersForEvent>[1]> = {}, ev = event) =>
  performersForEvent(ev, {
    masterClass: true, forms: [form], bookings: [], studentName: () => undefined, ...ctxOver,
  }).map(p => p.name);

// ── 1. A slot inside the window is in; one outside it is not ──────────
{
  const got = bookedPerformersForEvent(event, [form], [
    booking({ id: 'b1', slotIndex: 0, studentId: 's1', studentName: 'Ana Reyes' }),
    booking({ id: 'b3', slotIndex: 2, studentId: 's3', studentName: 'Chris Vo' }),
  ]);
  assert(got.length === 1 && got[0].name === 'Ana Reyes',
    'only the slot starting inside the event window is a performance in it');
}

// ── 2. Running order, not booking order ───────────────────────────────
{
  const got = bookedPerformersForEvent(event, [form], [
    booking({ id: 'b2', slotIndex: 1, studentId: 's2', studentName: 'Bo Lin' }),
    booking({ id: 'b1', slotIndex: 0, studentId: 's1', studentName: 'Ana Reyes' }),
  ]);
  assert(got.map(p => p.name).join(',') === 'Ana Reyes,Bo Lin',
    'performers read in slot-time order, whatever order the bookings arrived in');
}

// ── 3. A non-master-class NEVER gathers bookings ──────────────────────
// Sign-ups schedule lesson times and fittings too. A slot that happens to fall
// during a rehearsal must not make the rehearsal announce a performance.
{
  const got = names({
    masterClass: false,
    bookings: [booking({ id: 'b1' })],
  });
  assert(got.length === 0,
    'bookings are joined for a master class and for nothing else');
}

// ── 4. An event with no window matches nothing ────────────────────────
// An all-day entry has no window to fall inside, and an event with no end has
// no close — reading "no end" as "the rest of the day" would sweep in every
// later sign-up on that date.
{
  for (const ev of [
    { date: '2026-10-01' },
    { date: '2026-10-01', startTime: '15:00' },
    { date: '2026-10-01', endTime: '16:00' },
    { date: '2026-10-01', startTime: '16:00', endTime: '15:00' },
  ]) {
    assert(bookedPerformersForEvent(ev, [form], [booking({ id: 'b1' })]).length === 0,
      `an event with no usable window matches no booking: ${JSON.stringify(ev)}`);
  }
}

// ── 5. Nobody is listed twice, and nobody is printed as a doc id ──────
{
  const got = performersForEvent(
    { ...event, studentIds: ['s1', 's9', 'gone'], guestPerformers: ['Dr. Ito', 'ana reyes', '  '] },
    {
      masterClass: true,
      forms: [form],
      bookings: [booking({ id: 'b1', slotIndex: 0, studentId: 's1', studentName: 'Ana Reyes' })],
      studentName: id => ({ s1: 'Ana Reyes', s9: 'Wren Park' }[id]),
    },
  );
  assert(got.map(p => p.name).join(',') === 'Ana Reyes,Wren Park,Dr. Ito',
    'a booked student is not repeated as a named performer, and a guest matching '
    + 'a name already listed is dropped');
  assert(got[0].startMin === 900, 'the booked entry wins, because it carries the time');
  assert(!got.some(p => p.name === 'gone'),
    'a student id with no public record is dropped, never printed as a raw doc id');
}

// ── clockToMinutes rejects what is not a clock ────────────────────────
{
  assert(clockToMinutes('15:00') === 900, 'HH:MM parses');
  assert(clockToMinutes('9:05') === 545, 'H:MM parses');
  for (const bad of [undefined, '', 'noon', '25:00', '15:70', '15']) {
    assert(clockToMinutes(bad as string) === null, `not a clock time: ${String(bad)}`);
  }
}

console.log('eventPerformers.selfcheck: OK');
