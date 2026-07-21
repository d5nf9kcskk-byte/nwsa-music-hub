import { useState, useEffect } from 'react';
import {
  collection, onSnapshot, doc, setDoc, updateDoc, deleteDoc, query, orderBy,
} from 'firebase/firestore';
import { db } from '../firebase';
import { noteLoadError, noteLoadOk } from '../../shared/appStatus';
import { trackWrite } from '../writeStatus';

/**
 * Director allowlist, stored as data (#deploy-hang fix). Each doc's id is the
 * director's lowercased Google sign-in email; presence grants access. Adding or
 * removing a director is a plain Firestore write — no rules redeploy — which is
 * what ends the old "added a director, their saves silently fail until someone
 * hand-deploys the rules" trap. Enforcement lives in firestore.rules (only the
 * Owner may add/remove/change roles here); this hook powers the Directors screen.
 *
 * Three access levels (#roles):
 *   • owner    — the one account that can manage this list (add/remove
 *                directors, change roles). Assigned out-of-band, never through
 *                the app, so there's never more than one by accident.
 *   • director — full edit access to everything except this list.
 *   • teacher  — scoped to scheduling private lessons for their own assigned
 *                students (see Lesson / useLessons). Cannot touch rosters,
 *                schedule, repertoire, documents, announcements, or this list.
 * A doc with no `role` (every director created before this feature) is
 * treated as 'director' everywhere in the app — see `directorRole()`.
 */
export type DirectorRole = 'owner' | 'director' | 'teacher';

export interface Director {
  email: string;    // doc id
  name?: string;    // display name — auto-captured from Google profile on
                     // first sign-in (see currentDirector.ts), editable after
  role?: DirectorRole;
  addedBy?: string; // email of the director who added them
  addedAt?: number; // epoch ms
  /** Teacher-only: instrument(s) they give private lessons in, e.g. ["Violin"]. */
  instruments?: string[];
  /** Teacher-only: students they give private lessons to. An Owner/Director
   *  sets this when adding the teacher; the teacher may adjust it themselves
   *  afterward (firestore.rules allows a director to self-edit this field). */
  assignedStudentIds?: string[];
}

/** A doc with no `role` predates this feature and gets full director access. */
export function directorRole(d: Pick<Director, 'role'> | undefined | null): DirectorRole {
  return d?.role ?? 'director';
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

  /** Add a new director (Owner only — enforced in firestore.rules). Role
   *  defaults to 'director'; 'owner' is never assignable from the app. */
  async function addDirector(email: string, addedBy?: string, extra?: {
    name?: string; role?: Exclude<DirectorRole, 'owner'>; instruments?: string[]; assignedStudentIds?: string[];
  }) {
    if (!db) return;
    const dbRef = db;
    const id = directorEmailId(email);
    await trackWrite('Director', () =>
      setDoc(doc(dbRef, 'directors', id), {
        email: id,
        role: extra?.role ?? 'director',
        ...(extra?.name ? { name: extra.name } : {}),
        ...(extra?.instruments ? { instruments: extra.instruments } : {}),
        ...(extra?.assignedStudentIds ? { assignedStudentIds: extra.assignedStudentIds } : {}),
        addedBy: addedBy ?? null,
        addedAt: Date.now(),
      }));
  }

  /**
   * Edit an existing director's name / role / instruments / assigned
   * students. Owner can change anything about anyone; firestore.rules also
   * lets a signed-in director update ONLY `name` or `assignedStudentIds` on
   * their OWN doc (self-service name capture and "students assigned to me").
   */
  async function updateDirector(email: string, patch: Partial<Omit<Director, 'email'>>) {
    if (!db) return;
    const dbRef = db;
    const id = directorEmailId(email);
    await trackWrite('Director update', () => updateDoc(doc(dbRef, 'directors', id), patch));
  }

  async function removeDirector(email: string) {
    if (!db) return;
    const dbRef = db;
    await trackWrite('Director removal', () =>
      deleteDoc(doc(dbRef, 'directors', directorEmailId(email))));
  }

  return { directors, loading, addDirector, updateDirector, removeDirector };
}

/**
 * A single director's own doc, live. Unlike `useDirectors()` (which lists
 * the whole collection — Owner-only under firestore.rules), this only ever
 * `get`s one doc, which any signed-in user may do for their OWN email — so
 * a Teacher can read/edit their own `assignedStudentIds` without needing
 * list access to everyone else's.
 */
export function useMyDirector(email: string | null | undefined) {
  const [director, setDirector] = useState<Director | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db || !email) { setLoading(false); return; }
    const id = directorEmailId(email);
    return onSnapshot(doc(db, 'directors', id), snap => {
      setDirector(snap.exists() ? ({ email: id, ...snap.data() } as Director) : null);
      setLoading(false);
    }, () => setLoading(false));
  }, [email]);

  return { director, loading };
}
