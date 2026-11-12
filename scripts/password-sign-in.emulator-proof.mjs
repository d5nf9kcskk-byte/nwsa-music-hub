#!/usr/bin/env node
/**
 * Proof for email-and-password staff sign-in (#password-sign-in).
 *
 * Real sign-ins on the Auth emulator; every verdict comes from the REAL
 * firestore.rules and storage.rules, judging the token the sign-in service
 * actually minted, and from the same staff test the Cloud Functions use
 * (functions/src/staffToken.ts). Setting a password runs the REAL
 * requestSetup / completeSetup (functions/src/passwordSetup.ts) over the
 * real store (passwordSetupStore.ts, freshAccount.ts, entryLock.ts) and the
 * real Admin SDK: the code the `passwordSetup` function runs, minus only its
 * HTTP wrapper.
 *
 * Every "gets in" below asks THREE gates and requires them to agree:
 *   Firestore   the person's own directors doc, and the staff-only roster
 *   Storage     a staff-only listing
 *   Functions   verifyIdToken, then staffFromToken, then the role check
 *
 * Google sign-ins here do what the app does (#google-binding): right after
 * signing in, the device asks the REAL bindGoogle, sending along what Google
 * said at that sign-in, and when the answer is "again" the same Google
 * sign-in opens the fresh account. (The emulator's stand-in for Google signs
 * nothing, so this script reads what it says directly; the real signature
 * check is functions/src/googleIdToken.ts, with a self-check of its own.) The switch that makes Firestore require the
 * record is ON throughout, which is the state password sign-in is meant to
 * be turned on in, and the only one in which all three gates give the same
 * answer for a Google sign-in.
 *
 * Nothing here can reach production: the project id starts with "demo-".
 *
 * Run from the repo root (it needs Java; on this Mac that is Homebrew's
 * keg-only openjdk):
 *
 *   PATH="/opt/homebrew/opt/openjdk/bin:$PATH" firebase emulators:exec \
 *     --config firebase.emulators.json --only auth,firestore,storage \
 *     --project demo-password-sign-in \
 *     "node scripts/password-sign-in.emulator-proof.mjs"
 *
 * It runs in CI before every rules deploy and every functions deploy, and on
 * pull requests that touch the rules (.github/workflows/rules-checks.yml).
 *
 * What an emulator can and cannot prove. The rules verdicts are exact (same
 * rules engine as production). What the sign-in service itself does is the
 * emulator's MODEL of production, so those lines are printed as FACT, not
 * PASS. The design leans on one thing about the service that holds in both:
 * a deleted account's sessions cannot be renewed.
 */
import { initializeApp, deleteApp } from 'firebase/app';
import {
  getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInAnonymously,
  signInWithEmailAndPassword, signInWithCredential, GoogleAuthProvider,
} from 'firebase/auth';
import { initializeApp as initializeAdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore, FieldValue } from 'firebase-admin/firestore';
import { completeSetup, ownerSendLink, requestSetup } from '../functions/src/passwordSetup.ts';
import { passwordSetupStore } from '../functions/src/passwordSetupStore.ts';
import { staffFromToken } from '../functions/src/staffToken.ts';
import { bindGoogle } from '../functions/src/googleBinding.ts';
import { googleBindingStore } from '../functions/src/googleBindingStore.ts';
import { readSetupLink } from '../src/shared/passwordSetupLink.ts';

const PROJECT = process.env.GCLOUD_PROJECT || 'demo-password-sign-in';
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
const store = passwordSetupStore(adminDb, adminAuth, { publicUrl: 'https://example.test/hub/', appName: 'Proof Hub' });
/** What Google said at a sign-in. On the emulators the "token" is the JSON the sign-in was made with. */
const whatGoogleSays = async token => {
  try {
    const c = JSON.parse(String(token));
    if (typeof c.sub !== 'string' || typeof c.email !== 'string') return null;
    return { sub: c.sub, email: c.email.toLowerCase(), emailVerified: c.email_verified === true };
  } catch { return null; }
};
const bindStore = googleBindingStore(adminDb, adminAuth, whatGoogleSays);

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
const list = (email, role = 'director') => adminDb.doc(`directors/${email}`).set({ email, roles: [role], addedAt: 1 });
const director = async email => (await adminDb.doc(`directors/${email}`).get()).data();

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
  { headers: { Authorization: `Bearer ${idToken}` } },
).then(r => r.status);

/** A staff-only listing in Storage (`allow list: if isStaff()` on submissions). */
const storageList = idToken => fetch(
  `http://${ST_HOST}/v0/b/${BUCKET}/o?prefix=${encodeURIComponent('submissions/a1/s1/')}&delimiter=%2F`,
  { headers: { Authorization: `Firebase ${idToken}` } },
).then(r => r.status);

/**
 * Does this TOKEN get in as staff? All three gates must agree, or the proof
 * stops: a token one gate honours and another refuses is the very thing this
 * work exists to rule out.
 */
