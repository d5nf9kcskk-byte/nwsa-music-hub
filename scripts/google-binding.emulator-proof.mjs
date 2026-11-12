#!/usr/bin/env node
/**
 * Proof that each listed person is tied to their own Google account
 * (#google-binding).
 *
 * Real sign-ins on the Auth emulator; every verdict comes from the REAL
 * firestore.rules and storage.rules, judging the token the sign-in service
 * actually minted, and from the same staff test the Cloud Functions use
 * (functions/src/staffToken.ts). Tying a person runs the REAL bindGoogle
 * (functions/src/googleBinding.ts) over the real store
 * (googleBindingStore.ts, freshAccount.ts, entryLock.ts) and the real Admin
 * SDK, on the claims of a token the Admin SDK verified and on what Google
 * said at that sign-in: what the `bindGoogle` function does, minus its HTTP
 * wrapper and the signature on Google's token. (The emulator's stand-in for
 * Google signs nothing, so this script reads what it says directly; the real
 * signature check is functions/src/googleIdToken.ts, and its self-check runs
 * it against keys of its own.)
 *
 * Three gates are asked, and reported separately, because they are meant to
 * differ in one situation (see the top of storage.rules):
 *   Firestore   the person's own directors doc, and the staff-only roster.
 *               The record is required once the server-only switch is on.
 *   Storage     a staff-only listing. Always required.
 *   Functions   verifyIdToken, staffFromToken, the role check. Always required.
 *
 * Nothing here can reach production: the project id starts with "demo-".
 *
 * Run from the repo root (it needs Java; on this Mac that is Homebrew's
 * keg-only openjdk):
 *
 *   PATH="/opt/homebrew/opt/openjdk/bin:$PATH" firebase emulators:exec \
 *     --config firebase.emulators.json --only auth,firestore,storage \
 *     --project demo-google-binding \
 *     "node scripts/google-binding.emulator-proof.mjs"
 *
 * It runs in CI before every rules deploy and every functions deploy, and on
 * pull requests that touch the rules (.github/workflows/rules-checks.yml).
 *
 * What an emulator can and cannot prove: the rules verdicts are exact (same
 * rules engine as production). What the sign-in service itself does when an
 * address already has an account is the emulator's MODEL of production. The
 * design leans on one thing about the service that holds in both: a deleted
 * account's sessions cannot be renewed.
 */
import { initializeApp, deleteApp } from 'firebase/app';
import {
  getAuth, connectAuthEmulator, signInAnonymously, signInWithEmailAndPassword,
  signInWithCredential, GoogleAuthProvider,
} from 'firebase/auth';
import { initializeApp as initializeAdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore, FieldValue } from 'firebase-admin/firestore';
import { bindGoogle } from '../functions/src/googleBinding.ts';
import { googleBindingStore } from '../functions/src/googleBindingStore.ts';
import { staffFromToken } from '../functions/src/staffToken.ts';

const PROJECT = process.env.GCLOUD_PROJECT || 'demo-google-binding';
if (!PROJECT.startsWith('demo-')) {
  console.error(`Refusing to run against "${PROJECT}": the project id must start with demo-.`);
  process.exit(2);
}
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const FS_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const ST_HOST = process.env.FIREBASE_STORAGE_EMULATOR_HOST || '127.0.0.1:9199';
// The Admin SDK talks to the emulators only when these are set. Set them
// BEFORE the admin app exists, so it cannot go looking for the real thing.
process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_HOST;
process.env.FIRESTORE_EMULATOR_HOST = FS_HOST;
const BUCKET = `${PROJECT}.appspot.com`;
const adminApp = initializeAdminApp({ projectId: PROJECT });
const adminAuth = getAdminAuth(adminApp);
const adminDb = getAdminFirestore(adminApp);
/**
 * What Google said at a sign-in. On the emulators the "token" is the JSON
 * the sign-in was made with; in production it is a token Google signed, and
 * googleIdToken.ts checks the signature before reading these same fields.
 */
const whatGoogleSays = async token => {
  try {
    const c = JSON.parse(String(token));
    if (typeof c.sub !== 'string' || typeof c.email !== 'string') return null;
    return { sub: c.sub, email: c.email.toLowerCase(), emailVerified: c.email_verified === true };
  } catch { return null; }
};
const store = googleBindingStore(adminDb, adminAuth, whatGoogleSays);

