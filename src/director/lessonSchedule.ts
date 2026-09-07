import { defaultPayrollMinutes } from './lessonLog';
import type { Lesson, LessonSlot, Student } from './types';
import { formatTimeRange } from './utils';
import { isMdcpsSchoolDay } from '../shared/academicCalendars.ts';

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

/**
 * Every date the slot's weekday lands on in [from, through], school calendar
 * ignored. Nothing calls this directly: it is the ONE bounded walk that both
 * `slotDates()` (the days a lesson is created on) and
 * `skippedNoSchoolDates()` (the days it deliberately was not) are filtered
 * out of, so the two can never disagree about which weeks the slot covers.
 * A second walk would drift the moment either side gained a rule.
 */
function everySlotWeekday(slot: LessonSlot, from: string, through: string): string[] {
  if (!isLessonSlot(slot) || from > through) return [];
  let d = from;
  // Walk at most a week to reach the first matching weekday, then step by 7.
  for (let i = 0; i < 7 && dayOf(d) !== slot.weekday; i++) d = addDays(d, 1);
  const out: string[] = [];
  // Bounded so a bad `through` can never spin: a school year is ~40 weeks.
  for (let i = 0; d <= through && i < 120; i++, d = addDays(d, 7)) out.push(d);
  return out;
}

/** Every date the slot falls on in [from, through], inclusive of both ends,
 *  skipping MDCPS no-school days — a standing weekly time is a school-day
 *  recipe, and MDCPS is the calendar a lesson at NWSA actually runs on. */
