import { useState, useEffect } from 'react';
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc,
  query, orderBy,
} from 'firebase/firestore';
import { db } from '../firebase';
import { noteLoadError, noteLoadOk } from '../../shared/appStatus';
import { offerUndo, trackWrite } from '../writeStatus';
import type { Student } from '../types';
import { FIXTURES_ON, FIXTURE_STUDENTS } from './fixtures';

export function useStudents(ensembleId?: string) {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) { if (FIXTURES_ON) setStudents(FIXTURE_STUDENTS); setLoading(false); return; }
    const q = query(collection(db, 'students'), orderBy('name'));
    return onSnapshot(q, snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as Student));
      setStudents(
        ensembleId
          ? all.filter(s => s.ensembleIds?.includes(ensembleId) && s.status === 'Active')
          : all
      );
      noteLoadOk('students');
      setLoading(false);
    }, () => { noteLoadError('students'); setLoading(false); });
  }, [ensembleId]);

  async function addStudent(data: Omit<Student, 'id'>): Promise<string | undefined> {
    if (!db) return;
    const dbRef = db;
    const ref = await trackWrite('Student', () => addDoc(collection(dbRef, 'students'), data));
    return ref?.id;
  }

  async function updateStudent(id: string, data: Partial<Omit<Student, 'id'>>) {
    if (!db) return;
    const dbRef = db;
    await trackWrite('Student update', () => updateDoc(doc(dbRef, 'students', id), data));
  }

  async function deleteStudent(id: string) {
    if (!db) return;
    // Undo (#38): the one previously-unrecoverable tap in the roster.
    const gone = students.find(x => x.id === id);
    await deleteDoc(doc(db, 'students', id));
    if (gone) {
      const { id: _id, ...data } = gone;
      void _id;
      offerUndo('students', id, data, `Deleted ${gone.name} — restore?`);
    }
  }

  return { students, loading, addStudent, updateStudent, deleteStudent };
}
