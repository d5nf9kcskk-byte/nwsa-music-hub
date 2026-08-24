import { useState, useEffect } from 'react';
import { collection, doc, setDoc, deleteDoc, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { watchCollection } from '../../shared/watchCollection';
import { trackWrite } from '../writeStatus';
import { currentDirectorName, currentDirectorRole } from '../currentDirector';
import type { ServiceAttendance, ServiceAttendanceStatus } from '../types';
import { usePersonnelGate } from './personnelGate';

/** The rules-enforced doc id: one record per person per service, ever. */
export function serviceAttendanceDocId(eventId: string, personnelId: string) {
  return `${eventId}__${personnelId}`;
}

/**
 * Attendance at ONE service for the paid roster (#personnel — build-plan
 * Step 5). Query-and-rule agreement, both halves:
 *   • The rule is a role check (Owner/Director only, like every #personnel
 *     sibling), so the matching query is subscribing only as that role —
 *     usePersonnelGate, the same gate as usePersonnel. A teacher or
 *     assistant never attaches a listener that would die on
 *     permission-denied; they render empty with loading false.
 *   • Writes use the deterministic `${eventId}__${personnelId}` doc id the
 *     rules enforce, so a duplicate mark is structurally impossible and two
 *     services on the same day never share a record.
 *
 * No optimistic overlay (unlike useAttendance): setDoc/deleteDoc echo
 * through the local listener immediately via Firestore latency
 * compensation, which is instant enough for a roll screen.
 */
export function useServiceAttendance(eventId: string | null) {
  // State is tagged with the event it answers for and DERIVED against the
  // current eventId (no setState in the effect body — react-hooks lint):
  // switching the service picker shows empty-and-loading, never the previous
  // service's marks.
  const [snap, setSnap] = useState<{ eventId: string; records: ServiceAttendance[] } | null>(null);
  const [settledFor, setSettledFor] = useState<string | null>(null);
  const gate = usePersonnelGate();
  const records = snap?.eventId === eventId ? snap.records : [];
  const loading = Boolean(db) && Boolean(eventId) && gate !== 'blocked' && settledFor !== eventId;

  useEffect(() => {
    if (!db || gate !== 'open' || !eventId) return;
    return watchCollection(
      query(collection(db, 'serviceAttendance'), where('eventId', '==', eventId)),
      'serviceAttendance',
      s => setSnap({ eventId, records: s.docs.map(d => ({ id: d.id, ...d.data() } as ServiceAttendance)) }),
      () => setSettledFor(eventId),
    );
  }, [gate, eventId]);

  const recordMap: Record<string, ServiceAttendance> = Object.fromEntries(
    records.map(r => [r.personnelId, r]),
  );

  /** Set a mark; tapping the already-active status clears back to unmarked. */
  async function setStatus(personnelId: string, status: ServiceAttendanceStatus) {
    if (!db || !eventId) return;
    const dbRef = db;
    const ref = doc(dbRef, 'serviceAttendance', serviceAttendanceDocId(eventId, personnelId));
    if (recordMap[personnelId]?.status === status) {
      await trackWrite('Attendance clear', () => deleteDoc(ref));
      return;
    }
    await trackWrite('Attendance mark', () => setDoc(ref, {
      personnelId,
      eventId,
      status,
      updatedAt: Date.now(),
      updatedBy: currentDirectorName(),
      updatedByRole: currentDirectorRole(),
    }));
  }

  return { records, recordMap, loading, setStatus };
}
