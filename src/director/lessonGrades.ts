import type { Lesson } from './types';

/**
 * Applied-lesson grading (#applied). A studio teacher marks each lesson they
 * gave; the Dean wants a term average per student out the other end.
 *
 * The grade lives on the Lesson doc, NOT in a grades collection — see the
 * note on `Lesson.grade`. So this module is pure arithmetic over lessons the
 * caller already has, with no Firestore of its own.
 */

/** Best → worst. Index IS the letter's distance from an A, which is what
 *  makes `points` and `letterFor` below one line each. */
export const LESSON_MARKS = ['A', 'B', 'C', 'D', 'F'] as const;
export type LessonMark = (typeof LESSON_MARKS)[number];

/** A=4 … F=0, the ordinary 4-point scale. */
export const markPoints = (m: LessonMark): number => 4 - LESSON_MARKS.indexOf(m);

export function isLessonMark(v: unknown): v is LessonMark {
  return typeof v === 'string' && (LESSON_MARKS as readonly string[]).includes(v);
}

/** A lesson counts toward a grade only if it actually happened and carries a
 *  recognized mark. Cancelled lessons never drag an average down, and the
 *  free-text values the reserved `grade` field allowed before the closed set
 *  existed are ignored rather than crashing the average. */
export const isGraded = (l: Lesson): boolean => l.status !== 'Cancelled' && isLessonMark(l.grade);

/** A past, non-cancelled lesson with no mark on it — the teacher's to-do. */
export const needsGrade = (l: Lesson, today: string): boolean =>
  l.status !== 'Cancelled' && l.date <= today && !isLessonMark(l.grade);

export interface GradeSummary {
  /** Lessons that counted. */
  graded: number;
  /** Non-cancelled lessons up to `today` — the denominator the teacher sees. */
  gradable: number;
  /** Mean of the counted lessons' points, 0–4. */
  average: number;
  /** `average` snapped back to a letter, ties rounding to the BETTER grade. */
  letter: LessonMark;
}

/**
 * Term summary for a set of lessons (one student's, or a whole studio's).
 * Returns null when nothing has been graded — an empty average is not a zero.
 */
export function gradeSummary(lessons: Lesson[], today: string): GradeSummary | null {
  const counted = lessons.filter(isGraded);
  const gradable = lessons.filter(l => l.status !== 'Cancelled' && l.date <= today).length;
  if (counted.length === 0) return null;
  const average = counted.reduce((sum, l) => sum + markPoints(l.grade as LessonMark), 0) / counted.length;
  return { graded: counted.length, gradable, average, letter: letterFor(average) };
}

/** Points → letter. A half-point is the boundary and goes to the better
 *  letter (3.5 is an A, 3.4 a B) — the usual classroom convention. */
export function letterFor(average: number): LessonMark {
  const i = Math.ceil(4 - average - 0.5);
  return LESSON_MARKS[Math.min(LESSON_MARKS.length - 1, Math.max(0, i))];
}
