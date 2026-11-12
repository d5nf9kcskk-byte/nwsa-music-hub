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
 * (googleBindingStore.ts, freshAccount.ts) and the real Admin SDK, on the
 * claims of a token the Admin SDK verified: what the `bindGoogle` function
 * does, minus only its HTTP wrapper.
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
 * It runs in CI before every rules deploy and on pull requests that touch
 * the rules (.github/workflows/rules-checks.yml).
 *
 * What an emulator can and cannot prove: the rules verdicts are exact (same
 * rules engine as production). What the sign-in service itself does when an
 * address already has an account is the emulator's MODEL of production, so
 * those lines are printed as FACT, not PASS. The design leans on one thing
 * about the service that holds in both: a deleted account's sessions cannot
 * be renewed.
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
const store = googleBindingStore(adminDb, adminAuth);

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
const RECORD = ['googleSub', 'boundUid', 'boundAt'];
/** What "Reset" (or the server's clear-owner) leaves: the record gone. */
const clearRecord = email => adminDb.doc(`directors/${email}`).update(Object.fromEntries(RECORD.map(k => [k, FieldValue.delete()])));

/** A Google sign-in as the emulator models it: Google says who this is. `id` is Google's id for the person. */
const fakeGoogle = (email, id = `google-${email}`) => GoogleAuthProvider.credential(
  JSON.stringify({ sub: id, email, email_verified: true }),
);
/** Sign in with Google on a device (a new one unless given). */
const google = async (name, email, id, d = device(name)) => {
  const { user } = await signInWithCredential(d.auth, fakeGoogle(email, id));
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
/** What the app does by itself after a Google sign-in: ask the server. */
const askToBind = async dev => bindGoogle(store, await claimsOf(await tokenOf(dev)));
/**
 * The whole of what an up-to-date copy of the Hub does: sign in, ask, and
 * when the server says "again", sign in once more on the same device.
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
const fact = label => console.log(`  FACT  ${label}`);
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
  const whole = e => ({ email: s(e.email), roles: roles(e.roles[0]), googleSub: s(e.googleSub), boundUid: s(e.boundUid), boundAt: n(e.boundAt) });

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
    // A password account on a listed address, verified. Made here directly.
    const email = 'dee@school.test';
    await list(email);
    const account = await adminAuth.createUser({ email, emailVerified: true, password: 'some password 1' });
    const d = device('password-account');
    await signInWithEmailAndPassword(d.auth, email, 'some password 1');
    must(await all(d, email, false) && await askToBind(d) === 'mismatch' && await all(d, email, false) && await accountExists(account.uid),
      'a verified password account on a listed address: refused, not tied, left as it is, still refused');
    await adminAuth.deleteUser(account.uid);
  }
  {
    // An anonymous session whose account then has a listed address on it. Set directly.
    const email = 'eli@school.test';
    await list(email);
    const d = device('anonymous');
    const { user } = await signInAnonymously(d.auth);
    await adminAuth.updateUser(user.uid, { email, emailVerified: true });
    await user.getIdToken(true);
    must(await all(d, email, false) && await askToBind(d) === 'mismatch' && await all(d, email, false),
      'an anonymous account with a listed address on it: refused, not tied, still refused');
    await adminAuth.deleteUser(user.uid);
  }
  {
    const d = await google('odd-address', 'a/b@school.test');
    must(await askToBind(d.d) === 'mismatch', 'an address that could not be an entry\'s name: "mismatch", and nothing breaks');
  }
}

/**
 * The reason the account on record is always a fresh one. Each case starts
 * from an account that already has somebody signed in on it, put into that
 * state here directly, and then the listed person arrives.
 */
async function s5_nothingFromBeforeTheTieIsOnTheTiedAccount() {
  section('(5) Whoever was signed in on an account before the tie is not signed in after it');
  for (const order of ['the listed person\'s Hub asks first', 'the earlier session asks first']) {
    const email = order.startsWith('the listed') ? 'cyd@school.test' : 'cal@school.test';
    await list(email, 'owner');
    // An account with a session on it, and then the listed address on it.
    const earlier = await google('earlier-session', `someone-${email}`, `google-someone-${email}`);
    await adminAuth.updateUser(earlier.user.uid, { email, emailVerified: true });
    await refresh(earlier.d);
    must(await all(earlier.d, email, false) && await askToBind(earlier.d) === 'mismatch' && (await entry(email)).googleSub === undefined,
      `(${order}) an account that is not Google\'s own for the address: refused everywhere, and not tied`);

    // The listed person signs in with Google for the first time.
    const real = await google('the-listed-person', email);
    fact(`emulator: the listed person\'s first Google sign-in opened ${real.user.uid === earlier.user.uid ? 'that same account' : 'a different account'}`);
    const renewed = await refresh(earlier.d);
    fact(`emulator: asked for a fresh token, the earlier session gets: ${renewed}`);

    const first = order.startsWith('the listed') ? real : earlier;
    const answer = await askToBind(first.d);
    must(answer === 'again', `(${order}) the server makes the record, on a fresh account: "${answer}"`);
    const e = await entry(email);
    must(e.googleSub === `google-${email}` && e.boundUid !== earlier.user.uid && e.boundUid !== real.user.uid && !await accountExists(earlier.user.uid),
      'the record names the listed person\'s Google id and a new account; the account from before is gone');
    must(await all(earlier.d, email, false), 'the earlier session, with the token it holds: refused by Firestore, Storage and the functions');
    must(await refresh(earlier.d) !== 'ok', 'and it cannot get another');
    let back = null;
    try { back = await google('earlier-session-again', `someone-${email}`, `google-someone-${email}`); }
    catch (err) { fact(`emulator: signing in again the way it did before fails outright (${String(err.code).slice(0, 40)})`); }
    must(!back || (back.user.uid !== e.boundUid && await tokenAll(await tokenOf(back.d), email, false)), 'signing in again the way it did before does not reach the account on record');
    const realAgain = await google('the-listed-person', email, undefined, real.d);
    must(realAgain.user.uid === e.boundUid && await all(realAgain.d, email, true), 'the listed person signs in once more, is on the account on record, and is in everywhere');
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
    fact(`emulator: a different Google account for the same address opened ${second.user.uid === first.user.uid ? 'the same Hub account' : 'another Hub account'}`);
    must(await all(second.d, email, false), 'a different Google account for the same address: out');
    must(await askToBind(second.d) === 'other-account' && (await entry(email)).googleSub === 'google-hal-old', 'the server will not move the record by itself: the person is told to ask the Owner');
    await adminDb.doc(`directors/${email}`).update({ googleSub: '', boundUid: '' });
    must(await all(second.d, email, false) && await all(first.d, email, false), 'a blank record lets nobody in');
    await clearRecord(email); // the Owner presses Reset
    must(await askToBind(second.d) === 'again', 'after the Owner resets it, the server makes the record for the new Google account');
    const secondAgain = await google('hal-new-google', email, 'google-hal-new', second.d);
    must(await all(secondAgain.d, email, true), 'and once signed in again they are in');
    must(await all(first.d, email, false) && await refresh(first.d) !== 'ok', 'the session from the old Google account is out, and cannot be renewed');
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

await adminDb.doc('students/probe').set({ name: 'Probe Student (fictional)' });
const steps = [
  s1_switchOff, s2_switchOn_everyRole, s3_whoMayWriteTheRecord, s4_accountsTheServerWillNotTie,
  s5_nothingFromBeforeTheTieIsOnTheTiedAccount, s6_theOrdinaryCases, s7_reversible,
];
for (const step of steps) {
  try { await step(); }
  catch (e) { failed++; console.log(`  FAIL  ${step.name} threw: ${e.code || ''} ${e.message}`); }
}
console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
await Promise.all(apps.map(a => deleteApp(a).catch(() => {})));
process.exit(failed ? 1 : 0);
