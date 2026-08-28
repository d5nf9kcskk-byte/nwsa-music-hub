import { useState, useEffect } from 'react';
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, orderBy, where,
} from 'firebase/firestore';
import { db } from '../firebase';
import { noteLoadError, noteLoadOk } from '../../shared/appStatus';
import { offerUndo, trackWrite } from '../writeStatus';
import { currentDirectorName, useCurrentDirector, currentDirectorHasRole, currentDirectorIsStaff } from '../currentDirector';
import type { Lesson } from '../types';

/**
 * Private lessons (#roles, #applied) — an Applied Teacher's own scheduled 1:1
 * sessions, including the grade they gave each one. Never world-readable
 * (see firestore.rules); Owner/Director can read all of them
 * for coordination, an Applied Teacher only their own (enforced server-side
 * too, which is why the grade lives on this doc and not in its own
 * collection).
 */
export function useLessons() {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const me = useCurrentDirector();
  // An Applied Teacher may only READ their own lessons (audit rec #5) — so
  // their listener has to ASK for only their own, or Firestore rejects the whole
  // query. Deliberately no orderBy alongside the filter: an equality query
  // plus a sort on another field needs a composite index, and a teacher's
  // lesson list is small enough to sort here.
  // Applied teachers who are NOT also directors get a scoped query only.
  // Director+teacher combos see every lesson (Dean overview) on the Lessons
  // tab and their own on My Lessons.
  const mine = me && currentDirectorHasRole('teacher') && !currentDirectorIsStaff() ? me.email : null;

  useEffect(() => {
    if (!db) { setLoading(false); return; }
    // Wait for the signed-in identity to resolve before subscribing, so a
    // teacher never briefly opens the unscoped query and trips the rules.
    if (!me) return;
    const q = mine
      ? query(collection(db, 'lessons'), where('teacherEmail', '==', mine))
      : query(collection(db, 'lessons'), orderBy('date'));
    return onSnapshot(q, snap => {
      const rows = snap.docs.map(d => ({ id: d.id, ...d.data() } as Lesson));
      if (mine) rows.sort((a, b) => a.date.localeCompare(b.date));
      setLessons(rows);
      noteLoadOk('lessons');
      setLoading(false);
    }, () => { noteLoadError('lessons'); setLoading(false); });
  }, [me, mine]);

  async function addLesson(data: Omit<Lesson, 'id' | 'createdAt' | 'updatedAt' | 'updatedBy'>): Promise<string | undefined> {
    if (!db) return;
    const dbRef = db;
    const payload = { ...data, createdAt: Date.now(), updatedAt: Date.now(), updatedBy: currentDirectorName() };
    const ref = await trackWrite('Lesson', () => addDoc(collection(dbRef, 'lessons'), payload));
    return ref?.id;
  }

  async function updateLesson(id: string, data: Partial<Omit<Lesson, 'id'>>) {
    if (!db) return;
    const dbRef = db;
    const payload = { ...data, updatedAt: Date.now(), updatedBy: currentDirectorName() };
    await trackWrite('Lesson update', () => updateDoc(doc(dbRef, 'lessons', id), payload));
  }

  async function deleteLesson(id: string) {
    if (!db) return;
    const gone = lessons.find(x => x.id === id);
    await deleteDoc(doc(db, 'lessons', id));
    if (gone) {
      const { id: _id, ...data } = gone;
      offerUndo('lessons', id, data, `Deleted lesson — restore?`);
    }
  }

  return { lessons, loading, addLesson, updateLesson, deleteLesson };
}
