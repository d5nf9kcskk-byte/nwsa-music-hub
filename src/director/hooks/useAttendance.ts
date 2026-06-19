import { useState, useEffect } from 'react';
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc,
  query, where, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { AttendanceRecord, AttendanceStatus } from '../types';

export function useAttendance(date: string, ensembleId: string | null) {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Map from studentId → record for quick lookup
  const recordMap = Object.fromEntries(records.map(r => [r.studentId, r]));

  useEffect(() => {
    if (!db || !ensembleId) { setLoading(false); return; }
    const q = query(
      collection(db, 'attendance'),
      where('date', '==', date),
      where('ensembleId', '==', ensembleId),
    );
    return onSnapshot(q, snap => {
      setRecords(snap.docs.map(d => ({ id: d.id, ...d.data() } as AttendanceRecord)));
      setLoading(false);
    }, () => setLoading(false));
  }, [date, ensembleId]);

  async function toggleAttendance(studentId: string, newStatus: AttendanceStatus) {
    if (!db || !ensembleId) return;
    const existing = recordMap[studentId];

    if (existing?.status === newStatus) {
      // Tapping the active button clears it (back to present)
      await deleteDoc(doc(db, 'attendance', existing.id));
    } else if (existing) {
      // Change status
      await updateDoc(doc(db, 'attendance', existing.id), { status: newStatus });
    } else {
      // New exception record
      await addDoc(collection(db, 'attendance'), {
        studentId,
        ensembleId,
        date,
        status: newStatus,
        createdAt: serverTimestamp(),
      });
    }
  }

  return { records, recordMap, loading, toggleAttendance };
}

/** Listens to the entire attendance collection — for the tracker and roster counts. */
export function useAllAttendance() {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) { setLoading(false); return; }
    const q = query(collection(db, 'attendance'));
    return onSnapshot(q, snap => {
      setRecords(snap.docs.map(d => ({ id: d.id, ...d.data() } as AttendanceRecord)));
      setLoading(false);
    }, () => setLoading(false));
  }, []);

  return { records, loading };
}

export function useAttendanceHistory(studentId?: string) {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db || !studentId) { setLoading(false); return; }
    const q = query(
      collection(db, 'attendance'),
      where('studentId', '==', studentId),
    );
    return onSnapshot(q, snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as AttendanceRecord));
      all.sort((a, b) => b.date.localeCompare(a.date));
      setRecords(all);
      setLoading(false);
    }, () => setLoading(false));
  }, [studentId]);

  return { records, loading };
}
