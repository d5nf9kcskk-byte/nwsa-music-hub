import { useState, useEffect } from 'react';
import { collection, addDoc, updateDoc, deleteDoc, doc, query } from 'firebase/firestore';
import { db } from '../firebase';
import { watchCollection } from '../../shared/watchCollection';
import { offerUndo, trackWrite, reportWriteError } from '../writeStatus';
import { currentDirectorName, currentDirectorRole } from '../currentDirector';
import type { Payment } from '../types';
import { usePersonnelGate } from './personnelGate';
import { FIXTURES_ON } from './fixtures';
import { FIXTURE_PAYMENTS } from './fixturesAdult';

/**
 * Money paid against contracts (#personnel). Owner/Director only, the same
 * gate as every sibling; see the /payments rule for why this is its own
 * collection and not fields on the (frozen-once-signed) contract. Whole
 * cents only: the rule makes a fractional amount unwritable, and the guard
 * here says so before Firestore does.
 */
export function usePayments() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [settled, setSettled] = useState(false);
  const gate = usePersonnelGate();
  const loading = Boolean(db) && gate !== 'blocked' && !settled;

  useEffect(() => {
    if (!db || gate !== 'open') return;
    return watchCollection(query(collection(db, 'payments')), 'payments', snap => {
      const rows = snap.docs.map(d => ({ id: d.id, ...d.data() } as Payment));
      rows.sort((a, b) => a.paidOn.localeCompare(b.paidOn));
      setPayments(rows);
    }, () => setSettled(true));
  }, [gate]);

  const stamps = () => ({ updatedAt: Date.now(), updatedBy: currentDirectorName(), updatedByRole: currentDirectorRole() });

  async function addPayment(data: Omit<Payment, 'id' | 'updatedAt' | 'updatedBy' | 'updatedByRole'>) {
    if (!db) return;
    if (!Number.isInteger(data.amountCents) || data.amountCents === 0) {
      reportWriteError('Payment not saved — the amount must be whole cents');
      return;
    }
    const dbRef = db;
    // Optional strings are left off when blank: the rule wants a string or nothing.
    const clean = { ...data, ...stamps() };
    if (!clean.reference) delete clean.reference;
    if (!clean.note) delete clean.note;
    await trackWrite('Payment', () => addDoc(collection(dbRef, 'payments'), clean));
  }

  async function updatePayment(id: string, data: Partial<Omit<Payment, 'id'>>) {
    if (!db) return;
    const dbRef = db;
    await trackWrite('Payment update', () => updateDoc(doc(dbRef, 'payments', id), { ...data, ...stamps() }));
  }

  /** Takes a mistaken "Mark paid" back, with an undo. */
  async function deletePayment(id: string) {
    if (!db) return;
    const gone = payments.find(p => p.id === id);
    await deleteDoc(doc(db, 'payments', id));
    if (gone) {
      const { id: _id, ...data } = gone;
      void _id;
      offerUndo('payments', id, data, 'Deleted a payment — restore?');
    }
  }

  const fixtures = !db && FIXTURES_ON && gate === 'open';
  return { payments: fixtures ? FIXTURE_PAYMENTS : payments, loading, addPayment, updatePayment, deletePayment };
}
