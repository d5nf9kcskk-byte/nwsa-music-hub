import { useState, useEffect } from 'react';
import {
  collection, onSnapshot, doc, setDoc, deleteDoc, query, orderBy,
} from 'firebase/firestore';
import { db } from '../firebase';
import { noteLoadError, noteLoadOk } from '../../shared/appStatus';
import { trackWrite } from '../writeStatus';

/**
 * Director allowlist, stored as data (#deploy-hang fix). Each doc's id is the
 * director's lowercased Google sign-in email; presence grants access. Adding or
 * removing a director is a plain Firestore write — no rules redeploy — which is
 * what ends the old "added a director, their saves silently fail until someone
 * hand-deploys the rules" trap. Enforcement lives in firestore.rules (only an
 * existing director may write here); this hook powers the Directors screen.
 */
export interface Director {
  email: string;    // doc id
  addedBy?: string; // email of the director who added them
  addedAt?: number; // epoch ms
}

/** Normalise an email to the form used as the Firestore doc id. */
export function directorEmailId(email: string): string {
  return email.trim().toLowerCase();
}

export function useDirectors() {
  const [directors, setDirectors] = useState<Director[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) { setLoading(false); return; }
    const q = query(collection(db, 'directors'), orderBy('email'));
    return onSnapshot(q, snap => {
      setDirectors(snap.docs.map(d => ({ email: d.id, ...d.data() } as Director)));
      noteLoadOk('directors');
      setLoading(false);
    }, () => { noteLoadError('directors'); setLoading(false); });
  }, []);

  async function addDirector(email: string, addedBy?: string) {
    if (!db) return;
    const dbRef = db;
    const id = directorEmailId(email);
    await trackWrite('Director', () =>
      setDoc(doc(dbRef, 'directors', id), {
        email: id,
        addedBy: addedBy ?? null,
        addedAt: Date.now(),
      }));
  }

  async function removeDirector(email: string) {
    if (!db) return;
    const dbRef = db;
    await trackWrite('Director removal', () =>
      deleteDoc(doc(dbRef, 'directors', directorEmailId(email))));
  }

  return { directors, loading, addDirector, removeDirector };
}
