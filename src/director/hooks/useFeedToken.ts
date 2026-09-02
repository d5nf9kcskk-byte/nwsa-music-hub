import { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useCurrentDirector } from '../currentDirector';

/**
 * The unguessable token in one person's private calendar URL.
 *
 * Shared by the two per-person Cloud Function feeds — `appointments__<email>`
 * (#signup-appointments) and `staff__<email>` (#my-calendar) — because they
 * are the same object with two names: one doc under `feedSecrets`, holding one
 * `token`, scoped by firestore.rules to the signed-in person's own email.
 * Keeping one implementation is the point; the copy that existed first drifted
 * the moment a second one was made.
 *
 * Same posture as the private lessons feed: a calendar app cannot sign in, so
 * the URL itself is the access control. The matching Cloud Function reads this
 * exact doc and refuses any request whose token does not match it. Until a
 * person creates one, every request for their feed is refused; deleting it
 * revokes access on the very next fetch, because nothing is cached or
 * pre-built.
 *
 * `prefix` is the doc-id prefix, and it must stay in step with BOTH the
 * function's `tokenDocId()`/`staffTokenDocId()` and the clause in
 * firestore.rules that pins the same string.
 */
export type FeedTokenKind = 'appointments' | 'staff';

const REF = (prefix: FeedTokenKind, email: string | undefined) =>
  (db && email ? doc(db, 'feedSecrets', `${prefix}__${email}`) : null);

function newToken(): string {
  const bytes = new Uint8Array(16); // 128 bits
  crypto.getRandomValues(bytes);
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function useFeedToken(prefix: FeedTokenKind) {
  const me = useCurrentDirector();
  const email = me?.email;
  // The email the state BELONGS to rides along with it, so switching accounts
  // reads as "still loading" without a synchronous setState in the effect —
  // which would otherwise show one person the other's token for a frame.
  const [state, setState] = useState<{ email?: string; token: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const ref = REF(prefix, email);
    if (!ref) return;
    return onSnapshot(
      ref,
      snap => {
        const value = snap.exists() ? (snap.data().token as string | undefined) : undefined;
        setState({ email, token: value ?? null });
      },
      // A read failure (rules, offline) is "no link yet" rather than a
      // permanent spinner — the panel simply offers to create one.
      () => setState({ email, token: null }),
    );
  }, [prefix, email]);

  // No Firestore, or nobody signed in: settled, with nothing to offer.
  const settled = !db || !email ? { email, token: null } : (state?.email === email ? state : null);
  const token = settled?.token ?? null;

  /** Create the link, or rotate it. Rotation IS instant revocation: the
   *  endpoint compares against this doc on every request. */
  async function issue(): Promise<void> {
    const ref = REF(prefix, email);
    if (!ref) return;
    setBusy(true);
    setError('');
    try {
      await setDoc(ref, { token: newToken(), updatedAt: Date.now() });
    } catch (e) {
      // Rules deploy in their own workflow, so there is a window where this
      // write is refused. Surfacing it beats a button that silently does
      // nothing and a link that never resolves.
      setError(e instanceof Error ? e.message : 'Could not save the link — try again.');
    } finally {
      setBusy(false);
    }
  }

  /** Turn the calendar off entirely. Distinct from resetting: there is no new
   *  link to re-subscribe with, and the next fetch of the old one is refused. */
  async function revoke(): Promise<void> {
    const ref = REF(prefix, email);
    if (!ref) return;
    setBusy(true);
    setError('');
    try {
      await deleteDoc(ref);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not turn the link off — try again.');
    } finally {
      setBusy(false);
    }
  }

  return { token, email, loading: settled === null, busy, error, issue, revoke };
}
