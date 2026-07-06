import { useState, useEffect } from 'react';
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc,
  query, where, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { AttendanceRecord, AttendanceStatus } from '../types';

/**
 * Attendance for a (date, ensemble) — optionally scoped to a specific rehearsal
 * `eventId` so roll can be taken per class period. When eventId is given, only
 * records for that period are surfaced and new records are tagged with it; older
 * records without an eventId are treated as belonging to that day's period so
 * nothing is lost.
 */
export function useAttendance(date: string, ensembleId: string | null, eventId?: string | null) {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Scope to this period when an eventId is set (untagged legacy records included).
  const scoped = eventId
    ? records.filter(r => r.eventId === eventId || r.eventId == null)
    : records;
  const recordMap = Object.fromEntries(scoped.map(r => [r.studentId, r]));

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

  async function toggleAttendance(
    studentId: string,
    newStatus: AttendanceStatus,
    extra?: { minutesLate?: number },
  ) {
    if (!db || !ensembleId) return;
    const existing = recordMap[studentId];
    const extraFields = extra?.minutesLate != null && extra.minutesLate > 0
      ? { minutesLate: Math.round(extra.minutesLate) }
      : {};

    if (existing?.status === newStatus) {
      // Tapping the active button clears it (back to present)
      await deleteDoc(doc(db, 'attendance', existing.id));
    } else if (existing) {
      // Change status (and backfill eventId on any legacy record)
      await updateDoc(doc(db, 'attendance', existing.id), { status: newStatus, ...extraFields, ...(eventId ? { eventId } : {}) });
    } else {
      // New exception record
      await addDoc(collection(db, 'attendance'), {
        studentId,
        ensembleId,
        date,
        status: newStatus,
        ...extraFields,
        ...(eventId ? { eventId } : {}),
        createdAt: serverTimestamp(),
      });
    }
  }

  return { records: scoped, recordMap, loading, toggleAttendance };
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

/** Every attendance record for one DAY across all ensembles — powers the
 *  cross-period context badges on Take Roll (#25). */
export function useDayAttendance(date: string) {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, 'attendance'), where('date', '==', date));
    return onSnapshot(q, snap => {
      setRecords(snap.docs.map(d => ({ id: d.id, ...d.data() } as AttendanceRecord)));
    }, () => {});
  }, [date]);
  return { records };
}
