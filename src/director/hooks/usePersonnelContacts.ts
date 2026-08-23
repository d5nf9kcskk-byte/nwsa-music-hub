import { useState, useEffect } from 'react';
import { collection, setDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { watchCollection } from '../../shared/watchCollection';
import { reportWriteError } from '../writeStatus';
import type { PersonnelContact } from '../types';
import { usePersonnelGate } from './personnelGate';

/**
 * Private contact + payroll-adjacent details, keyed by personnel id (doc id
 * === personnel id — the students/contacts split). Mirrors useContacts, with
 * the role gate built in rather than passed as a prop: unlike student
 * contacts (readable by any allowlisted role except where the assistant
 * shell opts out), personnelContacts is Owner/Director only in
 * firestore.rules, so the hook itself knows who may subscribe.
 *
 * The Firestore allowlist for this collection is the no-TIN guarantee:
 * there is no key a taxpayer id could ride in on. Never add one — a W-9's
 * whereabouts is `w9Status`; the number itself never enters Firestore.
 */
export function usePersonnelContacts() {
  const [contacts, setContacts] = useState<Record<string, PersonnelContact>>({});
  // Derived, not set synchronously in the effect (react-hooks lint) — see
  // usePersonnel for the reasoning.
  const [settled, setSettled] = useState(false);
  const gate = usePersonnelGate();
  const loading = Boolean(db) && gate !== 'blocked' && !settled;

  useEffect(() => {
    if (!db || gate !== 'open') return;
    return watchCollection(collection(db, 'personnelContacts'), 'personnelContacts', snap => {
      const map: Record<string, PersonnelContact> = {};
      snap.docs.forEach(d => { map[d.id] = { id: d.id, ...d.data() } as PersonnelContact; });
      setContacts(map);
    }, () => setSettled(true));
  }, [gate]);

  async function savePersonnelContact(personnelId: string, data: Omit<PersonnelContact, 'id'>) {
    if (!db) return;
    // Merge-write only the keys the caller actually provided, so a form that
    // carries three fields never wipes `extra` or a field it doesn't show.
    // To clear a field, pass '' explicitly. The key list is the rules
    // allowlist; anything else would be rejected server-side by hasOnly().
    const clean: Record<string, unknown> = {};
    for (const k of ['email', 'phone', 'address', 'emergencyName', 'emergencyPhone', 'unionLocal', 'w9Status'] as const) {
      if (data[k] !== undefined) clean[k] = data[k];
    }
    if (data.extra !== undefined) clean.extra = data.extra;
    try {
      await setDoc(doc(db, 'personnelContacts', personnelId), clean, { merge: true });
    } catch (e) {
      // Surface instead of swallowing (#36) — offer a retry.
      reportWriteError('Contact info failed to save', () => setDoc(doc(db!, 'personnelContacts', personnelId), clean, { merge: true }));
      throw e;
    }
  }

  return { contacts, loading, savePersonnelContact };
}
