/**
 * Is this sign-in token a MEMBER's? (#member-sign-in, personnel orgs only)
 *
 * A member is a player on the paid roster with a Directors entry of exactly
 * `{ roles: ['member'], personnelId }` (the chaperone pattern: a closed,
 * narrow signed-in role that isKnownRole() does not include). The same test
 * as honouredSignIn() in firestore.rules and storage.rules, for the member
 * functions in personnelIndex.ts:
 *
 *   • a Google sign-in: exactly staffToken.ts's test (bound account, tied
 *     Google identity);
 *   • an email-and-password sign-in: honoured only on a MEMBER entry, on the
 *     account the server bound (`boundUid`), with `passwordSet` true (only
 *     passwordSetup.ts writes it). When the entry also names a Google
 *     identity, the account must still have it.
 *
 * staffToken.ts is deliberately NOT changed: the school's functions never
 * see a member, and a password token reaching a staff function is refused
 * there as before. That keeps the school's functions bundle byte-identical.
 */
import { signInHonoured, type DirectorData, type StaffClaims } from './staffToken.ts';

/** `roles` is exactly ['member']: a member entry can carry no other role. */
export function isMemberEntry(d: DirectorData | undefined): d is DirectorData {
  const roles = d?.roles;
  return Array.isArray(roles) && roles.length === 1 && roles[0] === 'member';
}

/** isBoundMemberPassword() from the rules files. */
function boundMemberPassword(claims: StaffClaims, d: DirectorData): boolean {
  const boundUid = d.boundUid;
  if (typeof boundUid !== 'string' || boundUid === '' || boundUid !== (claims.uid ?? claims.sub)) return false;
  if (d.passwordSet !== true) return false;
  const googleSub = d.googleSub ?? '';
  if (googleSub === '') return true;
  const ids = claims.firebase?.identities?.['google.com'];
  return typeof googleSub === 'string' && Array.isArray(ids) && ids.includes(googleSub);
}

export function memberSignInHonoured(claims: StaffClaims, d: DirectorData | undefined): boolean {
  if (!isMemberEntry(d)) return false;
  const provider = claims.firebase?.sign_in_provider;
  if (provider === 'google.com') return signInHonoured(claims, d);
  if (provider === 'password') return boundMemberPassword(claims, d);
  return false;
}

/** The member's email and entry behind a decoded token, or null. */
export async function memberFromToken(
  claims: StaffClaims,
  loadDirector: (email: string) => Promise<DirectorData | undefined>,
): Promise<{ email: string; director: DirectorData } | null> {
  if (claims.email_verified !== true || !claims.email) return null;
  const director = await loadDirector(claims.email);
  if (!director || !memberSignInHonoured(claims, director)) return null;
  return { email: claims.email, director };
}
