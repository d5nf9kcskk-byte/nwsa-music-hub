/**
 * "What does this student have" — the ONE answer (#student-day).
 *
 * For a student id, a date range and the PUBLIC records handed in, this says:
 * the events they are expected at (and how — performing, as a sub, in the
 * audience), the master class slots they booked, the pieces they play on each
 * event, their lesson times, and the assignments due.
 *
 * Before this the answer lived inside the student page component
 * (`PublicSchedule.tsx`) and was copied by hand into the calendar feed script,
 * and the copies had drifted: the feed never learned the academic-class rule,
 * and it read a pull-out differently. A student's page and the calendar they
 * subscribed to from that page disagreed. Now both call this, and the search
 * ("Ask") and Home's Now card call it too rather than becoming a fifth copy.
 *
 * It decides nothing new. Every rule is somebody else's ONE answer, joined:
 *   - expected or not, and via which group    → `studentExpectation`
 *   - a booked master class slot              → `bookedPerformersForEvent`
 *   - the pieces that are theirs to play      → `studentEventPieces`
 *   - an assignment that is open and theirs   → `isAssignmentOpen` + `studentHasAssignment`
 *
 * ── Rules for this file ────────────────────────────────────────────────
 * PURE. No React, no Firestore, no org config, no module state, no clock —
 * "today" and "now" are arguments. It must load under Node's type-stripping
 * loader for `scripts/generate-feeds.mjs`, so every relative import carries
 * its `.ts` extension and nothing here may import `director/utils` (which
 * reaches the org config).
 *
 * PUBLIC RECORDS ONLY (#privacy). Callers on the public site and the feed
 * script pass `studentsPublic`, `rosterOverridesPublic` and `lessonsPublic`.
 * Nothing here needs a staff-only field, and nothing here should grow one.
 *
 * THE SHORT PATH IS THE SAME ANSWER. Only this student's own record and the
 * pull-outs filed for this student are ever consulted, so a caller that has
 * loaded just those two (Home's Now card) gets exactly what a caller holding
 * the whole roster gets. `studentDay.selfcheck.ts` pins that.
 */
import { studentExpectation } from '../director/rosterResolver.ts';
import { isMasterClass } from '../director/groupKind.ts';
import { isAssignmentOpen, studentHasAssignment, byDueDateOpenFirst } from './pureRules.ts';
import { bookedPerformersForEvent, type EventPerformer } from './eventPerformers.ts';
import { studentEventPieces } from './studentRepertoire.ts';
import type {
  Assignment, CalendarEvent, Ensemble, RepertoirePiece, RosterOverride,
  SeatingChart, SignupForm, SignupSlotBooking, Student,
} from '../director/types.ts';
import type { PublicLesson } from './publicLesson.ts';

/** Everything optional but the first four: a caller with no sign-ups, no
 *  repertoire or no lessons to hand gets those parts empty, not an error. */
export interface StudentDayRecords {
  /** The roster, or just this student's own record (the short path). */
  students: Student[];
  /** Every event the caller has loaded — NOT pre-filtered to the range: an
   *  event-scoped pull-out is matched through its own event's date. */
  events: CalendarEvent[];
  /** Pull-outs and subs, or just the ones filed for this student. */
  overrides: RosterOverride[];
  /** Tells a master class from every other group. */
  ensembles: Pick<Ensemble, 'id' | 'kind'>[];
  forms?: SignupForm[];
  /** Slot bookings — everyone's or just this student's; others are ignored. */
  bookings?: SignupSlotBooking[];
  pieces?: RepertoirePiece[];
  charts?: SeatingChart[];
  /** Lesson times — everyone's or just this student's; others are ignored. */
  lessons?: PublicLesson[];
  assignments?: Assignment[];
}

export interface StudentDayWindow {
  /** First date included, YYYY-MM-DD. Absent = no lower bound. For
   *  assignments this is "today": due on or after it, or still taking answers. */
  from?: string;
  /** Last date included. Absent = no upper bound. */
  to?: string;
  /** The moment being asked about (ms). Required, never defaulted: it is what
   *  keeps an assignment scheduled for later out of the answer. */
  now: number;
}

