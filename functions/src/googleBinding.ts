/**
 * Each listed person is tied to their own Google account (#google-binding).
 *
 * A sign-in token says which ADDRESS an account carries. It does not say that
 * Google itself knows the person by that address, and the security rules
 * cannot see that either. This step can: it runs on the server, looks at the
 * account behind the caller's sign-in, and only when Google's OWN address for
 * that account is the listed address does it record Google's id for the
 * person (`googleSub`) on their Directors entry. From then on the entry says
 * which Google account is theirs.
 *
 * Called by the app, by itself, right after a Google sign-in whenever the
 * entry is not tied yet. Nobody does anything by hand.
 *
 * What it never does: put anyone on the list, change an existing tie, or tie
 * an account whose Google address is some other address. A person whose
 * Google account really did change asks the Owner to reset the tie on the
 * Directors screen, and is tied again the next time they open the Hub.
 *
 * Pure: the sign-in service and the database are passed in, so the function,
 * the emulator proof and the self-check run the same code.
 */

/** The claims this needs from a verified Firebase ID token. */
export interface BindClaims {
  uid?: string;
  sub?: string;
  email?: string;
  email_verified?: boolean;
  firebase?: { sign_in_provider?: string; identities?: Record<string, unknown> };
}

export interface BindUser {
  uid: string;
  email?: string;
  emailVerified: boolean;
  disabled: boolean;
  providerData: { providerId: string; uid?: string; email?: string }[];
}

export type BindOutcome =
  /** The entry is tied to this Google account (now, or already). */
  | 'bound'
  /** This address is not on the Directors list. */
  | 'not-listed'
  /** This is not a Google sign-in whose own Google address is the address it carries. */
  | 'mismatch'
  /** The entry is already tied to a different Google account. */
  | 'other-account';

export interface BindDeps {
  /** The account behind a sign-in, or null if it is gone. */
  getUser(uid: string): Promise<BindUser | null>;
  /**
   * In ONE transaction: read the Directors entry and, only if it carries no
   * tie, write this one. Answers with what the entry says afterwards. Never
   * creates an entry and never changes a tie that is already there.
   */
  tieIfUntied(email: string, googleSub: string, now: number): Promise<{ listed: false } | { listed: true; googleSub: string }>;
  now(): number;
}

/** Google's id for the person this session signed in as, or '' when the token is not a plain Google sign-in. */
export function googleSubOf(claims: BindClaims): string {
  if (claims.firebase?.sign_in_provider !== 'google.com') return '';
  const ids = claims.firebase.identities?.['google.com'];
  return Array.isArray(ids) && ids.length === 1 && typeof ids[0] === 'string' ? ids[0] : '';
}

/**
 * Is this account Google's own account for this address? Google's address
 * for the account must BE the address the account carries. An account that
 * merely carries an address is not enough.
 */
export function isOwnGoogleAccount(user: BindUser | null, email: string, googleSub: string): boolean {
  if (!user || user.disabled || !user.emailVerified) return false;
  if ((user.email ?? '').toLowerCase() !== email.toLowerCase()) return false;
  const google = user.providerData.filter(p => p.providerId === 'google.com');
  return google.length === 1
    && google[0].uid === googleSub
    && (google[0].email ?? '').toLowerCase() === email.toLowerCase();
}

export async function bindGoogle(deps: BindDeps, claims: BindClaims): Promise<BindOutcome> {
  const email = claims.email ?? '';
  const uid = claims.uid ?? claims.sub ?? '';
  const googleSub = googleSubOf(claims);
  if (claims.email_verified !== true || !email || !uid || !googleSub) return 'mismatch';
  // The account is judged BEFORE the list is looked at, so an account that
  // fails here learns nothing about who is listed.
  if (!isOwnGoogleAccount(await deps.getUser(uid), email, googleSub)) return 'mismatch';
  const entry = await deps.tieIfUntied(email, googleSub, deps.now());
  if (!entry.listed) return 'not-listed';
  return entry.googleSub === googleSub ? 'bound' : 'other-account';
}