const apps = [];
/** One browser: its own sign-in state. */
function device(name) {
  const app = initializeApp({ apiKey: 'demo-key', projectId: PROJECT }, `${name}-${apps.length}`);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${AUTH_HOST}`, { disableWarnings: true });
  return { name, auth };
}

/** What the Owner pressing Add writes. Nothing else happens when someone is listed. */
const list = (email, role = 'director') =>
  adminDb.doc(`directors/${email}`).set(role ? { email, roles: [role], addedAt: 1 } : { email, addedAt: 1 });
const entry = async email => (await adminDb.doc(`directors/${email}`).get()).data();
/** The server-only switch that firestore.rules reads. */
const requireTie = on => adminDb.doc('serverConfig/signIn').set({ googleTieRequired: on });
const RECORD = ['googleSub', 'boundUid', 'boundAt', 'passwordSet'];
/** What "Reset" (or the server's clear-owner) leaves: the record gone. */
const clearRecord = email => adminDb.doc(`directors/${email}`).update(Object.fromEntries(RECORD.map(k => [k, FieldValue.delete()])));

/** A Google sign-in as the emulator models it: Google says who this is. `id` is Google's id for the person. */
const googleSays = (email, id = `google-${email}`, verified = true) => JSON.stringify({ sub: id, email, email_verified: verified });
/** Sign in with Google on a device (a new one unless given). The device keeps what Google said, as the app does. */
const google = async (name, email, id, d = device(name), verified = true) => {
  d.googleToken = googleSays(email, id, verified);
  const { user } = await signInWithCredential(d.auth, GoogleAuthProvider.credential(d.googleToken));
  return { d, user };
};
const tokenOf = dev => dev.auth.currentUser.getIdToken();
/** Ask the sign-in service for a fresh token. The error code if it refuses. */
async function refresh(dev) {
  try { await dev.auth.currentUser.getIdToken(true); return 'ok'; }
  catch (e) { return e.code || String(e); }
}
const accountExists = async uid => { try { await adminAuth.getUser(uid); return true; } catch { return false; } };

/**
 * The claims of a token, as the `bindGoogle` function sees them. Against the
 * emulators the Admin SDK's verifyIdToken ALSO looks the account up, and so
 * throws for an account that has been deleted; in production it does not
 * (the function does not ask it to), and the token is good until it expires.
 * So for that one case the claims are read straight off the token here, to
 * put in front of bindGoogle what production would.
 */
async function claimsOf(idToken) {
  try { return await adminAuth.verifyIdToken(idToken); }
  catch (e) {
    if (e.code !== 'auth/user-not-found') throw e;
    const c = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8'));
    return { ...c, uid: c.user_id ?? c.sub };
  }
}
/** What the app does straight after a Google sign-in: ask the server, sending along what Google said. */
const askToBind = async (dev, googleToken = dev.googleToken) => bindGoogle(store, await claimsOf(await tokenOf(dev)), googleToken);
/**
 * The whole of what an up-to-date copy of the Hub does: sign in, ask, and
 * when the server says "again", open the fresh account with the same Google
 * sign-in on the same device (no second pop-up).
 */
async function openTheHub(name, email, id) {
  const first = await google(name, email, id);
  const answer = await askToBind(first.d);
  if (answer !== 'again') return { ...first, answer, firstUid: first.user.uid };
  const second = await google(name, email, id, first.d);
  return { ...second, answer, firstUid: first.user.uid };
}

// ── The three gates ─────────────────────────────────────────────────────────

const KNOWN_ROLES = ['owner', 'director', 'teacher', 'classroom', 'assistant'];
/** What pushTestAlert and draftChangeNoteEs do with a caller's token (staffFromIdToken + hasKnownRole in index.ts). */
async function functionsGate(idToken) {
  let decoded;
  try { decoded = await adminAuth.verifyIdToken(idToken); } catch { return false; }
  const staff = await staffFromToken(decoded, async email => (await adminDb.doc(`directors/${email}`).get()).data());
  if (!staff?.director) return false;
  const d = staff.director;
  return Array.isArray(d.roles) ? d.roles.some(r => KNOWN_ROLES.includes(String(r))) : KNOWN_ROLES.includes(d.role ?? 'director');
}
const fsGet = (path, idToken) => fetch(
  `http://${FS_HOST}/v1/projects/${PROJECT}/databases/(default)/documents/${path}`,
  { headers: idToken ? { Authorization: `Bearer ${idToken}` } : {} },
).then(r => r.status);
/** A staff-only listing in Storage (`allow list: if isStaff()` on submissions): Owner and Director only. */
const storageList = idToken => fetch(
  `http://${ST_HOST}/v0/b/${BUCKET}/o?prefix=${encodeURIComponent('submissions/a1/s1/')}&delimiter=%2F`,
  { headers: { Authorization: `Firebase ${idToken}` } },
).then(r => r.status);

