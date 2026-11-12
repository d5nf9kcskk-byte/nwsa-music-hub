/**
 * One at a time per person (#google-binding).
 *
 * Making a person's sign-in account afresh is several steps (create, attach,
 * delete, write the record). Two requests for the same person at the same
 * moment (two tabs, a phone and a laptop) must not interleave them. This
 * hands out a short claim on the person's address: the second request waits
 * for the first to finish and then looks at things as the first left them.
 *
 * The claim is a document in `signInLocks`, which no rule matches, so no
 * browser can read or write it. Each claim carries an id of its own, and a
 * request lets go of ITS claim only. A claim left behind by a crash is
 * ignored after a minute, and so is one dated in the future (which could
 * otherwise never go stale).
 */
import { randomBytes } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';

/** A claim older than this was left behind by something that died. */
export const LOCK_STALE_MS = 60_000;
/** How long a second request waits for the first before giving up. */
export const LOCK_WAIT_MS = 20_000;
/** How far ahead of this server's clock another server's claim may be dated and still count. */
export const LOCK_SKEW_MS = 5_000;
const POLL_MS = 250;

export type EntryLock = <T>(email: string, fn: () => Promise<T>) => Promise<T>;

/** Is a claim made at `at` still held at `now`? Not if it is too old, and not if it is dated in the future. */
export function claimIsLive(at: unknown, now: number): boolean {
  return typeof at === 'number' && now - at < LOCK_STALE_MS && at - now <= LOCK_SKEW_MS;
}

/** `opts` is for the self-check only: its own clock, and a shorter wait. */
export function entryLock(db: Firestore, opts: { now?: () => number; waitMs?: number; pollMs?: number } = {}): EntryLock {
  const now = opts.now ?? Date.now;
  const waitMs = opts.waitMs ?? LOCK_WAIT_MS;
  const pollMs = opts.pollMs ?? POLL_MS;
  return async function lock<T>(email: string, fn: () => Promise<T>): Promise<T> {
    const ref = db.doc(`signInLocks/${email}`);
    const mine = randomBytes(12).toString('hex');
    const started = now();
    for (;;) {
      const got = await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        if (snap.exists && claimIsLive(snap.get('at'), now())) return false;
        tx.set(ref, { at: now(), id: mine });
        return true;
      });
      if (got) break;
      if (now() - started > waitMs) throw Object.assign(new Error('entryLock: still busy'), { code: 'hub/busy' });
      await new Promise(resolve => { setTimeout(resolve, pollMs); });
    }
    try { return await fn(); }
    finally {
      // Let go of OUR claim only. If this ran so long that the claim went
      // stale and another request took it, that claim is theirs to let go.
      await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        if (snap.exists && snap.get('id') === mine) tx.delete(ref);
      }).catch(() => {});
    }
  };
}
