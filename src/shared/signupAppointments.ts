/**
 * One definition of "a booked time slot, as a calendar appointment" (#signups).
 *
 * The director's Schedule screen and the `appointmentsFeed` Cloud Function
 * both read THIS — same posture as calendarView.ts, signupEligibility.ts and
 * calendarBundles.ts. A second spelling is how a subscribed calendar and the
 * screen that promised it drift apart.
 *
 * The bookable times live on the QUESTION (`slotDefs[]`), and the booking
 * points at one by POSITION (`slotIndex`). The `slotLabel` on the booking is
 * display text — never parse a time back out of it.
 *
 * Explicit .ts extensions: this file is loaded by Node's type-stripping
 * loader (the self-check, and the function's esbuild input), which cannot
 * resolve extensionless relative imports. Same rule as signupEligibility.ts.
 */
// The booking → slot-definition join and the minutes → "HH:MM" conversion
// both already live in signupBooking.ts, which the confirmation email and the
// student's own schedule read. Reused rather than re-spelled: two definitions
// of what time a booking is, is exactly the drift this file exists to prevent.
import { formatClock24, slotDefAt } from './signupBooking.ts';
import type {
  SignupForm, SignupResponse, SignupSlotBooking,
} from '../director/types.ts';

export interface SignupAppointment {
  /** The booking's own doc id. The ICS UID is built from this, so it must
   *  stay stable across rebuilds or every refresh duplicates the event. */
  id: string;
  formId: string;
  formTitle: string;
  /** Whose sign-up this is, for the calendar's description. */
  ownerName?: string;
  date: string; // YYYY-MM-DD
  startMin: number;
  endMin: number;
  studentName: string;
  grade?: string;
  instrument?: string;
  email?: string;
  phone?: string;
  /** Question label → what they wrote, in the form's own order. Timeslot
   *  questions are excluded: their answer is the event's own start time. */
  answers: { label: string; value: string }[];
  /** False when the form asks for a signature (or a guardian co-sign) that
   *  has not arrived — "said yes" is not the same as "paperwork is in". */
  complete: boolean;
}

/**
 * Answers as a plain object. Never throws: the stored JSON arrives from an
 * unauthenticated write, so anything malformed reads as "no answers".
 *
 * Lives here rather than in useSignups.ts because the Cloud Function needs it
 * and cannot import a module that pulls in the Firebase SDK. useSignups.ts
 * re-exports it, so every existing call site is unchanged.
 */
export function parseAnswers(response: Pick<SignupResponse, 'answersJson'>): Record<string, string> {
  if (!response.answersJson) return {};
  try {
    const parsed: unknown = JSON.parse(response.answersJson);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'string') out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/** True once the student has done everything this form asks for. */
export function responseIsComplete(form: SignupForm, r: SignupResponse): boolean {
  if (form.signatureStatement && !r.signature) return false;
  if (form.guardianStatement && !(r.guardianName && r.guardianSignature)) return false;
  const answers = parseAnswers(r);
  return (form.questions ?? []).every(q => !q.required || (answers[q.id] ?? '').trim() !== '');
}

/** The newest response this student sent for this form, or undefined.
 *
 *  Newest, because there is no unauthenticated UPDATE on signupResponses — a
 *  student who comes back and fills in more of the form creates a SECOND doc.
 *  Same rule as latestPerStudent() in useSignups.ts. */
function latestResponse(
  formId: string,
  studentId: string,
  responses: SignupResponse[],
): SignupResponse | undefined {
  let best: SignupResponse | undefined;
  for (const r of responses) {
    if (r.formId !== formId || r.studentId !== studentId) continue;
    if (!best || r.submittedAt > best.submittedAt) best = r;
  }
  return best;
}

/**
 * Every booked slot on this form that has a real date and time, oldest first.
 *
 * A booking with no matching response still produces an appointment — the
 * name and the time are on the booking itself. It simply carries no answers,
 * which is honest: that is a student who took a time and never came back to
 * finish the form, and the director wants to see them on the calendar.
 */
export function appointmentsFor(
  form: SignupForm,
  bookings: SignupSlotBooking[],
  responses: SignupResponse[],
): SignupAppointment[] {
  const out: SignupAppointment[] = [];

  for (const booking of bookings) {
    if (booking.formId !== form.id) continue;
    // Null for a hand-typed slot label (no date in it), for a question that
    // is no longer a timeslot, and for an index past the end. All three are
    // normal, and none of them can become a calendar event.
    const def = slotDefAt(form, booking.questionId, booking.slotIndex);
    if (!def) continue;

    const response = latestResponse(form.id, booking.studentId, responses);
    const answers: { label: string; value: string }[] = [];
    if (response) {
      const values = parseAnswers(response);
      for (const q of form.questions ?? []) {
        // The timeslot answer IS this event's start time. Repeating it in the
        // notes is noise on a calendar entry that already says when it is.
        if (q.type === 'timeslot') continue;
        const value = (values[q.id] ?? '').trim();
        if (value) answers.push({ label: q.label, value });
      }
    }

    out.push({
      id: booking.id,
      formId: form.id,
      formTitle: form.title,
      ownerName: form.ownerName,
      date: def.date,
      startMin: def.startMin,
      endMin: def.endMin,
      // The booking's copy of the name is the one taken at claim time, so a
      // freed-and-rebooked slot never shows the previous student.
      studentName: booking.studentName,
      grade: response?.grade,
      instrument: response?.instrument,
      email: response?.email,
      phone: response?.phone,
      answers,
      complete: response ? responseIsComplete(form, response) : false,
    });
  }

  return sortAppointments(out);
}

/** Across several forms at once — the director's calendar, and their feed. */
export function appointmentsForForms(
  forms: SignupForm[],
  bookings: SignupSlotBooking[],
  responses: SignupResponse[],
): SignupAppointment[] {
  return sortAppointments(
    forms.flatMap(form => appointmentsFor(form, bookings, responses)),
  );
}

function sortAppointments(list: SignupAppointment[]): SignupAppointment[] {
  return [...list].sort((a, b) =>
    a.date.localeCompare(b.date)
    || a.startMin - b.startMin
    || a.studentName.localeCompare(b.studentName));
}

/** "HH:MM" for the ICS builder. Re-exported from signupBooking.ts so callers
 *  here have one import, not two — it is the same conversion the confirmation
 *  email's calendar attachment uses. */
export { formatClock24 };
