/**
 * The real sign-in service and database behind googleBinding.ts
 * (#google-binding). Its own module, with both passed in, so the Cloud
 * Function and the emulator proof run exactly this code.
 *
 * The tie lives on the person's own Directors entry:
 *   directors/{email}.googleSub  Google's id for the person
 *   directors/{email}.boundUid   the one Hub sign-in account that is theirs
 *   directors/{email}.boundAt    when it was recorded (ms), for the Owner's screen
 * A fresh account has no password on it, so a tie also sets
 * directors/{email}.passwordSet to false (#password-sign-in): the person
 * sets a password again by link if they want one.
 */
import type { Firestore } from 'firebase-admin/firestore';
import type { BindDeps, BindUser } from './googleBinding.ts';
import { freshAccount, type AccountAuth } from './freshAccount.ts';

export interface BindAuth extends AccountAuth {
  getUser(uid: string): Promise<BindUser>;
}

export function googleBindingStore(db: Firestore, auth: BindAuth): BindDeps {
  return {
    async getUser(uid) {
      try { return await auth.getUser(uid); }
      catch (e) {
        if ((e as { code?: unknown } | null)?.code === 'auth/user-not-found') return null;
        throw e;
      }
    },
    async getEntry(email) {
      const snap = await db.doc(`directors/${email}`).get();
      if (!snap.exists) return null;
      const text = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
      return { googleSub: text(snap.get('googleSub')), boundUid: text(snap.get('boundUid')) };
    },
    replaceAccount(user, google) {
      return freshAccount(auth, {
        email: (user.email ?? '').toLowerCase(),
        alsoDelete: user.uid,
        google,
        displayName: user.displayName,
        photoURL: user.photoURL,
      });
    },
    async tie(email, googleSub, boundUid, now) {
      return db.runTransaction(async tx => {
        const ref = db.doc(`directors/${email}`);
        const snap = await tx.get(ref);
        if (!snap.exists) return 'not-listed' as const;
        const existing = snap.get('googleSub');
        if (typeof existing === 'string' && existing && existing !== googleSub) return 'other-account' as const;
        // update(), never set(): this must not be able to put anyone ON the list.
        tx.update(ref, { googleSub, boundUid, boundAt: now, passwordSet: false });
        return 'tied' as const;
      });
    },
    now: () => Date.now(),
  };
}