async function tokenGetsIn(idToken, email) {
  const roster = await fsGet('students/probe', idToken);
  const own = await fsGet(`directors/${email}`, idToken);
  const storage = await storageList(idToken);
  const fn = await functionsGate(idToken);
  const firestore = roster === 200;
  const listed = !!await director(email);
  const answers = { roster, own, storage, functions: fn };
  const agree = (storage === 200) === firestore && fn === firestore
    && (listed ? (own === 200) === firestore : true)
    && [200, 403].includes(roster) && [200, 403].includes(storage);
  if (!agree) throw new Error(`the gates disagree for ${email}: ${JSON.stringify(answers)}`);
  return firestore;
}
/** The token this browser holds right now, as it is (not refreshed). */
const getsIn = async (dev, email) => tokenGetsIn(await dev.auth.currentUser.getIdToken(), email);

/** Ask the sign-in service for a fresh token. The error code if it refuses. */
async function refresh(dev) {
  try {
    await dev.auth.currentUser.getIdToken(true);
    return 'ok';
  } catch (e) { return e.code || String(e); }
}

// ── The inbox ───────────────────────────────────────────────────────────────

const seenMail = new Set();
const mailTo = async email => (await adminDb.collection('mail').where('to', 'array-contains', email).get()).docs;
/** The newest "choose your password" email to this address not yet opened: its link's token. */
async function hubLink(email) {
  const fresh = (await mailTo(email)).filter(d => !seenMail.has(d.id) && /choose your password/.test(d.data().message.subject));
  if (!fresh.length) return null;
  const newest = fresh.sort((x, y) => x.createTime.toMillis() - y.createTime.toMillis())[fresh.length - 1];
  fresh.forEach(d => seenMail.add(d.id));
  const href = newest.data().message.text.split('\n').find(l => l.startsWith('https://'));
  return readSetupLink(href.slice(href.indexOf('#'))).token;
}
const notices = async email => (await mailTo(email)).filter(d => /was just set/.test(d.data().message.subject)).length;

let callerCounter = 0;
const someCaller = () => `10.1.${Math.floor(++callerCounter / 250)}.${callerCounter % 250}`; // each call from its own address: the limits are not what is under test here
/** The whole of setting a password: ask, open the email, choose. */
async function setPassword(email, password) {
  await requestSetup(store, email, someCaller());
  const token = await hubLink(email.trim().toLowerCase()); // the Hub writes to the address as listed
  if (!token) return { status: 'no email' };
  return completeSetup(store, token, password, someCaller());
}

const googleSays = (email, id = `google-${email}`) => JSON.stringify({ sub: id, email, email_verified: true });
/**
 * The claims of a token, as the `bindGoogle` function sees them. Against the
 * emulators the Admin SDK's verifyIdToken ALSO looks the account up, and so
 * throws for a deleted account; in production it does not, and the token is
 * good until it expires. For that one case the claims are read straight off
 * the token, to put in front of bindGoogle what production would.
 */
async function claimsFor(idToken) {
  try { return await adminAuth.verifyIdToken(idToken); }
  catch (e) {
    if (e.code !== 'auth/user-not-found') throw e;
    const c = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8'));
    return { ...c, uid: c.user_id ?? c.sub };
  }
}
/** What the app does straight after a Google sign-in: ask the server, sending along what Google said. */
const askToBind = async dev => bindGoogle(bindStore, await claimsFor(await dev.auth.currentUser.getIdToken()), dev.googleToken);
/** Sign in with Google on a device (a new one unless given), and nothing else. The device keeps what Google said, as the app does. */
const googleOnly = async (name, email, id, d = device(name)) => {
  d.googleToken = googleSays(email, id);
  const { user } = await signInWithCredential(d.auth, GoogleAuthProvider.credential(d.googleToken));
  return { d, user };
};
/** What an up-to-date copy of the Hub does: sign in, ask, and when told "again" open the fresh account with the same Google sign-in. */
const google = async (name, email, id) => {
  const first = await googleOnly(name, email, id);
  const tie = await askToBind(first.d);
  if (tie !== 'again') return { ...first, tie };
  return { ...await googleOnly(name, email, id, first.d), tie };
};
const byPassword = async (name, email, password) => {
  const d = device(name);
  const { user } = await signInWithEmailAndPassword(d.auth, email, password);
  return { d, user };
};
/** An account the server did not make, with a password. Made here directly. */
async function outsideAccount(name, email, password, { verified }) {
  await adminAuth.createUser({ email, password, emailVerified: verified });
  return byPassword(name, email, password);
}
/** An account the server did not make, with an anonymous session. Made here directly. */
async function anonymousWithAddress(name, email) {
  const d = device(name);
  const { user } = await signInAnonymously(d.auth);
  await adminAuth.updateUser(user.uid, { email, emailVerified: true });
  await refresh(d);
  return { d, user };
}

let failed = 0;
function must(ok, label) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failed++;
}
const fact = label => console.log(`  FACT  ${label}`);
/** A starting condition a case relies on. Checked without a word; the case stops if it is not met. */
function need(ok, what) {
  if (!ok) throw new Error(`the starting condition was not met: ${what}`);
}
const section = title => console.log(`\n${title}`);
async function codeOf(p) {
  try { await p; return 'ok'; } catch (e) { return e.code || String(e); }
}
const claimsOf = async dev => (await dev.auth.currentUser.getIdTokenResult()).claims;

