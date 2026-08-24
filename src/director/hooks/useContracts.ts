import { useState, useEffect } from 'react';
import {
  collection, addDoc, updateDoc, deleteDoc, doc, query,
} from 'firebase/firestore';
import { db } from '../firebase';
import { watchCollection } from '../../shared/watchCollection';
import { offerUndo, trackWrite, reportWriteError } from '../writeStatus';
import { currentDirectorName, currentDirectorRole } from '../currentDirector';
import type { Contract } from '../types';
import { usePersonnelGate } from './personnelGate';

/**
 * Contracts (#personnel) — the most sensitive collection in the app: pay,
 * and the record of what was agreed. Owner/Director only, no public mirror,
 * no unauthenticated path of any kind.
 *
 * firestore.rules enforces the LIFECYCLE server-side, not just the shape:
 *
 *   Draft/Sent            — a working document; edit freely.
 *   Signed/Countersigned  — terms are FROZEN. Only status (forward, or to
 *                           Void), countersign fields, and the internal note
 *                           may change.
 *   Void                  — terminal. Only the note may change.
 *   delete                — Draft only. Everything past Draft was
 *                           communicated and is a record: void it instead.
 *
 * This hook is shaped so it cannot produce a write those rules reject: the
 * free-form updateContract refuses anything past Sent, and the only doors
 * through the frozen states are the narrow transitions below (sign,
 * countersign, void, note). Money is INTEGER CENTS — the rules make a
 * floating-point baseRateCents unwritable (`is int`), and the guard here
 * catches line-item amounts too, which rules can't reach inside a list.
 */

const EDITABLE: Contract['status'][] = ['Draft', 'Sent'];

/** Reject fractional cents before Firestore does (or, for line items, where it can't). */
function wholeCents(data: Partial<Contract>): boolean {
  if (data.baseRateCents !== undefined && !Number.isInteger(data.baseRateCents)) return false;
  return (data.lineItems ?? []).every(li => Number.isInteger(li.amountCents));
}

export function useContracts() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  // Derived, not set synchronously in the effect (react-hooks lint) — see
  // usePersonnel for the reasoning.
  const [settled, setSettled] = useState(false);
  const gate = usePersonnelGate();
  const loading = Boolean(db) && gate !== 'blocked' && !settled;

  useEffect(() => {
    if (!db || gate !== 'open') return;
    const dbRef = db;
    // No server-side orderBy: sorting here keeps a doc with an unexpected
    // missing field visible (orderBy silently drops docs without the field)
    // — for a pay record, visible-but-odd beats silently absent.
    return watchCollection(query(collection(dbRef, 'contracts')), 'contracts', snap => {
      const rows = snap.docs.map(d => ({ id: d.id, ...d.data() } as Contract));
      rows.sort((a, b) =>
        (a.personnelName ?? '').localeCompare(b.personnelName ?? '')
        || (a.createdAt ?? 0) - (b.createdAt ?? 0));
      setContracts(rows);
    }, () => setSettled(true));
  }, [gate]);

  function stamps() {
    return {
      updatedAt: Date.now(),
      updatedBy: currentDirectorName(),
      updatedByRole: currentDirectorRole(),
    };
  }

  async function addContract(
    data: Omit<Contract, 'id' | 'createdAt' | 'updatedAt' | 'updatedBy' | 'updatedByRole'>,
  ): Promise<string | undefined> {
    if (!db) return;
    if (!wholeCents(data)) {
      reportWriteError('Contract not saved — amounts must be whole cents');
      return;
    }
    const dbRef = db;
    const payload = { ...data, createdAt: Date.now(), ...stamps() };
    const ref = await trackWrite('Contract', () => addDoc(collection(dbRef, 'contracts'), payload));
    return ref?.id;
  }

  /**
   * Free-form edit — Draft and Sent only (a typo found after sending is
   * fixed and re-sent; the signature is what freezes). Past that, use the
   * lifecycle transitions below; a broad update would be rejected by rules.
   */
  async function updateContract(
    id: string,
    data: Partial<Omit<Contract, 'id' | 'createdAt' | 'updatedAt' | 'updatedBy' | 'updatedByRole'>>,
  ) {
    if (!db) return;
    const cur = contracts.find(c => c.id === id);
    if (!cur || !EDITABLE.includes(cur.status)) {
      reportWriteError('Contract not saved — terms are frozen once signed (void it instead)');
      return;
    }
    if (!wholeCents(data)) {
      reportWriteError('Contract not saved — amounts must be whole cents');
      return;
    }
    const dbRef = db;
    await trackWrite('Contract update', () => updateDoc(doc(dbRef, 'contracts', id), { ...data, ...stamps() }));
  }

  /**
   * Record the signer's typed-name signature (the SignupResponse pattern).
   * Runs while the contract is still Draft/Sent — signature, signedAt, and
   * the move to Signed land in one update, which is the write that freezes
   * the terms server-side.
   */
  async function signContract(id: string, signature: string) {
    if (!db) return;
    const cur = contracts.find(c => c.id === id);
    if (!cur || !EDITABLE.includes(cur.status)) {
      reportWriteError('Contract is already signed');
      return;
    }
    const dbRef = db;
    await trackWrite('Contract signature', () => updateDoc(doc(dbRef, 'contracts', id), {
      signature, signedAt: Date.now(), status: 'Signed', ...stamps(),
    }));
  }

  /** Countersign for the organization: Signed → Countersigned. */
  async function countersignContract(id: string) {
    if (!db) return;
    const cur = contracts.find(c => c.id === id);
    if (cur?.status !== 'Signed') {
      reportWriteError('Only a signed contract can be countersigned');
      return;
    }
    const dbRef = db;
    await trackWrite('Contract countersign', () => updateDoc(doc(dbRef, 'contracts', id), {
      status: 'Countersigned', countersignedBy: currentDirectorName(), countersignedAt: Date.now(), ...stamps(),
    }));
  }

  /** Void from any state. Terminal — the record stays; there is no un-void. */
  async function voidContract(id: string) {
    if (!db) return;
    const cur = contracts.find(c => c.id === id);
    if (!cur || cur.status === 'Void') return;
    const dbRef = db;
    await trackWrite('Contract void', () => updateDoc(doc(dbRef, 'contracts', id), {
      status: 'Void', ...stamps(),
    }));
  }

  /** The internal note — the one field editable in every state, Void included. */
  async function setContractNotes(id: string, notes: string) {
    if (!db) return;
    const dbRef = db;
    await trackWrite('Contract note', () => updateDoc(doc(dbRef, 'contracts', id), { notes, ...stamps() }));
  }

  /** Draft only — rules deny deleting anything that was ever communicated. */
  async function deleteContract(id: string) {
    if (!db) return;
    const gone = contracts.find(c => c.id === id);
    if (gone?.status !== 'Draft') {
      reportWriteError('Only a draft can be deleted — void it instead');
      return;
    }
    await deleteDoc(doc(db, 'contracts', id));
    const { id: _id, ...data } = gone;
    void _id;
    offerUndo('contracts', id, data, `Deleted draft contract — restore?`);
  }

  return {
    contracts, loading,
    addContract, updateContract,
    signContract, countersignContract, voidContract,
    setContractNotes, deleteContract,
  };
}
