import { useState, useEffect } from 'react';
import { collection, query, where, updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { watchCollection } from '../../shared/watchCollection';
import { reportWriteError } from '../writeStatus';
import type { BulletinQueueItem } from '../types';

/** Pending (or all) office-bulletin rows that need a human eyes for one date. */
export function useBulletinQueue(date: string) {
  const [items, setItems] = useState<BulletinQueueItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db || !date) { setLoading(false); return; }
    const q = query(collection(db, 'bulletinQueue'), where('date', '==', date));
    return watchCollection(q, 'bulletinQueue', snap => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() } as BulletinQueueItem)));
    }, () => setLoading(false));
  }, [date]);

  const pending = items.filter(i => i.status === 'pending');

  function dismiss(id: string) {
    if (!db) return;
    const run = () => updateDoc(doc(db!, 'bulletinQueue', id), { status: 'dismissed' });
    run().catch(() => reportWriteError('Could not dismiss bulletin row', run));
  }

  return { items, pending, loading, dismiss };
}
