import { useState, useEffect } from 'react';
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc,
  query, orderBy, where,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { Assignment, AssignmentResult, AssignmentResultStatus } from '../types';

export function useAssignments() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) { setLoading(false); return; }
    const q = query(collection(db, 'assignments'), orderBy('dueDate', 'desc'));
    return onSnapshot(q, snap => {
      setAssignments(snap.docs.map(d => ({ id: d.id, ...d.data() } as Assignment)));
      setLoading(false);
    }, () => setLoading(false));
  }, []);

  async function addAssignment(data: Omit<Assignment, 'id'>) {
    if (!db) return;
    await addDoc(collection(db, 'assignments'), data);
  }

  async function updateAssignment(id: string, data: Partial<Omit<Assignment, 'id'>>) {
    if (!db) return;
    await updateDoc(doc(db, 'assignments', id), data);
  }

  async function deleteAssignment(id: string) {
    if (!db) return;
    await deleteDoc(doc(db, 'assignments', id));
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
    return onSnapshot(q, snap => {
      setResults(snap.docs.map(d => ({ id: d.id, ...d.data() } as AssignmentResult)));
      setLoading(false);
    }, () => setLoading(false));
  }, [assignmentId]);

  const resultMap = Object.fromEntries(results.map(r => [r.studentId, r]));

  async function saveResult(studentId: string, status: AssignmentResultStatus) {
    if (!db) return;
    const existing = resultMap[studentId];
    const data = {
      assignmentId,
      studentId,
      status,
      gradedAt: new Date().toISOString().slice(0, 10),
    };
    if (existing) {
      await updateDoc(doc(db, 'assignmentResults', existing.id), data);
    } else {
      await addDoc(collection(db, 'assignmentResults'), data);
    }
  }

  return { results, resultMap, loading, saveResult };
}

export function useStudentAssignmentResults(studentId?: string) {
  const [results, setResults] = useState<AssignmentResult[]>([]);

  useEffect(() => {
    if (!db || !studentId) return;
    const q = query(
      collection(db, 'assignmentResults'),
      where('studentId', '==', studentId),
    );
    return onSnapshot(q, snap => {
      setResults(snap.docs.map(d => ({ id: d.id, ...d.data() } as AssignmentResult)));
    }, () => {});
  }, [studentId]);

  return { results };
}