const patch = (path, fields, mask, token) => fetch(
  `http://${FS_HOST}/v1/projects/${PROJECT}/databases/(default)/documents/${path}${mask ? `?${mask.map(m => `updateMask.fieldPaths=${m}`).join('&')}` : ''}`,
  { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) },
).then(r => r.status);
const s = v => ({ stringValue: v });
const b = v => ({ booleanValue: v });
const roles = { arrayValue: { values: [s('director')] } };

// ────────────────────────────────────────────────────────────────────────────

async function s1_theRulesAlone() {
  section('(1) What the rules honour, before anyone has set a password');
  const email = 'ada@school.test';
  await list(email);

  const g = await google('ada-laptop', email);
  must(g.tie === 'again' && await getsIn(g.d, email) === true, 'Google, on the list, confirmed by the server: gets in (Firestore, Storage and the functions agree)');
  const stranger = await google('unlisted-google', 'nobody@elsewhere.test');
  must(stranger.tie === 'not-listed' && await getsIn(stranger.d, 'nobody@elsewhere.test') === false, 'Google, not on the list: refused');

  await g.d.auth.signOut();
  await adminAuth.deleteUser(g.user.uid); // clear the address, and the entry, for the cases below
  await list(email);
  const unverified = await outsideAccount('unverified', email, 'some password 1', { verified: false });
  need((await claimsOf(unverified.d)).email_verified === false, 'its address is not verified');
  must(await getsIn(unverified.d, email) === false, 'an account the server did not make, by password, address not verified: refused');
  await adminAuth.deleteUser(unverified.user.uid);

  const verified = await outsideAccount('verified', email, 'some password 2', { verified: true });
  const c = await claimsOf(verified.d);
  need(c.email === email && c.email_verified === true && c.firebase.sign_in_provider === 'password', 'a verified password session');
  must(await getsIn(verified.d, email) === false, 'the same with the address verified: refused by Firestore, Storage and the functions, because it is not the account on record');
  await adminAuth.deleteUser(verified.user.uid);

  const anon = await anonymousWithAddress('anonymous', email);
  const ac = await claimsOf(anon.d);
  need(ac.email === email && ac.email_verified === true && ac.firebase.sign_in_provider === 'anonymous', 'a verified anonymous session');
  must(await getsIn(anon.d, email) === false, 'an account the server did not make, with an anonymous session: refused. Only a Google or a password sign-in on the account on record is honoured');
  await adminAuth.deleteUser(anon.user.uid);

  const off = await outsideAccount('unlisted-verified', 'someone@elsewhere.test', 'some password 3', { verified: true });
  must(await getsIn(off.d, 'someone@elsewhere.test') === false, 'an address that is not on the list: refused');
}

async function s2_askingChangesNothing() {
  section('(2) Asking for a link changes nothing, and answers the same for anyone');
  const email = 'ben@school.test';
  await list(email);
  const g = await google('ben-laptop', email);
  const before = await adminAuth.getUserByEmail(email);
  const entryBefore = JSON.stringify(await director(email));

  must(await requestSetup(store, 'nobody@elsewhere.test', someCaller()) === 'ok', 'an address that is not listed: "ok"');
  must(await hubLink('nobody@elsewhere.test') === null, 'and no email is sent to it');
  const answers = [];
  for (let i = 0; i < 3; i++) answers.push(await requestSetup(store, email, someCaller())); // anyone can do this, any number of times
  must(answers.every(a => a === 'ok'), 'a listed address: "ok", the same answer');
  must(await hubLink(email) !== null, 'and the email with the link goes to that inbox');
  const after = await adminAuth.getUserByEmail(email);
  must(after.uid === before.uid && after.tokensValidAfterTime === before.tokensValidAfterTime
    && JSON.stringify(after.providerData) === JSON.stringify(before.providerData), 'the account is exactly as it was');
  must(JSON.stringify(await director(email)) === entryBefore, 'the entry is exactly as it was');
  must(await refresh(g.d) === 'ok' && await getsIn(g.d, email) === true, 'and the person stays signed in with Google: asking for someone\'s link cannot sign them out or lock them out');
  must(await requestSetup(store, email, someCaller()) === 'ok' && await hubLink(email) === null, 'a fourth link in the hour is not sent, and the answer still does not change');
}

