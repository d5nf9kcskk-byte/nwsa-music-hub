/**
 * The real sign-in service, database and Google keys behind googleBinding.ts
 * (#google-binding). Its own module, with the database and sign-in service
 * passed in, so the Cloud Function and the emulator proof run exactly this
 * code. (The proof passes its own `verifyGoogle`, because the emulator's
 * stand-in for Google does not sign tokens; the real check is
 * googleIdToken.ts, and its self-check runs it against keys of its own.)
 *
 * The record lives on the person's own Directors entry:
 *   directors/{email}.googleSub    Google's id for the person
 *   directors/{email}.boundUid     the one Hub sign-in account that is theirs
 *   directors/{email}.boundAt      when it was recorded (ms), for the Owner's screen
 *   directors/{email}.passwordSet  set to false here: a fresh account has no
 *                                  password on it (#password-sign-in)
 */
import type { Firestore } from 'firebase-admin/firestore';
import type { BindDeps, BindUser } from './googleBinding.ts';
import { freshAccount, type AccountAuth } from './freshAccount.ts';
import { entryLock } from './entryLock.ts';
import { verifyGoogleIdToken, type GoogleIdentity, type GoogleJwk } from './googleIdToken.ts';

export interface BindAuth extends AccountAuth {
  getUser(uid: string): Promise<BindUser>;
}

export function googleBindingStore(
  db: Firestore, auth: BindAuth, verifyGoogle: (token: unknown) => Promise<GoogleIdentity | null>,
): BindDeps {
  return {
    verifyGoogle,
    lock: entryLock(db),
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
      return { googleSub: text(snap.get('googleSub')), boundUid: text(snap.get('boundUid')), passwordSet: snap.get('passwordSet') === true };
    },
    replaceAccount(spec) {
      return freshAccount(auth, spec);
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

// ── Google's keys and this project's number, as they are in production ──────

const KEYS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const PROJECT_NUMBER_URL = 'http://metadata.google.internal/computeMetadata/v1/project/numeric-project-id';
const KEYS_FRESH_MS = 60 * 60 * 1000;

let keys: { at: number; list: GoogleJwk[] } | null = null;
let projectNumber = '';

async function googleKeys(force: boolean): Promise<GoogleJwk[]> {
  if (!force && keys && Date.now() - keys.at < KEYS_FRESH_MS) return keys.list;
  const res = await fetch(KEYS_URL);
  if (!res.ok) throw new Error('could not fetch the signing keys');
  const body = await res.json() as { keys?: GoogleJwk[] };
  keys = { at: Date.now(), list: Array.isArray(body.keys) ? body.keys : [] };
  return keys.list;
}

async function thisProjectNumber(): Promise<string> {
  if (projectNumber) return projectNumber;
  const res = await fetch(PROJECT_NUMBER_URL, { headers: { 'Metadata-Flavor': 'Google' } });
  if (!res.ok) throw new Error('could not read the project number');
  projectNumber = (await res.text()).trim();
  return projectNumber;
}

/**
 * The check the deployed function uses: Google's published keys, and this
 * project's own number (which every one of its sign-in client ids begins
 * with). If a token does not verify, the keys are fetched once more before
 * giving up, because Google changes them from time to time.
 */
export async function verifyGoogleLive(token: unknown): Promise<GoogleIdentity | null> {
  const number = await thisProjectNumber();
  const first = verifyGoogleIdToken(token, { keys: await googleKeys(false), projectNumber: number, now: Date.now() });
  if (first) return first;
  return verifyGoogleIdToken(token, { keys: await googleKeys(true), projectNumber: number, now: Date.now() });
}
