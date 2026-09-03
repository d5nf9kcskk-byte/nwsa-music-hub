/**
 * A booked sign-up time as a STANDING weekly lesson (#signups, #applied).
 *
 * The one hop the Hub was missing. Everything on either side of it already
 * shipped: a booked slot reaches the owner's calendar as a one-off through
 * `appointmentsFeed`, and a `LessonSlot` on the teacher's own director doc
 * already expands into dated `Lesson` docs that mirror their TIME to
 * `lessonsPublic` and ride in each student's own `feeds/student-<id>.ics`.
 * Nothing here widens any of that — it only reads two world-readable
 * collections the public sign-up page already reads and derives a weekday.
 *
 * A booking says `{date, startMin, endMin}`; a standing time says
 * `{weekday, startTime, endTime}`. That conversion is the whole module.
 *
 * Explicit .ts extensions, and `director/types` is the only director module
 * touched — the eslint boundary lets src/shared reach types and nothing that
 * would drag director UI into the public bundle, and the self-check loads
 * this under Node's type-stripping loader, which cannot resolve
 * extensionless relative imports. Same rules as signupBooking.ts.
 */
import { formatClock24, slotDefAt } from './signupBooking.ts';
import type {
  LessonSlot, SignupForm, SignupSlotBooking, SignupSlotDef, Student,
} from '../director/types.ts';

/** One booking that can become a weekly lesson, with the student behind it. */
export interface PlannedLessonSlot {
  booking: SignupSlotBooking;
  student: Pick<Student, 'id' | 'name' | 'grade' | 'instrument'>;
  slot: LessonSlot;
  /** The booked date itself — the first lesson of the series. */
  firstDate: string;
}

/** A booking that cannot, and the sentence the director reads about it. */
export interface SkippedBooking {
  booking: SignupSlotBooking;
  reason: string;
}

export interface SignupLessonPlan {
  planned: PlannedLessonSlot[];
  skipped: SkippedBooking[];
}

/**
 * UTC weekday of a YYYY-MM-DD, matching `dayOf()` in lessonSchedule.ts,
 * `overrideApplies()`, and the feed generator. Re-spelled rather than
 * imported: lessonSchedule.ts is a director module src/shared may not import
 * a value from, and it reaches the org config through utils.ts. Arithmetic,
 * not policy — the drift risk that justifies a single definition elsewhere in
 * this codebase doesn't apply to "what day is this date".
 */
function utcWeekday(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

/**
 * The standing weekly time a booked slot implies.
 *
 * No location: a slot definition carries a date and two clock times and
 * nothing else. The teacher adds a room on their own sheet if they want one,
 * through the editor that already exists.
 */
export function slotFromBooking(def: SignupSlotDef): LessonSlot {
  return {
    weekday: utcWeekday(def.date),
    startTime: formatClock24(def.startMin),
    endTime: formatClock24(def.endMin),
  };
}

/**
 * What "make these weekly lessons" would actually do, before it does it.
 *
 * Three bookings can't convert, and all three are normal rather than errors:
 *
 *  • a slot the director TYPED by hand — free text like "Monday after
 *    school" holds no date, so there is no weekday to repeat on. Same
 *    `def: null` case signupBooking.ts already refuses to put on a calendar;
 *  • a student who has left the roster since booking — there is nobody to
 *    schedule, and the lesson would carry a dangling studentId into the
 *    public mirror;
 *  • a student holding TWO slots on this form. `lessonSlots` is one standing
 *    time per student, so the newest booking wins and the earlier one is
 *    reported. Newest-wins is the rule `latestPerStudent()` already applies
 *    to responses, for the same reason: there is no update path, so a change
 *    of mind arrives as a second document.
 */
export function planLessonsFromSignup(
  form: SignupForm,
  bookings: SignupSlotBooking[],
  students: Pick<Student, 'id' | 'name' | 'grade' | 'instrument'>[],
): SignupLessonPlan {
  const byId = new Map(students.map(s => [s.id, s]));
  const planned: PlannedLessonSlot[] = [];
  const skipped: SkippedBooking[] = [];

  for (const booking of bookings) {
    if (booking.formId !== form.id) continue;

    const def = slotDefAt(form, booking.questionId, booking.slotIndex);
    if (!def) {
      skipped.push({
        booking,
        reason: 'that time was typed by hand, so it has no day to repeat on',
      });
      continue;
    }

    const student = byId.get(booking.studentId);
    if (!student) {
      skipped.push({ booking, reason: 'not on the roster any more' });
      continue;
    }

    planned.push({ booking, student, slot: slotFromBooking(def), firstDate: def.date });
  }

  // One standing time per student: keep the newest booking, report the rest.
  const newest = new Map<string, PlannedLessonSlot>();
  for (const p of planned) {
    const held = newest.get(p.student.id);
    if (!held || p.booking.submittedAt > held.booking.submittedAt) newest.set(p.student.id, p);
  }
  const kept: PlannedLessonSlot[] = [];
  for (const p of planned) {
    if (newest.get(p.student.id) === p) kept.push(p);
    else skipped.push({ booking: p.booking, reason: 'they booked a second time; the later one wins' });
  }

  kept.sort((a, b) =>
    a.firstDate.localeCompare(b.firstDate)
    || a.slot.startTime.localeCompare(b.slot.startTime)
    || a.student.name.localeCompare(b.student.name));

  return { planned: kept, skipped };
}
