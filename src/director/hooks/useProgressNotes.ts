import { useState, useEffect } from 'react';
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc,
  query, where, orderBy,
} from 'firebase/firestore';
import { db } from '../firebase';
import { offerUndo } from '../writeStatus';
import { noteLoadError, noteLoadOk } from '../../shared/appStatus';
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
      noteLoadOk('progressNotes');
      setLoading(false);
    }, () => { noteLoadError('progressNotes'); setLoading(false); });
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
    const gone = notes.find(x => x.id === id);
    await deleteDoc(doc(db, 'progressNotes', id));
    if (gone) {
      const { id: _id, ...data } = gone;
      void _id;
      offerUndo('progressNotes', id, data, 'Deleted note — restore?');
    }
  }

  return { notes, loading, addNote, updateNote, deleteNote };
}
