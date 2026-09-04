import { defaultPayrollMinutes } from './lessonLog';
import type { Lesson, LessonSlot, Student } from './types';
import { formatTimeRange } from './utils';

/** The standing weekly time itself lives in types.ts so src/shared can build
 *  one (see signupToLessons.ts); this module owns everything you DO with it.
 *  Re-exported so every existing `from './lessonSchedule'` import still works. */
export type { LessonSlot };

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

/** A lesson as it goes in — the shape `addLesson()` takes. */
export type NewLesson = Omit<Lesson, 'id' | 'createdAt' | 'updatedAt' | 'updatedBy' | 'overrideId'>;

/**
 * Every lesson a standing time still owes, ready to write.
 *
 * Two screens expand a slot now — the teacher's own sheet, and "make these
 * weekly lessons" on a sign-up (#signups). Both call THIS, so a lesson born
 * from a booked sign-up time is indistinguishable from one the teacher set by
 * hand: same payroll band, same instrument, same location, same skip rule.
 * A second spelling would drift the moment either side gained a field.
 */
export function lessonPayloadsFor(
  slot: LessonSlot,
  student: Pick<Student, 'id' | 'grade' | 'instrument'>,
  teacher: { email: string; name: string },
  existing: Pick<Lesson, 'date'>[],
  from: string,
  through: string,
): NewLesson[] {
  return pendingSlotDates(slot, existing, from, through).map(date => ({
    teacherEmail: teacher.email,
    teacherName: teacher.name,
    studentId: student.id,
    date,
    startTime: slot.startTime,
    endTime: slot.endTime,
    status: 'Scheduled',
    ...(slot.location ? { location: slot.location } : {}),
    ...(student.instrument ? { instrument: student.instrument } : {}),
    payrollMinutes: defaultPayrollMinutes(student.grade),
  }));
}

// ── Changing a standing time (#applied) ────────────────────────────────
//
// Setting a weekly time and CHANGING one are different jobs, and conflating
// them is what made a confirmed change do nothing: `lessonSlots` is the
// recipe, the `Lesson` docs are the food, and editing the recipe never
// reheated anything. Worse, `pendingSlotDates()` matches on DATE alone, so
// moving 2:00 to 3:00 on the same weekday left every future date "taken" and
// the panel reported that the whole year was already on the calendar — while
// every one of those lessons still said 2:00, in the log, on the teacher's
// own calendar, and in the student's feed.
//
// The plan below is what the teacher is offered after a change. It is
// deliberately CONSERVATIVE about what it will touch: only lessons sitting on
// the OLD recipe are the old recipe's to move. A lesson typed by hand, one
// already graded, one already cancelled, and one in the past are all
// decisions somebody made, and editing a recipe does not overrule them.

/** Sunday of the UTC week containing `iso` — how an old date and its new one
 *  are paired when the weekday moves. "Monday the 5th" becomes "Thursday the
 *  8th", not "next Thursday". */
function weekOf(iso: string): string {
  return addDays(iso, -dayOf(iso));
}

/** Is this lesson sitting exactly where `slot` says, room included? */
export function lessonMatchesSlot(
  slot: LessonSlot | undefined,
  lesson: Pick<Lesson, 'date' | 'startTime' | 'endTime' | 'location'>,
): boolean {
  if (!isLessonSlot(slot)) return false;
  return dayOf(lesson.date) === slot.weekday
    && lesson.startTime === slot.startTime
    && lesson.endTime === slot.endTime
    && (lesson.location ?? '') === (slot.location ?? '');
}

/** Same day and time, ignoring the room — what identifies a lesson as one the
 *  old recipe produced. The room is the field most often filled in later by
 *  hand, and refusing to move a lesson over it would strand exactly the
 *  lessons someone had already tidied up. */
function sitsOnSlot(
  slot: LessonSlot | undefined,
  lesson: Pick<Lesson, 'date' | 'startTime' | 'endTime'>,
): boolean {
  if (!isLessonSlot(slot)) return false;
  return dayOf(lesson.date) === slot.weekday
    && lesson.startTime === slot.startTime
    && lesson.endTime === slot.endTime;
}

