import { useState, useEffect } from 'react';
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc,
  query, where, orderBy,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { ProgressNote } from '../types';

export function useProgressNotes(studentId?: string) {
  const [notes, setNotes] = useState<ProgressNote[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) { setLoading(false); return; }
    const q = studentId
      ? query(collection(db, 'progressNotes'), where('studentId', '==', studentId), orderBy('date', 'desc'))
      : query(collection(db, 'progressNotes'), orderBy('date', 'desc'));
    return onSnapshot(q, snap => {
      setNotes(snap.docs.map(d => ({ id: d.id, ...d.data() } as ProgressNote)));
      setLoading(false);
    }, () => setLoading(false));
  }, [studentId]);

  async function addNote(data: Omit<ProgressNote, 'id'>) {
    if (!db) return;
    await addDoc(collection(db, 'progressNotes'), data);
  }

  async function updateNote(id: string, data: Partial<Omit<ProgressNote, 'id'>>) {
    if (!db) return;
    await updateDoc(doc(db, 'progressNotes', id), data);
  }

  async function deleteNote(id: string) {
    if (!db) return;
    await deleteDoc(doc(db, 'progressNotes', id));
  }

  return { notes, loading, addNote, updateNote, deleteNote };
}
