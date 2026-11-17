/**
 * Each listed person is tied to their own Google account (#google-binding).
 *
 * The Directors list names people by address. This step records, on a
 * person's entry, which Google account is theirs and which Hub sign-in
 * account goes with it. It runs on the server and is the only thing that
 * writes that record:
 *
 *   googleSub  Google's own id for the person
 *   boundUid   the one Hub sign-in account that is theirs
 *   boundAt    when (ms), for the Owner's screen
 *
 * It makes a record only from what GOOGLE says, in the token Google signed
 * at the person's sign-in (googleIdToken.ts): who they are, that their
 * address is the listed one, and that Google has verified it. So a record is
 * only ever made at the moment of a real Google sign-in.
 *
 * And the account it records is always a FRESH one (freshAccount.ts): the
 * account the caller arrived on is deleted and a new one is made that only
 * this Google identity opens. The caller's same Google sign-in then opens it.
 *
 * What it never does: put anyone on the list, move a record to a different
 * Google account, or put a Google account on a record its owner made with a
 * password alone. A person whose Google account really did change
 * asks the Owner to reset the record on the Directors screen. If a Google
 * identity the entry does not name turns up ON the recorded account, the
 * account is made afresh for the identity the entry does name, which signs
 * everyone on it out.
 *
 * Pure: the sign-in service, the database and the token check are passed in,
 * so the function, the emulator proof and the self-check run the same code.
 */
import type { AccountProvider, AccountRecord } from './freshAccount.ts';
import type { GoogleIdentity } from './googleIdToken.ts';

/** The claims this needs from a verified Firebase ID token. */
export interface BindClaims {
  uid?: string;
  sub?: string;
  email?: string;
  email_verified?: boolean;
  firebase?: { sign_in_provider?: string; identities?: Record<string, unknown> };
}

export type BindUser = AccountRecord;

export type BindOutcome =
  /** The entry names this Google account and this very sign-in account. Nothing to do. */
  | 'bound'
  /** The entry names this Google account, and its account is not the one this session is on. Sign in with the same Google sign-in again. */
  | 'again'
  /** This address is not on the Directors list. */
  | 'not-listed'
  /** Google does not vouch for this sign-in as the owner of its address. */
  | 'mismatch'
  /** The entry names a different Google account. */
  | 'other-account';

/** What an entry says about its record. */
export interface BindEntry {
  googleSub?: string;
  boundUid?: string;
  /** The server set a password on the recorded account, through the person's own inbox (#password-sign-in). */
  passwordSet?: boolean;
}

export interface BindDeps {
  /** What Google says in the token it signed at sign-in, or null if the token is not good. */
  verifyGoogle(token: unknown): Promise<GoogleIdentity | null>;
  /** One request at a time per address (entryLock.ts). */
  lock<T>(email: string, fn: () => Promise<T>): Promise<T>;
  /** The account behind a sign-in, or null if it is gone. */
  getUser(uid: string): Promise<BindUser | null>;
  /** The Directors entry for an address, or null when it is not listed. */
  getEntry(email: string): Promise<BindEntry | null>;
  /**
   * Make the person's fresh account, carrying only this Google identity,
   * and delete the caller's account and anything else on the address. Its
   * id, or null when it must not be made.
   */
  replaceAccount(spec: {
    email: string; alsoDelete: string; google: AccountProvider & { uid: string };
    displayName?: string; photoURL?: string;
  }): Promise<string | null>;
  /**
   * In ONE transaction: write the record, unless the entry is gone or names
   * a different Google account. Never creates an entry and never moves a
   * record to another Google account.
   */
  tie(email: string, googleSub: string, boundUid: string, now: number): Promise<'tied' | 'not-listed' | 'other-account'>;
  now(): number;
}

/** Google's id for the person this session signed in as, or '' when the token is not a plain Google sign-in. */
export function googleSubOf(claims: BindClaims): string {
  if (claims.firebase?.sign_in_provider !== 'google.com') return '';
  const ids = claims.firebase.identities?.['google.com'];
  return Array.isArray(ids) && ids.length === 1 && typeof ids[0] === 'string' ? ids[0] : '';
}

/**
 * `claims` are the caller's verified Hub sign-in. `googleToken` is the token
 * Google signed at that same sign-in, sent along by the app.
 */
export async function bindGoogle(deps: BindDeps, claims: BindClaims, googleToken: unknown): Promise<BindOutcome> {
  const uid = claims.uid ?? claims.sub ?? '';
  const sessionSub = googleSubOf(claims);
  if (!uid || !sessionSub) return 'mismatch';
  // What Google itself says. Nothing below reads who the person is, or
  // whether their address is verified, from anywhere else.
  const google = await deps.verifyGoogle(googleToken);
  if (!google || !google.emailVerified) return 'mismatch';
  // The token is for the Google identity this session signed in with, and
  // the session is on the address Google names.
  if (google.sub !== sessionSub) return 'mismatch';
  const email = google.email;
  if ((claims.email ?? '').toLowerCase() !== email) return 'mismatch';
  // An entry's name is its address, so an address that could not be an
  // entry's name is nobody's.
  if (email.includes('/')) return 'mismatch';

  return deps.lock(email, async () => {
    const user = await deps.getUser(uid);
    // The account behind this session is gone: the person's account has been
    // made afresh since. Their Google sign-in opens the new one.
    if (!user) return 'again';
    if (user.disabled) return 'mismatch';
    const entry = await deps.getEntry(email);
    if (!entry) return 'not-listed';

    // (#password-sign-in) A person who has only ever used a password: their
    // record was made with their own inbox, and names no Google identity. A
    // Google sign-in does not get to replace that by itself, whoever's it
    // is. The Owner's Reset is how such a person adds Google.
    if (!entry.googleSub && entry.passwordSet === true) return 'other-account';

    if (entry.googleSub && entry.googleSub !== google.sub) {
      // A Google identity the entry does not name, ON the account the entry
      // names. That account is made afresh for the identity the entry does
      // name, so that everyone on it is signed out, this caller included.
      if (entry.boundUid === uid) {
        const fresh = await deps.replaceAccount({
          email, alsoDelete: uid, google: { providerId: 'google.com', uid: entry.googleSub, email },
        });
        if (fresh) await deps.tie(email, entry.googleSub, fresh, deps.now());
      }
      return 'other-account';
    }
    if (entry.googleSub === google.sub && entry.boundUid === uid) return 'bound';

    // No record yet, or a record whose account is not the one this session
    // is on. Either way the person's account is made afresh, here.
    const fresh = await deps.replaceAccount({
      email, alsoDelete: uid, google: { providerId: 'google.com', uid: google.sub, email },
      displayName: user.displayName, photoURL: user.photoURL,
    });
    if (!fresh) return 'mismatch';
    const tied = await deps.tie(email, google.sub, fresh, deps.now());
    return tied === 'tied' ? 'again' : tied;
  });
}
