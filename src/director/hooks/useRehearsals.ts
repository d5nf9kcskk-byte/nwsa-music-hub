import { useState, useEffect } from 'react';
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc,
  query, where, orderBy,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { Rehearsal } from '../types';

export function useRehearsals(ensembleId?: string) {
  const [rehearsals, setRehearsals] = useState<Rehearsal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) { setLoading(false); return; }
    const q = ensembleId
      ? query(collection(db, 'rehearsals'), where('ensembleId', '==', ensembleId), orderBy('date', 'desc'))
      : query(collection(db, 'rehearsals'), orderBy('date', 'desc'));
    return onSnapshot(q, snap => {
      setRehearsals(snap.docs.map(d => ({ id: d.id, ...d.data() } as Rehearsal)));
      setLoading(false);
    }, () => setLoading(false));
  }, [ensembleId]);

  async function addRehearsal(data: Omit<Rehearsal, 'id'>) {
    if (!db) return;
    await addDoc(collection(db, 'rehearsals'), data);
  }

  async function updateRehearsal(id: string, data: Partial<Omit<Rehearsal, 'id'>>) {
    if (!db) return;
    await updateDoc(doc(db, 'rehearsals', id), data);
  }

  async function deleteRehearsal(id: string) {
    if (!db) return;
    await deleteDoc(doc(db, 'rehearsals', id));
  }

  return { rehearsals, loading, addRehearsal, updateRehearsal, deleteRehearsal };
}
