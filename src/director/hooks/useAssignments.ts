import { useState, useEffect } from 'react';
import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  query, where, deleteField,
} from 'firebase/firestore';
import { db } from '../firebase';
import { offerUndo } from '../writeStatus';
import { deleteStoredFiles } from '../storageCleanup';
import { watchCollection } from '../../shared/watchCollection';
import { todayStr } from '../utils';
import { currentDirectorName } from '../currentDirector';
import type { Assignment, AssignmentResult, AssignmentResultStatus } from '../types';

export function useAssignments() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) { setLoading(false); return; }
    return watchCollection(collection(db, 'assignments'), 'assignments', snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Assignment));
      list.sort((a, b) => b.dueDate.localeCompare(a.dueDate));
      setAssignments(list);
    }, () => setLoading(false));
  }, []);

  async function addAssignment(data: Omit<Assignment, 'id'>) {
    if (!db) return;
    await addDoc(collection(db, 'assignments'), data);
  }

  async function updateAssignment(id: string, data: Partial<Omit<Assignment, 'id'>>) {
    if (!db) return;
    // Explicit undefined means DELETE, mirroring useRepertoire.updatePiece.
    // The app initializes Firestore with ignoreUndefinedProperties, which
    // silently DROPS undefined keys from a patch — so clearing the last
    // linked piece (or the form link, or turning video submissions off) left
    // the stored value untouched and the "cleared" field came straight back.
    const stamped: Record<string, unknown> = { ...data, updatedAt: Date.now(), updatedBy: currentDirectorName() };
    const payload = Object.fromEntries(
      Object.entries(stamped).map(([k, v]) => [k, v === undefined ? deleteField() : v]),
    );
    const previous = assignments.find(a => a.id === id)?.attachments ?? [];
    await updateDoc(doc(db, 'assignments', id), payload);
    // Attachments dropped in this save are no longer referenced — delete the
    // objects (audit rec #6). After the save, so a cancelled edit keeps them.
    if ('attachments' in data) {
      const kept = new Set((data.attachments ?? []).map(a => a.url));
      void deleteStoredFiles(previous.map(a => a.url).filter(url => !kept.has(url)));
    }
  }

  async function deleteAssignment(id: string) {
    if (!db) return;
    const gone = assignments.find(x => x.id === id);
    await deleteDoc(doc(db, 'assignments', id));
    if (gone) {
      const { id: _id, ...data } = gone;
      void _id;
      // Attachments are deleted with the assignment once undo lapses (rec #6).
      offerUndo('assignments', id, data, `Deleted "${gone.title}" — restore?`, undefined,
        () => { void deleteStoredFiles((gone.attachments ?? []).map(a => a.url)); });
    }
  }

  return { assignments, loading, addAssignment, updateAssignment, deleteAssignment };
}

export function useAssignmentResults(assignmentId: string) {
  const [results, setResults] = useState<AssignmentResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db || !assignmentId) { setLoading(false); return; }
    const q = query(
      collection(db, 'assignmentResults'),
      where('assignmentId', '==', assignmentId),
    );
    return watchCollection(q, 'assignments', snap => {
      setResults(snap.docs.map(d => ({ id: d.id, ...d.data() } as AssignmentResult)));
    }, () => setLoading(false));
  }, [assignmentId]);

  const resultMap = Object.fromEntries(results.map(r => [r.studentId, r]));

  async function saveResult(
    studentId: string,
    status: AssignmentResultStatus,
    opts?: { score?: string | null },
  ) {
    if (!db) return;
    const existing = resultMap[studentId];
    const data: Record<string, unknown> = {
      assignmentId,
      studentId,
      status,
      gradedAt: todayStr(),
    };
    if (opts && 'score' in opts) {
      // Explicit null/'' clears the field; omit opts.score to leave it alone.
      data.score = opts.score ? opts.score : deleteField();
    }
    if (existing) {
      await updateDoc(doc(db, 'assignmentResults', existing.id), data);
    } else {
      if (!opts?.score) delete data.score;
      await addDoc(collection(db, 'assignmentResults'), data);
    }
  }

  /** Remove a student's result — tapping the same grade again clears it back to Pending. */
  async function clearResult(studentId: string) {
    if (!db) return;
    const existing = resultMap[studentId];
    if (existing) await deleteDoc(doc(db, 'assignmentResults', existing.id));
  }

  return { results, resultMap, loading, saveResult, clearResult };
}

export function useStudentAssignmentResults(studentId?: string) {
  const [results, setResults] = useState<AssignmentResult[]>([]);

  useEffect(() => {
    if (!db || !studentId) return;
    const q = query(
      collection(db, 'assignmentResults'),
      where('studentId', '==', studentId),
    );
    return watchCollection(q, 'assignments', snap => {
      setResults(snap.docs.map(d => ({ id: d.id, ...d.data() } as AssignmentResult)));
    });
  }, [studentId]);

  return { results };
}