export interface SlotMove {
  id: string;
  /** Where it sits now — shown to the teacher before anything is written. */
  fromDate: string;
  fromStartTime: string;
  toDate: string;
  /** Present only when this lesson carries a confirmed pull-out that is about
   *  to point at the wrong rehearsal. The caller drops the override and says
   *  so; re-confirming is the teacher's to do, because that is what tells the
   *  ensemble director. */
  overrideId?: string;
}

export interface SlotChangePlan {
  /** Future lessons that came from the old recipe and belong at a new time. */
  move: SlotMove[];
  /** Dates the new recipe calls for that have no lesson at all. */
  create: string[];
  /** Left alone on purpose, and counted so the teacher is told rather than
   *  left to notice. */
  keptGraded: number;
  keptCancelled: number;
  keptOther: number;
}

const EMPTY_PLAN: SlotChangePlan = { move: [], create: [], keptGraded: 0, keptCancelled: 0, keptOther: 0 };

/**
 * What changing the standing time should do to the lessons already on the
 * calendar — computed, shown, and only then written on a press.
 *
 * `before` is the recipe as it was; without it nothing is movable, because
 * there is no way to tell a lesson the recipe produced from one the teacher
 * typed. That is the safe direction to fail: the teacher is offered fewer
 * moves and the lessons stay where somebody put them.
 */
export function slotChangePlan(
  before: LessonSlot | undefined,
  after: LessonSlot,
  lessons: Lesson[],
  from: string,
  through: string,
): SlotChangePlan {
  if (!isLessonSlot(after)) return EMPTY_PLAN;

  const future = lessons.filter(l => l.date >= from);
  const newDates = slotDates(after, from, through);
  const newDateByWeek = new Map(newDates.map(d => [weekOf(d), d]));

  const plan: SlotChangePlan = { move: [], create: [], keptGraded: 0, keptCancelled: 0, keptOther: 0 };
  // Dates that will hold a lesson once the moves land — so a move never
  // collides with a lesson already sitting on the target date, and `create`
  // never doubles one up.
  const occupied = new Set(future.map(l => l.date));

  for (const l of future) {
    if (!sitsOnSlot(before, l)) { if (!lessonMatchesSlot(after, l)) plan.keptOther++; continue; }
    if (l.status === 'Cancelled') { plan.keptCancelled++; continue; }
    if ((l.grade ?? '').trim()) { plan.keptGraded++; continue; }

    const target = newDateByWeek.get(weekOf(l.date));
    // No matching week (the new day falls outside the horizon, say) — leave it
    // where it is rather than guessing at a date nobody chose.
    if (!target) { plan.keptOther++; continue; }
    if (target !== l.date && occupied.has(target)) { plan.keptOther++; continue; }
    if (lessonMatchesSlot(after, l)) continue; // already right — nothing to do

    occupied.delete(l.date);
    occupied.add(target);
    plan.move.push({
      id: l.id,
      fromDate: l.date,
      fromStartTime: l.startTime,
      toDate: target,
      ...(l.overrideId ? { overrideId: l.overrideId } : {}),
    });
  }

  plan.create = newDates.filter(d => !occupied.has(d));
  return plan;
}

/** Is there anything for the teacher to press? An empty plan must never be
 *  offered as if it were work. */
export function planHasWork(plan: SlotChangePlan): boolean {
  return plan.move.length > 0 || plan.create.length > 0;
}

/**
 * Future lessons that do NOT sit where the standing time says they should —
 * the number the panel needs so it can stop claiming the year is handled.
 * Cancelled and graded lessons are excluded: they are settled, and counting
 * them would put a "fix these" badge on a screen with nothing to fix.
 */
export function lessonsOffSlot(slot: LessonSlot | undefined, lessons: Lesson[], from: string): Lesson[] {
  if (!isLessonSlot(slot)) return [];
  return lessons.filter(l =>
    l.date >= from
    && l.status !== 'Cancelled'
    && !(l.grade ?? '').trim()
    && !lessonMatchesSlot(slot, l));
}
