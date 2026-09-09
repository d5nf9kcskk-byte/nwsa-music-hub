/**
 * The Firestore side of the Student Assistant approval gate (#approvals) —
 * proposing a write, listening for what is waiting, and recording a decision.
 * What a proposal MEANS lives in `../pendingActions.ts`, which stays
 * dependency-free.
 *
 * Query and rule must agree (the `useLessons` treatment): a Student Assistant
 * may read only their OWN proposals, so their listener issues the matching
 * `where('byEmail', '==', …)`. Change one and you must change the other, or
 * the listener errors for that role.
 */
import { useState, useEffect } from 'react';
import { collection, addDoc, updateDoc, doc, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { watchCollection } from '../../shared/watchCollection';
import { noteQueued } from '../writeStatus';
import {
  encodeProposalData, proposalsApplyTo, MAX_LABEL,
  type GatedCollection, type PendingAction, type PendingOp, type PendingStatus,
} from '../pendingActions';
import {
  currentDirectorEmail, currentDirectorName,
  currentDirectorIsStaff, currentDirectorRoles, useCurrentDirector,
} from '../currentDirector';
import { isStaffMember, hasDirectorRole } from './useDirectors';

/** Are the signed-in account's writes diverted for approval? Read from the
 *  same external store the write hooks already use for attribution, so a
 *  non-component write path can ask without threading props. */
export function shouldProposeWrites(): boolean {
  return proposalsApplyTo(currentDirectorRoles(), currentDirectorIsStaff());
}

export interface ProposalDraft {
  collection: GatedCollection;
  op: PendingOp;
  docId?: string;
  data?: Record<string, unknown>;
  label: string;
}

/**
 * Queue a write for a director's sign-off. Returns TRUE if it was queued —
 * the calling hook must then return instead of performing the real write.
 * Returns false for anyone whose writes are not gated, so a director's save
 * falls straight through to Firestore as it always has.
 */
export async function proposeWrite(draft: ProposalDraft): Promise<boolean> {
  if (!shouldProposeWrites()) return false;
  // A gated account with no database must NOT fall through to a live write.
  if (!db) return true;
  await addDoc(collection(db, 'pendingActions'), {
    collection: draft.collection,
    op: draft.op,
    ...(draft.docId ? { docId: draft.docId } : {}),
    dataJson: draft.op === 'delete' ? '' : encodeProposalData(draft.data ?? {}),
    label: draft.label.slice(0, MAX_LABEL),
    byEmail: currentDirectorEmail() ?? '',
    byName: currentDirectorName() ?? '',
    submittedAt: Date.now(),
    status: 'pending',
  });
  noteQueued('Sent to your director for approval');
  return true;
}

/** Record the outcome. Staff-only by rules. When `status` is 'approved' the
 *  caller has ALREADY performed the real write with its own credentials —
 *  this only files the receipt. */
export async function recordDecision(
  id: string,
  status: Exclude<PendingStatus, 'pending'>,
  extra?: { note?: string; applied?: boolean; applyError?: string },
): Promise<void> {
  if (!db) return;
  await updateDoc(doc(db, 'pendingActions', id), {
    status,
    decidedAt: Date.now(),
    decidedBy: currentDirectorName() ?? '',
    decidedByEmail: currentDirectorEmail() ?? '',
    ...(extra?.note ? { note: extra.note.slice(0, MAX_LABEL) } : {}),
    ...(extra?.applied ? { appliedAt: Date.now() } : {}),
    ...(extra?.applyError ? { applyError: extra.applyError.slice(0, MAX_LABEL) } : {}),
  });
}

/** The assistant's own take-back, before anyone has acted on it. */
export async function withdrawProposal(id: string): Promise<void> {
  if (!db) return;
  await updateDoc(doc(db, 'pendingActions', id), { status: 'withdrawn', decidedAt: Date.now() });
}

/**
 * Everything waiting (staff), or everything this assistant submitted (them).
 * Anyone else gets an empty list and no listener at all — a Teacher or
 * Classroom Teacher is not on this gate and reading the queue would show them
 * another person's unapproved work.
 */
export function usePendingActions() {
  const me = useCurrentDirector();
  const [actions, setActions] = useState<PendingAction[]>([]);
  const [loading, setLoading] = useState(true);

  const staff = !!me && isStaffMember(me);
  const mine = !!me && !staff && hasDirectorRole(me, 'assistant') ? me.email : undefined;

  useEffect(() => {
    if (!db || (!staff && !mine)) { setActions([]); setLoading(false); return; }
    const col = collection(db, 'pendingActions');
    const q = staff ? col : query(col, where('byEmail', '==', mine));
    return watchCollection(q, 'pendingActions', snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as PendingAction));
      // Newest first; still-waiting always above what has been dealt with.
      list.sort((a, b) =>
        (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1)
        || b.submittedAt - a.submittedAt);
      setActions(list);
      setLoading(false);
    }, () => setLoading(false));
  }, [staff, mine]);

  return { actions, loading };
}