/** Each gate's answer for this token. Firestore's two reads must agree with each other. */
async function gates(idToken, email) {
  const roster = await fsGet('students/probe', idToken);
  const own = await fsGet(`directors/${email}`, idToken);
  const listed = !!await entry(email);
  if (![200, 403].includes(roster) || (listed && (own === 200) !== (roster === 200))) {
    throw new Error(`Firestore disagrees with itself for ${email}: roster ${roster}, own doc ${own}`);
  }
  return { firestore: roster === 200, storage: await storageList(idToken) === 200, functions: await functionsGate(idToken) };
}
const tokenAll = async (idToken, email, want) => {
  const g = await gates(idToken, email);
  return g.firestore === want && g.storage === want && g.functions === want;
};
const all = async (dev, email, want) => tokenAll(await tokenOf(dev), email, want);
const shape = g => `Firestore ${g.firestore ? 'in' : 'out'}, Storage ${g.storage ? 'in' : 'out'}, functions ${g.functions ? 'in' : 'out'}`;

let failed = 0;
function must(ok, label) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failed++;
}
/** A starting condition a case relies on. Checked without a word; the case stops if it is not met. */
function need(ok, what) {
  if (!ok) throw new Error(`the starting condition was not met: ${what}`);
}
const section = title => console.log(`\n${title}`);

// ────────────────────────────────────────────────────────────────────────────

async function s1_switchOff() {
  section('(1) The switch is off: Firestore answers exactly as it does today');
  await requireTie(false);
  const email = 'ada@school.test';
  await list(email);
  const ada = await google('ada-laptop', email);
  const firstUid = ada.user.uid;
  const g = await gates(await tokenOf(ada.d), email);
  must(g.firestore === true, 'a listed person signed in with Google, no record yet: Firestore lets them in, as today');
  must(g.storage === false && g.functions === false, 'Storage and the functions wait for the record (they exist only where the server step does)');
  const stranger = await google('unlisted', 'nobody@elsewhere.test');
  const st = await tokenOf(stranger.d);
  must(await fsGet('students/probe', st) === 403 && await fsGet('directors/nobody@elsewhere.test', st) === 404,
    'a Google account that is not listed: refused, and told "no such entry" as today (not an error)');
  must(await askToBind(stranger.d) === 'not-listed' && !await entry('nobody@elsewhere.test'), 'asking does not put anyone on the list');
  must(await accountExists(stranger.user.uid) && await refresh(stranger.d) === 'ok', 'and the account of someone who is not listed is left alone');

  must(await askToBind(ada.d) === 'again', 'the app asks, and the server answers "sign in once more"');
  const e = await entry(email);
  must(e.googleSub === `google-${email}` && typeof e.boundUid === 'string' && Number.isInteger(e.boundAt), 'her entry now records Google\'s id for her and her Hub account');
  must(e.boundUid !== firstUid && !await accountExists(firstUid) && await accountExists(e.boundUid), 'the account on record is a FRESH one; the one she arrived on is gone');
  must(await refresh(ada.d) !== 'ok', 'the session she arrived on cannot be renewed');
  const again = await google('ada-laptop', email, undefined, ada.d);
  must(again.user.uid === e.boundUid, 'she signs in once more and is on the account on record');
  must(await all(again.d, email, true), 'and all three gates let her in');
  must(await askToBind(again.d) === 'bound' && (await entry(email)).boundUid === e.boundUid, 'asking again from there answers "bound" and changes nothing');

  {
    // An account the server did not make, with a password. Made here directly.
    const listed = 'abe@school.test';
    await list(listed);
    const account = await adminAuth.createUser({ email: listed, emailVerified: true, password: 'some password 0' });
    const d = device('password-account-switch-off');
    await signInWithEmailAndPassword(d.auth, listed, 'some password 0');
    const tok = await tokenOf(d);
    must(await fsGet('students/probe', tok) === 403 && await fsGet(`directors/${listed}`, tok) === 403 && await all(d, listed, false),
      'even with the switch off, a sign-in on a listed address that is not Google\'s is refused everywhere');
    await adminAuth.deleteUser(account.uid);
  }

  await adminDb.doc('serverConfig/signIn').delete();
  const bea = 'bea@school.test';
  await list(bea);
  const b = await google('bea-laptop', bea);
  must((await gates(await tokenOf(b.d), bea)).firestore === true, 'with no switch document at all (a demo project): the same as off');
}