async function s3_noAccountYet() {
  section('(3) Someone on the list who has never signed in sets a password');
  const typed = 'Cara.Stone@School.test';
  const email = typed.toLowerCase();
  await list(email);
  const done = await setPassword(typed, 'caras own pass 1');
  must(done.status === 'done' && done.email === email, 'the link is opened and a password chosen (capitals in the typed email do not matter)');
  const account = await adminAuth.getUserByEmail(email);
  const d = await director(email);
  must(d.boundUid === account.uid && d.passwordSet === true && Number.isInteger(d.boundAt), 'the server made the account and recorded it on the entry');
  must(await notices(email) === 1, 'and emailed the person that a password was just set');
  need(account.emailVerified === true, 'the server marks the address verified, on the strength of the link');

  const phone = await byPassword('cara-phone', email, 'caras own pass 1');
  must((await claimsOf(phone.d)).firebase.sign_in_provider === 'password' && phone.user.uid === d.boundUid, 'the sign-in that follows is by password, on the account on record');
  must(await getsIn(phone.d, email) === true, 'and gets in: Firestore, Storage and the functions agree');
  must(await codeOf(signInWithEmailAndPassword(device('guess').auth, email, 'not caras password')) !== 'ok', 'a wrong password does not sign in');

  // Later she uses Google for the first time. A Google tie always makes the
  // account afresh, and a fresh account has no password.
  const g = await google('cara-laptop', email);
  const d2 = await director(email);
  must(g.tie === 'again' && g.user.uid === d2.boundUid && d2.googleSub === `google-${email}` && await getsIn(g.d, email) === true, 'her first Google sign-in is confirmed on a fresh account, and gets in');
  must(d2.passwordSet !== true && await getsIn(phone.d, email) === false && await refresh(phone.d) !== 'ok', 'the password session from before is out, and the entry no longer says a password is set');
  must(await codeOf(signInWithEmailAndPassword(device('cara-old-pass').auth, email, 'caras own pass 1')) !== 'ok', 'the old password no longer signs in: she sets one again by link');
  must((await setPassword(email, 'caras own pass 2')).status === 'done', 'which she does');
  const d3 = await director(email);
  const both = await adminAuth.getUserByEmail(email);
  must(d3.passwordSet === true && d3.googleSub === `google-${email}` && d3.boundUid === both.uid && both.providerData.some(p => p.providerId === 'google.com' && p.uid === `google-${email}`),
    'the entry now names one account, with the password the server set and her own Google identity on it');
  must(await getsIn((await byPassword('cara-phone-2', email, 'caras own pass 2')).d, email) === true, 'the password gets in');
  const gAgain = await google('cara-laptop-2', email);
  must(gAgain.tie === 'bound' && await getsIn(gAgain.d, email) === true, 'and so does Google, on that same account, with nothing more to confirm');
}

async function s4_theRecordIsTheServers() {
  section('(4) No browser can write the record, the Owner included');
  const owner = 'owner@school.test';
  const email = 'dan@school.test';
  await list(owner, 'owner');
  await list(email);
  await setPassword(email, 'dans own pass 1');
  const bound = await director(email);
  const o = await google('owner-laptop', owner);
  const ownerToken = await o.d.auth.currentUser.getIdToken();
  const dan = await byPassword('dan-phone', email, 'dans own pass 1');
  const danToken = await dan.d.auth.currentUser.getIdToken();
  const KEYS = ['googleSub', 'boundUid', 'boundAt', 'passwordSet'];

  must(await patch(`directors/${email}`, { boundUid: s('some-other-account') }, ['boundUid'], ownerToken) === 403, 'the Owner cannot point the record at another account');
  must(await patch('directors/quin@school.test', { email: s('quin@school.test'), roles }, null, ownerToken) === 200, 'the Owner can add a person the ordinary way');
  must(await patch('directors/quin@school.test', { passwordSet: b(true) }, ['passwordSet'], ownerToken) === 403, 'and cannot mark them as having a password');
  must(await patch('directors/new@school.test', { email: s('new@school.test'), roles, boundUid: s('x'), passwordSet: b(true) }, null, ownerToken) === 403, 'the Owner cannot add a person who already has a record');
  must(await patch(`directors/${email}`, { name: s('Dan Example') }, ['name'], ownerToken) === 200, 'an ordinary edit by the Owner goes through');
  must(await patch(`directors/${email}`, { name: s('Dan E.') }, ['name'], danToken) === 200, 'the person can still edit their own name');
  must(await patch(`directors/${email}`, { boundUid: s('x') }, ['boundUid'], danToken) === 403 && await patch(`directors/${email}`, {}, ['passwordSet'], danToken) === 403, 'and cannot touch their own record');
  const now = await director(email);
  must(KEYS.every(k => now[k] === bound[k]), 'after all of that the record is exactly what the server wrote');
  for (const path of ['passwordSetup/x', 'passwordSetupLimits/x', 'mail/x']) {
    must(await fsGet(path, ownerToken) === 403, `${path.split('/')[0]} cannot be read by the Owner's browser either`);
  }

  // "Remove password" on the Directors screen: the mark goes, and only that.
  must(await patch(`directors/${email}`, {}, ['passwordSet'], ownerToken) === 200, 'the Owner CAN remove another person\'s password mark (Remove password on the Directors screen)');
  must((await director(email)).boundUid === bound.boundUid && await getsIn(dan.d, email) === false, 'and the password stops being honoured at once, until it is set up again');
  must((await setPassword(email, 'dans own pass 2')).status === 'done' && await getsIn((await byPassword('dan-phone-2', email, 'dans own pass 2')).d, email) === true, 'which the person can do by link');
}

