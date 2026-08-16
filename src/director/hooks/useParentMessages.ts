import { useState, useEffect } from 'react';
import { collection, onSnapshot, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import type { ParentMessage } from '../types';

/** Director-side view of parent contact-form messages (#parent-messages).
 *  `enabled: false` skips the listener entirely — DirectorApp passes the
 *  org's contactForm flag so orgs without the form never pay for the watch. */
export function useParentMessages(enabled = true) {
  const [messages, setMessages] = useState<ParentMessage[]>([]);

  useEffect(() => {
    if (!db || !enabled) return;
    return onSnapshot(collection(db, 'parentMessages'), snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as ParentMessage)));
    }, () => {});
  }, [enabled]);

  async function setStatus(id: string, status: ParentMessage['status']) {
    if (!db) return;
    await updateDoc(doc(db, 'parentMessages', id), { status });
  }

  async function remove(id: string) {
    if (!db) return;
    await deleteDoc(doc(db, 'parentMessages', id));
  }

  return { messages, setStatus, remove };
}