async function s2_switchOn_everyRole() {
  section('(2) The switch is on: nobody in without a record, everybody in with one. Every role.');
  await requireTie(true);
  const roles = [['owner', 'owner'], ['director', 'director'], ['legacy', null], ['teacher', 'teacher'], ['classroom', 'classroom'], ['assistant', 'assistant']];
  for (const [who, role] of roles) {
    const email = `${who}@school.test`;
    await list(email, role);
    const p = await google(`${who}-phone`, email); // signed in on an up-to-date copy of the Hub
    const before = await gates(await tokenOf(p.d), email);
    const out = !before.firestore && !before.storage && !before.functions;
    const earlier = await tokenOf(p.d);
    const answer = await askToBind(p.d);
    const stillOut = await tokenAll(earlier, email, false);
    const again = await google(`${who}-phone`, email, undefined, p.d);
    const after = await gates(await tokenOf(again.d), email);
    // Storage's probe is an Owner-and-Director listing; the other roles' own Storage paths are covered by scripts/rules-verdicts.emulator-check.mjs.
    const storageWant = ['owner', 'director', 'legacy'].includes(who);
    must(out && answer === 'again' && stillOut && after.firestore && after.functions && after.storage === storageWant,
      `${who}: out before (${shape(before)}); the app asks, "${answer}"; still out until they sign in once more; then in`);
  }
}

async function s3_whoMayWriteTheRecord() {
  section('(3) Only the server writes the record');
  const owner = 'owner@school.test';
  const other = 'director@school.test';
  const o = await google('owner-laptop', owner);
  const d = await google('director-laptop', other);
  const ownerToken = await tokenOf(o.d);
  const otherToken = await tokenOf(d.d);
  const patch = (path, fields, mask, token) => fetch(
    `http://${FS_HOST}/v1/projects/${PROJECT}/databases/(default)/documents/${path}${mask ? `?${mask.map(m => `updateMask.fieldPaths=${m}`).join('&')}` : ''}`,
    { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) },
  ).then(r => r.status);
  const s = v => ({ stringValue: v });
  const n = v => ({ integerValue: String(v) });
  const roles = r => ({ arrayValue: { values: [s(r)] } });
  const before = await entry(other);
  const whole = e => ({ email: s(e.email), roles: roles(e.roles[0]), googleSub: s(e.googleSub), boundUid: s(e.boundUid), boundAt: n(e.boundAt), passwordSet: { booleanValue: e.passwordSet } });

  must(await patch(`directors/${other}`, { googleSub: s('some-other-google-account') }, ['googleSub'], ownerToken) === 403, 'the Owner cannot point a record at another Google account');
  must(await patch(`directors/${other}`, { boundUid: s('some-other-account') }, ['boundUid'], ownerToken) === 403, 'or at another Hub account');
  must(await patch(`directors/${other}`, { boundAt: n(1) }, ['boundAt'], ownerToken) === 403, 'or change when it was made');
  must(await patch('directors/new@school.test', { email: s('new@school.test'), roles: roles('director'), googleSub: s('x'), boundUid: s('y') }, null, ownerToken) === 403, 'the Owner cannot add a person who already has a record');
  must(await patch('directors/new@school.test', { email: s('new@school.test'), roles: roles('director') }, null, ownerToken) === 200, 'the Owner can add a person the ordinary way');
  must(await patch('directors/new@school.test', { googleSub: s('x'), boundUid: s('y') }, ['googleSub', 'boundUid'], ownerToken) === 403, 'and cannot give them a record afterwards');
  must(await patch(`directors/${other}`, { boundUid: s('x') }, ['boundUid'], otherToken) === 403, 'a person cannot alter their own record');
  must(await patch(`directors/${other}`, {}, RECORD, otherToken) === 403, 'or remove it');
  must(await patch(`directors/${other}`, { name: s('D. Example') }, ['name'], otherToken) === 200, 'but can still edit their own name');
  must(await patch(`directors/${other}`, { name: s('Director Example') }, ['name'], ownerToken) === 200, 'an ordinary edit by the Owner goes through');
  must(await patch(`directors/${owner}`, {}, RECORD, ownerToken) === 403, 'the Owner cannot remove their OWN record');
  must(await patch(`directors/${owner}`, { email: s(owner), roles: roles('owner') }, null, ownerToken) === 403, 'not even by writing their whole entry again without it');
  must(await patch(`directors/${other}`, whole(before), null, ownerToken) === 200, 'adding an address that is already listed, the way the app does it (the record rides along unchanged), is allowed');
  const now = await entry(other);
  must(RECORD.every(k => now[k] === before[k]), 'after all of that the record is exactly what the server wrote');
  must(await fsGet('serverConfig/signIn', ownerToken) === 200 && await patch('serverConfig/signIn', { googleTieRequired: { booleanValue: false } }, null, ownerToken) === 403,
    'the Owner\'s browser can read the switch (for the Directors screen) and cannot write it');
  must(await fsGet('serverConfig/signIn', otherToken) === 403 && await patch('serverConfig/signIn', { googleTieRequired: { booleanValue: false } }, null, otherToken) === 403,
    'nobody else can read it or write it');

  must(await patch(`directors/${other}`, {}, RECORD, ownerToken) === 200, 'the Owner CAN remove another person\'s record (Reset on the Directors screen)');
  must(await all(d.d, other, false), 'which lets that person in nowhere');
  must(await askToBind(d.d) === 'again', 'until they open the Hub again: the server makes the record again by itself');
  must(await all((await google('director-laptop', other, undefined, d.d)).d, other, true), 'and once they have signed in once more they are in');
}

