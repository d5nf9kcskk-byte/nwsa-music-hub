import { useState, useEffect } from 'react';
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc,
  query, orderBy,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { Student } from '../types';

export function useStudents(ensembleId?: string) {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) { setLoading(false); return; }
    const q = query(collection(db, 'students'), orderBy('name'));
    return onSnapshot(q, snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as Student));
      setStudents(
        ensembleId
          ? all.filter(s => s.ensembleIds?.includes(ensembleId) && s.status === 'Active')
          : all
      );
      setLoading(false);
    }, () => setLoading(false));
  }, [ensembleId]);

  async function addStudent(data: Omit<Student, 'id'>): Promise<string | undefined> {
    if (!db) return;
    const ref = await addDoc(collection(db, 'students'), data);
    return ref.id;
  }

  async function updateStudent(id: string, data: Partial<Omit<Student, 'id'>>) {
    if (!db) return;
    await updateDoc(doc(db, 'students', id), data);
  }

  async function deleteStudent(id: string) {
    if (!db) return;
    await deleteDoc(doc(db, 'students', id));
  }

  return { students, loading, addStudent, updateStudent, deleteStudent };
}
