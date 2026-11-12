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
 * It ties a Google sign-in only when Google's own address for the account
 * IS the listed address. And the account it ties is always a FRESH one
 * (freshAccount.ts): the account the caller arrived on is deleted and a new
 * one is made that only this Google identity can open. So no session that
 * existed before the tie is on the tied account. The caller signs in once
 * more and is on it.
 *
 * Called by the app, by itself, after a Google sign-in whenever the entry is
 * not tied to the account the person is on. Nobody does anything by hand.
 *
 * What it never does: put anyone on the list, or move a tie to a different
 * Google account. A person whose Google account really did change asks the
 * Owner to reset the tie on the Directors screen, and is tied again the next
 * time they open the Hub.
 *
 * Pure: the sign-in service and the database are passed in, so the function,
 * the emulator proof and the self-check run the same code.
 */
import type { AccountProvider, AccountRecord } from './freshAccount.ts';

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
  /** The entry is tied to this Google account and this very sign-in account. Nothing to do. */
  | 'bound'
  /** The entry is tied (now, or already) and its account is not the one this session is on. Sign in once more. */
  | 'again'
  /** This address is not on the Directors list. */
  | 'not-listed'
  /** This is not a Google sign-in on Google's own account for its address. */
  | 'mismatch'
  /** The entry is tied to a different Google account. */
  | 'other-account';

/** What an entry says about its tie. */
export interface BindEntry {
  googleSub?: string;
  boundUid?: string;
}

export interface BindDeps {
  /** The account behind a sign-in, or null if it is gone. */
  getUser(uid: string): Promise<BindUser | null>;
  /** The Directors entry for an address, or null when it is not listed. */
  getEntry(email: string): Promise<BindEntry | null>;
  /**
   * Delete the caller's account (and anything else on the address) and make
   * the person's fresh one, carrying only this Google identity. Its id, or
   * null when it must not be made.
   */
  replaceAccount(user: BindUser, google: AccountProvider & { uid: string }): Promise<string | null>;
  /**
   * In ONE transaction: write the tie, unless the entry is gone or is tied
   * to a different Google account. Never creates an entry and never moves a
   * tie to another Google account.
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

/** The one Google identity on an account, when it is Google's own for this address. */
export function ownGoogleIdentity(user: BindUser | null, email: string, googleSub: string): (AccountProvider & { uid: string }) | null {
  if (!user || user.disabled || !user.emailVerified) return null;
  if ((user.email ?? '').toLowerCase() !== email.toLowerCase()) return null;
  const google = user.providerData.filter(p => p.providerId === 'google.com');
  if (google.length !== 1 || google[0].uid !== googleSub) return null;
  if ((google[0].email ?? '').toLowerCase() !== email.toLowerCase()) return null;
  return { ...google[0], uid: googleSub };
}

/** Is this account Google's own account for this address? */
export function isOwnGoogleAccount(user: BindUser | null, email: string, googleSub: string): boolean {
  return ownGoogleIdentity(user, email, googleSub) !== null;
}

export async function bindGoogle(deps: BindDeps, claims: BindClaims): Promise<BindOutcome> {
  const email = (claims.email ?? '').toLowerCase();
  const uid = claims.uid ?? claims.sub ?? '';
  const googleSub = googleSubOf(claims);
  if (claims.email_verified !== true || !email || !uid || !googleSub) return 'mismatch';
  // An entry's name is its address, so an address that could not be an
  // entry's name is nobody's.
  if (email.includes('/')) return 'mismatch';
  const user = await deps.getUser(uid);
  // The account behind this session is gone: the person's account has been
  // made afresh since. Nothing to do here but sign in again.
  if (!user) return 'again';
  // The account is judged BEFORE the list is looked at, so an account that
  // fails here learns nothing about who is listed.
  const google = ownGoogleIdentity(user, email, googleSub);
  if (!google) return 'mismatch';
  const entry = await deps.getEntry(email);
  if (!entry) return 'not-listed';
  if (entry.googleSub && entry.googleSub !== googleSub) return 'other-account';
  if (entry.googleSub === googleSub && entry.boundUid === uid) return 'bound';

  // Not tied yet, or tied but this session is not on the account on file.
  // Either way the person's account is made afresh, here, so that nothing
  // signed in before this moment is on it.
  const fresh = await deps.replaceAccount(user, google);
  if (!fresh) return 'mismatch';
  const tied = await deps.tie(email, googleSub, fresh, deps.now());
  return tied === 'tied' ? 'again' : tied;
}