async function s4_accountsTheServerWillNotTie() {
  section('(4) Accounts the server will not tie');
  {
    // An account the server did not make, with a password. Made here directly.
    const email = 'dee@school.test';
    await list(email);
    const account = await adminAuth.createUser({ email, emailVerified: true, password: 'some password 1' });
    const d = device('password-account');
    await signInWithEmailAndPassword(d.auth, email, 'some password 1');
    must(await all(d, email, false) && await askToBind(d) === 'mismatch' && await all(d, email, false) && await accountExists(account.uid),
      'an account the server did not make, signed in by password: refused, no record made, left as it is, still refused');
    await adminAuth.deleteUser(account.uid);
  }
  {
    // An account the server did not make, with an anonymous session. Made here directly.
    const email = 'eli@school.test';
    await list(email);
    const d = device('anonymous');
    const { user } = await signInAnonymously(d.auth);
    await adminAuth.updateUser(user.uid, { email, emailVerified: true });
    await user.getIdToken(true);
    must(await all(d, email, false) && await askToBind(d) === 'mismatch' && await all(d, email, false),
      'an account the server did not make, with an anonymous session: refused, no record made, still refused');
    await adminAuth.deleteUser(user.uid);
  }
  {
    const d = await google('odd-address', 'a/b@school.test');
    must(await askToBind(d.d) === 'mismatch', 'an address that could not be an entry\'s name: "mismatch", and nothing breaks');
  }
  {
    // The record is made from what GOOGLE says and nothing else. Here the
    // sign-in service calls the address verified and Google does not. The
    // account is made here directly.
    const email = 'flo@school.test';
    await list(email);
    const account = await adminAuth.createUser({ email, emailVerified: true });
    await adminAuth.updateUser(account.uid, { providerToLink: { providerId: 'google.com', uid: `google-${email}`, email } });
    const d = await google('google-does-not-vouch', email, undefined, undefined, false);
    need(d.user.uid === account.uid && (await claimsOf(await tokenOf(d.d))).email_verified === true, 'the session is on that account, which the sign-in service calls verified');
    must(await askToBind(d.d) === 'mismatch' && (await entry(email)).googleSub === undefined && await accountExists(account.uid),
      'Google does not say it has verified the address: "mismatch", no record, whatever the sign-in service says');
    must(await askToBind(d.d, undefined) === 'mismatch' && await askToBind(d.d, 'not a token') === 'mismatch' && (await entry(email)).googleSub === undefined,
      'a request with nothing from Google, or with something unreadable: "mismatch", no record');
    must(await askToBind(d.d, googleSays(email, 'google-somebody-else')) === 'mismatch' && (await entry(email)).googleSub === undefined,
      'what Google said about a different sign-in than the one this session made: "mismatch", no record');
    await adminAuth.deleteUser(account.uid);
  }
}

