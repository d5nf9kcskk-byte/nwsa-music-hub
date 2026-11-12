/**
 * The staff sign-in test (#password-sign-in). Run:
 *   node --experimental-strip-types functions/src/staffToken.selfcheck.ts
 *
 * Pins signInHonoured / staffFromToken, and reads the two rules files and
 * index.ts to keep the three copies of the test telling the same story:
 *   • Google is honoured whatever else is on the directors doc;
 *   • a password is honoured for the bound account only, and only for a
 *     sign-in strictly after the binding;
 *   • every other way in is refused;
 *   • every staff gate in firestore.rules and storage.rules applies the
 *     test, and no client can set or alter the binding;
 *   • every function that verifies a token does it through the one helper.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { signInHonoured, staffFromToken, type StaffClaims } from './staffToken.ts';

let failures = 0;
function check(cond: unknown, msg: string) {
  if (!cond) { failures++; console.error(`  ✗ ${msg}`); }
}

const BOUND = { role: 'director', passwordUid: 'acct-1', passwordBoundAt: 1000 };
const claims = (provider: string | undefined, over: Partial<StaffClaims> = {}): StaffClaims => ({
  uid: 'acct-1', email: 'a@school.test', email_verified: true, auth_time: 2000,
  firebase: provider === undefined ? {} : { sign_in_provider: provider }, ...over,
});

// ── Google: exactly as before ───────────────────────────────────────────────
check(signInHonoured(claims('google.com'), { role: 'director' }), 'Google is honoured for an unbound person');
check(signInHonoured(claims('google.com', { uid: 'someone-else', auth_time: 1 }), BOUND), 'Google is honoured whatever the binding says');
check(signInHonoured(claims('google.com'), undefined), 'Google passes the sign-in test with no directors doc (the role check refuses those)');

// ── Password: the bound account, after the binding, and nothing else ────────
check(signInHonoured(claims('password'), BOUND), 'the bound account, signed in after the binding, is honoured');
check(!signInHonoured(claims('password', { auth_time: 1000 }), BOUND), 'a sign-in in the binding second is refused');
check(!signInHonoured(claims('password', { auth_time: 999 }), BOUND), 'a sign-in before the binding is refused');
check(!signInHonoured(claims('password', { auth_time: undefined }), BOUND), 'a token with no sign-in time is refused');
check(!signInHonoured(claims('password', { uid: 'acct-2' }), BOUND), 'another account on the same address is refused');
check(signInHonoured({ ...claims('password'), uid: undefined, sub: 'acct-1' }, BOUND), 'the account id is read from sub when uid is absent');
check(!signInHonoured(claims('password'), { role: 'director' }), 'an unbound person is refused by password');
check(!signInHonoured(claims('password'), { role: 'director', passwordUid: 'acct-1' }), 'half a binding (no time) is refused');
check(!signInHonoured(claims('password'), { role: 'director', passwordBoundAt: 1000 }), 'half a binding (no account) is refused');
check(!signInHonoured(claims('password'), { ...BOUND, passwordBoundAt: 1000.5 }), 'a binding time that is not a whole number is refused');
check(!signInHonoured(claims('password'), { ...BOUND, passwordBoundAt: '1000' }), 'a binding time that is not a number is refused');
check(!signInHonoured(claims('password', { uid: '' }), { ...BOUND, passwordUid: '' }), 'an empty account id never matches');
check(!signInHonoured(claims('password'), undefined), 'no directors doc: refused');

// ── Every other way in ──────────────────────────────────────────────────────
for (const provider of ['anonymous', 'custom', 'phone', 'microsoft.com', 'apple.com', '', undefined]) {
  check(!signInHonoured(claims(provider), BOUND), `"${provider}" is refused even on the bound account`);
}
check(!signInHonoured({ uid: 'acct-1', email: 'a@school.test', email_verified: true, auth_time: 2000 }, BOUND), 'a token with no firebase claim is refused');

// ── staffFromToken ──────────────────────────────────────────────────────────
{
  const load = async (email: string) => (email === 'a@school.test' ? BOUND : undefined);
  let loads = 0;
  const counting = async (email: string) => { loads++; return load(email); };
  check(await staffFromToken(claims('google.com', { email_verified: false }), counting) === null && loads === 0, 'an unverified email is refused before anything is read');
  check(await staffFromToken(claims('google.com', { email: undefined }), counting) === null && loads === 0, 'a token with no email is refused before anything is read');
  const g = await staffFromToken(claims('google.com'), load);
  check(g?.email === 'a@school.test' && g.director === BOUND, 'Google: the email and the directors doc come back');
  const stranger = await staffFromToken(claims('google.com', { email: 'x@elsewhere.test' }), load);
  check(stranger !== null && stranger.director === undefined, 'an unlisted Google account comes back with NO doc, for the role check to refuse');
  check(await staffFromToken(claims('password', { uid: 'acct-2' }), load) === null, 'a password on another account: null');
  check((await staffFromToken(claims('password'), load))?.email === 'a@school.test', 'the bound password account: honoured');
}

// ── The three copies agree, read from the source ────────────────────────────
{
  const here = dirname(fileURLToPath(import.meta.url));
  const repo = resolve(here, '../..');
  const noComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
  const fn = (src: string, name: string) => {
    const at = src.indexOf(`function ${name}(`);
    return at < 0 ? '' : squash(src.slice(at, src.indexOf('\n    }', at)));
  };
  const fsRules = noComments(readFileSync(resolve(repo, 'firestore.rules'), 'utf8'));
  const stRules = noComments(readFileSync(resolve(repo, 'storage.rules'), 'utf8'));

  const want = "function honouredSignIn() { return request.auth.token.firebase.sign_in_provider == 'google.com' || (request.auth.token.firebase.sign_in_provider == 'password' && boundPasswordSignIn());";
  check(fn(fsRules, 'honouredSignIn') === want, 'firestore.rules honouredSignIn is the agreed test, Google first');
  check(fn(stRules, 'honouredSignIn') === want, 'storage.rules honouredSignIn is word for word the same');
  const bound = (doc: string) => `function boundPasswordSignIn() { let d = ${doc}(); return d.keys().hasAll(['passwordUid', 'passwordBoundAt']) && d.passwordUid is string && d.passwordBoundAt is int && d.passwordUid == request.auth.uid && request.auth.token.auth_time > d.passwordBoundAt;`;
  check(fn(fsRules, 'boundPasswordSignIn') === bound('myDirectorDoc'), 'firestore.rules boundPasswordSignIn is the agreed binding test');
  check(fn(stRules, 'boundPasswordSignIn') === bound('directorDoc'), 'storage.rules boundPasswordSignIn is the same test');

  // Every staff gate: wherever a rules file asks for a verified email, the
  // same function must also ask how the token signed in.
  for (const [name, rules] of [['firestore.rules', fsRules], ['storage.rules', stRules]] as const) {
    const gates = [...rules.matchAll(/function (\w+)\([^)]*\) \{[^}]*email_verified == true[^}]*\}/g)];
    check(gates.length > 0, `${name}: found the verified-email gates`);
    for (const g of gates) check(/honouredSignIn\(\)/.test(g[0]), `${name}: ${g[1]}() also applies honouredSignIn()`);
    const loose = (rules.match(/email_verified == true/g) ?? []).length;
    check(loose === gates.length, `${name}: no verified-email check sits outside a gate function (${loose} vs ${gates.length})`);
  }
  check((fsRules.match(/request\.auth != null/g) ?? []).length === 2, 'firestore.rules still has exactly its two sign-in gates (signedIn, verifiedSelf)');

  // The binding is the server's alone.
  const directors = fsRules.slice(fsRules.indexOf('match /directors/{email} {'));
  const block = directors.slice(0, directors.indexOf('\n    }'));
  check(/allow create: if isOwner\(\)\s*&& !request\.resource\.data\.keys\(\)\.hasAny\(\['passwordUid', 'passwordBoundAt'\]\);/.test(block), 'no create may carry the binding');
  check(/allow update: if \(isOwner\(\)[\s\S]*\)\s*&& bindingUntouched\(\);/.test(block), 'every update, the Owner\'s included, must leave the binding untouched');
  const selfList = block.match(/hasOnly\(\[([^\]]*)\]\)/)?.[1] ?? 'passwordUid';
  check(!/password/.test(selfList), 'the self-service key list does not name the binding');
  check(squash(fn(fsRules, 'bindingUntouched')) === "function bindingUntouched() { return !request.resource.data.diff(resource.data).affectedKeys() .hasAny(['passwordUid', 'passwordBoundAt']) || !request.resource.data.keys().hasAny(['passwordUid', 'passwordBoundAt']);",
    'bindingUntouched: unchanged, or gone whole; never set, never altered');
  for (const server of ['passwordSetup', 'passwordSetupLimits']) {
    check(!new RegExp(`match /${server}/`).test(fsRules), `firestore.rules has no match for ${server}: it is the server's alone`);
  }
  check(/match \/mail\/\{doc\}\s*\{ allow read, write: if false; \}/.test(fsRules), 'mail (where the link email is queued) is denied to every client');
  check(/match \/\{document=\*\*\}\s*\{ allow read, write: if false; \}/.test(fsRules), 'and everything unmatched is denied by default');

  // Functions: one door for a caller's token.
  const index = noComments(readFileSync(resolve(repo, 'functions/src/index.ts'), 'utf8'));
  check((index.match(/verifyIdToken\(/g) ?? []).length === 1, 'index.ts verifies an ID token in exactly one place');
  const helper = index.slice(index.indexOf('async function staffFromIdToken'), index.indexOf('function pushDeps'));
  check(/verifyIdToken\(idToken\)/.test(helper) && /staffFromToken\(decoded,/.test(helper), 'and that place is staffFromIdToken, which applies staffFromToken');
  check(!/email_verified/.test(index), 'index.ts reads email_verified nowhere itself');
  check((index.match(/staffFromIdToken\(idToken\)/g) ?? []).length === (index.match(/startsWith\('Bearer '\)/g) ?? []).length,
    'every function that takes a Bearer token puts it through staffFromIdToken');
}

if (failures) {
  console.error(`staff token self-check: ${failures} failure(s)`);
  process.exit(1);
}
console.log('staff token self-check: ok');
