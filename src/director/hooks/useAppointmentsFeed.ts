import { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useCurrentDirector } from '../currentDirector';

/**
 * The unguessable token in one director's appointments calendar URL
 * (#signup-appointments).
 *
 * Same posture as the private lessons feed: a calendar app cannot sign in, so
 * the URL itself is the access control. Per-DIRECTOR here rather than one
 * shared token, because this calendar carries what students wrote on a form —
 * free text and contact details — and no director needs to hold another's.
 * firestore.rules scopes `feedSecrets/appointments__<email>` to that person
 * (and the Owner, so a leaked link can always be revoked).
 *
 * The Cloud Function at `functions/src/appointmentsFeed.ts` reads the same doc
 * and refuses any request whose token does not match it. Until a director
 * creates one, every request for their feed is refused; deleting it revokes
 * access on the very next fetch, because nothing is cached or pre-built.
 */
const REF = (email: string | undefined) =>
  (db && email ? doc(db, 'feedSecrets', `appointments__${email}`) : null);

function newToken(): string {
  const bytes = new Uint8Array(16); // 128 bits
  crypto.getRandomValues(bytes);
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function useAppointmentsFeed() {
  const me = useCurrentDirector();
  const email = me?.email;
  // The email the state BELONGS to rides along with it, so switching accounts
  // reads as "still loading" without a synchronous setState in the effect —
  // which would otherwise show one director the other's token for a frame.
  const [state, setState] = useState<{ email?: string; token: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const ref = REF(email);
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
  }, [email]);

  // No Firestore, or no signed-in director: settled, with nothing to offer.
  const settled = !db || !email ? { email, token: null } : (state?.email === email ? state : null);
  const token = settled?.token ?? null;

  /** Create the link, or rotate it. Rotation IS instant revocation: the
   *  endpoint compares against this doc on every request. */
  async function issue(): Promise<void> {
    const ref = REF(email);
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
    const ref = REF(email);
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
