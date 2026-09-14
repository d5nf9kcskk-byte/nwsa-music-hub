import { useEffect, useState } from 'react';
import { collection, doc, query, setDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { watchCollection } from '../../shared/watchCollection';
import { reportWriteError } from '../writeStatus';
import { currentDirectorName } from '../currentDirector';

/**
 * The numbers a director types for one group, one grading period (#gradebook).
 *
 * Staff-only, and there is no public projection: `assignmentResults` has none
 * either, and a student's own breakdown would be a NEW mirror with its own
 * pinned allowlist, never a loosened read rule (#privacy).
 *
 * The doc id is `${groupKey}_${periodId}_${studentId}` — the same composite-id
 * duplicate guard as `checkinDocId` and `schoolDayTardies`. A second save
 * updates one record rather than stacking a second opinion about a student's
 * quarter, and the query below can be a simple two-field match.
 *
 * `scores` is a MAP keyed by category id rather than named fields, because the
 * plan's categories are config: a course that adds Sectionals, or drops
 * Professionalism, must not need a schema change, a rules change and a screen
 * change to say so.
 */
export interface GradeMarks {
  id: string;
  /** An ensemble id, or `applied` for the report-runner's own studio. */
  groupKey: string;
  periodId: string;
  studentId: string;
  /** Category id → the typed 0-100. Absent means NOT SCORED, never zero. */
  scores?: Record<string, number>;
  /** '1' | '2' | '3' — the district's effort scale, stored as typed. */
  effort?: string;
  /** 'A' | 'B' | 'C' | 'D' | 'F'. */
  conduct?: string;
  /** District comment codes, e.g. ['14', '20']. */
  codes?: string[];
  /** The director's own note. Never leaves the Hub; the district gets codes. */
  note?: string;
  updatedAt?: number;
  updatedBy?: string;
}

export function markDocId(groupKey: string, periodId: string, studentId: string): string {
  return `${groupKey}_${periodId}_${studentId}`;
}

/**
 * Every mark for one grading period, across every group.
 *
 * Deliberately period-wide rather than one listener per group: the submitted
 * email carries all three tables at once, so a screen showing one table still
 * needs the other two to build it, and three listeners that can each be a beat
 * out of date is how two tables end up disagreeing about the same student.
 */
export function useGradeMarks(periodId: string) {
  const [marks, setMarks] = useState<GradeMarks[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db || !periodId) { setMarks([]); setLoading(false); return; }
    const q = query(collection(db, 'gradeMarks'), where('periodId', '==', periodId));
    return watchCollection(q, 'gradeMarks', snap => {
      setMarks(snap.docs.map(d => ({ id: d.id, ...d.data() } as GradeMarks)));
      setLoading(false);
    }, () => setLoading(false));
  }, [periodId]);

  /** groupKey → studentId → the record. */
  const byGroup: Record<string, Record<string, GradeMarks>> = {};
  for (const m of marks) {
    (byGroup[m.groupKey] ??= {})[m.studentId] = m;
  }

  /**
   * Merge a patch onto one student's record. `setDoc(..., { merge: true })`
   * rather than update, because the first save for a student is a create and
   * the caller should not have to know which this is.
   */
  async function saveMark(
    groupKey: string,
    studentId: string,
    patch: Partial<Omit<GradeMarks, 'id' | 'groupKey' | 'periodId' | 'studentId'>>,
  ) {
    if (!db || !groupKey || !periodId || !studentId) return;
    try {
      await setDoc(
        doc(db, 'gradeMarks', markDocId(groupKey, periodId, studentId)),
        {
          groupKey,
          periodId,
          studentId,
          ...patch,
          updatedAt: Date.now(),
          updatedBy: currentDirectorName() ?? '',
        },
        { merge: true },
      );
    } catch {
      reportWriteError('Grade not saved — check your connection and try again');
    }
  }

  /** Set or CLEAR one category's score. An empty box means NOT SCORED, which
   *  is not the same as a zero, so the key is removed rather than set to 0. */
  async function saveScore(
    groupKey: string,
    studentId: string,
    categoryId: string,
    value: number | null,
  ) {
    const current = byGroup[groupKey]?.[studentId]?.scores ?? {};
    const next = { ...current };
    if (value === null) delete next[categoryId];
    else next[categoryId] = value;
    await saveMark(groupKey, studentId, { scores: next });
  }

  return { marks, byGroup, loading, saveMark, saveScore };
}