async function s5_googleFirst() {
  section('(5) A director who has always used Google adds a password');
  const email = 'eve@school.test';
  await list(email);
  const laptop = await google('eve-laptop', email);
  const tied = await director(email);
  const done = await setPassword(email, 'eves own pass 1');
  must(done.status === 'done', 'they open their link and choose a password');
  const account = await adminAuth.getUserByEmail(email);
  const d = await director(email);
  must(account.uid !== laptop.user.uid && d.boundUid === account.uid && d.passwordSet === true, 'the account is a fresh one, and the entry names it');
  must(account.providerData.filter(p => p.providerId === 'google.com').map(p => p.uid).join() === `google-${email}`, 'with their own Google identity, the one the entry names, attached to it');
  must(d.googleSub === tied.googleSub, 'the entry still names the same Google identity');
  const phone = await byPassword('eve-phone', email, 'eves own pass 1');
  must(phone.user.uid === account.uid && await getsIn(phone.d, email) === true, 'the password gets in');
  const again = await google('eve-laptop-again', email);
  must(again.tie === 'bound' && again.user.uid === account.uid && await getsIn(again.d, email) === true, 'Sign in with Google opens the same account, and gets in with nothing more to confirm');
  must(await refresh(laptop.d) !== 'ok' && await getsIn(laptop.d, email) === false, 'the browser that was signed in before has to sign in again (its account is gone)');
}

async function s6_reset() {
  section('(6) Someone who has a password resets it');
  const email = 'finn@school.test';
  await list(email);
  await setPassword(email, 'finns first pass 1');
  const old = await byPassword('finn-old-phone', email, 'finns first pass 1');
  must(await getsIn(old.d, email) === true, 'in with the first password');
  must((await setPassword(email, 'finns second pass 2')).status === 'done', 'a new link, a new password');
  must(await getsIn(old.d, email) === false, 'the browser signed in with the old password is refused AT ONCE, with the token it already holds');
  must(await refresh(old.d) !== 'ok', 'and cannot renew it');
  must(await codeOf(signInWithEmailAndPassword(device('finn-guess').auth, email, 'finns first pass 1')) !== 'ok', 'the old password no longer signs in');
  const fresh = await byPassword('finn-new-phone', email, 'finns second pass 2');
  must(await getsIn(fresh.d, email) === true, 'the new password gets in');
  must(await notices(email) === 2, 'and each time the person was told by email');
}

/**
 * A session from before a record is made does not carry over, whatever kind
 * of session it is and whether it keeps its old token or asks for a new one.
 * Each starting state is made here directly.
 */
async function s7_aSessionFromBeforeDoesNotCarryOver() {
  section('(7) A session from before: by password');
  {
    const email = 'gia@school.test';
    await list(email);
    const older = await outsideAccount('older', email, 'older pass 1', { verified: true });
    const olderToken = await older.d.auth.currentUser.getIdToken();
    must(await getsIn(older.d, email) === false, 'refused before');
    must((await setPassword(email, 'gias own pass 1')).status === 'done', 'the person sets a password by link');
    must(await tokenGetsIn(olderToken, email) === false, 'the session from before, with the token it holds: refused by Firestore, Storage and the functions');
    must(await refresh(older.d) !== 'ok', 'and it cannot get another');
    must(await codeOf(signInWithEmailAndPassword(device('older-again').auth, email, 'older pass 1')) !== 'ok', 'the password that was on that account no longer signs in');
    must(await codeOf(createUserWithEmailAndPassword(device('older-third').auth, email, 'older pass 2')) === 'auth/email-already-in-use', 'and no second account can be made on the address');
    must(await getsIn((await byPassword('gia-phone', email, 'gias own pass 1')).d, email) === true, 'the person gets in');
  }

  section('(7) A session from before: anonymous');
  {
    const email = 'hal@school.test';
    await list(email);
    const anon = await anonymousWithAddress('anon', email);
    const anonToken = await anon.d.auth.currentUser.getIdToken();
    must(await tokenGetsIn(anonToken, email) === false, 'refused before');
    must((await setPassword(email, 'hals own pass 1')).status === 'done', 'the person sets a password by link');
    must(await tokenGetsIn(anonToken, email) === false, 'the session from before is refused after');
    must(await refresh(anon.d) !== 'ok', 'and it cannot get another');
    must(await getsIn((await byPassword('hal-phone', email, 'hals own pass 1')).d, email) === true, 'the person gets in');
  }

  section('(7) A session from before, and then the person signs in with Google');
  {
    const email = 'ida@school.test';
    await list(email);
    const older = await outsideAccount('older', email, 'older pass 3', { verified: false });
    const olderToken = await older.d.auth.currentUser.getIdToken();
    const real = await googleOnly('ida-laptop', email);
    if (real.user.uid !== older.user.uid) fact('emulator: the sign-in opened a different account');
    const renewed = await refresh(older.d);
    if (renewed !== 'ok') fact(`emulator: the session from before could not renew (${renewed})`);
    must(await tokenGetsIn(olderToken, email) === false && (renewed !== 'ok' || await getsIn(older.d, email) === false), 'before any record is made: the session from before is refused, with the token it had and with a fresh one');
    must(await askToBind(real.d) === 'again', 'the person\'s Hub asks, and the server makes the record on a fresh account');
    const realAgain = await googleOnly('ida-laptop', email, undefined, real.d);
    must(await getsIn(realAgain.d, email) === true, 'the person signs in once more and gets in with Google');
    must(await tokenGetsIn(olderToken, email) === false && await refresh(older.d) !== 'ok', 'after: the session from before is refused, and cannot get another token');
    must((await setPassword(email, 'idas own pass 1')).status === 'done', 'the person sets a password by link');
    must(await getsIn((await byPassword('ida-phone', email, 'idas own pass 1')).d, email) === true, 'and gets in with the password');
    must(await getsIn((await google('ida-laptop-again', email)).d, email) === true, 'and still with Google');
    must(await codeOf(signInWithEmailAndPassword(device('older-pass').auth, email, 'older pass 3')) !== 'ok', 'the password that was on that account signs in nowhere');
  }
}

