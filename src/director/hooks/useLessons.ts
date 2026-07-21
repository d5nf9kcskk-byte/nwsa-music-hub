import { useState, useEffect } from 'react';
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, orderBy,
} from 'firebase/firestore';
import { db } from '../firebase';
import { noteLoadError, noteLoadOk } from '../../shared/appStatus';
import { offerUndo, trackWrite } from '../writeStatus';
import { currentDirectorName } from '../currentDirector';
import type { Lesson } from '../types';

/**
 * Private lessons (#roles) — a Teacher's own scheduled 1:1 sessions. Never
 * world-readable (see firestore.rules); Owner/Director can read all of them
 * for coordination, a Teacher only their own (enforced server-side too).
 */
export function useLessons() {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) { setLoading(false); return; }
    const q = query(collection(db, 'lessons'), orderBy('date'));
    return onSnapshot(q, snap => {
      setLessons(snap.docs.map(d => ({ id: d.id, ...d.data() } as Lesson)));
      noteLoadOk('lessons');
      setLoading(false);
    }, () => { noteLoadError('lessons'); setLoading(false); });
  }, []);

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
