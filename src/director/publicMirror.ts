import type { Student, RosterOverride } from './types';

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
 *
 * Every write in useStudents / useRosterOverrides batches the mirror doc with
 * the source doc (same id), and scripts/backfill-public-projections.mjs
 * converges the mirrors from the full collections via the Admin SDK.
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
