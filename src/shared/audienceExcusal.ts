/**
 * Grade-level excusals from an AUDIENCE requirement (#audience-excusal).
 *
 * The first case: every Symphony member is required to attend the College
 * Chamber Orchestra concert on Sept 29, 2026, except the seniors, who have a
 * college event the school set up for them that night.
 *
 * The rule lives on the EVENT (`attendanceExcusedGrades`), not on anybody's
 * record, and that is the point. A grade is already public (`studentsPublic`
 * carries it), so an event that says "12th grade is excused" publishes nothing
 * new about a student, and a senior who transfers in on Monday is excused
 * without anyone remembering to add them. A per-student pull-out would be a
 * roster write about minors, and pull-outs only touch PERFORMING rosters
 * anyway (#concert-excusals); an audience requirement is not a roster.
 *
 * What it excuses, and what it never does:
 *   - Only the ensemble-wide audience requirement (`attendanceEnsembleIds`).
 *   - Never a performer. A senior who plays on the concert still plays.
 *   - Never a student the director named one at a time
 *     (`attendanceStudentIds`). Naming someone is more specific than a grade.
 *
 * Matching is by PREFIX, the same `startsWith('12')` the roster's Seniors view
 * uses, so "12" and "12th" both match and no college year does
 * ("College Senior" is not a graduating 12th grader).
 *
 * Zero imports on purpose: `scripts/generate-feeds.mjs` imports this `.ts`
 * directly under Node's type stripping.
 */

/** The value a "Seniors are excused" switch stores. */
export const SENIOR_GRADE = '12';

/** Is a student in this grade excused from the event's audience requirement? */
export function gradeExcusedFromAudience(
  grade: string | undefined | null,
  event: { attendanceExcusedGrades?: string[] },
): boolean {
  const g = String(grade ?? '').trim();
  if (!g) return false; // an unknown grade is not excused: fail closed
  return (event.attendanceExcusedGrades ?? []).some(p => !!p && g.startsWith(p));
}

/** Are seniors excused from this event's audience requirement? */
export function seniorsExcused(event: { attendanceExcusedGrades?: string[] }): boolean {
  return (event.attendanceExcusedGrades ?? []).includes(SENIOR_GRADE);
}
