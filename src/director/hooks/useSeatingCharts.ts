import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { SeatingChart } from '../types';

/** Published seating charts. Public-readable (students see where they sit). */
export function useSeatingCharts(ensembleId?: string) {
  const [charts, setCharts] = useState<SeatingChart[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) { setLoading(false); return; }
    const col = collection(db, 'seatingCharts');
    const q = ensembleId ? query(col, where('ensembleId', '==', ensembleId)) : col;
    return onSnapshot(q, snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as SeatingChart));
      list.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || b.createdAt - a.createdAt);
      setCharts(list);
      setLoading(false);
    }, () => setLoading(false));
  }, [ensembleId]);

  async function addChart(data: Omit<SeatingChart, 'id'>) {
    if (!db) return;
    await addDoc(collection(db, 'seatingCharts'), data);
  }
  async function updateChart(id: string, data: Partial<Omit<SeatingChart, 'id'>>) {
    if (!db) return;
    await updateDoc(doc(db, 'seatingCharts', id), data);
  }
  async function deleteChart(id: string) {
    if (!db) return;
    await deleteDoc(doc(db, 'seatingCharts', id));
  }

  return { charts, loading, addChart, updateChart, deleteChart };
}
