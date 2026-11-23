/**
 * Is this sign-in token a staff member's? (#google-binding, #password-sign-in)
 *
 * The same test as honouredSignIn() in storage.rules, for the Cloud
 * Functions that check a caller's token themselves. (firestore.rules applies
 * it too, behind a server-only switch, because that one file also runs for
 * the demo projects, which have no server step. Storage and these functions
 * exist only for the school's project, so here it is always required.) All
 * three change together. Being on the Directors list is not enough by
 * itself: the server records on each entry which sign-in account is that
 * person's (googleBinding.ts), and a sign-in is honoured only on it.
 *
 *   • A Google sign-in is honoured only when the session is on the account
 *     the entry names (`boundUid`) and that account has the entry's Google
 *     identity (`googleSub`).
 *   • An email-and-password sign-in is honoured on that same account, and
 *     only when the server has set a password on it (`passwordSet`). When
 *     the entry also names a Google identity, the account must still have it.
 *   • Anything else is refused. A new way of signing in gets a clause here,
 *     and in both rules files, on purpose, or it gets nothing.
 *
 * Pure, so the emulator proof can feed it real tokens. Every function that
 * calls verifyIdToken to learn who is asking goes through staffFromToken;
 * staffToken.selfcheck.ts reads index.ts to keep it that way. (`bindGoogle`
 * is the one exception by design: it is what makes the record, so it cannot
 * require it.)
 */

/** The claims this needs from a decoded Firebase ID token. */
export interface StaffClaims {
  uid?: string;
  sub?: string;
  email?: string;
  email_verified?: boolean;
  firebase?: { sign_in_provider?: string; identities?: Record<string, unknown> };
}

export type DirectorData = Record<string, unknown>;

/** isBoundAccount() from the rules files: the session is on the one account the entry names. */
function isBoundAccount(claims: StaffClaims, director: DirectorData | undefined): boolean {
  const boundUid = director?.boundUid;
  return typeof boundUid === 'string' && boundUid !== '' && boundUid === (claims.uid ?? claims.sub);
}

/** boundGoogleSignIn() from the rules files. */
function boundGoogleSignIn(claims: StaffClaims, director: DirectorData | undefined): boolean {
  const googleSub = director?.googleSub;
  const ids = claims.firebase?.identities?.['google.com'];
  return isBoundAccount(claims, director)
    && typeof googleSub === 'string' && googleSub !== ''
    && Array.isArray(ids) && ids.includes(googleSub);
}

/** boundPasswordSignIn() from the rules files. */
function boundPasswordSignIn(claims: StaffClaims, director: DirectorData | undefined): boolean {
  if (!isBoundAccount(claims, director) || director?.passwordSet !== true) return false;
  const googleSub = director.googleSub ?? '';
  if (googleSub === '') return true;
  const ids = claims.firebase?.identities?.['google.com'];
  return typeof googleSub === 'string' && Array.isArray(ids) && ids.includes(googleSub);
}

/** honouredSignIn() from the rules files. */
export function signInHonoured(claims: StaffClaims, director: DirectorData | undefined): boolean {
  const provider = claims.firebase?.sign_in_provider;
  if (provider === 'google.com') return boundGoogleSignIn(claims, director);
  if (provider === 'password') return boundPasswordSignIn(claims, director);
  return false;
}

/**
 * The verified email and directors doc behind a decoded token, or null when
 * the token is not one the Hub honours. A caller still checks the ROLE: this
 * answers "may this sign-in speak for that address", not "what may they do".
 */
export async function staffFromToken(
  claims: StaffClaims,
  loadDirector: (email: string) => Promise<DirectorData | undefined>,
): Promise<{ email: string; director: DirectorData | undefined } | null> {
  if (claims.email_verified !== true || !claims.email) return null;
  const director = await loadDirector(claims.email);
  // Not on the list at all: hand back no entry, and the caller's role check
  // refuses it exactly as it always did.
  if (!director) return { email: claims.email, director: undefined };
  if (!signInHonoured(claims, director)) return null;
  return { email: claims.email, director };
}
