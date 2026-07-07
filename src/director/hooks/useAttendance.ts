import { useState, useEffect } from 'react';
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc,
  query, where, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { noteLoadError } from '../../shared/appStatus';
import { reportWriteError } from '../writeStatus';
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
  // Optimistic overlay: studentId → status the director just tapped (null =
  // cleared back to present). The card repaints instantly; the entry drops
  // once the Firestore echo confirms it. Doubles as a per-student tap lock so
  // a double-tap can never create duplicate records.
  const [optimistic, setOptimistic] = useState<Record<string, AttendanceStatus | null>>({});

  // Scope to this period when an eventId is set (untagged legacy records included).
  const scoped = eventId
    ? records.filter(r => r.eventId === eventId || r.eventId == null)
    : records;
  const serverMap: Record<string, AttendanceRecord> = Object.fromEntries(scoped.map(r => [r.studentId, r]));

  // Drop confirmed optimistic entries (render-phase adjustment).
  const confirmed = Object.entries(optimistic).filter(([sid, status]) => {
    const rec = serverMap[sid];
    return status === null ? !rec : rec?.status === status;
  });
  if (confirmed.length > 0) {
    setOptimistic(o => {
      const next = { ...o };
      for (const [sid] of confirmed) delete next[sid];
      return next;
    });
  }

  // What consumers see: server state overlaid with in-flight taps.
  const recordMap: Record<string, AttendanceRecord> = { ...serverMap };
  for (const [sid, status] of Object.entries(optimistic)) {
    if (status === null) delete recordMap[sid];
    else recordMap[sid] = {
      ...(serverMap[sid] ?? { id: `optimistic-${sid}`, studentId: sid, ensembleId: ensembleId ?? '', date }),
      status,
    } as AttendanceRecord;
  }

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
    }, () => { noteLoadError(); setLoading(false); });
  }, [date, ensembleId]);

  function toggleAttendance(
    studentId: string,
    newStatus: AttendanceStatus,
    extra?: { minutesLate?: number },
  ) {
    if (!db || !ensembleId) return;
    // A tap is still settling for this student — ignore until the echo lands.
    if (studentId in optimistic) return;
    const dbRef = db;
    const existing = serverMap[studentId];
    const extraFields = extra?.minutesLate != null && extra.minutesLate > 0
      ? { minutesLate: Math.round(extra.minutesLate) }
      : {};
    const clearing = existing?.status === newStatus;

    setOptimistic(o => ({ ...o, [studentId]: clearing ? null : newStatus }));
    try { navigator.vibrate?.(10); } catch { /* no haptics */ }

    const run = async () => {
      if (clearing) {
        // Tapping the active button clears it (back to present)
        await deleteDoc(doc(dbRef, 'attendance', existing.id));
      } else if (existing) {
        // Change status (and backfill eventId on any legacy record)
        await updateDoc(doc(dbRef, 'attendance', existing.id), { status: newStatus, ...extraFields, ...(eventId ? { eventId } : {}) });
      } else {
        // New exception record
        await addDoc(collection(dbRef, 'attendance'), {
          studentId,
          ensembleId,
          date,
          status: newStatus,
          ...extraFields,
          ...(eventId ? { eventId } : {}),
          createdAt: serverTimestamp(),
        });
      }
    };
    run().catch(() => {
      // Roll back the overlay and surface a retry.
      setOptimistic(o => {
        const next = { ...o };
        delete next[studentId];
        return next;
      });
      reportWriteError('Roll mark failed to save', run);
    });
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
    }, () => { noteLoadError(); setLoading(false); });
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
    }, () => { noteLoadError(); setLoading(false); });
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
