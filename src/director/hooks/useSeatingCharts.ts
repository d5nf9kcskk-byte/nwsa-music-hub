import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { noteLoadError, noteLoadOk } from '../../shared/appStatus';
import { offerUndo } from '../writeStatus';
import { currentDirectorName } from '../currentDirector';
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
      noteLoadOk('seatingCharts');
    }, () => { noteLoadError('seatingCharts'); setLoading(false); });
  }, [ensembleId]);

  async function addChart(data: Omit<SeatingChart, 'id'>) {
    if (!db) return;
    await addDoc(collection(db, 'seatingCharts'), data);
  }
  async function updateChart(id: string, data: Partial<Omit<SeatingChart, 'id'>>) {
    if (!db) return;
    const payload = { ...data, updatedAt: Date.now(), updatedBy: currentDirectorName() };
    await updateDoc(doc(db, 'seatingCharts', id), payload);
  }
  async function deleteChart(id: string) {
    if (!db) return;
    // Undo (#38): capture the doc, delete, offer 10s restore with the same id.
    const gone = charts.find(x => x.id === id);
    await deleteDoc(doc(db, 'seatingCharts', id));
    if (gone) {
      const { id: _id, ...data } = gone;
      offerUndo('seatingCharts', id, data, `Deleted seating chart — restore?`);
    }
  }

  return { charts, loading, addChart, updateChart, deleteChart };
}
