/**
 * The real sign-in service and database behind googleBinding.ts
 * (#google-binding). Its own module, with both passed in, so the Cloud
 * Function and the emulator proof run exactly this code.
 *
 * The tie lives on the person's own Directors entry:
 *   directors/{email}.googleSub      Google's id for the person
 *   directors/{email}.googleBoundAt  when it was recorded (ms), for the Owner's screen
 */
import type { Firestore } from 'firebase-admin/firestore';
import type { BindDeps, BindUser } from './googleBinding.ts';

export interface BindAuth {
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
    async tieIfUntied(email, googleSub, now) {
      return db.runTransaction(async tx => {
        const ref = db.doc(`directors/${email}`);
        const snap = await tx.get(ref);
        if (!snap.exists) return { listed: false as const };
        const existing = snap.get('googleSub');
        if (typeof existing === 'string' && existing) return { listed: true as const, googleSub: existing };
        // update(), never set(): this must not be able to put anyone ON the list.
        tx.update(ref, { googleSub, googleBoundAt: now });
        return { listed: true as const, googleSub };
      });
    },
    now: () => Date.now(),
  };
}
