import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, doc, updateDoc, arrayUnion, query } from 'firebase/firestore';
import { db } from '../firebase';
import { noteLoadError, noteLoadOk } from '../../shared/appStatus';
import { currentDirectorEmail } from '../currentDirector';
import type { StaffNotice } from '../types';

/**
 * Staff heads-up notices (#two-doors §5.1): one doc per saved student move,
 * naming the affected ensembles. Dismiss is per-person (readBy), so both
 * affected directors each see it once. Staff-only collection — see
 * firestore.rules /staffNotices.
 */
export function useStaffNotices() {
  const [notices, setNotices] = useState<StaffNotice[]>([]);

  useEffect(() => {
    if (!db) return;
    return onSnapshot(query(collection(db, 'staffNotices')), snap => {
      setNotices(snap.docs.map(d => ({ id: d.id, ...d.data() } as StaffNotice)));
      noteLoadOk('staffNotices');
    }, () => noteLoadError('staffNotices'));
  }, []);

  async function addNotice(data: Omit<StaffNotice, 'id'>) {
    if (!db) return;
    await addDoc(collection(db, 'staffNotices'), data);
  }

  async function dismissNotice(id: string) {
    if (!db) return;
    const email = currentDirectorEmail();
    if (!email) return;
    await updateDoc(doc(db, 'staffNotices', id), { readBy: arrayUnion(email) });
  }

  return { notices, addNotice, dismissNotice };
}

/** Notices still worth showing me: not dismissed, and the move isn't over. */
export function activeNotices(notices: StaffNotice[], today: string): StaffNotice[] {
  const email = currentDirectorEmail();
  return notices
    .filter(n => (n.endDate ?? n.date) >= today)
    .filter(n => !email || !(n.readBy ?? []).includes(email))
    .sort((a, b) => b.createdAt - a.createdAt);
}
