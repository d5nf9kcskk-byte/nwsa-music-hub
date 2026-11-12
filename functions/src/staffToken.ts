/**
 * Is this sign-in token a staff member's? (#password-sign-in)
 *
 * The SAME test as honouredSignIn() in firestore.rules and storage.rules,
 * for the Cloud Functions that check a caller's token themselves. All three
 * change together. A verified email on the Directors list is not enough by
 * itself; the way in matters:
 *
 *   • Google: honoured, exactly as it always was.
 *   • Email and password: honoured for ONE account only, the one the server
 *     bound to this listed person (`passwordUid`), and only for a sign-in
 *     made after it was bound (`passwordBoundAt`, whole seconds).
 *   • Anything else: refused.
 *
 * Pure, so the emulator proof can feed it real tokens. Every function that
 * calls verifyIdToken goes through staffFromToken; staffToken.selfcheck.ts
 * reads index.ts to keep it that way.
 */

/** The claims this needs from a decoded Firebase ID token. */
export interface StaffClaims {
  uid?: string;
  sub?: string;
  email?: string;
  email_verified?: boolean;
  /** When this session signed in, in seconds. A refreshed token keeps it. */
  auth_time?: number;
  firebase?: { sign_in_provider?: string };
}

export type DirectorData = Record<string, unknown>;

/** honouredSignIn() from the rules files. */
export function signInHonoured(claims: StaffClaims, director: DirectorData | undefined): boolean {
  const provider = claims.firebase?.sign_in_provider;
  if (provider === 'google.com') return true;
  if (provider !== 'password' || !director) return false;
  const uid = claims.uid ?? claims.sub;
  const { passwordUid, passwordBoundAt } = director;
  return typeof passwordUid === 'string' && passwordUid !== ''
    && typeof passwordBoundAt === 'number' && Number.isInteger(passwordBoundAt)
    && passwordUid === uid
    && typeof claims.auth_time === 'number' && claims.auth_time > passwordBoundAt;
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
  if (!signInHonoured(claims, director)) return null;
  return { email: claims.email, director };
}
