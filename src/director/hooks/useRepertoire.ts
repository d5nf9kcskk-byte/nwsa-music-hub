import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, deleteField, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { noteLoadError, noteLoadOk } from '../../shared/appStatus';
import { offerUndo } from '../writeStatus';
import { currentDirectorName } from '../currentDirector';
import type { RepertoirePiece } from '../types';
import { FIXTURES_ON, FIXTURE_PIECES } from './fixtures';

/**
 * Real-time listener for repertoire pieces. Sorted client-side by order then
 * title so the director can arrange a program and missing-order docs still sort.
 */
export function useRepertoire() {
  const [pieces, setPieces] = useState<RepertoirePiece[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) { if (FIXTURES_ON) setPieces(FIXTURE_PIECES); setLoading(false); return; }
    return onSnapshot(collection(db, 'repertoire'), snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as RepertoirePiece));
      list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.title.localeCompare(b.title));
      setPieces(list);
      noteLoadOk('repertoire');
      setLoading(false);
    }, () => { noteLoadError('repertoire'); setLoading(false); });
  }, []);

  async function addPiece(data: Omit<RepertoirePiece, 'id'>): Promise<string | undefined> {
    if (!db) return;
    const ref = await addDoc(collection(db, 'repertoire'), data);
    return ref.id;
  }

  async function updatePiece(id: string, data: Partial<Omit<RepertoirePiece, 'id'>>) {
    if (!db) return;
    // The form clears an optional field by setting it to `undefined`, but the
    // app initializes Firestore with ignoreUndefinedProperties, which silently
    // DROPS those keys from the patch — the stored value survived every
    // "clear" (this is what kept a piece glued to a concert after unchecking
    // its last "Programmed for" box). Explicit undefined now means DELETE.
    const stamped: Record<string, unknown> = { ...data, updatedAt: Date.now(), updatedBy: currentDirectorName() };
    const payload = Object.fromEntries(
      Object.entries(stamped).map(([k, v]) => [k, v === undefined ? deleteField() : v]),
    );
    await updateDoc(doc(db, 'repertoire', id), payload);
  }

  async function deletePiece(id: string) {
    if (!db) return;
    // Undo (#38): capture the doc, delete, offer 10s restore with the same id.
    const gone = pieces.find(x => x.id === id);
    await deleteDoc(doc(db, 'repertoire', id));
    if (gone) {
      const { id: _id, ...data } = gone;
      offerUndo('repertoire', id, data, `Deleted \"${gone.title}\" — restore?`);
    }
  }

  return { pieces, loading, addPiece, updatePiece, deletePiece };
}