export interface StudentDayEvent {
  event: CalendarEvent;
  /** How they are expected: with which ensembles, as a sub, audience only. */
  exp: ReturnType<typeof studentExpectation>;
  /** The pieces on this event that are theirs to play. Empty for audience. */
  pieces: RepertoirePiece[];
  /** The slot(s) they booked at this master class, with the time. */
  booked: EventPerformer[];
}

export interface StudentDay {
  /** By date, then start time (no time sorts last in its day). */
  events: StudentDayEvent[];
  /** By date, then start time. Cancelled ones are INCLUDED — "your lesson is
   *  off this week" is worth showing; a caller that wants them gone filters. */
  lessons: PublicLesson[];
  /** Soonest due first, anything overdue-but-open last. */
  assignments: Assignment[];
}

export function studentDay(
  studentId: string,
  when: StudentDayWindow,
  records: StudentDayRecords,
): StudentDay {
  const student = records.students.find(s => s.id === studentId);
  if (!student) return { events: [], lessons: [], assignments: [] };

  const { from, to, now } = when;
  const inRange = (date: string) => (!from || date >= from) && (!to || date <= to);

  // Only this student's own rows matter to their own answer, and narrowing to
  // them is what makes the feed script's 143 students x 3,000 events cheap.
  const me = [student];
  const myOverrides = records.overrides.filter(o => o.studentId === studentId);
  const myBookings = (records.bookings ?? []).filter(b => b.studentId === studentId);
  const forms = records.forms ?? [];
  const charts = records.charts ?? [];
  const masterClassIds = new Set(records.ensembles.filter(isMasterClass).map(e => e.id));
  const eventsById = Object.fromEntries(records.events.map(e => [e.id, e]));
  const piecesById = Object.fromEntries((records.pieces ?? []).map(p => [p.id, p]));

  // Master classes this student booked a slot at (#masterclass-performers).
  // Signing up to play is its own way onto the schedule: the sign-up exists
  // precisely because these students are not on the master class roster, so
  // without this the one event they personally committed to is the one event
  // missing from their schedule.
  const bookedAt = (e: CalendarEvent): EventPerformer[] =>
    myBookings.length > 0 && e.ensembleIds.some(id => masterClassIds.has(id))
      ? bookedPerformersForEvent(e, forms, myBookings).filter(p => p.studentId === studentId)
      : [];

  // Events where this student is expected — performing (base member or sub,
  // minus pulls) OR required in the audience (attendanceEnsembleIds).
  const events: StudentDayEvent[] = [];
  for (const event of records.events) {
    if (!inRange(event.date)) continue;
    const booked = bookedAt(event);
    const exp = studentExpectation(
      studentId, event, me, myOverrides, eventsById,
      booked.length > 0 ? new Set([event.id]) : undefined,
    );
    if (!exp.expected) continue;
    // The pieces this student PLAYS (#student-repertoire). An audience-only
    // concert contributes none, and a shared program contributes only their
    // own ensemble's works.
    events.push({ event, exp, booked, pieces: studentEventPieces(studentId, event, exp, piecesById, charts) });
  }
  events.sort((a, b) => a.event.date.localeCompare(b.event.date)
    || (a.event.startTime ?? '99').localeCompare(b.event.startTime ?? '99'));

  const lessons = (records.lessons ?? [])
    .filter(l => l.studentId === studentId && !!l.date && inRange(l.date))
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')
      || (a.startTime ?? '').localeCompare(b.startTime ?? ''));

  const today = from ?? '';
  const assignments = (records.assignments ?? [])
    .filter(a => isAssignmentOpen(a, today, now)
      && (!to || a.dueDate <= to)
      && studentHasAssignment(a, student.id, student.ensembleIds))
    .sort(byDueDateOpenFirst(today));

  return { events, lessons, assignments };
}
