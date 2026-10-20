import { useState, useEffect } from 'react';
import { collection, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { watchCollection } from '../../shared/watchCollection';
import { currentDirectorEmail, currentDirectorName } from '../currentDirector';
import type { ReadAloudItem } from '../readAloudBoard';
import { proposeWrite } from './usePendingActions';

/**
 * Read-Aloud talking points (#read-aloud). Staff and assistants read every
 * point; the board filters by group. A director's add lands; an assistant's
 * is queued for approval by `proposeWrite`, exactly like their announcements.
 */
export function useReadAloudItems() {
  const [items, setItems] = useState<ReadAloudItem[]>([]);

  useEffect(() => {
    if (!db) return;
    return watchCollection(collection(db, 'readAloudItems'), 'readAloudItems', snap => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() } as ReadAloudItem)));
    });
  }, []);

  async function addItem(data: Omit<ReadAloudItem, 'id'>): Promise<void> {
    if (!db) return;
    const stamped = {
      ...data,
      createdBy: data.createdBy ?? currentDirectorName(),
      createdByEmail: data.createdByEmail ?? currentDirectorEmail(),
    };
    if (await proposeWrite({
      collection: 'readAloudItems', op: 'create', data: stamped,
      label: `Read-aloud point: “${data.title}”`,
    })) return;
    await addDoc(collection(db, 'readAloudItems'), stamped);
  }

  async function deleteItem(id: string): Promise<void> {
    if (!db) return;
    const gone = items.find(i => i.id === id);
    if (await proposeWrite({
      collection: 'readAloudItems', op: 'delete', docId: id,
      label: `Remove read-aloud point: “${gone?.title ?? id}”`,
    })) return;
    await deleteDoc(doc(db, 'readAloudItems', id));
  }

  return { items, addItem, deleteItem };
}
