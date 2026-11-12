/**
 * One at a time per person (#google-binding).
 *
 * Making a person's sign-in account afresh is several steps (delete, create,
 * attach, write the record). Two requests for the same person at the same
 * moment (two tabs, a phone and a laptop) must not interleave them. This
 * hands out a short claim on the person's address: the second request waits
 * for the first to finish and then looks at things as the first left them.
 *
 * The claim is a document in `signInLocks`, which no rule matches, so no
 * browser can read or write it. A claim left behind by a crash is ignored
 * after a minute.
 */
import type { Firestore } from 'firebase-admin/firestore';

/** A claim older than this was left behind by something that died. */
export const LOCK_STALE_MS = 60_000;
/** How long a second request waits for the first before giving up. */
export const LOCK_WAIT_MS = 20_000;
const POLL_MS = 250;

export type EntryLock = <T>(email: string, fn: () => Promise<T>) => Promise<T>;

export function entryLock(db: Firestore): EntryLock {
  return async function lock<T>(email: string, fn: () => Promise<T>): Promise<T> {
    const ref = db.doc(`signInLocks/${email}`);
    const started = Date.now();
    for (;;) {
      const got = await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        const at: unknown = snap.get('at');
        if (snap.exists && typeof at === 'number' && Date.now() - at < LOCK_STALE_MS) return false;
        tx.set(ref, { at: Date.now() });
        return true;
      });
      if (got) break;
      if (Date.now() - started > LOCK_WAIT_MS) throw Object.assign(new Error('entryLock: still busy'), { code: 'hub/busy' });
      await new Promise(resolve => { setTimeout(resolve, POLL_MS); });
    }
    try { return await fn(); }
    finally { await ref.delete().catch(() => {}); }
  };
}
