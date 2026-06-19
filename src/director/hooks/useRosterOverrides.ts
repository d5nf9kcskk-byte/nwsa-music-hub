import { useState, useEffect } from 'react';
import {
  collection, onSnapshot, addDoc, deleteDoc, doc, query,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { RosterOverride } from '../types';

/** Real-time listener for all temporary roster moves (subs / pulls). */
export function useRosterOverrides() {
  const [overrides, setOverrides] = useState<RosterOverride[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) { setLoading(false); return; }
    const q = query(collection(db, 'rosterOverrides'));
    return onSnapshot(q, snap => {
      setOverrides(snap.docs.map(d => ({ id: d.id, ...d.data() } as RosterOverride)));
      setLoading(false);
    }, () => setLoading(false));
  }, []);

  async function addOverride(data: Omit<RosterOverride, 'id'>) {
    if (!db) return;
    await addDoc(collection(db, 'rosterOverrides'), data);
  }

  async function deleteOverride(id: string) {
    if (!db) return;
    await deleteDoc(doc(db, 'rosterOverrides', id));
  }

  return { overrides, loading, addOverride, deleteOverride };
}