/**
 * The account on record belongs to one person: when its entry names a Google
 * identity, a password is honoured on it only while it still has that one.
 * The starting state is made here directly.
 */
async function s8_onePersonPerAccount() {
  section('(8) One person per account');
  const email = 'ned@school.test';
  await list(email);
  await google('ned-laptop', email, 'google-ned');
  must((await setPassword(email, 'neds own pass 1')).status === 'done', 'a person confirmed with Google sets a password');
  const record = await director(email);
  const ned = await byPassword('ned-phone', email, 'neds own pass 1');
  must(await getsIn(ned.d, email) === true, 'and is in by password');

  // The account on record, with a Google identity on it that the entry does
  // not name, and a password that is not the one the person chose. (What an
  // account carries is the sign-in service's to decide, not the Hub's.)
  await adminAuth.updateUser(record.boundUid, { providersToUnlink: ['google.com'] });
  await adminAuth.updateUser(record.boundUid, { providerToLink: { providerId: 'google.com', uid: 'google-other', email }, password: 'a password of its own 1' });
  const viaPassword = await byPassword('by-that-password', email, 'a password of its own 1');
  must(await getsIn(viaPassword.d, email) === false, 'a password sign-in on it is not honoured: the account does not have the Google identity its entry names');
  const other = await googleOnly('another-identity', email, 'google-other');
  need(other.user.uid === record.boundUid, 'that identity signs in on the account on record');
  must(await getsIn(other.d, email) === false, 'a Google sign-in on it with an identity the entry does not name: refused');

  // Its Hub asks. The server does not move the record; it makes the account
  // afresh for the identity the entry DOES name, which ends every session on
  // the old one and leaves no password on the new one.
  must(await askToBind(other.d) === 'other-account', 'it asks: "other-account"');
  const after = await director(email);
  const remade = await adminAuth.getUser(after.boundUid);
  must(after.googleSub === 'google-ned' && after.boundUid !== record.boundUid && after.passwordSet === false,
    'the record still names the person\'s own Google identity, on a fresh account, with the password mark off');
  must(remade.providerData.length === 1 && remade.providerData[0].providerId === 'google.com' && remade.providerData[0].uid === 'google-ned',
    'the fresh account carries that Google identity and nothing else: no password of anyone\'s');
  must(await refresh(other.d) !== 'ok' && await refresh(viaPassword.d) !== 'ok' && await refresh(ned.d) !== 'ok', 'every session that was on the old account cannot be renewed');
  must(await codeOf(signInWithEmailAndPassword(device('that-password-again').auth, email, 'a password of its own 1')) !== 'ok'
    && await codeOf(signInWithEmailAndPassword(device('neds-old-password').auth, email, 'neds own pass 1')) !== 'ok',
  'and neither password signs in anywhere');

  // The person signs in with Google and is in; then chooses a password again.
  const back = await googleOnly('ned-laptop-again', email, 'google-ned');
  must(back.user.uid === after.boundUid && await getsIn(back.d, email) === true && await askToBind(back.d) === 'bound', 'the person signs in with Google, is on the account on record, and is in');
  must((await setPassword(email, 'neds own pass 2')).status === 'done', 'and sets a password again by link');
  const fresh = await adminAuth.getUserByEmail(email);
  must(fresh.providerData.filter(q => q.providerId === 'google.com').map(q => q.uid).join() === 'google-ned', 'the fresh account has the entry\'s Google identity on it, and no other');
  must(await getsIn((await byPassword('ned-phone-2', email, 'neds own pass 2')).d, email) === true, 'and they are in again by password');
}

async function s9_aFailedSetup() {
  section('(9) A setup that fails half way');
  const email = 'jo@school.test';
  await list(email);
  await requestSetup(store, email, someCaller());
  const token = await hubLink(email);
  const broken = { ...store, bind: async () => { throw new Error('the database is down'); } };
  must(await codeOf(completeSetup(broken, token, 'jos own pass 1', someCaller())) !== 'ok', 'the recording step fails (the database is down at that moment)');
  must((await director(email)).boundUid === undefined && await notices(email) === 0, 'nothing is recorded, and no notice is sent');
  const half = await codeOf(signInWithEmailAndPassword(device('jo-half').auth, email, 'jos own pass 1'));
  if (half === 'ok') must(await getsIn((await byPassword('jo-half-2', email, 'jos own pass 1')).d, email) === false, 'but the rules refuse it: it is not an account the entry names');
  must((await completeSetup(store, token, 'jos own pass 1', someCaller())).status === 'expired', 'the link was used up by the failed attempt');
  must((await setPassword(email, 'jos own pass 2')).status === 'done', 'asking again works: nothing is left to repair by hand');
  must(await getsIn((await byPassword('jo-phone', email, 'jos own pass 2')).d, email) === true, 'and gets in');
  must(await codeOf(signInWithEmailAndPassword(device('jo-old').auth, email, 'jos own pass 1')) !== 'ok', 'the password from the failed attempt is gone');
}

