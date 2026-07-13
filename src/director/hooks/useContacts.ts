import { useState, useEffect } from 'react';
import { collection, onSnapshot, setDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { noteLoadError, noteLoadOk } from '../../shared/appStatus';
import { reportWriteError } from '../writeStatus';
import type { StudentContact } from '../types';

/**
 * Auth-only contact details, keyed by student id. Directors read/write here;
 * the public app never touches this collection.
 */
export function useContacts() {
  const [contacts, setContacts] = useState<Record<string, StudentContact>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) { setLoading(false); return; }
    return onSnapshot(collection(db, 'contacts'), snap => {
      const map: Record<string, StudentContact> = {};
      snap.docs.forEach(d => { map[d.id] = { id: d.id, ...d.data() } as StudentContact; });
      setContacts(map);
      setLoading(false);
      noteLoadOk('contacts');
    }, () => { noteLoadError('contacts'); setLoading(false); });
  }, []);

  async function saveContact(studentId: string, data: Omit<StudentContact, 'id'>) {
    if (!db) return;
    const clean = {
      email: data.email || '',
      parentEmail: data.parentEmail || '',
      phone: data.phone || '',
    };
    if (!clean.email && !clean.parentEmail && !clean.phone) {
      // Nothing to store — remove any existing contact doc.
      await deleteDoc(doc(db, 'contacts', studentId)).catch(() => {});
      return;
    }
    try {
      await setDoc(doc(db, 'contacts', studentId), clean);
    } catch (e) {
      // Surface instead of swallowing (#36) — offer a retry.
      reportWriteError('Contact info failed to save', () => setDoc(doc(db!, 'contacts', studentId), clean));
      throw e;
    }
  }

  return { contacts, loading, saveContact };
}
