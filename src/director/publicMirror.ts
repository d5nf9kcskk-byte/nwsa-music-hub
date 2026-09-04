import type { Student, RosterOverride, Lesson } from './types';
import type { PublicLessonKey } from '../shared/publicLesson';

/**
 * Public-projection field lists (#privacy). The `students` and
 * `rosterOverrides` collections are readable only by signed-in staff; the
 * public site reads the `studentsPublic` and `rosterOverridesPublic` mirror
 * collections instead. These helpers are the single source of truth for what
 * is allowed to appear in a mirror doc:
 *
 *   • studentsPublic       — name, preferredName, instrument, section,
 *                            ensembleIds, status, grade. NEVER pronunciation
 *                            or staff-attribution metadata.
 *   • rosterOverridesPublic — everything except the free-text `reason`
 *                            (directors may type sensitive context there).
 *   • lessonsPublic        — WHEN and WHERE only: studentId, date, times,
 *                            status, location, teacherName. Never the grade,
 *                            the comments, the repertoire, or the initials.
 *
 * Every write in useStudents / useRosterOverrides / useLessons batches the
 * mirror doc with the source doc (same id), and
 * scripts/backfill-public-projections.mjs converges the mirrors from the full
 * collections via the Admin SDK.
 */

const PUBLIC_STUDENT_KEYS = [
  'name', 'preferredName', 'instrument', 'section', 'ensembleIds', 'status', 'grade',
] as const;

export function publicStudentFields(
  data: Partial<Omit<Student, 'id'>>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of PUBLIC_STUDENT_KEYS) {
    if (data[k] !== undefined) out[k] = data[k];
  }
  return out;
}

export function publicOverrideFields(
  data: Omit<RosterOverride, 'id'>,
): Record<string, unknown> {
  const { reason, ...rest } = data;
  void reason; // stripped: free-text reasons never reach the public mirror
  return rest;
}

/**
 * The lesson fields that reach a student's own calendar (#applied).
 *
 * This mirror exists so `feeds/student-<id>.ics` can carry a student's
 * private-lesson times — the director's decision, 2026-09-01. It is an
 * ALLOWLIST, not a denylist, because the source doc is the lesson LOG: it
 * holds the mark, the technique comments, the repertoire and both parties'
 * initials, and none of that may ever ride along with the time. Adding a
 * field to `Lesson` therefore does NOT publish it; publishing is a deliberate
 * edit here AND in the firestore.rules key allowlist for lessonsPublic.
 *
 * `teacherEmail` is deliberately absent — the display name is enough for a
 * calendar entry, and staff addresses are not public elsewhere.
 */
const PUBLIC_LESSON_KEYS = [
  'studentId', 'date', 'startTime', 'endTime', 'status', 'location', 'teacherName', 'instrument',
] as const;

/**
 * The reader's view of the same contract lives in src/shared/publicLesson.ts
 * — public code may not import from src/director beyond types, so the type
 * the student's schedule page consumes cannot live here. These two lines are
 * what stop the pair drifting: they fail to compile unless the allowlist
 * above and `PublicLessonKey` name exactly the same fields, so adding one
 * without the other is a build error rather than a field that quietly does or
 * does not reach a public page.
 */
type Exactly<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const _publicLessonKeysAgree: Exactly<(typeof PUBLIC_LESSON_KEYS)[number], PublicLessonKey> = true;
void _publicLessonKeysAgree;

export function publicLessonFields(
  data: Partial<Omit<Lesson, 'id'>>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of PUBLIC_LESSON_KEYS) {
    if (data[k] !== undefined) out[k] = data[k];
  }
  return out;
}