/**
 * The account on record is always a fresh one, so a session from before a
 * record is made does not carry over. The starting state is made here
 * directly.
 */
async function s5_aSessionFromBeforeDoesNotCarryOver() {
  section('(5) A session from before a record is made does not carry over');
  for (const order of ['the person asks straight away', 'the session from before asks first']) {
    const first = order.startsWith('the session');
    const email = first ? 'cal@school.test' : 'cyd@school.test';
    await list(email, 'owner');
    // An account the server did not make, with a session on it.
    const account = await adminAuth.createUser({ email, emailVerified: true });
    await adminAuth.updateUser(account.uid, { providerToLink: { providerId: 'google.com', uid: `google-other-${email}`, email: `other-${email}` } });
    const before = await google('a-session-from-before', `other-${email}`, `google-other-${email}`);
    need(before.user.uid === account.uid, 'the session is on that account');
    must(await all(before.d, email, false) && await askToBind(before.d) === 'mismatch' && (await entry(email)).googleSub === undefined,
      `(${order}) a session on an account the server did not make: refused everywhere, and no record is made`);

    // The person signs in with Google.
    const real = await google('the-person', email);
    if (first) {
      must(await askToBind(before.d) === 'mismatch' && (await entry(email)).googleSub === undefined,
        `(${order}) it is still not who Google says owns the address: "mismatch", and no record is made`);
    }
    const answer = await askToBind(real.d);
    must(answer === 'again', `(${order}) the person asks, and the server makes the record on a fresh account: "${answer}"`);
    const e = await entry(email);
    must(e.googleSub === `google-${email}` && e.boundUid !== account.uid && e.boundUid !== real.user.uid && !await accountExists(account.uid),
      'the record names a new account; the one from before is gone');
    must(await all(before.d, email, false), 'the session from before, with the token it holds: refused by Firestore, Storage and the functions');
    must(await refresh(before.d) !== 'ok', 'and it cannot get another');
    const realAgain = await google('the-person', email, undefined, real.d);
    must(realAgain.user.uid === e.boundUid && await all(realAgain.d, email, true), 'the same Google sign-in opens the account on record, and the person is in everywhere');
  }
}

