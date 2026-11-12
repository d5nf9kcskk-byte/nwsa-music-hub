/**
 * The staff sign-in test (#google-binding). Run:
 *   node --experimental-strip-types functions/src/staffToken.selfcheck.ts
 *
 * Pins signInHonoured / staffFromToken, and reads the two rules files and
 * index.ts to keep the three copies of the test telling the same story:
 *   • a Google sign-in is honoured only on the account the entry names, and
 *     only when that account has the entry's Google identity;
 *   • every other way in is refused;
 *   • every staff gate in firestore.rules and storage.rules applies the
 *     test, and every role helper goes through the gate;
 *   • the switch is the server's alone;
 *   • every function that verifies a token to learn who is asking does it
 *     through the one helper, and checks the role afterwards.
 *
 * What a text check can and cannot see. Functions are compared WORD FOR
 * WORD, so a change to how conditions are grouped changes the text and
 * fails here. What it cannot see is a rule somewhere else in the file that
 * lets the same thing through another way. That is what the emulator checks
 * are for (scripts/google-binding.emulator-proof.mjs and the "no more than a
 * visitor" check in scripts/rules-verdicts.emulator-check.mjs); both run
 * before every rules deploy (rules-checks.yml).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { signInHonoured, staffFromToken, type StaffClaims } from './staffToken.ts';

let failures = 0;
function check(cond: unknown, msg: string) {
  if (!cond) { failures++; console.error(`  ✗ ${msg}`); }
}

const TIED = { role: 'director', googleSub: 'g-pat', boundUid: 'acct-1', boundAt: 1 };
const claims = (provider: string | undefined, ids: unknown = ['g-pat'], over: Partial<StaffClaims> = {}): StaffClaims => ({
  uid: 'acct-1', email: 'pat@school.test', email_verified: true,
  firebase: { ...(provider === undefined ? {} : { sign_in_provider: provider }), identities: { 'google.com': ids, email: ['pat@school.test'] } },
  ...over,
});

// ── Google: only the entry's own account, with the entry's Google identity ──
check(signInHonoured(claims('google.com'), TIED), 'the account the entry names, with the entry\'s Google identity, is honoured');
check(signInHonoured({ ...claims('google.com'), uid: undefined, sub: 'acct-1' }, TIED), 'the account id is read from sub when uid is absent');
check(!signInHonoured(claims('google.com', ['g-pat'], { uid: 'some-other-account' }), TIED), 'any other account is refused, even with the right Google identity on it');
check(!signInHonoured(claims('google.com', ['g-someone-else']), TIED), 'the right account with a different Google identity on it is refused');
check(!signInHonoured(claims('google.com'), { role: 'director' }), 'an entry with no record lets nobody in');
check(!signInHonoured(claims('google.com'), { role: 'director', googleSub: 'g-pat' }), 'half a record (no account) lets nobody in');
check(!signInHonoured(claims('google.com'), { role: 'director', boundUid: 'acct-1' }), 'half a record (no Google identity) lets nobody in');
check(!signInHonoured(claims('google.com'), { ...TIED, googleSub: '' }), 'a blank Google identity lets nobody in');
check(!signInHonoured(claims('google.com', ['']), { ...TIED, googleSub: '' }), 'a blank Google identity does not match a blank id');
check(!signInHonoured(claims('google.com', ['g-pat'], { uid: '' }), { ...TIED, boundUid: '' }), 'a blank account does not match a blank account id');
check(!signInHonoured(claims('google.com'), { ...TIED, googleSub: 7 }), 'a Google identity that is not text lets nobody in');
check(!signInHonoured(claims('google.com'), { ...TIED, boundUid: 7 }), 'an account id that is not text lets nobody in');
check(!signInHonoured(claims('google.com', []), TIED), 'a token with no Google identity is refused');
check(!signInHonoured(claims('google.com', 'g-pat'), TIED), 'a Google identity that is not a list is refused');
check(!signInHonoured(claims('google.com'), undefined), 'no directors doc: refused');
check(!signInHonoured({ uid: 'acct-1', email: 'pat@school.test', email_verified: true }, TIED), 'a token with no firebase claim is refused');

// ── Every other way in ──────────────────────────────────────────────────────
for (const provider of ['password', 'anonymous', 'custom', 'phone', 'microsoft.com', 'apple.com', '', undefined]) {
  check(!signInHonoured(claims(provider), TIED), `"${provider}" is refused even on the right account with the right Google identity`);
}

// ── staffFromToken ──────────────────────────────────────────────────────────
{
  const load = async (email: string) => (email === 'pat@school.test' ? TIED : undefined);
  let loads = 0;
  const counting = async (email: string) => { loads++; return load(email); };
  check(await staffFromToken(claims('google.com', ['g-pat'], { email_verified: false }), counting) === null && loads === 0, 'an unverified email is refused before anything is read');
  check(await staffFromToken(claims('google.com', ['g-pat'], { email: undefined }), counting) === null && loads === 0, 'a token with no email is refused before anything is read');
  const g = await staffFromToken(claims('google.com'), load);
  check(g?.email === 'pat@school.test' && g.director === TIED, 'the entry\'s own account: the email and the directors doc come back');
  check(await staffFromToken(claims('google.com', ['g-pat'], { uid: 'other' }), load) === null, 'another account on a listed address: null');
  check(await staffFromToken(claims('google.com', ['g-someone-else']), load) === null, 'another Google identity on a listed address: null');
  check(await staffFromToken(claims('password'), load) === null, 'a password sign-in on a listed address: null');
  const stranger = await staffFromToken(claims('google.com', ['g-x'], { email: 'x@elsewhere.test' }), load);
  check(stranger !== null && stranger.director === undefined, 'an address that is not listed comes back with NO doc, for the role check to refuse as it always did');
}

// ── The three copies agree, read from the source ────────────────────────────
{
  const here = dirname(fileURLToPath(import.meta.url));
  const repo = resolve(here, '../..');
  const noComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
  const fnIn = (src: string) => (name: string) => {
    const at = src.indexOf(`function ${name}(`);
    return at < 0 ? '' : squash(src.slice(at, src.indexOf('\n    }', at)));
  };
  const fsRules = noComments(readFileSync(resolve(repo, 'firestore.rules'), 'utf8'));
  const stRules = noComments(readFileSync(resolve(repo, 'storage.rules'), 'utf8'));
  const fsFn = fnIn(fsRules);
  const stFn = fnIn(stRules);

  // Firestore: bound, or (only while the server-only switch is off) no
  // record yet. The bound clause first, so a bound person never costs a
  // switch read.
  check(fsFn('honouredSignIn') === "function honouredSignIn() { return request.auth.token.firebase.sign_in_provider == 'google.com' && (boundGoogleSignIn() || !googleTieRequired());",
    'firestore.rules honouredSignIn: Google, and bound or the requirement not yet on');
  check(fsFn('googleTieRequired') === "function googleTieRequired() { return exists(/databases/$(database)/documents/serverConfig/signIn) && get(/databases/$(database)/documents/serverConfig/signIn).data.get('googleTieRequired', false) == true;",
    'the switch is serverConfig/signIn.googleTieRequired, and a missing document means "not required"');
  // Storage: always bound. No switch (a Storage rule may read two Firestore
  // documents and these already use both).
  check(stFn('honouredSignIn') === "function honouredSignIn() { return request.auth.token.firebase.sign_in_provider == 'google.com' && boundGoogleSignIn();",
    'storage.rules honouredSignIn: Google and bound, always');
  check(!/serverConfig/.test(stRules), 'storage.rules reads no switch');
  const same: [string, string][] = [
    ['isBoundGoogleAccount', "function isBoundGoogleAccount(d) { return isBoundAccount(d.get('boundUid', '')) && isTiedGoogleId(d.get('googleSub', ''));"],
    ['isBoundAccount', "function isBoundAccount(boundUid) { return boundUid is string && boundUid != '' && boundUid == request.auth.uid;"],
    ['isTiedGoogleId', "function isTiedGoogleId(googleSub) { return googleSub is string && googleSub != '' && 'google.com' in request.auth.token.firebase.identities && googleSub in request.auth.token.firebase.identities['google.com'];"],
  ];
  for (const [name, text] of same) {
    check(fsFn(name) === text, `firestore.rules ${name} is the agreed test`);
    check(stFn(name) === text, `storage.rules ${name} is word for word the same`);
  }
  check(fsFn('boundGoogleSignIn') === 'function boundGoogleSignIn() { return exists(/databases/$(database)/documents/directors/$(request.auth.token.email)) && isBoundGoogleAccount(myDirectorDoc());',
    'firestore.rules reads the record off the caller\'s own directors doc, and a missing doc is a plain no');
  check(stFn('boundGoogleSignIn') === 'function boundGoogleSignIn() { return isBoundGoogleAccount(directorDoc());',
    'storage.rules reads the record off the caller\'s own directors doc');
  for (const g of [...stRules.matchAll(/function (\w+)\([^)]*\) \{[^}]*honouredSignIn\(\)[^}]*\}/g)]) {
    check(g[0].indexOf('firestore.exists(') >= 0 && g[0].indexOf('firestore.exists(') < g[0].indexOf('honouredSignIn()'), `storage.rules: ${g[1]}() checks the directors doc exists before reading the record off it`);
  }

  // Every staff gate: wherever a rules file asks for a verified email, the
  // same function must also ask how the token signed in.
  check(fsFn('signedIn') === 'function signedIn() { return request.auth != null && request.auth.token.email_verified == true && exists(/databases/$(database)/documents/directors/$(request.auth.token.email)) && honouredSignIn();', 'firestore.rules signedIn is the agreed gate');
  check(fsFn('verifiedSelf') === 'function verifiedSelf(email) { return request.auth != null && request.auth.token.email_verified == true && request.auth.token.email == email && honouredSignIn();', 'firestore.rules verifiedSelf is the agreed gate');
  for (const [name, rules] of [['firestore.rules', fsRules], ['storage.rules', stRules]] as const) {
    const gates = [...rules.matchAll(/function (\w+)\([^)]*\) \{[^}]*email_verified == true[^}]*\}/g)];
    check(gates.length > 0, `${name}: found the verified-email gates`);
    for (const g of gates) check(/honouredSignIn\(\)/.test(g[0]), `${name}: ${g[1]}() also applies honouredSignIn()`);
    const loose = (rules.match(/email_verified == true/g) ?? []).length;
    check(loose === gates.length, `${name}: no verified-email check sits outside a gate function (${loose} vs ${gates.length})`);
  }
  check((fsRules.match(/request\.auth != null/g) ?? []).length === 2, 'firestore.rules still has exactly its two sign-in gates (signedIn, verifiedSelf)');
  check((fsRules.match(/request\.auth\.uid/g) ?? []).length === 1 && (stRules.match(/request\.auth\.uid/g) ?? []).length === 1, 'the account id is read in one place in each file: isBoundAccount');

  // Every role helper goes through the gate. hasRole is the one place a
  // role is read, and it asks signedIn() first; anything else that reads
  // the caller's directors doc must ask a role helper in the same breath.
  check(fsFn('hasRole') === "function hasRole(r) { let d = myDirectorDoc(); return signedIn() && ( (d.keys().hasAny(['roles']) && r in d.get('roles', [])) || (!d.keys().hasAny(['roles']) && d.get('role', 'director') == r) );",
    'hasRole asks signedIn() before it reads a role');
  const readers = [...fsRules.matchAll(/function (\w+)\([^)]*\) \{([\s\S]*?)\n    \}/g)].filter(m => /myDirectorDoc\(\)/.test(m[2]));
  check(readers.length >= 5, 'found the functions that read the caller\'s directors doc');
  for (const [, name, body] of readers) {
    if (name === 'hasRole' || name === 'boundGoogleSignIn' || name === 'roleClaimValid') continue;
    check(/\b(is\w+Role|hasRole)\(/.test(body), `${name}() reads the caller's directors doc only behind a role helper`);
  }
  // roleClaimValid only compares a label; each rule that uses it asks
  // isKnownRole() first.
  const claimUses = [...fsRules.matchAll(/allow create: if ([^;]*roleClaimValid\([^;]*);/g)];
  check(claimUses.length === 2 && claimUses.every(m => m[1].startsWith('isKnownRole()')), 'roleClaimValid is used only in rules that begin with isKnownRole()');
  check(!/myDirectorDoc\(\)/.test(fsRules.slice(fsRules.indexOf('match /directors/{email}'))) , 'no rule below the helpers reads the caller\'s directors doc directly');
  const stRole = stFn('hasRole');
  for (const g of ['isStaff', 'isTeacher', 'isClassroom', 'isAssistant']) {
    check(/honouredSignIn\(\)/.test(stFn(g)) && /email_verified == true/.test(stFn(g)), `storage.rules ${g}() is a full gate`);
  }
  check(stRole !== '' && [...stRules.matchAll(/hasRole\(/g)].length >= 4, 'storage.rules reads roles through hasRole, inside those gates');

  // The switch is the server's alone, and nothing else can match it.
  check(/match \/serverConfig\/\{doc\}\s*\{ allow read: if isOwner\(\); allow write: if false; \}/.test(fsRules), 'no client can write the switch; only the Owner can read it');
  check((fsRules.match(/serverConfig\/\{/g) ?? []).length === 1 && (fsRules.match(/match \/serverConfig/g) ?? []).length === 1, 'exactly one rule names serverConfig');
  const wild = fsRules.match(/match \/\{[^}]*\}[^\n]*/g) ?? [];
  check(wild.length === 1 && /^match \/\{document=\*\*\}\s*\{ allow read, write: if false; \}$/.test(wild[0].trim()), 'the only rule that matches every path is the final deny');

  // Functions: one door for a caller's token, and the role checked after it.
  const index = noComments(readFileSync(resolve(repo, 'functions/src/index.ts'), 'utf8'));
  const helper = index.slice(index.indexOf('async function staffFromIdToken'), index.indexOf('function pushDeps'));
  check(/verifyIdToken\(idToken\)/.test(helper) && /staffFromToken\(decoded,/.test(helper), 'staffFromIdToken verifies the token and applies staffFromToken');
  const binder = index.slice(index.indexOf('export const bindGoogle'));
  const elsewhere = index.replace(helper, '').replace(binder.slice(0, binder.indexOf('\n});')), '');
  check(!/verifyIdToken\(/.test(elsewhere), 'no other function verifies a token itself (bindGoogle aside, which is what makes the record)');
  check(!/email_verified/.test(index), 'index.ts reads email_verified nowhere itself');
  const doors = [...elsewhere.matchAll(/staffFromIdToken\(idToken\)/g)];
  check(doors.length === (elsewhere.match(/startsWith\('Bearer '\)/g) ?? []).length && doors.length >= 2,
    'every other function that takes a Bearer token puts it through staffFromIdToken');
  // staffFromToken hands back an unlisted caller with no doc, on purpose. So
  // each door must be followed, before anything else is done, by the null
  // check and then the role check.
  for (const d of doors) {
    const after = squash(elsewhere.slice(d.index!, d.index! + 600));
    check(/^staffFromIdToken\(idToken\); if \(!staff\) \{ refuse\(401, [^)]*\); return; \}/.test(after), 'a caller the Hub does not honour is refused at once');
    const role = after.indexOf('if (!hasKnownRole(staff.director)) { refuse(403,');
    check(role > 0 && !/await /.test(after.slice(after.indexOf('return; }'), role)), 'and the role is checked next, before anything is read or done');
  }
}

if (failures) {
  console.error(`staff token self-check: ${failures} failure(s)`);
  process.exit(1);
}
console.log('staff token self-check: ok');
