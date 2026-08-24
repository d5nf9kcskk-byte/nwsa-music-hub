import { useState, useEffect } from 'react';
import {
  collection, addDoc, updateDoc, deleteDoc, doc, query, orderBy,
} from 'firebase/firestore';
import { db } from '../firebase';
import { watchCollection } from '../../shared/watchCollection';
import { offerUndo, trackWrite } from '../writeStatus';
import { currentDirectorName, currentDirectorRole } from '../currentDirector';
import type { Personnel } from '../types';
import { usePersonnelGate } from './personnelGate';

/**
 * The paid adult roster (#personnel — Fair Copy adult orgs). Mirrors
 * useStudents, minus the one thing that must not carry over: there is NO
 * public-mirror batching, because no `personnelPublic` projection exists and
 * none may be added casually — a printed-program roster would be a new,
 * separately reviewed projection, never a copy of the student one.
 *
 * Firestore pins every write to an exact key allowlist mirroring the
 * `Personnel` interface; adding a field to the type means adding it to
 * firestore.rules in the SAME change or every save starts failing.
 */
export function usePersonnel(ensembleId?: string) {
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  // Derived, not set synchronously in the effect (react-hooks lint): loading
  // means "a listener will attach and hasn't answered yet" — a blocked gate
  // or unconfigured Firebase never loads, so it is never loading.
  const [settled, setSettled] = useState(false);
  const gate = usePersonnelGate();
  const loading = Boolean(db) && gate !== 'blocked' && !settled;

  useEffect(() => {
    if (!db || gate !== 'open') return;
    const dbRef = db;
    return watchCollection(
      query(collection(dbRef, 'personnel'), orderBy('name')), 'personnel',
      snap => {
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as Personnel));
        setPersonnel(
          ensembleId
            ? all.filter(p => p.ensembleIds?.includes(ensembleId) && p.status !== 'Inactive')
            : all
        );
      },
      () => setSettled(true),
    );
  }, [gate, ensembleId]);

  async function addPersonnel(data: Omit<Personnel, 'id'>): Promise<string | undefined> {
    if (!db) return;
    const dbRef = db;
    const payload = {
      ...data,
      updatedAt: Date.now(),
      updatedBy: currentDirectorName(),
      updatedByRole: currentDirectorRole(),
    };
    const ref = await trackWrite('Personnel', () => addDoc(collection(dbRef, 'personnel'), payload));
    return ref?.id;
  }

  async function updatePersonnel(id: string, data: Partial<Omit<Personnel, 'id'>>) {
    if (!db) return;
    const dbRef = db;
    const payload = {
      ...data,
      updatedAt: Date.now(),
      updatedBy: currentDirectorName(),
      updatedByRole: currentDirectorRole(),
    };
    await trackWrite('Personnel update', () => updateDoc(doc(dbRef, 'personnel', id), payload));
  }

  // Once a contract points at someone, prefer archivePersonnel: deleting the
  // roster doc orphans the contract (rules can't check for referencing
  // contracts, so they allow the delete — see the /personnel rule comment).
  async function deletePersonnel(id: string) {
    if (!db) return;
    const gone = personnel.find(x => x.id === id);
    await deleteDoc(doc(db, 'personnel', id));
    if (gone) {
      const { id: _id, ...data } = gone;
      void _id;
      offerUndo('personnel', id, data, `Deleted ${gone.name} — restore?`);
    }
  }

  /** Off the active roster and sub list, kept for history — contracts point here. */
  async function archivePersonnel(id: string) {
    await updatePersonnel(id, { status: 'Inactive' });
  }

  /** Back onto the active roster. */
  async function restorePersonnel(id: string) {
    await updatePersonnel(id, { status: 'Contracted' });
  }

  return { personnel, loading, addPersonnel, updatePersonnel, deletePersonnel, archivePersonnel, restorePersonnel };
}
