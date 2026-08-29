import { useState, useEffect } from 'react';
import {
  collection, onSnapshot, writeBatch, doc, query,
} from 'firebase/firestore';
import { db } from '../firebase';
import { noteLoadError, noteLoadOk } from '../../shared/appStatus';
import { offerUndo } from '../writeStatus';
import { publicOverrideFields } from '../publicMirror';
import type { RosterOverride } from '../types';

/** Real-time listener for all temporary roster moves (subs / pulls). */
export function useRosterOverrides() {
  const [overrides, setOverrides] = useState<RosterOverride[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) { setLoading(false); return; }
    const q = query(collection(db, 'rosterOverrides'));
    return onSnapshot(q, snap => {
      setOverrides(snap.docs.map(d => ({ id: d.id, ...d.data() } as RosterOverride)));
      noteLoadOk('rosterOverrides');
      setLoading(false);
    }, () => { noteLoadError('rosterOverrides'); setLoading(false); });
  }, []);

  // Writes batch the rosterOverridesPublic mirror with the source doc
  // (#privacy): the public site reads only the mirror, which carries every
  // field EXCEPT the free-text reason — see src/director/publicMirror.ts.

  async function addOverride(data: Omit<RosterOverride, 'id'>): Promise<string | undefined> {
    if (!db) return;
    const ref = doc(collection(db, 'rosterOverrides'));
    const batch = writeBatch(db);
    batch.set(ref, data);
    batch.set(doc(db, 'rosterOverridesPublic', ref.id), publicOverrideFields(data));
    await batch.commit();
    return ref.id;
  }

  async function deleteOverride(id: string) {
    if (!db) return;
    // Undo (#38): capture the doc, delete, offer 10s restore with the same id.
    const gone = overrides.find(x => x.id === id);
    const batch = writeBatch(db);
    batch.delete(doc(db, 'rosterOverrides', id));
    batch.delete(doc(db, 'rosterOverridesPublic', id));
    await batch.commit();
    if (gone) {
      const { id: _id, ...data } = gone;
      void _id;
      offerUndo('rosterOverrides', id, data, `Removed schedule change — restore?`, [
        { collection: 'rosterOverridesPublic', docId: id, data: publicOverrideFields(data) },
      ]);
    }
  }

  /** Delete several overrides in ONE batch — a standing rotation is 1–n docs
   *  that must go together (restoring half would strand the student in both
   *  halves of a shared block). Pass `undoLabel` to offer a single undo that
   *  restores every doc + mirror; omit it when replacing (edit = delete +
   *  re-add, where an undo would duplicate the rotation). */
  async function deleteOverrides(ids: string[], undoLabel?: string) {
    if (!db || ids.length === 0) return;
    const gone = overrides.filter(o => ids.includes(o.id));
    const batch = writeBatch(db);
    for (const id of ids) {
      batch.delete(doc(db, 'rosterOverrides', id));
      batch.delete(doc(db, 'rosterOverridesPublic', id));
    }
    await batch.commit();
    if (undoLabel && gone.length) {
      const [{ id: firstId, ...firstData }, ...rest] = gone;
      offerUndo('rosterOverrides', firstId, firstData, undoLabel, [
        { collection: 'rosterOverridesPublic', docId: firstId, data: publicOverrideFields(firstData) },
        ...rest.flatMap(({ id, ...data }) => [
          { collection: 'rosterOverrides', docId: id, data },
          { collection: 'rosterOverridesPublic', docId: id, data: publicOverrideFields(data) },
        ]),
      ]);
    }
  }

  return { overrides, loading, addOverride, deleteOverride, deleteOverrides };
}
