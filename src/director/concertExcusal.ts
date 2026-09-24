import { studentExpectation } from './rosterResolver';
import type { CalendarEvent, ConcertExcusal, ExcusalCategory, RosterOverride, Student } from './types';

/**
 * Excused from a concert (#concert-excusals) — what an excusal WRITES.
 *
 * Deliberately nothing but ordinary event-scoped pull-outs: every consumer
 * that already honours a pull-out (event roster, Take Roll, Who's Out, the
 * student's schedule and .ics, the program's roster pages, the Gradebook's
 * concert count) drops the student with no special case to keep in step.
 *
 * The override carries ONLY the generic `EXCUSAL_REASON`. The category and the
 * record stay on the `concertExcusals` doc, which assistants cannot read; the
 * override's `reason` is readable by every Hub role, and its public mirror
 * carries no reason at all. `concertExcusal.selfcheck.ts` pins both.
 */

export const EXCUSAL_CATEGORIES: { value: ExcusalCategory; label: string }[] = [
  { value: 'religious', label: 'Religious' },
  { value: 'medical', label: 'Medical' },
  { value: 'family', label: 'Family' },
  { value: 'other', label: 'Other' },
];

export function excusalCategoryLabel(c: ExcusalCategory): string {
  return EXCUSAL_CATEGORIES.find(x => x.value === c)?.label ?? 'Other';
}

/** What an assistant or any other Hub role sees on the pull-out itself. */
export const EXCUSAL_REASON = 'Excused from this concert';

export interface ExcusableConcert {
  event: CalendarEvent;
  /** The ensembles the student would play with on it — one pull-out each. */
  ensembleIds: string[];
}

/**
 * Upcoming concerts this student is on stage for. A concert they are only in
 * the AUDIENCE for is not offered (there is no seat to vacate), nor one they
 * reach only as a named individual performer: that is `event.studentIds`, which
 * no pull-out can remove — take them off the event itself.
 */
export function excusableConcerts(
  student: Student,
  events: CalendarEvent[],
  students: Student[],
  overrides: RosterOverride[],
  eventsById: Record<string, CalendarEvent>,
  today: string,
): ExcusableConcert[] {
  const out: ExcusableConcert[] = [];
  for (const event of events) {
    if (event.type !== 'Concert' || event.status === 'Cancelled' || event.date < today) continue;
    const exp = studentExpectation(student.id, event, students, overrides, eventsById);
    if (!exp.expected || exp.attendanceOnly) continue;
    const ensembleIds = exp.ensembleIds.filter(id => event.ensembleIds.includes(id));
    if (ensembleIds.length) out.push({ event, ensembleIds });
  }
  return out.sort((a, b) => a.event.date.localeCompare(b.event.date)
    || (a.event.startTime ?? '').localeCompare(b.event.startTime ?? ''));
}

/** The pull-outs for one excusal: one per concert per ensemble played with. */
export function excusalOverrides(studentId: string, picks: ExcusableConcert[]): Omit<RosterOverride, 'id'>[] {
  return picks.flatMap(({ event, ensembleIds }) => ensembleIds.map(ensembleId => ({
    studentId, ensembleId, action: 'remove' as const, scope: 'event' as const,
    eventId: event.id, reason: EXCUSAL_REASON,
  })));
}

/** Override ids owned by some excusal — shown as the excusal, never alone. */
export function excusalOverrideIds(excusals: Pick<ConcertExcusal, 'overrideIds'>[]): Set<string> {
  return new Set(excusals.flatMap(x => x.overrideIds));
}
