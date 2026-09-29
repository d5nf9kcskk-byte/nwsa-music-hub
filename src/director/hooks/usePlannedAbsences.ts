import { useState, useEffect } from 'react';
import { collection, onSnapshot, updateDoc, deleteDoc, addDoc, doc } from 'firebase/firestore';
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

  /** Staff filing a heads-up on a family's behalf ("arriving late"). Goes
   *  through the same create rule the public writers use, so it must carry the
   *  same shape: status 'pending', a real student, bounded strings. */
  async function addReport(report: Omit<PlannedAbsence, 'id' | 'submittedAt' | 'status'>) {
    if (!db) return;
    await addDoc(collection(db, 'plannedAbsences'), { ...report, submittedAt: Date.now(), status: 'pending' });
  }

  return { absences, setStatus, remove, addReport };
}
