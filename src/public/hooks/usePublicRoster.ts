import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../../director/firebase';
import { noteLoadError, noteLoadOk } from '../../shared/appStatus';
import type { Student, RosterOverride } from '../../director/types';
import { FIXTURES_ON, FIXTURE_STUDENTS } from '../../director/hooks/fixtures';

/**
 * Public-site roster hooks (#privacy). The full `students` and
 * `rosterOverrides` collections are staff-only; the public surface reads the
 * `studentsPublic` / `rosterOverridesPublic` projections instead (no grade,
 * no pronunciation, no free-text override reasons — see
 * src/director/publicMirror.ts for the field contract). The returned shapes
 * are Student / RosterOverride with those optional fields simply absent, so
 * public components consume them unchanged.
 */

export function useStudentsPublic(ensembleId?: string) {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) { if (FIXTURES_ON) setStudents(FIXTURE_STUDENTS); setLoading(false); return; }
    const q = query(collection(db, 'studentsPublic'), orderBy('name'));
    return onSnapshot(q, snap => {
      // Same legacy-doc defaulting as useStudents: no status ⇒ Active.
      const all = snap.docs.map(d => {
        const data = d.data();
        return { id: d.id, ...data, status: data.status ?? 'Active' } as Student;
      });
      setStudents(
        ensembleId
          ? all.filter(s => s.ensembleIds?.includes(ensembleId) && s.status === 'Active')
          : all
      );
      noteLoadOk('studentsPublic');
      setLoading(false);
    }, () => { noteLoadError('studentsPublic'); setLoading(false); });
  }, [ensembleId]);

  return { students, loading };
}

export function usePublicOverrides() {
  const [overrides, setOverrides] = useState<RosterOverride[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) { setLoading(false); return; }
    const q = query(collection(db, 'rosterOverridesPublic'));
    return onSnapshot(q, snap => {
      setOverrides(snap.docs.map(d => ({ id: d.id, ...d.data() } as RosterOverride)));
      noteLoadOk('rosterOverridesPublic');
      setLoading(false);
    }, () => { noteLoadError('rosterOverridesPublic'); setLoading(false); });
  }, []);

  return { overrides, loading };
}
