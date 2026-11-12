/**
 * Where passwordSetup.ts keeps its things (#password-sign-in): the real
 * Firestore and sign-in service behind the pure rules in passwordSetup.ts.
 * Its own module, with the database and the sign-in service passed in, so
 * the Cloud Function and the emulator proof run exactly this code.
 *
 * Three server-only places, none of which any client may read or write
 * (firestore.rules has no match for the last two, so they are denied):
 *   directors/{email}.passwordUid / .passwordBoundAt   the binding
 *   passwordSetup/{sha256 of the token}                a link not yet used
 *   passwordSetupLimits/{hashed key}                   the rate-limit counters
 */
import type { Firestore } from 'firebase-admin/firestore';
import { newToken, type SetupAuth, type SetupDeps } from './passwordSetup.ts';

// ponytail: a link that is never opened, and every counter, stays in the
// database for good. Each is a few bytes and holds nothing usable (a hash, an
// address, a number). If that ever matters, put a Firestore TTL policy on
// `passwordSetup.expiresAt` rather than writing a sweeper.

const NOT_FOUND = 5; // gRPC status: the document does not exist

export function passwordSetupStore(
  db: Firestore, auth: SetupAuth, org: { publicUrl: string; appName: string },
): SetupDeps {
  return {
    auth,
    async getDirector(email) {
      return (await db.doc(`directors/${email}`).get()).data();
    },
    async bind(email, uid, boundAtSeconds) {
      // update(), never set(): this must not be able to put anyone ON the list.
      try {
        await db.doc(`directors/${email}`).update({ passwordUid: uid, passwordBoundAt: boundAtSeconds });
        return true;
      } catch (e) {
        if ((e as { code?: unknown } | null)?.code === NOT_FOUND) return false;
        throw e;
      }
    },
    async saveToken(id, record) {
      await db.doc(`passwordSetup/${id}`).set(record);
    },
    async takeToken(id, now) {
      return db.runTransaction(async tx => {
        const ref = db.doc(`passwordSetup/${id}`);
        const snap = await tx.get(ref);
        if (!snap.exists) return null;
        tx.delete(ref); // used up, whatever it turns out to be
        const d = snap.data() as { email?: unknown; expiresAt?: unknown };
        return typeof d.email === 'string' && typeof d.expiresAt === 'number' && d.expiresAt > now
          ? { email: d.email }
          : null;
      });
    },
    async sendMail(mail) {
      // The Trigger Email extension sends anything written here. `mail` is
      // denied to every client.
      await db.collection('mail').add(mail);
    },
    async allow(key, max, windowMs) {
      return db.runTransaction(async tx => {
        const ref = db.doc(`passwordSetupLimits/${key}`);
        const d = (await tx.get(ref)).data() as { start?: unknown; count?: unknown } | undefined;
        const now = Date.now();
        const open = typeof d?.start === 'number' && now - d.start < windowMs;
        const count = open && typeof d?.count === 'number' ? d.count + 1 : 1;
        tx.set(ref, { start: open ? d!.start : now, count });
        return count <= max;
      });
    },
    newToken,
    now: () => Date.now(),
    sleepUntil: ms => new Promise(resolve => { setTimeout(resolve, Math.max(0, ms - Date.now())); }),
    publicUrl: org.publicUrl,
    appName: org.appName,
  };
}
