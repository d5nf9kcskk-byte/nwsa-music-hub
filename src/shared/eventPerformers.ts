/**
 * Who is playing at this event (#masterclass-performers).
 *
 * A master class meeting has performers from two unrelated places, and until
 * now only one of them reached anybody:
 *
 *   1. Students the director typed onto the event (`studentIds`) and visiting
 *      players who are on no roster (`guestPerformers`). Both were write-only
 *      — the Event form saved them and nothing ever rendered them.
 *   2. Students who claimed a time on a sign-up form. A violin master class is
 *      run this way: the director opens a sign-up with one timeslot per
 *      performance, the students book, and that booking IS the running order.
 *      Nothing joined those bookings back to the meeting, so a student who had
 *      signed up could not see it on the class they signed up for.
 *
 * This module is the ONE answer to "who plays at this event", so the public
 * event page, the subscribed .ics, and the director's roster drawer all say
 * the same names in the same order.
 *
 * ── How a booking finds its event ───────────────────────────────────────
 * By the CLOCK, not by a stored link. A booking points at a `slotDef` with a
 * date and a start minute; an event has a date and a start/end time. A slot
 * whose start falls inside the meeting's window is a performance in that
 * meeting. Nothing has to be linked by hand, so the master classes already on
 * the calendar and the sign-ups already booked light up with no migration and
 * no re-entry — which is the point, since the director has already done this
 * work once.
 *
 * The rule is deliberately narrow in one way: bookings are only gathered for a
 * MASTER CLASS. Sign-ups are used for far more than performances (lesson
 * times, uniform fittings, interest lists), and a slot that happens to fall
 * during a rehearsal must never make the rehearsal announce that somebody is
 * playing at it. `kind: 'masterclass'` is exactly the group whose meetings are
 * defined as "these students play in it", so that is where the join applies.
 *
 * ── Privacy ────────────────────────────────────────────────────────────
 * Nothing here widens what is public (#privacy). `signupSlotBookings` is
 * already `allow read` in firestore.rules — the public sign-up page reads it
 * to grey out times another student took — and each booking already carries
 * `studentName`. `signupForms` is world-readable too, and a student's name is
 * public by the projection model. So this joins two things any reader could
 * already fetch separately and shows them in the one place a student would
 * look. It reads no staff-only collection: named performers resolve through
 * `studentsPublic`, never `students`.
 */
import { slotDefAt } from './signupBooking.ts';
import type { SignupForm, SignupSlotBooking } from '../director/types.ts';

/** Only what this module needs off a CalendarEvent, so the Cloud Functions and
 *  the feed generator can pass their own plain doc shapes. */
export interface PerformerEventLike {
  date: string;
  startTime?: string;
  endTime?: string;
  studentIds?: string[];
  guestPerformers?: string[];
}

export interface EventPerformer {
  /** What to print. Always non-empty. */
  name: string;
  /** Present for a roster student — the public doc id, for linking. */
  studentId?: string;
  /** Minutes from midnight for a booked slot, absent otherwise. Drives the
   *  order, and lets a caller print the running time beside the name. */
  startMin?: number;
  /** `'booking'` = claimed a time on a sign-up, `'named'` = the director typed
   *  them onto the event, `'guest'` = a visitor on no roster. */
  source: 'booking' | 'named' | 'guest';
}

export interface PerformerContext {
  /** True when this event belongs to a `kind: 'masterclass'` group. A gate,
   *  not a hint: false means no bookings are joined at all. */
  masterClass: boolean;
  forms: SignupForm[];
  bookings: SignupSlotBooking[];
  /** Display name for a student doc id, from `studentsPublic`. An id with no
   *  name is DROPPED rather than printed as a raw id — a student who left the
   *  program is not a performer, and a doc id is not a name. */
  studentName: (id: string) => string | undefined;
}

/** "HH:MM" → minutes from midnight, or null when it isn't a clock time.
 *  Local to this module on purpose: it has to load under Node's type-stripping
 *  loader for the feed generator, so it cannot reach dates.ts → the org config. */
export function clockToMinutes(clock: string | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((clock ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Bookings that fall inside this event's window, earliest first.
 *
 * Both ends of the window are required. An event with no `startTime` is an
 * all-day entry and has no window to fall inside; an event with no `endTime`
 * has no close, and reading "no end" as "the rest of the day" would sweep in
 * every later sign-up on the calendar. Both cases return nothing rather than
 * guess — a wrong name on a running order is worse than a missing section.
 */
export function bookedPerformersForEvent(
  event: PerformerEventLike,
  forms: SignupForm[],
  bookings: SignupSlotBooking[],
): EventPerformer[] {
  const startMin = clockToMinutes(event.startTime);
  const endMin = clockToMinutes(event.endTime);
  if (startMin === null || endMin === null || endMin <= startMin) return [];

  const formById = new Map(forms.map(f => [f.id, f]));
  const out: EventPerformer[] = [];
  for (const booking of bookings) {
    const form = formById.get(booking.formId);
    if (!form) continue;
    // Null for a hand-typed slot label, for a question that is no longer a
    // timeslot, and for an index past the end — the same three cases every
    // other reader of a booking treats as "not placeable on a day".
    const def = slotDefAt(form, booking.questionId, booking.slotIndex);
    if (!def) continue;
    if (def.date !== event.date) continue;
    // Start-containment, half-open. A slot is IN the class if it begins during
    // it; a slot running a minute past the scheduled end still belongs to the
    // class it began in.
    if (def.startMin < startMin || def.startMin >= endMin) continue;
    const name = (booking.studentName ?? '').trim();
    if (!name) continue;
    out.push({
      name,
      studentId: booking.studentId || undefined,
      startMin: def.startMin,
      source: 'booking',
    });
  }
  return out.sort((a, b) =>
    (a.startMin ?? 0) - (b.startMin ?? 0) || a.name.localeCompare(b.name));
}

/**
 * Everyone playing at this event, in the order they should be read.
 *
 * Booked slots first, in running order — the order the class actually happens
 * in. Then students the director named on the event, then guests, each in the
 * order they were entered: the director's own sequence, which is a decision
 * and not something to re-sort (the rule the jury running order follows).
 *
 * A person is listed ONCE. A student who booked a slot and was also typed onto
 * the event keeps the booked entry, because that one carries their time.
 */
export function performersForEvent(
  event: PerformerEventLike,
  ctx: PerformerContext,
): EventPerformer[] {
  const out: EventPerformer[] = ctx.masterClass
    ? bookedPerformersForEvent(event, ctx.forms, ctx.bookings)
    : [];

  const seenIds = new Set(out.map(p => p.studentId).filter((v): v is string => !!v));
  const seenNames = new Set(out.map(p => p.name.toLowerCase()));

  for (const id of event.studentIds ?? []) {
    if (seenIds.has(id)) continue;
    const name = (ctx.studentName(id) ?? '').trim();
    if (!name || seenNames.has(name.toLowerCase())) continue;
    seenIds.add(id);
    seenNames.add(name.toLowerCase());
    out.push({ name, studentId: id, source: 'named' });
  }

  for (const raw of event.guestPerformers ?? []) {
    const name = (raw ?? '').trim();
    if (!name || seenNames.has(name.toLowerCase())) continue;
    seenNames.add(name.toLowerCase());
    out.push({ name, source: 'guest' });
  }

  return out;
}

/** The names alone, for a plain-text sink like an .ics DESCRIPTION. */
export function performerNames(performers: EventPerformer[]): string[] {
  return performers.map(p => p.name);
}