async function s10_linksAreOneTime() {
  section('(10) A link works once, for an hour, for its own person');
  const email = 'kit@school.test';
  await list(email);
  await requestSetup(store, email, someCaller());
  const first = await hubLink(email);
  await requestSetup(store, email, someCaller());
  const second = await hubLink(email);
  must((await completeSetup(store, first, 'kits own pass 0', someCaller())).status === 'expired', 'asking again retires the earlier link: only the newest email\'s link works');
  must((await completeSetup(store, second, email, someCaller())).status === 'weak', 'the email address is refused as its own password');
  must((await completeSetup(store, second, 'kits own pass 0', someCaller())).status === 'expired', 'and that link is used up all the same: a link works once, whether or not it succeeded');
  must(await codeOf(adminAuth.getUserByEmail(email)) === 'auth/user-not-found' && (await director(email)).boundUid === undefined, 'nothing was made and nothing recorded by any of that');
  await requestSetup(store, email, someCaller());
  const third = await hubLink(email);
  must((await completeSetup(store, 'a-made-up-token-000000000000', 'kits own pass 3', someCaller())).status === 'expired', 'a made-up link: expired');
  must((await completeSetup(store, third, 'kits own pass 1', someCaller())).status === 'done', 'a fresh link with a proper password works');
  must((await completeSetup(store, third, 'kits own pass 2', someCaller())).status === 'expired', 'and never a second time');
  must(await getsIn((await byPassword('kit-phone', email, 'kits own pass 1')).d, email) === true, 'the password that was set gets in');

  const email2 = 'kat@school.test';
  await list(email2);
  await requestSetup(store, email2, someCaller());
  const slow = await hubLink(email2);
  const late = { ...store, now: () => Date.now() + 61 * 60 * 1000 };
  must((await completeSetup(late, slow, 'kats own pass 1', someCaller())).status === 'expired', 'a link opened after an hour: expired');
  must((await completeSetup(store, slow, 'kats own pass 1', someCaller())).status === 'expired', 'and gone for good');

  // The same link tried several times in the same instant.
  const email3 = 'kay@school.test';
  await list(email3);
  await requestSetup(store, email3, someCaller());
  const once = await hubLink(email3);
  const tries = await Promise.all([1, 2, 3, 4].map(i => completeSetup(store, once, `kays own pass ${i}`, someCaller()).then(r => r.status, () => 'threw')));
  must(tries.filter(t => t === 'done').length === 1 && tries.filter(t => t === 'expired').length === 3, `four tries with one link at the same moment: exactly one is "done" (${tries.join(', ')})`);
  must(await notices(email3) === 1, 'and one notice is sent');
}

async function s11_removedAndReadded() {
  section('(11) A person taken off the list and added again');
  const email = 'lee@school.test';
  await list(email);
  const laptop = await google('lee-laptop', email);
  await setPassword(email, 'lees own pass 1');
  const phone = await byPassword('lee-phone', email, 'lees own pass 1');
  const laptop2 = await google('lee-laptop-2', email);
  must(await getsIn(phone.d, email) === true && await getsIn(laptop2.d, email) === true && await refresh(laptop.d) !== 'ok', 'in, by password and by Google, on one account');

  await adminDb.doc(`directors/${email}`).delete();
  must(await getsIn(phone.d, email) === false && await getsIn(laptop2.d, email) === false, 'taken off the list: out, both ways');

  await list(email); // removed and added again: a new entry, with no record
  must(await getsIn(laptop2.d, email) === false && await getsIn(phone.d, email) === false, 'added again: out both ways, until the server makes the record again');
  must(await refresh(phone.d) === 'ok' && await getsIn(phone.d, email) === false, 'not with a renewed token either');
  await requestSetup(store, email, someCaller()); // anyone asking
  await hubLink(email);
  must((await director(email)).boundUid === undefined, 'someone asking for their link changes nothing');
  must(await askToBind(laptop2.d) === 'again', 'their Hub asks, and the server confirms their Google account again');
  must(await getsIn((await googleOnly('lee-laptop-2', email, undefined, laptop2.d)).d, email) === true, 'they sign in once more and Google gets in');
  must(await refresh(phone.d) !== 'ok' && await codeOf(signInWithEmailAndPassword(device('lee-old-pass').auth, email, 'lees own pass 1')) !== 'ok', 'the old password does not: the account was made afresh');
  must((await setPassword(email, 'lees own pass 2')).status === 'done', 'they open a link and choose a password again');
  must(await getsIn((await byPassword('lee-phone-third', email, 'lees own pass 2')).d, email) === true, 'and the password gets in again');
  must(await getsIn((await google('lee-laptop-again', email)).d, email) === true, 'as does Google');
}

/**
 * The parts of the record, each tested where it is the ONLY thing standing.
 * The setup function never produces these situations (it always writes a
 * whole record for a fresh account), which is exactly why they need their
 * own cases: nothing above would notice if one part of the rule went missing.
 */
