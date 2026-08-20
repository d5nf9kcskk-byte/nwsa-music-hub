/**
 * Per-device sign-up receipts (#signups). No account exists on the public
 * side, so "you already signed up" is remembered locally, the same way
 * identity.ts remembers which student this phone belongs to.
 *
 * This is a convenience, never a gate: the record of truth is the response
 * doc in Firestore, and a student on a new phone can always sign up again
 * (the director's screen keeps the newest response per student).
 */

export interface SignupReceipt {
  studentId: string;
  studentName: string;
  /** When it was sent, stamped here so callers never have to. */
  at: number;
  /** Everything the form asked for was filled in and signed. */
  complete: boolean;
}

const KEY = 'nwsa.signups.v1';

type Store = Record<string, SignupReceipt>;

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const v: unknown = JSON.parse(raw);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Store) : {};
  } catch {
    return {};
  }
}

export function getReceipt(formId: string): SignupReceipt | null {
  return read()[formId] ?? null;
}

export function saveReceipt(formId: string, receipt: Omit<SignupReceipt, 'at'>) {
  try {
    const full: SignupReceipt = { ...receipt, at: Date.now() };
    localStorage.setItem(KEY, JSON.stringify({ ...read(), [formId]: full }));
  } catch { /* private mode — the response is already saved server-side */ }
}