export function slotDates(slot: LessonSlot, from: string, through: string): string[] {
  return everySlotWeekday(slot, from, through).filter(isMdcpsSchoolDay);
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
 * The weeks the standing time covers that got no lesson because MDCPS is
 * closed — what `slotDates()` dropped on the floor.
 *
 * Skipping silently is its own bug. A teacher who asks for "the rest of the
 * year" and is handed 31 lessons instead of 34 has no way to tell a holiday
 * from a bug in the generator, and the honest reading of a smaller number is
 * that something went wrong. So the count is reported, both before the press
 * and after it.
 *
 * A date that ALREADY has a lesson is not counted: nothing was skipped there.
 * The teacher put a lesson on that day themselves, which is allowed — some
 * studios do run through a teacher-planning day — and calling that "skipped"
 * would be flatly wrong.
 */
export function skippedNoSchoolDates(
  slot: LessonSlot,
  lessons: Pick<Lesson, 'date'>[],
  from: string,
  through: string,
): string[] {
  const taken = new Set(lessons.map(l => l.date));
  return everySlotWeekday(slot, from, through)
    .filter(d => !isMdcpsSchoolDay(d) && !taken.has(d));
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

/** An old-recipe lesson the NEW series already covers — the leftover half of a
 *  time change where the new weeks got generated before the move ran. */
export interface SupersededLesson {
  id: string;
  date: string;
  startTime: string;
  /** The date, in the same week, that already holds a lesson at the new time. */
  coveredBy: string;
}

/**
 * Future lessons that are doubled up against the standing time: a week that
 * already holds a lesson AT the weekly time, plus another one that is not.
 *
 * Deliberately independent of what the PREVIOUS weekly time was. The reported
 * case had a full Monday series and a full Tuesday series running in parallel,
 * and by the time anyone noticed, the stored recipe matched one of them — so a
 * rule keyed on "the old recipe" could not see the other. The question that
 * actually matters is "is this student down for two lessons this week", and
 * that is answerable from the current time alone, at any moment, not just in
 * the seconds after an edit.
 *
 * Never a graded or cancelled lesson: those are settled records. And never the
 * lesson that IS on the standing time — that is the one being kept.
 *
 * This is an OFFER, never automatic. A studio that genuinely teaches twice in
 * a week will show up here, which is exactly why the panel lists the count and
 * waits for a press instead of quietly deleting.
 */
export function doubledUpOffSlot(
  slot: LessonSlot | undefined,
  lessons: Lesson[],
  from: string,
): SupersededLesson[] {
  if (!isLessonSlot(slot)) return [];
  const byWeek = new Map<string, Lesson[]>();
  for (const l of lessons) {
    if (l.date < from) continue;
    const w = weekOf(l.date);
    const at = byWeek.get(w);
    if (at) at.push(l); else byWeek.set(w, [l]);
  }
  const out: SupersededLesson[] = [];
  for (const week of byWeek.values()) {
    const keeper = week.find(l => l.status !== 'Cancelled' && lessonMatchesSlot(slot, l));
    if (!keeper) continue;
    for (const l of week) {
      if (l.id === keeper.id) continue;
      if (l.status === 'Cancelled') continue;
      if ((l.grade ?? '').trim()) continue;
      if (lessonMatchesSlot(slot, l)) continue;
      out.push({ id: l.id, date: l.date, startTime: l.startTime, coveredBy: keeper.date });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export interface SlotChangePlan {
  /** Future lessons that came from the old recipe and belong at a new time. */
  move: SlotMove[];
  /** Dates the new recipe calls for that have no lesson at all. */
  create: string[];
  /** Old-recipe lessons made redundant by a lesson already at the new time in
   *  the same week. Removing these is what collapses two parallel weekly
   *  series back into one. Never graded and never cancelled — both are
   *  classified out above this ever being reached. */
  supersede: SupersededLesson[];
  /** Left alone on purpose, and counted so the teacher is told rather than
   *  left to notice. */
  keptGraded: number;
  keptCancelled: number;
  keptOther: number;
}

const EMPTY_PLAN: SlotChangePlan = {
  move: [], create: [], supersede: [], keptGraded: 0, keptCancelled: 0, keptOther: 0,
};

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

  const plan: SlotChangePlan = {
    move: [], create: [], supersede: [], keptGraded: 0, keptCancelled: 0, keptOther: 0,
  };
  // Dates that will hold a lesson once the moves land — so a move never
  // collides with a lesson already sitting on the target date, and `create`
  // never doubles one up.
  const occupied = new Set(future.map(l => l.date));
  // Who is sitting on each date, so a blocked move can tell WHY it is blocked.
  // A date can legitimately hold more than one lesson, so this is a list.
  const byDate = new Map<string, Lesson[]>();
  for (const l of future) {
    const at = byDate.get(l.date);
    if (at) at.push(l); else byDate.set(l.date, [l]);
  }

  for (const l of future) {
    if (!sitsOnSlot(before, l)) { if (!lessonMatchesSlot(after, l)) plan.keptOther++; continue; }
    if (l.status === 'Cancelled') { plan.keptCancelled++; continue; }
    if ((l.grade ?? '').trim()) { plan.keptGraded++; continue; }

    const target = newDateByWeek.get(weekOf(l.date));
    // No matching week (the new day falls outside the horizon, say) — leave it
    // where it is rather than guessing at a date nobody chose.
    if (!target) { plan.keptOther++; continue; }
    // Blocked by a lesson already on the target date. If that blocker is the
    // new standing time itself, this lesson is a leftover and `supersede`
    // (computed below, over the whole window) will offer it for removal — so
    // it is not counted as "set by hand" here, which is what made two parallel
    // series look like a teacher's own arrangement.
    if (target !== l.date && occupied.has(target)) {
      const coveredByNewSlot = (byDate.get(target) ?? [])
        .some(o => o.status !== 'Cancelled' && lessonMatchesSlot(after, o));
      if (!coveredByNewSlot) plan.keptOther++;
      continue;
    }
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
  // Computed over the whole window from the NEW time alone, not from what the
  // old recipe happened to be — one definition, shared with the panel's
  // standing offer so the two can never disagree about what is doubled up.
  // Anything the moves are about to fix is excluded: those lessons are being
  // relocated onto the standing time, not left as duplicates.
  const moving = new Set(plan.move.map(m => m.id));
  plan.supersede = doubledUpOffSlot(after, future, from).filter(s => !moving.has(s.id));
  return plan;
}

/** Is there anything for the teacher to press? An empty plan must never be
 *  offered as if it were work. */
export function planHasWork(plan: SlotChangePlan): boolean {
  return plan.move.length > 0 || plan.create.length > 0 || plan.supersede.length > 0;
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