async function s12_theRecordItself() {
  section('(12) The record: the account, the password mark, the Google identity');
  const email = 'max@school.test';
  await list(email);
  await setPassword(email, 'maxs own pass 1');
  const good = await director(email);
  const max = await byPassword('max-phone', email, 'maxs own pass 1');
  const entry = adminDb.doc(`directors/${email}`);
  must(await getsIn(max.d, email) === true, 'a whole record: in');
  await entry.update({ passwordSet: FieldValue.delete() });
  must(await getsIn(max.d, email) === false, 'the account on record, but no password mark: refused');
  await entry.update({ passwordSet: false });
  must(await getsIn(max.d, email) === false, 'a password mark of false: refused');
  await entry.update({ passwordSet: 'true' });
  must(await getsIn(max.d, email) === false, 'a password mark that is not exactly true: refused');
  await entry.update({ passwordSet: true, boundUid: 'some-other-account' });
  must(await getsIn(max.d, email) === false, 'the mark, but the entry names another account: refused');
  await entry.update({ boundUid: FieldValue.delete() });
  must(await getsIn(max.d, email) === false, 'the mark, but no account on record: refused');
  await entry.update({ boundUid: good.boundUid, googleSub: 'google-someone' });
  must(await getsIn(max.d, email) === false, 'the entry names a Google identity the account does not have: refused');
  await entry.update({ googleSub: FieldValue.delete() });
  must(await getsIn(max.d, email) === true, 'put back as the server wrote it: in again');

  // The account on record deleted by hand, and another account on the address.
  await adminAuth.deleteUser(good.boundUid);
  const other = await outsideAccount('another-account', email, 'another pass 1', { verified: true });
  must(other.user.uid !== good.boundUid && await getsIn(other.d, email) === false, 'a different account on that person\'s address, verified: refused, it is not the account on record');
}

async function s13_theOwnersLinkAndTwoAtOnce() {
  section('(13) The Owner\'s link, and two requests for one person at the same moment');
  {
    const email = 'oz@school.test';
    await list(email);
    for (let i = 0; i < 5; i++) await requestSetup(store, email, someCaller()); // people asking in this person's name
    need((await mailTo(email)).length === 3, 'the inbox has had its three links for the hour');
    await hubLink(email); // those are in the inbox; set them aside
    must(await ownerSendLink(store, email) === 'sent', 'the Owner has the Hub send this person a link, though the inbox\'s own cap is used up');
    const token = await hubLink(email);
    must(!!token && (await director(email)).boundUid === undefined, 'it arrives, and sending it changed nothing');
    must((await completeSetup(store, token, 'ozs own pass 1', someCaller())).status === 'done'
      && await getsIn((await byPassword('oz-phone', email, 'ozs own pass 1')).d, email) === true, 'and it works like any other link');
    must(await ownerSendLink(store, 'nobody-listed@school.test') === 'not-listed' && (await mailTo('nobody-listed@school.test')).length === 0, 'for an address that is not listed, nothing is sent');
  }
  {
    // A Google confirm and a password link for the same person, at once.
    const email = 'pam@school.test';
    await list(email);
    const pam = await googleOnly('pam-laptop', email);
    await requestSetup(store, email, someCaller());
    const token = await hubLink(email);
    const both = await Promise.allSettled([askToBind(pam.d), completeSetup(store, token, 'pams own pass 1', someCaller())]);
    must(both.every(r => r.status === 'fulfilled') && both[1].value?.status === 'done', 'neither request fails');
    const e = await director(email);
    const standing = await adminAuth.getUserByEmail(email);
    const kinds = standing.providerData.map(q => q.providerId).sort().join();
    const googleOn = standing.providerData.filter(q => q.providerId === 'google.com').map(q => q.uid).join();
    must(standing.uid === e.boundUid && e.passwordSet === true && kinds.includes('password') && googleOn === (e.googleSub ?? ''),
      'one account stands on the address; it is the one the record names, with the password, and with exactly the Google identity the record names (or none)');
    must(await getsIn((await byPassword('pam-phone', email, 'pams own pass 1')).d, email) === true, 'and the person is in with the password they chose');
    must(!(await adminDb.doc(`signInLocks/${email}`).get()).exists, 'the claim that kept the two apart has been let go');
  }
}

await adminDb.doc('students/probe').set({ name: 'Probe Student (fictional)' });
await adminDb.doc('serverConfig/signIn').set({ googleTieRequired: true }); // the record is required (see the header)
const steps = [
  s1_theRulesAlone, s2_askingChangesNothing, s3_noAccountYet, s4_theRecordIsTheServers, s5_googleFirst,
  s6_reset, s7_aSessionFromBeforeDoesNotCarryOver, s8_onePersonPerAccount, s9_aFailedSetup, s10_linksAreOneTime,
  s11_removedAndReadded, s12_theRecordItself, s13_theOwnersLinkAndTwoAtOnce,
];
for (const step of steps) {
  try { await step(); }
  catch (e) { failed++; console.log(`  FAIL  ${step.name} threw: ${e.code || ''} ${e.message}`); }
}
console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
await Promise.all(apps.map(a => deleteApp(a).catch(() => {})));
process.exit(failed ? 1 : 0);
