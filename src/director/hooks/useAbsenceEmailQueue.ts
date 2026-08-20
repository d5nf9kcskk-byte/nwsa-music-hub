import { useState, useEffect } from 'react';
import { collection, query, where, updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { watchCollection } from '../../shared/watchCollection';
import { reportWriteError } from '../writeStatus';
import type { AbsenceEmailQueueItem } from '../types';

/** Pending absence-emails the local Mail.app pipeline couldn't confidently match. */
export function useAbsenceEmailQueue(date: string) {
  const [items, setItems] = useState<AbsenceEmailQueueItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db || !date) { setLoading(false); return; }
    const q = query(collection(db, 'absenceEmailQueue'), where('dates', 'array-contains', date));
    return watchCollection(q, 'absenceEmailQueue', snap => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() } as AbsenceEmailQueueItem)));
    }, () => setLoading(false));
  }, [date]);

  const pending = items.filter(i => i.status === 'pending');

  function dismiss(id: string) {
    if (!db) return;
    const run = () => updateDoc(doc(db!, 'absenceEmailQueue', id), { status: 'dismissed' });
    run().catch(() => reportWriteError('Could not dismiss absence email', run));
  }

  return { items, pending, loading, dismiss };
}
