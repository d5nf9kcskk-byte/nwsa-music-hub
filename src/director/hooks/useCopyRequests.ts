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

  /** "Can't do" (#requests). The note is emailed when the student left an
   *  address (copyDeclineMail). */
  async function decline(id: string, note: string) {
    if (!db) return;
    await updateDoc(doc(db, 'copyRequests', id), {
      status: 'declined', decisionNote: note.trim().slice(0, 1000),
      doneAt: Date.now(), doneBy: currentDirectorName() ?? '',
    });
  }

  async function reopen(id: string) {
    if (!db) return;
    await updateDoc(doc(db, 'copyRequests', id), {
      status: 'new', doneAt: deleteField(), doneBy: deleteField(), decisionNote: deleteField(),
    });
  }

  async function remove(id: string) {
    if (!db) return;
    await deleteDoc(doc(db, 'copyRequests', id));
  }

  return { requests, markDone, decline, reopen, remove };
}

/**
 * "Is this request mine" for the signed-in director, built once so the nav
 * badge, the Today line and the Requests screen can never count different
 * things (#requests). Takes the groups a request is FOR: one for a copy, the
 * named ones for an absence. A request naming no group at all (an absence
 * from an older writer) is everyone's. A group counts as staffed when anyone
 * is on its synced `staff` list or it names a conductor.
 */
export function requestMineFilter(
  me: DirectorAssignmentFields | null,
  ensembles: Pick<Ensemble, 'id' | 'name' | 'staff' | 'conductorName'>[],
): (ensembleIds: readonly string[] | undefined) => boolean {
  const mine = resolveAssignedEnsembleIds(me, ensembles);
  const byId = new Map(ensembles.map(e => [e.id, e]));
  const staffed = (id: string) => {
    const e = byId.get(id);
    return !!e && (!!e.staff?.length || !!e.conductorName?.trim());
  };
  return ids => !ids?.length || ids.some(id => copyRequestIsMine({ ensembleId: id }, mine, staffed));
}
