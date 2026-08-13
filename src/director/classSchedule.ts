import type { Student } from './types';

/**
 * Which academic Class calendar title a student belongs to (Mon/Thu theory
 * block). Jazz Ensemble members take Jazz Theory; everyone else is by grade.
 * Used by personal-schedule expectation so Class events (school-wide,
 * empty ensembleIds) still appear on the right students' schedules.
 */
export function theoryClassTitleFor(
  student: Pick<Student, 'grade' | 'ensembleIds'>,
): string | null {
  if (student.ensembleIds?.includes('jazz-ensemble')) return 'Jazz Theory';
  const g = String(student.grade ?? '');
  if (g.startsWith('9')) return 'Theory — 9th Grade';
  if (g.startsWith('10')) return 'Theory — 10th Grade';
  if (g.startsWith('11') || g.startsWith('12')) return 'Music History — 11th–12th';
  return null;
}

/** Choir Block 1 academic classes — every High School Choir member. */
export function isChoirClassTitle(title: string | undefined): boolean {
  return title === 'Vocal Lit' || title === 'Vocal Forum';
}
