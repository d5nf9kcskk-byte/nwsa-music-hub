/**
 * Which campus's calendar governs a block — the ONE answer
 * (#college-hs-calendar-deps).
 *
 * `academicCalendars.ts` owns the two independently sourced no-school sets and
 * `collegeSchedule.ts` owns MDC's term boundaries. Neither of them answers the
 * question a SCREEN actually asks, which is "this block, on this date: is the
 * room open?" Every generator answered it privately, by knowing at the call
 * site which calendar it was generating against — fine while the only callers
 * were seeds that each built one kind of thing.
 *
 * "Cancel the day" is not one of those. It sweeps a whole date, it cannot know
 * at the call site what it is sweeping, and on 2026-09-21 — an MDCPS teacher
 * planning day, a normal Monday at Miami Dade College — it cancelled nine
 * dual-enrollment classes that were still meeting. That is the same bug
 * `collegeSchedule.ts` was written to fix, reached through a different door,
 * and it stays reachable through new doors until the question has one public
 * answer. This is it.
 *
 * Imports nothing that needs Vite's build-time defines, so a self-check can
 * load it under Node's type-stripping loader.
 */
import type { CalendarEvent, Ensemble } from './types';
import { isClassGroup, isMasterClass } from './groupKind';
import { MDCPS_NO_SCHOOL } from '../shared/academicCalendars.ts';
import { isCollegeSessionDay } from './collegeSchedule.ts';

/** Whose academic calendar decides whether the room is open that day. */
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
 * Pick the campus by WHICH ROOM this group meets in, never by "is this a
 * college thing" — the distinction CLAUDE.md draws, and the one the reported
 * bug turns on.
 *
 * An actual MDC course meets on the MDC schedule, so MDC's calendar governs
 * it: `kind: 'class'` plus `collegeLevel`, which is exactly what
 * `scripts/seed-college.mjs` writes for every entry in `COLLEGE_CLASSES`.
 *
 * Everything else follows MDCPS, including groups that are unmistakably
 * college-level:
 *   • College Chamber Orchestra and College Vocal Ensemble are
 *     `kind: 'ensemble'` — they rehearse ON NWSA's campus during the high
 *     school's own afternoon, so an MDCPS closure closes the room.
 *   • A master class is `kind: 'masterclass'`, also on NWSA's campus, so a
 *     college master class stays MDCPS too.
 *
 * An UNKNOWN group (an id whose doc is gone, or a group not yet loaded) reads
 * as MDCPS on purpose. The two ways to be wrong are not symmetric: defaulting
 * to MDC would quietly leave a high school block running on a day the director
 * just cancelled, and families would show up to a locked room. Defaulting to
 * MDCPS can only over-cancel a block the review sheet shows them first.
 */
export function campusForGroup(g: Pick<Ensemble, 'kind' | 'collegeLevel'> | undefined): Campus {
  if (!g) return 'mdcps';
  return g.collegeLevel && isClassGroup(g) && !isMasterClass(g) ? 'mdc' : 'mdcps';
}

/**
 * The campus governing an event. MDC only when EVERY group on it is an MDC
 * course: a shared block carrying one high school ensemble is a block in an
 * NWSA room, whoever else is in it. An event with no groups at all is a
 * school-wide marker, which is MDCPS's.
 */
export function campusForEvent(
  e: Pick<CalendarEvent, 'ensembleIds'>,
  groupById: Record<string, Pick<Ensemble, 'kind' | 'collegeLevel'> | undefined>,
): Campus {
  if (e.ensembleIds.length === 0) return 'mdcps';
  return e.ensembleIds.every(id => campusForGroup(groupById[id]) === 'mdc') ? 'mdc' : 'mdcps';
}

/**
 * An applied lesson is taught in an NWSA room by NWSA staff, whatever year the
 * student is in — so MDCPS governs it, always. `slotDates()` in
 * lessonSchedule.ts already generates against `MDCPS_NO_SCHOOL` for the same
 * reason; this is that decision named, so a cancel and the generator cannot
 * come to disagree about which days a lesson may sit on.
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
