import { useState, useEffect } from 'react';
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc,
  query, orderBy,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { Ensemble } from '../types';

export function useEnsembles() {
  const [ensembles, setEnsembles] = useState<Ensemble[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) { setLoading(false); return; }
    const q = query(collection(db, 'ensembles'), orderBy('order'));
    return onSnapshot(q, snap => {
      setEnsembles(snap.docs.map(d => ({ id: d.id, ...d.data() } as Ensemble)));
      setLoading(false);
    }, () => setLoading(false));
  }, []);

  async function addEnsemble(data: Omit<Ensemble, 'id'>) {
    if (!db) return;
    await addDoc(collection(db, 'ensembles'), data);
  }

  async function updateEnsemble(id: string, data: Partial<Omit<Ensemble, 'id'>>) {
    if (!db) return;
    await updateDoc(doc(db, 'ensembles', id), data);
  }

  async function deleteEnsemble(id: string) {
    if (!db) return;
    await deleteDoc(doc(db, 'ensembles', id));
  }

  return { ensembles, loading, addEnsemble, updateEnsemble, deleteEnsemble };
}