async function s6_theOrdinaryCases() {
  section('(6) The ordinary cases');
  {
    const email = 'fay@school.test';
    await list(email);
    const old = await google('fay-phone-on-an-old-copy', email); // an old copy of the Hub never asks
    must(await all(old.d, email, false), 'an old copy of the Hub that never asks: out, until it is refreshed');
    await requireTie(false);
    must((await gates(await tokenOf(old.d), email)).firestore === true, '(with the switch off that same old copy is in, which is why the switch waits for everyone)');
    await requireTie(true);
    const laptop = await google('fay-laptop-signed-in-earlier', email); // a second device, signed in before the record exists
    must(await askToBind(old.d) === 'again', 'once refreshed it asks, and is told to sign in once more');
    const phone = await google('fay-phone', email, undefined, old.d);
    must(await all(phone.d, email, true), 'after which it is in');
    must(await all(laptop.d, email, false), 'her other device, signed in before: out');
    must(await askToBind(laptop.d) === 'again', 'it asks, and is told to sign in once more too');
    const laptopAgain = await google('fay-laptop', email, undefined, laptop.d);
    must(laptopAgain.user.uid === phone.user.uid && await all(laptopAgain.d, email, true) && await all(phone.d, email, true), 'it signs in once more: both devices are on the one account, and in');
    must(await askToBind(laptopAgain.d) === 'bound', 'and asking again changes nothing');
  }
  {
    // People with a record need nothing from the server step ever again.
    const email = 'gus@school.test';
    await list(email);
    await openTheHub('gus-phone', email);
    const later = await google('gus-phone-next-week', email); // no call to the server step at all
    must(await all(later.d, email, true), 'a person with a record signs in and is in with no help from the server step (it can be unreachable)');
  }
  {
    // The person's Google account itself changed: same address, a different Google account.
    const email = 'hal@school.test';
    await list(email);
    const first = await openTheHub('hal-old-google', email, 'google-hal-old');
    const second = await google('hal-new-google', email, 'google-hal-new');
    must(await all(second.d, email, false), 'a different Google account for the same address: out');
    must(await askToBind(second.d) === 'other-account' && (await entry(email)).googleSub === 'google-hal-old', 'the server will not move the record by itself: the person is told to ask the Owner');
    await adminDb.doc(`directors/${email}`).update({ googleSub: '', boundUid: '' });
    must(await all(second.d, email, false) && await all(first.d, email, false), 'a blank record lets nobody in');
    await clearRecord(email); // the Owner presses Reset
    const secondAgain = await openTheHub('hal-new-google', email, 'google-hal-new');
    must(secondAgain.answer === 'again' && (await entry(email)).googleSub === 'google-hal-new', 'after the Owner resets it, the person signs in and the server makes the record for the new Google account');
    must(await all(secondAgain.d, email, true), 'and they are in');
    must(await all(first.d, email, false) && await refresh(first.d) !== 'ok', 'the session from the old Google account is out, and cannot be renewed');
  }
  {
    // A Google identity the entry does not name is ON the account the entry
    // names. (The sign-in service decides what an account carries, not the
    // Hub.) The state is made here directly.
    const email = 'lou@school.test';
    await list(email);
    const lou = await openTheHub('lou-phone', email);
    const recorded = (await entry(email)).boundUid;
    need(lou.user.uid === recorded && await all(lou.d, email, true), 'recorded and in');
    await adminAuth.updateUser(recorded, { providerToLink: { providerId: 'google.com', uid: 'google-not-the-entrys', email } });
    const other = await google('another-google-identity', email, 'google-not-the-entrys');
    need(other.user.uid === recorded, 'the session is on the recorded account');
    must(await all(other.d, email, false), 'a Google identity the entry does not name, on the recorded account: refused everywhere');
    must(await askToBind(other.d) === 'other-account', 'it asks: "other-account"');
    const e = await entry(email);
    const made = await adminAuth.getUser(e.boundUid);
    must(e.googleSub === `google-${email}` && e.boundUid !== recorded && !await accountExists(recorded)
      && made.providerData.length === 1 && made.providerData[0].uid === `google-${email}`,
    'and the account is made afresh for the identity the entry DOES name: the record is not moved, and the old account is gone');
    must(await all(other.d, email, false) && await refresh(other.d) !== 'ok' && await refresh(lou.d) !== 'ok', 'every session on the old account is out and cannot be renewed');
    const louAgain = await google('lou-phone', email, undefined, lou.d);
    must(louAgain.user.uid === e.boundUid && await all(louAgain.d, email, true) && await askToBind(louAgain.d) === 'bound', 'the person signs in again, is on the account on record, and is in everywhere');
  }
  {
    const email = 'ivy@school.test';
    await list(email);
    const ivy = await openTheHub('ivy-phone', email);
    must(await all(ivy.d, email, true), 'recorded and in');
    await adminDb.doc(`directors/${email}`).delete();
    must(await all(ivy.d, email, false), 'taken off the list: out');
    must(await askToBind(ivy.d) === 'not-listed' && !await entry(email), 'and asking does not put her back');
    await list(email); // removed and added again: a new entry, with no record
    must(await all(ivy.d, email, false), 'added again: out until there is a record');
    must(await askToBind(ivy.d) === 'again' && await all((await google('ivy-phone', email, undefined, ivy.d)).d, email, true), 'the server makes it again by itself, she signs in once more, and she is in');
  }
  {
    // The account on record was deleted by hand (in the console, say).
    const email = 'kim@school.test';
    await list(email);
    const kim = await openTheHub('kim-phone', email);
    await adminAuth.deleteUser(kim.user.uid);
    const next = await google('kim-phone-later', email);
    must(next.user.uid !== (await entry(email)).boundUid && await all(next.d, email, false), 'the account on record is gone and she is on a new one: out');
    must(await askToBind(next.d) === 'again', 'the server makes her account afresh again, never adopting the one she is on');
    const e = await entry(email);
    must(e.boundUid !== next.user.uid && await all((await google('kim-phone-later', email, undefined, next.d)).d, email, true), 'and once signed in again she is in');
  }
}

