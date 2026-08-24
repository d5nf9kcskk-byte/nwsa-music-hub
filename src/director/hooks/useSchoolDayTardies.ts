import { useState, useEffect } from 'react';
import { collection, onSnapshot, setDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { noteLoadError, noteLoadOk } from '../../shared/appStatus';
import { trackWrite } from '../writeStatus';
import type { SchoolDayTardy } from '../types';

/**
 * Late to SCHOOL (#tardies) — the office bulletin's TARDY section, kept apart
 * from class attendance on purpose. See SchoolDayTardy in types.ts.
 *
 * Doc id is `${studentId}_${date}`: a student is tardy once on a day, so the
 * id makes that true by construction — the bulletin re-running mid-morning
 * updates the record instead of adding a second one, and a director marking
 * someone the bulletin missed can't create a duplicate either.
 */
export function tardyId(studentId: string, date: string): string {
  return `${studentId}_${date}`;
}

export function useSchoolDayTardies() {
  const [tardies, setTardies] = useState<SchoolDayTardy[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) { setLoading(false); return; }
    return onSnapshot(collection(db, 'schoolDayTardies'), snap => {
      setTardies(snap.docs.map(d => ({ id: d.id, ...d.data() } as SchoolDayTardy)));
      noteLoadOk('schoolDayTardies');
      setLoading(false);
    }, () => { noteLoadError('schoolDayTardies'); setLoading(false); });
  }, []);

  /** Record (or update) a tardy a director noticed the bulletin didn't have. */
  async function markTardy(student: { id: string; name: string }, date: string, time?: string) {
    if (!db) return;
    const dbRef = db;
    await trackWrite('Tardy', () => setDoc(doc(dbRef, 'schoolDayTardies', tardyId(student.id, date)), {
      studentId: student.id,
      studentName: student.name,
      date,
      time: time ?? null,
      updatedAt: Date.now(),
    }, { merge: true }));
  }

  async function clearTardy(studentId: string, date: string) {
    if (!db) return;
    const dbRef = db;
    await trackWrite('Tardy', () => deleteDoc(doc(dbRef, 'schoolDayTardies', tardyId(studentId, date))));
  }

  return { tardies, loading, markTardy, clearTardy };
}
