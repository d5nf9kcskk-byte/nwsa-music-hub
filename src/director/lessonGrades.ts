import type { Lesson } from './types';

/**
 * Applied-lesson grading (#applied). A studio teacher marks each lesson they
 * gave; the Dean wants a term average per student out the other end.
 *
 * The mark is a NUMBER on the district's 0–100 scale (Sept 2026, director's
 * call): the paper High School Lesson Log's "Lesson Grade" column is numeric
 * and the district gradebook is a percentage, so a letter had to be converted
 * by hand at both ends. Letters are gone. Anything that is not a whole 0–100
 * fails closed and is ignored rather than counted as a zero, which is also
 * what retires the A–F values still sitting on lessons graded before this.
 *
 * The grade lives on the Lesson doc, NOT in a grades collection — see the
 * note on `Lesson.grade`. So this module is pure arithmetic over lessons the
 * caller already has, with no Firestore of its own.
 */

export const LESSON_GRADE_MIN = 0;
export const LESSON_GRADE_MAX = 100;

/**
 * The ONE reader of `Lesson.grade`. Returns the number, or null for anything
 * that is not a whole 0–100 — blank, a legacy letter, "95.5", "-5", "1000".
 * The field stays a string on the doc because it always was one.
 */
export function lessonGradeValue(v: unknown): number | null {
  const s = typeof v === 'number' ? String(v) : typeof v === 'string' ? v.trim() : '';
  if (!/^\d{1,3}$/.test(s)) return null;
  const n = Number(s);
  return n >= LESSON_GRADE_MIN && n <= LESSON_GRADE_MAX ? n : null;
}

export function isLessonGrade(v: unknown): boolean {
  return lessonGradeValue(v) !== null;
}

/** A lesson counts toward a term average only if it actually happened and
 *  carries a number. Cancelled lessons never drag an average down. */
export const isGraded = (l: Lesson): boolean => l.status !== 'Cancelled' && isLessonGrade(l.grade);

/** A past, non-cancelled lesson with no number on it — the teacher's to-do. */
export const needsGrade = (l: Lesson, today: string): boolean =>
  l.status !== 'Cancelled' && l.date <= today && !isLessonGrade(l.grade);

export interface GradeSummary {
  /** Lessons that counted. */
  graded: number;
  /** Non-cancelled lessons up to `today` — the denominator the teacher sees. */
  gradable: number;
  /** Mean of the counted lessons' grades, 0–100. */
  average: number;
  /** `average` to the nearest whole number — what goes in a gradebook, and
   *  the ONE rounding so two screens can't show 89 and 90 for one student. */
  rounded: number;
}

/**
 * Term summary for a set of lessons (one student's, or a whole studio's).
 * Returns null when nothing has been graded — an empty average is not a zero.
 */
export function gradeSummary(lessons: Lesson[], today: string): GradeSummary | null {
  const counted = lessons.map(l => (isGraded(l) ? lessonGradeValue(l.grade) : null)).filter((n): n is number => n !== null);
  const gradable = lessons.filter(l => l.status !== 'Cancelled' && l.date <= today).length;
  if (counted.length === 0) return null;
  const average = counted.reduce((sum, n) => sum + n, 0) / counted.length;
  return { graded: counted.length, gradable, average, rounded: Math.round(average) };
}
