import { useState, useEffect } from 'react';
import { collection, onSnapshot, updateDoc, deleteDoc, deleteField, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { currentDirectorName } from '../currentDirector';
import { copyRequestIsMine, type CopyRequest } from '../../shared/copyRequest';
import { resolveAssignedEnsembleIds, type DirectorAssignmentFields } from '../directorAssignments';
import type { Ensemble } from '../types';

/** Director-side view of student music copy requests (#copy-requests).
 *  `enabled: false` skips the listener: the collection is staff-only in the
 *  rules, so a Teacher or Assistant shell would only collect a denial. */
export function useCopyRequests(enabled = true) {
  const [requests, setRequests] = useState<CopyRequest[]>([]);

  useEffect(() => {
    if (!db || !enabled) return;
    return onSnapshot(collection(db, 'copyRequests'), snap => {
      setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() } as CopyRequest)));
    }, () => {});
  }, [enabled]);

  async function markDone(id: string) {
    if (!db) return;
    await updateDoc(doc(db, 'copyRequests', id), {
      status: 'done', doneAt: Date.now(), doneBy: currentDirectorName() ?? '',
    });
  }

  async function reopen(id: string) {
    if (!db) return;
    await updateDoc(doc(db, 'copyRequests', id), { status: 'new', doneAt: deleteField(), doneBy: deleteField() });
  }

  async function remove(id: string) {
    if (!db) return;
    await deleteDoc(doc(db, 'copyRequests', id));
  }

  return { requests, markDone, reopen, remove };
}

/**
 * "Is this request mine" for the signed-in director, built once so the nav
 * badge and the screen can never count different things. A group counts as
 * staffed when anyone is on its synced `staff` list or it names a conductor.
 */
export function copyRequestMineFilter(
  me: DirectorAssignmentFields | null,
  ensembles: Pick<Ensemble, 'id' | 'name' | 'staff' | 'conductorName'>[],
): (r: Pick<CopyRequest, 'ensembleId'>) => boolean {
  const mine = resolveAssignedEnsembleIds(me, ensembles);
  const byId = new Map(ensembles.map(e => [e.id, e]));
  const staffed = (id: string) => {
    const e = byId.get(id);
    return !!e && (!!e.staff?.length || !!e.conductorName?.trim());
  };
  return r => copyRequestIsMine(r, mine, staffed);
}
