import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { noteLoadError, noteLoadOk } from '../../shared/appStatus';
import { trackWrite } from '../writeStatus';
import { currentDirectorName } from '../currentDirector';
import type { Jury } from '../types';

/** End-of-semester juries (#juries) — see the Jury type; this is a stub. */
export function useJuries() {
  const [juries, setJuries] = useState<Jury[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) { setLoading(false); return; }
    // Ordered by name, not date: a jury usually has no date yet, and ordering
    // by a mostly-absent field puts every un-dated one in an arbitrary heap.
    const q = query(collection(db, 'juries'), orderBy('name'));
    return onSnapshot(q, snap => {
      setJuries(snap.docs.map(d => ({ id: d.id, ...d.data() } as Jury)));
      noteLoadOk('juries');
      setLoading(false);
    }, () => { noteLoadError('juries'); setLoading(false); });
  }, []);

  const stamp = () => ({ updatedAt: Date.now(), updatedBy: currentDirectorName() ?? '' });

  async function addJury(data: Omit<Jury, 'id'>): Promise<string | undefined> {
    if (!db) return;
    const dbRef = db;
    let id: string | undefined;
    await trackWrite('Jury', async () => {
      const ref = await addDoc(collection(dbRef, 'juries'), { ...data, ...stamp() });
      id = ref.id;
    });
    return id;
  }

  async function updateJury(id: string, data: Partial<Omit<Jury, 'id'>>) {
    if (!db) return;
    const dbRef = db;
    await trackWrite('Jury', () => updateDoc(doc(dbRef, 'juries', id), { ...data, ...stamp() }));
  }

  async function deleteJury(id: string) {
    if (!db) return;
    const dbRef = db;
    await trackWrite('Jury', () => deleteDoc(doc(dbRef, 'juries', id)));
  }

  return { juries, loading, addJury, updateJury, deleteJury };
}
