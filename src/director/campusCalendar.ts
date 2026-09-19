/**
 * Which academic calendar governs a group — the ONE answer
 * (#college-hs-calendar-deps).
 *
 * MDC decides college. MDCPS decides high school. There is no crossover in
 * either direction, and no third rule: an MDC day off cancels the college
 * groups and nothing else, an MDCPS day off cancels the high school groups and
 * nothing else. College Chamber Orchestra is a college ensemble, so it follows
 * MDC — it has no high school connection. A master class is a high school
 * class, so it follows MDCPS — it has no college connection.
 *
 * `academicCalendars.ts` owns the two independently sourced no-school sets and
 * `collegeSchedule.ts` owns MDC's term boundaries. Neither of them answers the
 * question a SCREEN asks, which is "this group, on this date: is it meeting?"
 * Every generator answered it privately, by knowing at the call site what it
 * was generating — fine while the only callers were seeds.
 *
 * "Cancel the day" is not one of those. It sweeps a whole date, it cannot know
 * at the call site what it is sweeping, and on 2026-09-21 — an MDCPS teacher
 * planning day, a normal Monday at Miami Dade College — it cancelled the
 * dual-enrollment classes that were still meeting. That is the same bug
 * `collegeSchedule.ts` was written to fix, reached through a different door,
 * and it stays reachable through new doors until the question has one public
 * answer. This is it.
 *
 * Imports nothing that needs Vite's build-time defines, so a self-check can
 * load it under Node's type-stripping loader.
 */
import type { CalendarEvent, Ensemble } from './types';
import { isCollegeGroup } from './groupKind';
import { COLLEGE_GROUP_IDS } from './collegeClasses.ts';
import { MDCPS_NO_SCHOOL } from '../shared/academicCalendars.ts';
import { isCollegeSessionDay } from './collegeSchedule.ts';

/** Whose academic calendar decides whether this group is meeting that day. */
export type Campus = 'mdcps' | 'mdc';

/** Mid-sentence, for a director reading a button: "Cancel the high school day". */
export const CAMPUS_LABEL: Record<Campus, string> = {
  mdcps: 'high school',
  mdc: 'college',
};

/** Full name, for a sentence that has to be unambiguous. */
export const CAMPUS_FULL_NAME: Record<Campus, string> = {
  mdcps: 'the high school (MDCPS)',
  mdc: 'Miami Dade College',
};

/**
 * College-level → MDC. Everything else → MDCPS. That is the whole rule, and it
 * is deliberately `collegeLevel` and nothing else:
 *
 *   • College Chamber Orchestra and College Vocal Ensemble are college
 *     ensembles. They follow MDC, and an MDCPS teacher planning day does not
 *     touch them.
 *   • Every entry in `COLLEGE_CLASSES` is a college class. Same.
 *   • A master class is a high school class. It follows MDCPS, and an MDC
 *     closure does not touch it.
 *
 * An earlier pass had this keyed on `kind` as well, which put College Chamber
 * Orchestra on the MDCPS calendar. That was wrong: the two programs are
 * separate, and `collegeLevel` is already the app's ONE answer to which one a
 * group belongs to (`isCollegeGroup`, shared with every College screen and
 * filter). A second spelling of college-ness is what let them disagree.
 *
 * An UNKNOWN group (an id whose doc is gone, or one not loaded yet) reads as
 * MDCPS. The two ways to be wrong are not symmetric: reading it as college
 * would leave a high school block running on a day the director just
 * cancelled, and families would arrive to a locked room. Reading it as high
 * school can only over-cancel something the review sheet shows them first.
 */
export function campusForGroup(g: Pick<Ensemble, 'collegeLevel'> | undefined): Campus {
  return g && isCollegeGroup(g) ? 'mdc' : 'mdcps';
}

/**
 * The campus governing an event. MDC only when EVERY group on it is a college
 * group.
 *
 * A block carrying groups from both programs should not exist — they are
 * separate programs with separate calendars, which is the whole point above —
 * so this is a fail-safe for data that shouldn't happen, not a rule about
 * mixing. It errs towards MDCPS for the same reason `campusForGroup` does.
 * An event with no groups at all is a school-wide marker, which is MDCPS's.
 */
export function campusForEvent(
  e: Pick<CalendarEvent, 'ensembleIds'>,
  groupById: Record<string, Pick<Ensemble, 'collegeLevel'> | undefined>,
): Campus {
  if (e.ensembleIds.length === 0) return 'mdcps';
  return e.ensembleIds.every(id => campusForGroup(groupById[id]) === 'mdc') ? 'mdc' : 'mdcps';
}

/**
 * The campus governing a group by ID — for the SEED GENERATORS, which build
 * from the hardcoded program specs before any `ensembles` doc exists to read
 * `collegeLevel` off, so they cannot call `campusForGroup()`.
 *
 * It gives the same answer, because `scripts/seed-college.mjs` writes
 * `collegeLevel: true` from exactly the lists `COLLEGE_GROUP_IDS` is built
 * from. Pinned in the self-check, so the two cannot drift.
 */
export function campusForGroupId(id: string): Campus {
  return COLLEGE_GROUP_IDS.has(id) ? 'mdc' : 'mdcps';
}

/**
 * Applied lessons follow MDCPS.
 *
 * Not because of where the room is — that reasoning is what got College
 * Chamber Orchestra put on the wrong calendar — but because the applied lesson
 * program IS the high school one: `lessonLog.ts` builds the official High
 * School Lesson Log, `defaultPayrollMinutes()` bands by grades 9–12, and
 * `slotDates()` in lessonSchedule.ts already generates every lesson against
 * `MDCPS_NO_SCHOOL`. Generation and cancellation have to name the same set or
 * a lesson can be created on a day a cancel would never reach.
 *
 * If applied lessons are ever offered to dual-enrollment students on the MDC
 * calendar, this and `slotDates()` change together, or they drift.
 */
export const LESSON_CAMPUS: Campus = 'mdcps';

/** Is this campus closed on this date? */
export function isCampusClosed(campus: Campus, date: string): boolean {
  return campus === 'mdc' ? !isCollegeSessionDay(date) : MDCPS_NO_SCHOOL.has(date);
}

/**
 * The campus that is closed while the other one is open — the asymmetry that
 * makes "cancel the day" the wrong verb — and `null` when the date says
 * nothing useful (both open, or both shut).
 *
 * This is what a screen should lead with. Sep 21 2026 answers `'mdcps'`;
 * Dec 14 2026 answers `'mdc'` (MDC's fall term ended on the 11th while MDCPS
 * runs to the 17th), so the split is real in both directions and neither
 * calendar can be derived from the other.
 */
export function splitClosure(date: string): Campus | null {
  const mdcpsShut = isCampusClosed('mdcps', date);
  const mdcShut = isCampusClosed('mdc', date);
  if (mdcpsShut === mdcShut) return null;
  return mdcpsShut ? 'mdcps' : 'mdc';
}
