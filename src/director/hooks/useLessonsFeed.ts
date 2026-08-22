import { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * The unguessable token in the private lessons calendar's URL (#lessons-feed).
 *
 * Lessons are staff-only everywhere else in the app, and a feed on GitHub
 * Pages has no sign-in — so the URL itself is the access control. That means:
 * the token lives in a staff-only Firestore doc (never in the app bundle,
 * never in the repo), it is 128 bits of randomness, and anyone who gets the
 * link can read every student's lesson schedule until it is reset.
 *
 * The Cloud Function at `functions/src/index.ts` reads the same doc and
 * refuses any request whose token does not match it. Until a director
 * creates a token here, every request to that endpoint is refused — and
 * deleting the token revokes access on the very next fetch, because nothing
 * is cached or pre-built.
 */
const REF = () => (db ? doc(db, 'feedSecrets', 'lessons') : null);

function newToken(): string {
  const bytes = new Uint8Array(16); // 128 bits
  crypto.getRandomValues(bytes);
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function useLessonsFeed() {
  // One piece of state, seeded for the no-Firestore case, so the listener
  // only ever writes from its own callbacks — nothing is set synchronously
  // inside the effect.
  const [state, setState] = useState<{ token: string | null } | null>(db ? null : { token: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const ref = REF();
    if (!ref) return;
    return onSnapshot(
      ref,
      snap => {
        const value = snap.exists() ? (snap.data().token as string | undefined) : undefined;
        setState({ token: value ?? null });
      },
      // A read failure (rules, offline) is "no link yet" rather than a
      // permanent spinner — the panel simply offers to create one.
      () => setState({ token: null }),
    );
  }, []);

  const token = state?.token ?? null;
  const loading = state === null;

  /**
   * Create the link, or rotate it. Rotation IS instant revocation now that
   * the calendar is served by a function rather than published as a file:
   * the endpoint compares against this doc on every request.
   */
  async function issue(): Promise<void> {
    const ref = REF();
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

  return { token, loading, busy, error, issue };
}
