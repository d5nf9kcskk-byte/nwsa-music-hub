import type { Lesson } from '../director/types';

/**
 * A `lessonsPublic` doc as a READER sees it (#applied, #privacy).
 *
 * The write side — the allowlist `PUBLIC_LESSON_KEYS` and
 * `publicLessonFields()` — stays in src/director/publicMirror.ts, which is
 * where CLAUDE.md says the field contract lives and where
 * scripts/weekly-review/drift.mjs looks for it. This is only the type the
 * public site needs, and it lives in src/shared because public code may not
 * import from src/director beyond types (eslint no-restricted-imports).
 *
 * The two cannot drift apart in silence: publicMirror.ts carries a
 * compile-time assertion that its key list and `PublicLessonKey` are the same
 * set, so adding a field on one side and not the other fails `tsc`.
 *
 * WHEN and WHERE only. The mark, the technique comments, the repertoire and
 * both parties' initials live on the staff-only `lessons` doc and are not
 * nameable here.
 */
export type PublicLessonKey =
  | 'studentId'
  | 'date'
  | 'startTime'
  | 'endTime'
  | 'status'
  | 'location'
  | 'teacherName'
  | 'instrument';

/** All of it optional but the id: a mirror doc carries only the keys its
 *  source lesson actually had, and a reader that assumes otherwise crashes a
 *  public page on a half-filled doc. */
export type PublicLesson = { id: string } & Partial<Pick<Lesson, PublicLessonKey>>;
