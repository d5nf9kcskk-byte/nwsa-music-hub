import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import type { RepertoirePiece } from '../types';

/**
 * Real-time listener for repertoire pieces. Sorted client-side by order then
 * title so the director can arrange a program and missing-order docs still sort.
 */
export function useRepertoire() {
  const [pieces, setPieces] = useState<RepertoirePiece[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) { setLoading(false); return; }
    return onSnapshot(collection(db, 'repertoire'), snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as RepertoirePiece));
      list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.title.localeCompare(b.title));
      setPieces(list);
      setLoading(false);
    }, () => setLoading(false));
  }, []);

  async function addPiece(data: Omit<RepertoirePiece, 'id'>) {
    if (!db) return;
    await addDoc(collection(db, 'repertoire'), data);
  }

  async function updatePiece(id: string, data: Partial<Omit<RepertoirePiece, 'id'>>) {
    if (!db) return;
    await updateDoc(doc(db, 'repertoire', id), data);
  }

  async function deletePiece(id: string) {
    if (!db) return;
    await deleteDoc(doc(db, 'repertoire', id));
  }

  return { pieces, loading, addPiece, updatePiece, deletePiece };
}
