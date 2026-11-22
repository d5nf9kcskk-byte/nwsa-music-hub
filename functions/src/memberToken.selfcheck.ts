/**
 * The member sign-in test (#member-sign-in). Run:
 *   node --experimental-strip-types functions/src/memberToken.selfcheck.ts
 *
 * Pins memberSignInHonoured / memberFromToken, the copy for the member
 * functions of the password arm in firestore.rules and storage.rules
 * (staffToken.selfcheck.ts pins the rules text; the emulator proof
 * scripts/member-sign-in.emulator-proof.mjs asks the real rules).
 */
import { isMemberEntry, memberFromToken, memberSignInHonoured } from './memberToken.ts';
import type { StaffClaims } from './staffToken.ts';

let failures = 0;
const check = (c: unknown, m: string) => { if (!c) { failures++; console.error(`  ✗ ${m}`); } };

const MEMBER = { roles: ['member'], personnelId: 'p1', boundUid: 'acct-1', boundAt: 1, passwordSet: true };
const claims = (provider: string | undefined, over: Partial<StaffClaims> = {}, ids: unknown = []): StaffClaims => ({
  uid: 'acct-1', email: 'ana@orchestra.test', email_verified: true,
  firebase: { ...(provider === undefined ? {} : { sign_in_provider: provider }), identities: { 'google.com': ids, email: ['ana@orchestra.test'] } },
  ...over,
});

check(isMemberEntry(MEMBER) && !isMemberEntry({ roles: ['member', 'director'] }) && !isMemberEntry({ role: 'member' }) && !isMemberEntry(undefined), 'a member entry has exactly the one role, in roles[]');
check(memberSignInHonoured(claims('password'), MEMBER), 'a password on the member\'s bound account, server-set, is honoured');
check(!memberSignInHonoured(claims('password', { uid: 'other' }), MEMBER), 'any other account is refused');
check(!memberSignInHonoured(claims('password'), { ...MEMBER, passwordSet: false }), 'a password the server did not set is refused');
check(!memberSignInHonoured(claims('password'), { ...MEMBER, passwordSet: 'true' }), 'passwordSet must be the boolean true');
check(!memberSignInHonoured(claims('password'), { ...MEMBER, boundUid: '' }), 'no bound account: refused');
check(!memberSignInHonoured(claims('password'), { ...MEMBER, roles: ['director'] }), 'a password on a STAFF entry is refused');
check(!memberSignInHonoured(claims('password'), { ...MEMBER, googleSub: 'g-ana' }), 'when the entry names a Google identity, the account must still have it');
check(memberSignInHonoured(claims('password', {}, ['g-ana']), { ...MEMBER, googleSub: 'g-ana' }), 'and with it, it is honoured');
check(memberSignInHonoured(claims('google.com', {}, ['g-ana']), { ...MEMBER, googleSub: 'g-ana' }), 'a member\'s bound Google sign-in is honoured (staffToken\'s test)');
check(!memberSignInHonoured(claims('google.com', {}, ['g-ana']), { ...MEMBER }), 'an unbound Google sign-in is not');
for (const p of ['anonymous', 'custom', 'phone', 'emailLink', '', undefined]) check(!memberSignInHonoured(claims(p), MEMBER), `"${p}" is refused`);
{
  const load = async (e: string) => (e === 'ana@orchestra.test' ? MEMBER : undefined);
  check((await memberFromToken(claims('password'), load))?.director === MEMBER, 'memberFromToken hands back the entry');
  check(await memberFromToken(claims('password', { email_verified: false }), load) === null, 'an unverified email: null');
  check(await memberFromToken(claims('password', { email: 'x@y.test' }), load) === null, 'not listed: null (a member function has no role to check afterwards)');
}

if (failures) { console.error(`member token self-check: ${failures} failure(s)`); process.exit(1); }
console.log('member token self-check: ok');