async function s7_reversible() {
  section('(7) Turning the switch back off');
  const email = 'jon@school.test';
  await list(email);
  const jon = await google('jon-phone', email);
  must((await gates(await tokenOf(jon.d), email)).firestore === false, 'switch on, no record: Firestore out');
  await requireTie(false);
  must((await gates(await tokenOf(jon.d), email)).firestore === true, 'switch off: in again at once, with the same token. One write undoes it.');
  await requireTie(true);
}

async function s8_theStoreItself() {
  section('(8) The write step refuses by itself, and two requests at once do not interleave');
  {
    const email = 'max@school.test';
    await list(email);
    const max = await openTheHub('max-phone', email);
    const before = await entry(email);
    const refused = await store.tie(email, 'google-some-other-identity', 'some-other-account', Date.now());
    const after = await entry(email);
    must(refused === 'other-account' && RECORD.every(k => after[k] === before[k]),
      'the write step, asked directly to record a different Google identity: "other-account", and the record is untouched');
    must(await store.tie('nobody-listed@school.test', 'g', 'u', Date.now()) === 'not-listed' && !await entry('nobody-listed@school.test'),
      'asked about an address that is not listed: "not-listed", and no entry appears');
    must(await all(max.d, email, true), 'and the person is still in');
  }
  {
    // Two devices, signed in before there is a record, ask at the same moment.
    const email = 'ned@school.test';
    await list(email);
    const a = await google('ned-phone', email);
    const b = await google('ned-laptop', email);
    const answers = await Promise.allSettled([askToBind(a.d), askToBind(b.d)]);
    must(answers.every(r => r.status === 'fulfilled' && r.value === 'again'), 'two requests for one person at the same moment: neither fails, both are told "again"');
    const e = await entry(email);
    const standing = await adminAuth.getUserByEmail(email);
    must(standing.uid === e.boundUid && standing.providerData.length === 1 && standing.providerData[0].uid === e.googleSub,
      'one account stands on the address afterwards, and it is the one the record names');
    const a2 = await google('ned-phone', email, undefined, a.d);
    const b2 = await google('ned-laptop', email, undefined, b.d);
    must(a2.user.uid === e.boundUid && b2.user.uid === e.boundUid && await all(a2.d, email, true) && await all(b2.d, email, true),
      'both devices open it with the same Google sign-in and are in');
    must(!(await adminDb.doc(`signInLocks/${email}`).get()).exists, 'and the claim that kept them apart has been let go');
  }
  {
    // A claim left behind by a request that died. Made here directly.
    const email = 'ona@school.test';
    await list(email);
    const ona = await google('ona-phone', email);
    await adminDb.doc(`signInLocks/${email}`).set({ at: Date.now() - 61_000, id: 'left-by-a-request-that-died' });
    must(await askToBind(ona.d) === 'again' && !(await adminDb.doc(`signInLocks/${email}`).get()).exists,
      'a claim left behind more than a minute ago does not block the person: the request takes it over, and lets go of its own');
    await adminDb.doc(`signInLocks/${email}`).set({ at: Date.now() + 3_600_000, id: 'dated-in-the-future' });
    const onaAgain = await google('ona-phone', email, undefined, ona.d);
    must(await askToBind(onaAgain.d) === 'bound' && await all(onaAgain.d, email, true), 'and neither does one dated in the future');
  }
}

await adminDb.doc('students/probe').set({ name: 'Probe Student (fictional)' });
const steps = [
  s1_switchOff, s2_switchOn_everyRole, s3_whoMayWriteTheRecord, s4_accountsTheServerWillNotTie,
  s5_aSessionFromBeforeDoesNotCarryOver, s6_theOrdinaryCases, s7_reversible, s8_theStoreItself,
];
for (const step of steps) {
  try { await step(); }
  catch (e) { failed++; console.log(`  FAIL  ${step.name} threw: ${e.code || ''} ${e.message}`); }
}
console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
await Promise.all(apps.map(a => deleteApp(a).catch(() => {})));
process.exit(failed ? 1 : 0);
