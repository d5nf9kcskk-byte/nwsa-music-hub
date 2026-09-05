import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../director/firebase';
import { noteLoadError, noteLoadOk } from '../../shared/appStatus';
import { PUBLIC_STUDENT_INFO } from '../publicStudentInfo';
import type { PublicLesson } from '../../shared/publicLesson';

const NONE: PublicLesson[] = [];

/**
 * One student's own private-lesson times (#applied, #privacy).
 *
 * Reads `lessonsPublic` and nothing else. That mirror is WHEN and WHERE only
 * — studentId, date, times, status, location, teacherName, instrument — and
 * the allowlist keeping it that way lives in three places that change
 * together (publicMirror.ts, firestore.rules, the backfill script). The
 * staff-only `lessons` collection, which holds the mark, the comments, the
 * repertoire and the initials, is never touched from the public site.
 *
 * Why this hook exists: the mirror had exactly one consumer,
 * scripts/generate-feeds.mjs, so a lesson reached a student only through
 * `feeds/student-<id>.ics` — a file rebuilt by the hourly deploy cron, and
 * only for a student who had already subscribed to it. On the page the
 * student actually opens, their lesson was invisible. A time nobody can see
 * is not a schedule.
 *
 * Scoped by studentId rather than filtered client-side: `lessonsPublic` grows
 * by one doc per lesson per student per week, so the whole collection is a
 * year of every studio in the school.
 */
export function useStudentLessons(studentId: string) {
  const enabled = PUBLIC_STUDENT_INFO && !!studentId && !!db;
  // The id the rows BELONG to rides along with them, so switching students
  // reads as "still loading" rather than briefly showing one student the
  // other's lesson times — the same shape useFeedToken uses for the same
  // reason, and without a synchronous setState inside the effect.
  const [state, setState] = useState<{ id: string; lessons: PublicLesson[] } | null>(null);

  useEffect(() => {
    if (!enabled || !db) return;
    // Equality only — a single-field filter needs no composite index, and
    // sorting a handful of dates here costs nothing. A missing index would
    // fail the whole listener rather than one row.
    const q = query(collection(db, 'lessonsPublic'), where('studentId', '==', studentId));
    return onSnapshot(q, snap => {
      const rows = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as PublicLesson))
        .filter(l => !!l.date)
        .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')
          || (a.startTime ?? '').localeCompare(b.startTime ?? ''));
      setState({ id: studentId, lessons: rows });
      noteLoadOk('lessonsPublic');
    }, () => {
      // A read failure is "nothing to show" rather than a stuck spinner: this
      // is one section of a page that is otherwise working.
      setState({ id: studentId, lessons: [] });
      noteLoadError('lessonsPublic');
    });
  }, [enabled, studentId]);

  const settled = enabled ? (state?.id === studentId ? state : null) : { id: studentId, lessons: NONE };
  return { lessons: settled?.lessons ?? NONE, loading: settled === null };
}
