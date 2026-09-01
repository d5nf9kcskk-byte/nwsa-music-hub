/**
 * Reading a booked time slot back (#signups).
 *
 * A `signupSlotBookings` doc records WHICH slot a student took, but the only
 * copy of that slot's date and clock times lives in the form's own
 * `slotDefs`. Nothing can show a booked time on a calendar without joining
 * the two, so this module is the ONE place that join happens — the
 * confirmation screen, the return visit, and the student's schedule page all
 * resolve a booking the same way, or they drift.
 *
 * Slots a director typed by hand are free text ("Monday after school") with
 * no date inside them. Those resolve to `def: null`: still shown, because the
 * student picked something and must be able to see what, but never placed on
 * a day and never offered an "add to calendar" button that would land on the
 * wrong one.
 *
 * Nothing here widens what is public. `signupSlotBookings` is already
 * `allow read` in firestore.rules (the public sign-up page greys out taken
 * times with it) and `signupForms` is world-readable too — this only joins
 * two things a reader could already fetch separately.
 */
import { formatClock24 } from './signupSlotTimes.ts';
import { isTimeslotQuestion, slotBookingId } from './signupSlots.ts';
import type {
  CalendarEvent, SignupForm, SignupSlotBooking, SignupSlotDef,
} from '../director/types.ts';

/** One slot a student holds, with the form and slot definition behind it. */
export interface BookedSlot {
  booking: SignupSlotBooking;
  form: SignupForm;
  /** The dated definition, or null for a hand-typed slot label. */
  def: SignupSlotDef | null;
  /** Exactly what the student saw when they picked — always present. */
  label: string;
}

/**
 * The dated definition behind one slot, or null when there isn't one.
 *
 * Null covers three real cases that must all behave alike: the director typed
 * slot labels instead of building them, the question is no longer a timeslot,
 * or the slot was deleted from the form after someone booked it.
 */
export function slotDefAt(
  form: SignupForm,
  questionId: string,
  slotIndex: number,
): SignupSlotDef | null {
  const q = (form.questions ?? []).find(x => x.id === questionId);
  if (!q || !isTimeslotQuestion(q)) return null;
  return q.slotDefs?.[slotIndex] ?? null;
}

/**
 * A booked slot as a calendar event, or null when the slot has no date.
 *
 * Synthesised rather than stored: this exists only to hand the public
 * "Add to my calendar" button (AddToCalendarButton) the shape it already
 * knows how to turn into an .ics / Google Calendar link, so a sign-up time
 * reaches a phone through the same tested path as a rehearsal.
 *
 * Takes the slot's coordinates rather than a resolved BookedSlot on purpose:
 * the confirmation screen has to offer this the instant a student sends the
 * form, from what they just picked, without waiting for their own booking doc
 * to come back down the listener.
 */
export function slotCalendarEvent(
  form: SignupForm,
  questionId: string,
  slotIndex: number,
): CalendarEvent | null {
  const def = slotDefAt(form, questionId, slotIndex);
  if (!def) return null;
  return {
    // The booking's own doc id — so re-adding an already-added time updates
    // that calendar entry instead of duplicating it.
    id: slotBookingId(form.id, questionId, slotIndex),
    type: 'Event',
    // A held slot is always live: a director who cancels the sign-up deletes
    // the booking, so there is no cancelled state to represent here.
    status: 'Scheduled',
    ensembleIds: [],
    date: def.date,
    startTime: formatClock24(def.startMin),
    endTime: formatClock24(def.endMin),
    title: form.title,
  };
}

/** Resolve raw bookings against the forms they belong to, earliest first.
 *  A booking whose form is gone is dropped — there is nothing to show. */
export function resolveBookedSlots(
  forms: SignupForm[],
  bookings: SignupSlotBooking[],
): BookedSlot[] {
  const byId = new Map(forms.map(f => [f.id, f]));
  const out: BookedSlot[] = [];
  for (const booking of bookings) {
    const form = byId.get(booking.formId);
    if (!form) continue;
    out.push({
      booking,
      form,
      def: slotDefAt(form, booking.questionId, booking.slotIndex),
      label: booking.slotLabel,
    });
  }
  return sortBookedSlots(out);
}

/** Dated slots in time order; undated ones keep their order, at the end —
 *  the same "loses nobody" rule the jury running order follows. */
export function sortBookedSlots(slots: BookedSlot[]): BookedSlot[] {
  return [...slots].sort((a, b) => {
    if (!a.def && !b.def) return 0;
    if (!a.def) return 1;
    if (!b.def) return -1;
    return a.def.date.localeCompare(b.def.date) || a.def.startMin - b.def.startMin;
  });
}

/**
 * Slots still worth showing on a schedule: today or later.
 *
 * Undated slots are KEPT — "Monday after school" may well be ahead of the
 * student, and silently hiding a time they booked is the worse failure.
 */
export function upcomingBookedSlots(slots: BookedSlot[], today: string): BookedSlot[] {
  return slots.filter(s => !s.def || s.def.date >= today);
}
