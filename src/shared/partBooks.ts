/**
 * Part books on a concert (#part-books): one PDF per player holding ALL of
 * their music for the concert, in program order, so a musician downloads one
 * file instead of opening every piece on the program. Director's call,
 * 2026-10-15: "publish books as part books somewhere on the concert card so
 * they can download all of their parts as one single book".
 *
 * The data is `CalendarEvent.partBooks` (a label and a link per book, in the
 * order they show) and `partBooksSharedUrl` (the folder holding them all).
 * ABSENT = no books, which is every event that predates the field, and every
 * reader here treats an empty list or a blank row exactly like absent.
 *
 * Two promises, pinned by partBooks.selfcheck.ts:
 *   - A student's own book is found with the SAME matcher as a piece's own
 *     part (`findPartForInstrument`), so the two can never disagree about
 *     which chair a student sits in, and an exact label always wins ("Bass"
 *     gets the Bass book, never the Bassoon one).
 *   - Only a PERFORMER on the event is offered a book of their own. A student
 *     required to sit in the audience plays nothing on it (#student-repertoire).
 */
import type { CalendarEvent, PiecePartLink } from '../director/types';
import { findPartForInstrument } from '../director/utils';

/** The books worth showing: each with a label and a link, in stored order. */
export function partBooksOf(e: Pick<CalendarEvent, 'partBooks'>): PiecePartLink[] {
  return (e.partBooks ?? []).filter(b => Boolean(b && b.instrument?.trim() && b.url?.trim()));
}

/** Does this event carry anything to show under "Part books"? */
export function hasPartBooks(e: Pick<CalendarEvent, 'partBooks' | 'partBooksSharedUrl'>): boolean {
  return partBooksOf(e).length > 0 || Boolean(e.partBooksSharedUrl?.trim());
}

/**
 * Is this saved student a performer on the event: named on it, or a member of
 * an ensemble that plays it. Membership in an ensemble required to ATTEND
 * (`attendanceEnsembleIds`) does not count.
 */
export function performsOn(
  e: Pick<CalendarEvent, 'ensembleIds' | 'studentIds'>,
  student: { id: string; ensembleIds?: string[] } | null | undefined,
): boolean {
  if (!student) return false;
  if ((e.studentIds ?? []).includes(student.id)) return true;
  return (student.ensembleIds ?? []).some(id => e.ensembleIds.includes(id));
}

/** The book for this instrument, chosen the way a piece's own part is. */
export function myPartBook(e: Pick<CalendarEvent, 'partBooks'>, instrument?: string): PiecePartLink | undefined {
  return findPartForInstrument({ partsLinks: partBooksOf(e) }, instrument);
}
