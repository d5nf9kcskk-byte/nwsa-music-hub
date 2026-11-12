/**
 * The staff sign-in test (#google-binding). Run:
 *   node --experimental-strip-types functions/src/staffToken.selfcheck.ts
 *
 * Pins signInHonoured / staffFromToken, and reads the two rules files and
 * index.ts to keep the three copies of the test telling the same story:
 *   • a Google sign-in is honoured only for the Google account the entry is
 *     tied to;
 *   • every other way in is refused;
 *   • every staff gate in firestore.rules and storage.rules applies the
 *     test, and no client can set or alter the tie;
 *   • every function that verifies a token to learn who is asking does it
 *     through the one helper.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { signInHonoured, staffFromToken, type StaffClaims } from './staffToken.ts';

let failures = 0;
function check(cond: unknown, msg: string) {
  if (!cond) { failures++; console.error(`  ✗ ${msg}`); }
}

const TIED = { role: 'director', googleSub: 'g-pat', googleBoundAt: 1 };
const claims = (provider: string | undefined, ids: unknown = ['g-pat'], over: Partial<StaffClaims> = {}): StaffClaims => ({
  uid: 'acct-1', email: 'pat@school.test', email_verified: true,
  firebase: { ...(provider === undefined ? {} : { sign_in_provider: provider }), identities: { 'google.com': ids, email: ['pat@school.test'] } },
  ...over,
});

// ── Google: only the account the entry is tied to ───────────────────────────
check(signInHonoured(claims('google.com'), TIED), 'the Google account the entry is tied to is honoured');
check(signInHonoured(claims('google.com', ['g-pat'], { uid: 'a-different-hub-account' }), TIED), 'whatever the Hub\'s own account id is: it is Google\'s id for the person that counts');
check(!signInHonoured(claims('google.com', ['g-someone-else']), TIED), 'a different Google account carrying the same address is refused');
check(!signInHonoured(claims('google.com'), { role: 'director' }), 'an entry that is not tied yet lets nobody in');
check(!signInHonoured(claims('google.com'), { role: 'director', googleSub: '' }), 'a blank tie lets nobody in');
check(!signInHonoured(claims('google.com', ['']), { role: 'director', googleSub: '' }), 'a blank tie does not match a blank id');
check(!signInHonoured(claims('google.com'), { role: 'director', googleSub: 7 }), 'a tie that is not text lets nobody in');
check(!signInHonoured(claims('google.com', []), TIED), 'a token with no Google identity is refused');
check(!signInHonoured(claims('google.com', 'g-pat'), TIED), 'a Google identity that is not a list is refused');
check(!signInHonoured(claims('google.com'), undefined), 'no directors doc: refused');
check(!signInHonoured({ uid: 'acct-1', email: 'pat@school.test', email_verified: true }, TIED), 'a token with no firebase claim is refused');

// ── Every other way in ──────────────────────────────────────────────────────
for (const provider of ['password', 'anonymous', 'custom', 'phone', 'microsoft.com', 'apple.com', '', undefined]) {
  check(!signInHonoured(claims(provider), TIED), `"${provider}" is refused even with the tied Google identity on the account`);
}

// ── staffFromToken ──────────────────────────────────────────────────────────
{
  const load = async (email: string) => (email === 'pat@school.test' ? TIED : undefined);
  let loads = 0;
  const counting = async (email: string) => { loads++; return load(email); };
  check(await staffFromToken(claims('google.com', ['g-pat'], { email_verified: false }), counting) === null && loads === 0, 'an unverified email is refused before anything is read');
  check(await staffFromToken(claims('google.com', ['g-pat'], { email: undefined }), counting) === null && loads === 0, 'a token with no email is refused before anything is read');
  const g = await staffFromToken(claims('google.com'), load);
  check(g?.email === 'pat@school.test' && g.director === TIED, 'the tied Google account: the email and the directors doc come back');
  check(await staffFromToken(claims('google.com', ['g-someone-else']), load) === null, 'another Google account on a listed address: null');
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
  const fn = (src: string, name: string) => {
    const at = src.indexOf(`function ${name}(`);
    return at < 0 ? '' : squash(src.slice(at, src.indexOf('\n    }', at)));
  };
  const fsRules = noComments(readFileSync(resolve(repo, 'firestore.rules'), 'utf8'));
  const stRules = noComments(readFileSync(resolve(repo, 'storage.rules'), 'utf8'));

  // Firestore: the tie, or (only while the server-only switch is off) no tie
  // yet. The tied clause first, so a tied person never costs a switch read.
  check(fn(fsRules, 'honouredSignIn') === "function honouredSignIn() { return request.auth.token.firebase.sign_in_provider == 'google.com' && (boundGoogleSignIn() || !googleTieRequired());",
    'firestore.rules honouredSignIn: Google, and tied or the tie not yet required');
  check(fn(fsRules, 'googleTieRequired') === "function googleTieRequired() { return exists(/databases/$(database)/documents/serverConfig/signIn) && get(/databases/$(database)/documents/serverConfig/signIn).data.get('googleTieRequired', false) == true;",
    'the switch is serverConfig/signIn.googleTieRequired, and a missing document means "not required"');
  check(/match \/serverConfig\/\{doc\}\s*\{ allow read, write: if false; \}/.test(fsRules), 'no client can read or write the switch');
  // Storage: always the tie. No switch (a Storage rule may read two Firestore
  // documents and these already use both).
  check(fn(stRules, 'honouredSignIn') === "function honouredSignIn() { return request.auth.token.firebase.sign_in_provider == 'google.com' && boundGoogleSignIn();",
    'storage.rules honouredSignIn: Google and tied, always');
  check(!/serverConfig/.test(stRules), 'storage.rules reads no switch');
  const tied = "function isTiedGoogleId(googleSub) { return googleSub is string && googleSub != '' && googleSub in request.auth.token.firebase.identities['google.com'];";
  check(fn(fsRules, 'isTiedGoogleId') === tied, 'firestore.rules isTiedGoogleId is the agreed tie test');
  check(fn(stRules, 'isTiedGoogleId') === tied, 'storage.rules isTiedGoogleId is word for word the same');
  check(fn(fsRules, 'boundGoogleSignIn') === "function boundGoogleSignIn() { return exists(/databases/$(database)/documents/directors/$(request.auth.token.email)) && isTiedGoogleId(myDirectorDoc().get('googleSub', ''));",
    'firestore.rules reads the tie off the caller\'s own directors doc, and a missing doc is a plain no');
  check(fn(stRules, 'boundGoogleSignIn') === "function boundGoogleSignIn() { return isTiedGoogleId(directorDoc().get('googleSub', ''));",
    'storage.rules reads the tie off the caller\'s own directors doc');
  for (const g of [...stRules.matchAll(/function (\w+)\([^)]*\) \{[^}]*honouredSignIn\(\)[^}]*\}/g)]) {
    check(g[0].indexOf('firestore.exists(') >= 0 && g[0].indexOf('firestore.exists(') < g[0].indexOf('honouredSignIn()'), `storage.rules: ${g[1]}() checks the directors doc exists before reading the tie off it`);
  }

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

  // The tie is the server's alone.
  const directors = fsRules.slice(fsRules.indexOf('match /directors/{email} {'));
  const block = directors.slice(0, directors.indexOf('\n    }'));
  check(/allow create: if isOwner\(\)\s*&& !request\.resource\.data\.keys\(\)\.hasAny\(\['googleSub', 'googleBoundAt'\]\);/.test(block), 'no create may carry the tie');
  check(/allow update: if \(isOwner\(\)[\s\S]*\)\s*&& \(tieKept\(\) \|\| \(tieCleared\(\) && isOwner\(\) && request\.auth\.token\.email != email\)\);/.test(block),
    'an update leaves the tie as it is, or the Owner clears someone ELSE\'s whole');
  const selfList = block.match(/hasOnly\(\[([^\]]*)\]\)/)?.[1] ?? 'googleSub';
  check(!/google/i.test(selfList), 'the self-service key list does not name the tie');
  check(fn(fsRules, 'tieKept') === "function tieKept() { return !request.resource.data.diff(resource.data).affectedKeys() .hasAny(['googleSub', 'googleBoundAt']);", 'tieKept: neither field is touched');
  check(fn(fsRules, 'tieCleared') === "function tieCleared() { return !request.resource.data.keys().hasAny(['googleSub', 'googleBoundAt']);", 'tieCleared: both fields are gone');

  // Functions: one door for a caller's token.
  const index = noComments(readFileSync(resolve(repo, 'functions/src/index.ts'), 'utf8'));
  const helper = index.slice(index.indexOf('async function staffFromIdToken'), index.indexOf('function pushDeps'));
  check(/verifyIdToken\(idToken\)/.test(helper) && /staffFromToken\(decoded,/.test(helper), 'staffFromIdToken verifies the token and applies staffFromToken');
  const binder = index.slice(index.indexOf('export const bindGoogle'));
  const elsewhere = index.replace(helper, '').replace(binder.slice(0, binder.indexOf('\n});')), '');
  check(!/verifyIdToken\(/.test(elsewhere), 'no other function verifies a token itself (bindGoogle aside, which is what makes the tie)');
  check(!/email_verified/.test(index), 'index.ts reads email_verified nowhere itself');
  check((elsewhere.match(/staffFromIdToken\(idToken\)/g) ?? []).length === (elsewhere.match(/startsWith\('Bearer '\)/g) ?? []).length,
    'every other function that takes a Bearer token puts it through staffFromIdToken');
}

if (failures) {
  console.error(`staff token self-check: ${failures} failure(s)`);
  process.exit(1);
}
console.log('staff token self-check: ok');
