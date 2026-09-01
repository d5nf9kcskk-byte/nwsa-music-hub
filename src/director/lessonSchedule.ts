import type { Lesson } from './types';
import { formatTimeRange } from './utils';

/**
 * A teacher's STANDING weekly lesson time for one student (#applied).
 *
 * The Hub's lessons are, and stay, one dated doc per lesson — that is what
 * carries the grade, the log line and the initials, and what every feed and
 * roll screen already reads. A slot is not a second kind of lesson; it is
 * the recipe the teacher stops retyping. `pendingSlotDates()` turns it into
 * ordinary Lesson docs, and from that moment nothing downstream knows or
 * cares that a slot existed.
 *
 * Stored on the teacher's own `directors/{email}` doc, keyed by student id,
 * right beside `assignedStudentIds` — the assignment it qualifies. No new
 * collection means no second rule pair to keep in agreement with a query.
 */
export interface LessonSlot {
  /** 0 = Sunday … 6 = Saturday, matching Date#getUTCDay(). */
  weekday: number;
  /** "HH:MM", 24h — same shape as Lesson.startTime/endTime. */
  startTime: string;
  endTime: string;
  location?: string;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function isLessonSlot(v: unknown): v is LessonSlot {
  const s = v as LessonSlot | undefined;
  return !!s && typeof s.weekday === 'number' && s.weekday >= 0 && s.weekday <= 6
    && /^\d{2}:\d{2}$/.test(s.startTime ?? '') && /^\d{2}:\d{2}$/.test(s.endTime ?? '');
}

/** UTC throughout, matching overrideApplies() and the feed generator. */
function dayOf(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Last day of the school year containing `iso` — the default horizon for
 * "add the rest of the year". August or later belongs to the year that
 * ENDS the following May (mirrors schoolYearLabel in lessonLog.ts).
 */
export function schoolYearEnd(iso: string): string {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  if (!y || !m) return iso;
  return `${m >= 8 ? y + 1 : y}-05-31`;
}

/** Every date the slot falls on in [from, through], inclusive of both ends. */
export function slotDates(slot: LessonSlot, from: string, through: string): string[] {
  if (!isLessonSlot(slot) || from > through) return [];
  let d = from;
  // Walk at most a week to reach the first matching weekday, then step by 7.
  for (let i = 0; i < 7 && dayOf(d) !== slot.weekday; i++) d = addDays(d, 1);
  const out: string[] = [];
  // Bounded so a bad `through` can never spin: a school year is ~40 weeks.
  for (let i = 0; d <= through && i < 120; i++, d = addDays(d, 7)) out.push(d);
  return out;
}

/**
 * The dates the slot calls for that have no lesson yet — what "add these"
 * actually creates. Any existing lesson on that date for that student wins,
 * cancelled ones included: a cancelled lesson is a decision the teacher
 * already made, and re-creating it would silently undo it.
 */
export function pendingSlotDates(
  slot: LessonSlot,
  lessons: Pick<Lesson, 'date'>[],
  from: string,
  through: string,
): string[] {
  const taken = new Set(lessons.map(l => l.date));
  return slotDates(slot, from, through).filter(d => !taken.has(d));
}

/**
 * "Fridays, 2:00 PM – 2:45 PM · Room 214" — the sentence the teacher reads.
 * Times go through the app's one time formatter, so a slot reads exactly like
 * every other time on the screen and translates with them.
 */
export function slotSentence(slot: LessonSlot): string {
  if (!isLessonSlot(slot)) return '';
  const when = `${DAY_NAMES[slot.weekday]}s, ${formatTimeRange(slot.startTime, slot.endTime)}`;
  return slot.location ? `${when} · ${slot.location}` : when;
}

export const WEEKDAY_OPTIONS = DAY_NAMES.map((label, weekday) => ({ weekday, label }));
