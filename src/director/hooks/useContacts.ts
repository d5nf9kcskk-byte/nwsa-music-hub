import { useState, useEffect } from 'react';
import { collection, setDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { watchCollection } from '../../shared/watchCollection';
import { reportWriteError } from '../writeStatus';
import type { StudentContact } from '../types';

/**
 * Auth-only contact details, keyed by student id. Directors read/write here;
 * the public app never touches this collection. Pass `enabled: false` for
 * roles firestore.rules bars from contacts (the Personnel Assistant shell) —
 * otherwise the denied listener trips the "couldn't load" status strip.
 */
export function useContacts(enabled: boolean = true) {
  const [contacts, setContacts] = useState<Record<string, StudentContact>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db || !enabled) { setLoading(false); return; }
    return watchCollection(collection(db, 'contacts'), 'contacts', snap => {
      const map: Record<string, StudentContact> = {};
      snap.docs.forEach(d => { map[d.id] = { id: d.id, ...d.data() } as StudentContact; });
      setContacts(map);
    }, () => setLoading(false));
  }, [enabled]);

  async function saveContact(studentId: string, data: Omit<StudentContact, 'id'>) {
    if (!db) return;
    // Merge-write so editing the three flat fields from StudentForm never wipes
    // imported `guardians`/`extra` (which the form doesn't carry). Only the keys
    // present in `data` are written; anything else on the doc is preserved.
    const clean: Record<string, unknown> = {
      email: data.email || '',
      parentEmail: data.parentEmail || '',
      phone: data.phone || '',
    };
    if (data.guardians !== undefined) clean.guardians = data.guardians;
    if (data.extra !== undefined) clean.extra = data.extra;
    try {
      await setDoc(doc(db, 'contacts', studentId), clean, { merge: true });
    } catch (e) {
      // Surface instead of swallowing (#36) — offer a retry.
      reportWriteError('Contact info failed to save', () => setDoc(doc(db!, 'contacts', studentId), clean, { merge: true }));
      throw e;
    }
  }

  return { contacts, loading, saveContact };
}
