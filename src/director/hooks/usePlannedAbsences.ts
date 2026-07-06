import { useState, useEffect } from 'react';
import { collection, onSnapshot, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import type { PlannedAbsence } from '../types';

/** Director-side view of student-submitted planned absences (#27). */
export function usePlannedAbsences() {
  const [absences, setAbsences] = useState<PlannedAbsence[]>([]);

  useEffect(() => {
    if (!db) return;
    return onSnapshot(collection(db, 'plannedAbsences'), snap => {
      setAbsences(snap.docs.map(d => ({ id: d.id, ...d.data() } as PlannedAbsence)));
    }, () => {});
  }, []);

  async function setStatus(id: string, status: 'approved' | 'dismissed') {
    if (!db) return;
    await updateDoc(doc(db, 'plannedAbsences', id), { status });
  }

  async function remove(id: string) {
    if (!db) return;
    await deleteDoc(doc(db, 'plannedAbsences', id));
  }

  return { absences, setStatus, remove };
}
