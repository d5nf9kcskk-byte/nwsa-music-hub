#!/usr/bin/env node
/**
 * Proof for email-and-password staff sign-in (#password-sign-in).
 *
 * Real sign-ins on the Auth emulator; every verdict comes from the REAL
 * firestore.rules and storage.rules, judging the token the sign-in service
 * actually minted, and from the same staff test the Cloud Functions use
 * (functions/src/staffToken.ts). Setting a password runs the REAL
 * requestSetup / completeSetup (functions/src/passwordSetup.ts) over the
 * real store (passwordSetupStore.ts) and the real Admin SDK: the code the
 * `passwordSetup` function runs, minus only its HTTP wrapper.
 *
 * Every "gets in" below asks THREE gates and requires them to agree:
 *   Firestore   the person's own directors doc, and the staff-only roster
 *   Storage     a staff-only listing
 *   Functions   verifyIdToken, then staffFromToken, then the role check
 *
 * Nothing here can reach production: the project id starts with "demo-".
 *
 * Run from the repo root (Java is Homebrew's keg-only openjdk on this Mac):
 *
 *   PATH="/opt/homebrew/opt/openjdk/bin:$PATH" firebase emulators:exec \
 *     --config firebase.emulators.json --only auth,firestore,storage \
 *     --project demo-password-sign-in \
 *     "node scripts/password-sign-in.emulator-proof.mjs"
 *
 * NOT in .github/actions/self-checks: those are pure and offline, and this
 * needs Java and three emulators. Run it by hand before switching
 * features.passwordSignIn on, and after any change to firestore.rules,
 * storage.rules, staffToken.ts, passwordSetup.ts or the sign-in screen.
 *
 * What an emulator can and cannot prove. The rules verdicts are exact (same
 * rules engine as production). The sign-in service's own behaviour is the
 * emulator's MODEL of production, and two things about that model matter
 * here, both read from its source:
 *   • it does not end a session when its tokens are revoked, and
 *   • it stamps a refreshed token with the ACCOUNT's latest sign-in time,
 *     where production keeps the session's own.
 * The design leans on neither: a password is honoured for one account id
 * only, and setting a password always makes a fresh account, so an older
 * session is on the wrong account whatever its token says.
 */
import { initializeApp, deleteApp } from 'firebase/app';
import {
  getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInAnonymously,
  signInWithEmailAndPassword, signInWithCredential, GoogleAuthProvider,
  sendEmailVerification, applyActionCode, updateEmail, verifyBeforeUpdateEmail,
} from 'firebase/auth';
import { initializeApp as initializeAdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { completeSetup, requestSetup } from '../functions/src/passwordSetup.ts';
import { passwordSetupStore } from '../functions/src/passwordSetupStore.ts';
import { staffFromToken } from '../functions/src/staffToken.ts';
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
/** The newest Hub email to this address not yet opened: its link's token. */
async function hubLink(email) {
  const snap = await adminDb.collection('mail').where('to', 'array-contains', email).get();
  const fresh = snap.docs.filter(d => !seenMail.has(d.id));
  if (!fresh.length) return null;
  const mail = fresh[fresh.length - 1];
  fresh.forEach(d => seenMail.add(d.id));
  const href = mail.data().message.text.split('\n').find(l => l.startsWith('https://'));
  return readSetupLink(href.slice(href.indexOf('#'))).token;
}
/** A link the sign-in service itself emailed (verification), as the emulator records it. */
async function serviceLink(email, requestType) {
  const res = await fetch(`http://${AUTH_HOST}/emulator/v1/projects/${PROJECT}/oobCodes`);
  const { oobCodes = [] } = await res.json();
  const mine = oobCodes.filter(c => c.email.toLowerCase() === email.toLowerCase() && c.requestType === requestType);
  if (!mine.length) throw new Error(`no ${requestType} email for ${email}`);
  return mine[mine.length - 1].oobCode;
}

let ipCounter = 0;
const someIp = () => `10.1.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`; // each call from its own address: the limits are not what is under test here
/** The whole of setting a password: ask, open the email, choose. */
async function setPassword(email, password) {
  await requestSetup(store, email, someIp());
  const token = await hubLink(email.trim().toLowerCase()); // the Hub writes to the address as listed
  if (!token) return { status: 'no email' };
  return completeSetup(store, token, password, someIp());
}

const fakeGoogle = email => GoogleAuthProvider.credential(
  JSON.stringify({ sub: `google-${email}`, email, email_verified: true }),
);
const google = async (name, email) => {
  const d = device(name);
  const { user } = await signInWithCredential(d.auth, fakeGoogle(email));
  return { d, user };
};
const byPassword = async (name, email, password) => {
  const d = device(name);
  const { user } = await signInWithEmailAndPassword(d.auth, email, password);
  return { d, user };
};
/** A password account made straight at the sign-in service, by whoever, and (optionally) verified. */
async function outsideAccount(name, email, password, { verified }) {
  const d = device(name);
  const { user } = await createUserWithEmailAndPassword(d.auth, email, password);
  if (verified) {
    await sendEmailVerification(user);
    await applyActionCode(device(`${name}-link`).auth, await serviceLink(email, 'VERIFY_EMAIL'));
    await refresh(d);
  }
  return { d, user };
}

let failed = 0;
function must(ok, label) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failed++;
}
const fact = label => console.log(`  FACT  ${label}`);
const section = title => console.log(`\n${title}`);
async function codeOf(p) {
  try { await p; return 'ok'; } catch (e) { return e.code || String(e); }
}
const claimsOf = async dev => (await dev.auth.currentUser.getIdTokenResult()).claims;

// ────────────────────────────────────────────────────────────────────────────

async function s1_theRulesAlone() {
  section('(1) What the rules honour, before anyone has set a password');
  const email = 'ada@school.test';
  await list(email);

  const g = await google('ada-laptop', email);
  must(await getsIn(g.d, email) === true, 'Google, on the list: gets in (Firestore, Storage and the functions agree)');
  const stranger = await google('unlisted-google', 'nobody@elsewhere.test');
  must(await getsIn(stranger.d, 'nobody@elsewhere.test') === false, 'Google, not on the list: refused');

  await g.d.auth.signOut();
  await adminAuth.deleteUser(g.user.uid); // clear the address for the cases below
  const unverified = await outsideAccount('unverified', email, 'some password 1', { verified: false });
  must((await claimsOf(unverified.d)).email_verified === false && await getsIn(unverified.d, email) === false,
    'a password account on a listed address, never verified: refused');
  await adminAuth.deleteUser(unverified.user.uid);

  const verified = await outsideAccount('verified', email, 'some password 2', { verified: true });
  const c = await claimsOf(verified.d);
  must(c.email === email && c.email_verified === true && c.firebase.sign_in_provider === 'password', 'a password account on a listed address, VERIFIED: its token says so');
  must(await getsIn(verified.d, email) === false, 'and it is refused all the same, by Firestore, Storage and the functions: nobody bound it');
  await adminAuth.deleteUser(verified.user.uid);

  const anon = device('anonymous');
  const { user } = await signInAnonymously(anon.auth);
  if (await codeOf(updateEmail(user, email)) !== 'ok') {
    await verifyBeforeUpdateEmail(user, email);
    await applyActionCode(device('anon-link').auth, await serviceLink(email, 'VERIFY_AND_CHANGE_EMAIL'));
  } else {
    await sendEmailVerification(user);
    await applyActionCode(device('anon-link').auth, await serviceLink(email, 'VERIFY_EMAIL'));
  }
  await refresh(anon);
  const ac = await claimsOf(anon);
  must(ac.email === email && ac.email_verified === true && ac.firebase.sign_in_provider === 'anonymous', 'an anonymous account given a listed address, verified: its token says so');
  must(await getsIn(anon, email) === false, 'refused: only Google and a bound password are honoured');
  await adminAuth.deleteUser(user.uid);

  const off = await outsideAccount('unlisted-verified', 'someone@elsewhere.test', 'some password 3', { verified: true });
  must(await getsIn(off.d, 'someone@elsewhere.test') === false, 'a verified password account that is not on the list: refused');
}

async function s2_askingChangesNothing() {
  section('(2) Asking for a link changes nothing, and answers the same for anyone');
  const email = 'ben@school.test';
  await list(email);
  const g = await google('ben-laptop', email);
  const before = await adminAuth.getUserByEmail(email);

  must(await requestSetup(store, 'nobody@elsewhere.test', someIp()) === 'ok', 'an address that is not listed: "ok"');
  must(await hubLink('nobody@elsewhere.test') === null, 'and no email is sent to it');
  const answers = [];
  for (let i = 0; i < 3; i++) answers.push(await requestSetup(store, email, someIp())); // anyone can do this, any number of times
  must(answers.every(a => a === 'ok'), 'a listed address: "ok", the same answer');
  must(await hubLink(email) !== null, 'and the email with the link goes to that inbox');
  const after = await adminAuth.getUserByEmail(email);
  must(after.uid === before.uid && after.tokensValidAfterTime === before.tokensValidAfterTime
    && JSON.stringify(after.providerData) === JSON.stringify(before.providerData), 'the account is exactly as it was');
  must((await director(email)).passwordUid === undefined, 'nothing is bound');
  must(await refresh(g.d) === 'ok' && await getsIn(g.d, email) === true, 'and the person stays signed in with Google: asking for someone\'s link cannot sign them out or lock them out');
  must(await requestSetup(store, email, someIp()) === 'ok' && await hubLink(email) === null, 'a fourth link in the hour is not sent, and the answer still does not change');
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
  must(d.passwordUid === account.uid && Number.isInteger(d.passwordBoundAt), 'the server made the account and bound it to the person');
  fact(`the address is marked verified by the server, on the strength of the link: emailVerified is ${account.emailVerified}`);

  const phone = await byPassword('cara-phone', email, 'caras own pass 1');
  const c = await claimsOf(phone.d);
  must(c.firebase.sign_in_provider === 'password' && c.auth_time > d.passwordBoundAt, 'the sign-in that follows is by password, after the binding');
  must(await getsIn(phone.d, email) === true, 'and gets in: Firestore, Storage and the functions agree');

  const g = await google('cara-laptop', email);
  must(g.user.uid === account.uid && await getsIn(g.d, email) === true, 'Google with the same address opens the SAME account, and gets in');
  must((await byPassword('cara-tablet', email, 'caras own pass 1')).user.uid === account.uid, 'and the password still opens it afterwards');
  must(await codeOf(signInWithEmailAndPassword(device('guess').auth, email, 'not caras password')) !== 'ok', 'a wrong password does not sign in');
}

async function s4_theBindingIsTheServers() {
  section('(4) No browser can write the binding, the Owner included');
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

  const patch = (path, fields, mask, token) => fetch(
    `http://${FS_HOST}/v1/projects/${PROJECT}/databases/(default)/documents/${path}${mask ? `?${mask.map(m => `updateMask.fieldPaths=${m}`).join('&')}` : ''}`,
    { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) },
  ).then(r => r.status);
  const s = v => ({ stringValue: v });
  const n = v => ({ integerValue: String(v) });
  const roles = { arrayValue: { values: [s('director')] } };

  must(await patch(`directors/${email}`, { passwordUid: s('some-other-account') }, ['passwordUid'], ownerToken) === 403, 'the Owner cannot point a binding at another account');
  must(await patch(`directors/${email}`, { passwordBoundAt: n(1) }, ['passwordBoundAt'], ownerToken) === 403, 'the Owner cannot move a binding time');
  must(await patch('directors/new@school.test', { email: s('new@school.test'), roles, passwordUid: s('x'), passwordBoundAt: n(1) }, null, ownerToken) === 403, 'the Owner cannot add a person already bound');
  must(await patch('directors/new@school.test', { email: s('new@school.test'), roles }, null, ownerToken) === 200, 'the Owner can add a person the ordinary way');
  must(await patch('directors/new@school.test', { passwordUid: s('x'), passwordBoundAt: n(1) }, ['passwordUid', 'passwordBoundAt'], ownerToken) === 403, 'and cannot bind them afterwards');
  must(await patch(`directors/${email}`, { name: s('Dan Example') }, ['name'], ownerToken) === 200, 'an ordinary edit by the Owner goes through');
  must(await patch(`directors/${email}`, { name: s('Dan E.') }, ['name'], danToken) === 200, 'the person can still edit their own name');
  must(await patch(`directors/${email}`, { passwordBoundAt: n(1) }, ['passwordBoundAt'], danToken) === 403, 'and cannot touch their own binding');
  const now = await director(email);
  must(now.passwordUid === bound.passwordUid && now.passwordBoundAt === bound.passwordBoundAt, 'after all of that the binding is exactly what the server wrote');
  for (const path of ['passwordSetup/x', 'passwordSetupLimits/x', 'mail/x']) {
    must(await fsGet(path, ownerToken) === 403, `${path.split('/')[0]} cannot be read by the Owner's browser either`);
  }

  // The Owner overwriting the person whole (what re-adding an email does)
  // drops the binding. That only takes access away.
  must(await patch(`directors/${email}`, { email: s(email), roles }, null, ownerToken) === 200, 'the Owner overwriting the person whole is allowed');
  must((await director(email)).passwordUid === undefined && await getsIn(dan.d, email) === false, 'and it removes the binding: the password stops being honoured until it is set up again');
}

async function s5_googleFirst() {
  section('(5) A director who has always used Google adds a password');
  const email = 'eve@school.test';
  await list(email);
  const laptop = await google('eve-laptop', email);
  const done = await setPassword(email, 'eves own pass 1');
  must(done.status === 'done', 'they open their link and choose a password');
  const account = await adminAuth.getUserByEmail(email);
  must(account.uid !== laptop.user.uid, 'the account is a fresh one');
  must(account.providerData.some(p => p.providerId === 'google.com' && p.uid === `google-${email}`), 'with their own Google identity attached to it');
  const phone = await byPassword('eve-phone', email, 'eves own pass 1');
  must(phone.user.uid === account.uid && await getsIn(phone.d, email) === true, 'the password gets in');
  const again = await google('eve-laptop-again', email);
  must(again.user.uid === account.uid && await getsIn(again.d, email) === true, 'Sign in with Google opens the same account, and gets in');
  must(await refresh(laptop.d) !== 'ok', 'the browser that was signed in before has to sign in again (its account is gone)');
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
}

/**
 * Accounts that stood on an address before its person set a password, each
 * with a browser still signed in. Whatever state they are in, and whether
 * that browser keeps its old token or asks for a new one, it stays out.
 */
async function s7_accountsFromBefore() {
  section('(7) An account from before: a verified password account, with a browser still signed in');
  {
    const email = 'gia@school.test';
    await list(email);
    const older = await outsideAccount('older', email, 'older pass 1', { verified: true });
    const olderToken = await older.d.auth.currentUser.getIdToken();
    must(await getsIn(older.d, email) === false, 'refused before');
    must((await setPassword(email, 'gias own pass 1')).status === 'done', 'the real person sets a password by link');
    must(await tokenGetsIn(olderToken, email) === false, 'the older token, exactly as it was minted, is refused by Firestore, Storage and the functions');
    const renew = await refresh(older.d);
    must(renew !== 'ok', `and cannot be renewed (${renew})`);
    must(await codeOf(signInWithEmailAndPassword(device('older-again').auth, email, 'older pass 1')) !== 'ok', 'the older password no longer signs in');
    must(await codeOf(createUserWithEmailAndPassword(device('older-third').auth, email, 'older pass 2')) === 'auth/email-already-in-use', 'and no second account can be made on the address');
    must(await getsIn((await byPassword('gia-phone', email, 'gias own pass 1')).d, email) === true, 'the real person gets in');
  }

  section('(7) An account from before: an anonymous account given the address');
  {
    const email = 'hal@school.test';
    await list(email);
    const anon = device('anon');
    const { user } = await signInAnonymously(anon.auth);
    if (await codeOf(updateEmail(user, email)) !== 'ok') {
      await verifyBeforeUpdateEmail(user, email);
      await applyActionCode(device('anon-link').auth, await serviceLink(email, 'VERIFY_AND_CHANGE_EMAIL'));
    } else {
      await sendEmailVerification(user);
      await applyActionCode(device('anon-link').auth, await serviceLink(email, 'VERIFY_EMAIL'));
    }
    await refresh(anon);
    const anonToken = await anon.auth.currentUser.getIdToken();
    must(await tokenGetsIn(anonToken, email) === false, 'refused before');
    must((await setPassword(email, 'hals own pass 1')).status === 'done', 'the real person sets a password by link');
    must(await tokenGetsIn(anonToken, email) === false, 'the older token is refused after');
    must(await refresh(anon) !== 'ok', 'and cannot be renewed');
    must(await getsIn((await byPassword('hal-phone', email, 'hals own pass 1')).d, email) === true, 'the real person gets in');
  }

  section('(7) An account from before: made by someone else, then opened by the real person with Google');
  {
    const email = 'ida@school.test';
    await list(email);
    const older = await outsideAccount('older', email, 'older pass 3', { verified: false });
    const olderToken = await older.d.auth.currentUser.getIdToken();
    const real = await google('ida-laptop', email);
    fact(`emulator: the real person's Google sign-in opened ${real.user.uid === older.user.uid ? 'that same account' : 'a different account'}`);
    must(await getsIn(real.d, email) === true, 'the real person gets in with Google, exactly as today');
    must(await tokenGetsIn(olderToken, email) === false, 'BEFORE any binding: the older token is refused');
    const renewed = await refresh(older.d);
    fact(`emulator: asked for a fresh token, the older browser gets: ${renewed}`);
    if (renewed === 'ok') {
      const c = await claimsOf(older.d);
      fact(`that fresh token says: verified ${c.email_verified}, signed in by ${c.firebase.sign_in_provider}`);
      must(await getsIn(older.d, email) === false, 'BEFORE any binding: refused with the fresh token as well (nobody is bound, so no password is honoured)');
    }
    must((await setPassword(email, 'idas own pass 1')).status === 'done', 'the real person sets a password by link');
    must(await tokenGetsIn(olderToken, email) === false, 'AFTER the binding: the older token is refused');
    if (renewed === 'ok') must(await getsIn(older.d, email) === false, 'AFTER the binding: the token it renewed earlier is refused too');
    must(await refresh(older.d) !== 'ok', 'and it cannot renew again');
    must(await getsIn((await byPassword('ida-phone', email, 'idas own pass 1')).d, email) === true, 'the real person gets in with the password');
    must(await getsIn((await google('ida-laptop-again', email)).d, email) === true, 'and still with Google');
  }
}

async function s8_aFailedSetup() {
  section('(8) A setup that fails half way');
  const email = 'jo@school.test';
  await list(email);
  await requestSetup(store, email, someIp());
  const token = await hubLink(email);
  const broken = { ...store, bind: async () => { throw new Error('the database is down'); } };
  must(await codeOf(completeSetup(broken, token, 'jos own pass 1', someIp())) !== 'ok', 'the binding step fails (the database is down at that moment)');
  must((await director(email)).passwordUid === undefined, 'nothing is bound');
  const half = await codeOf(signInWithEmailAndPassword(device('jo-half').auth, email, 'jos own pass 1'));
  fact(`the account from the failed attempt exists; signing in to it at the sign-in service answers: ${half}`);
  if (half === 'ok') must(await getsIn((await byPassword('jo-half-2', email, 'jos own pass 1')).d, email) === false, 'but the rules refuse it: an unbound account is not honoured');
  must((await completeSetup(store, token, 'jos own pass 1', someIp())).status === 'expired', 'the link was used up by the failed attempt');
  must((await setPassword(email, 'jos own pass 2')).status === 'done', 'asking again works: nothing is left to repair by hand');
  must(await getsIn((await byPassword('jo-phone', email, 'jos own pass 2')).d, email) === true, 'and gets in');
  must(await codeOf(signInWithEmailAndPassword(device('jo-old').auth, email, 'jos own pass 1')) !== 'ok', 'the password from the failed attempt is gone');
}

async function s9_linksAreOneTime() {
  section('(9) A link works once, for an hour, for its own person');
  const email = 'kit@school.test';
  await list(email);
  await requestSetup(store, email, someIp());
  const token = await hubLink(email);
  must((await completeSetup(store, token, 'short', someIp())).status === 'weak', 'a password under 10 characters is refused');
  const late = { ...store, now: () => Date.now() + 61 * 60 * 1000 };
  await requestSetup(store, email, someIp());
  const second = await hubLink(email);
  must((await completeSetup(late, second, 'kits own pass 1', someIp())).status === 'expired', 'a link opened after an hour: expired');
  must((await completeSetup(store, token, 'kits own pass 1', someIp())).status === 'done', 'the first link, still inside its hour, works (the short password did not use it up)');
  must((await completeSetup(store, token, 'kits own pass 2', someIp())).status === 'expired', 'and never a second time');
  must((await completeSetup(store, 'a-made-up-token-000000000000', 'kits own pass 3', someIp())).status === 'expired', 'a made-up link: expired');
  must(await getsIn((await byPassword('kit-phone', email, 'kits own pass 1')).d, email) === true, 'the password that was set gets in');
}

async function s10_removedAndReadded() {
  section('(10) A person taken off the list and added again');
  const email = 'lee@school.test';
  await list(email);
  await setPassword(email, 'lees own pass 1');
  const phone = await byPassword('lee-phone', email, 'lees own pass 1');
  const laptop = await google('lee-laptop', email);
  must(await getsIn(phone.d, email) === true && await getsIn(laptop.d, email) === true, 'in, by password and by Google');

  await adminDb.doc(`directors/${email}`).delete();
  must(await getsIn(phone.d, email) === false && await getsIn(laptop.d, email) === false, 'taken off the list: out, both ways');

  await list(email); // added again: a new doc, with no binding
  must(await getsIn(laptop.d, email) === true, 'added again: Google gets in at once, exactly as today');
  must(await getsIn(phone.d, email) === false, 'the password does not: the binding went with the old listing');
  must(await refresh(phone.d) === 'ok' && await getsIn(phone.d, email) === false, 'not with a renewed token either');
  const fresh = await byPassword('lee-phone-again', email, 'lees own pass 1');
  must(await getsIn(fresh.d, email) === false, 'not even signing in afresh with the old password');
  await requestSetup(store, email, someIp()); // anyone asking
  await hubLink(email);
  must(await getsIn(laptop.d, email) === true && (await director(email)).passwordUid === undefined, 'someone asking for their link changes nothing');
  must((await setPassword(email, 'lees own pass 2')).status === 'done', 'they open a link and choose a password again');
  must(await getsIn((await byPassword('lee-phone-third', email, 'lees own pass 2')).d, email) === true, 'and the password gets in again');
  must(await getsIn((await google('lee-laptop-again', email)).d, email) === true, 'as does Google');
}

/**
 * The two halves of the binding, each tested where it is the ONLY thing
 * standing. The setup function never produces either situation (it always
 * binds a fresh account), which is exactly why they need their own cases:
 * nothing above would notice if one half of the rule went missing.
 */
async function s11_theBindingTestItself() {
  section('(11) The binding test: the account, and the time');
  {
    // The bound account is removed out from under the binding (an admin
    // deleting it in the console, say), and a different account appears on
    // the address AFTER the binding time.
    const email = 'max@school.test';
    await list(email);
    await setPassword(email, 'maxs own pass 1');
    const boundUid = (await director(email)).passwordUid;
    await adminAuth.deleteUser(boundUid);
    const other = await outsideAccount('another-account', email, 'another pass 1', { verified: true });
    const c = await claimsOf(other.d);
    must(other.user.uid !== boundUid && c.email_verified === true && c.auth_time > (await director(email)).passwordBoundAt,
      'a different account on a bound person\'s address, verified, signed in after the binding time');
    must(await getsIn(other.d, email) === false, 'is refused: it is not the account that was bound');
  }
  {
    // A binding written onto an account that already had a browser signed in.
    const email = 'nia@school.test';
    await list(email);
    const early = await outsideAccount('signed-in-earlier', email, 'nias pass 1', { verified: true });
    await new Promise(r => setTimeout(r, 1100));
    const boundAt = Math.floor(Date.now() / 1000);
    await adminDb.doc(`directors/${email}`).update({ passwordUid: early.user.uid, passwordBoundAt: boundAt });
    must((await claimsOf(early.d)).auth_time <= boundAt && await getsIn(early.d, email) === false,
      'on the bound account itself, a sign-in from BEFORE the binding is refused');
    await new Promise(r => setTimeout(r, 2100));
    const later = await byPassword('signed-in-later', email, 'nias pass 1');
    must((await claimsOf(later.d)).auth_time > boundAt && await getsIn(later.d, email) === true,
      'and a sign-in made after it is honoured');
    await adminDb.doc(`directors/${email}`).update({ passwordBoundAt: `${boundAt}` });
    must(await getsIn(later.d, email) === false, 'a binding time that is not a whole number is honoured for nobody');
  }
}

await adminDb.doc('students/probe').set({ name: 'Probe Student (fictional)' });
const steps = [
  s1_theRulesAlone, s2_askingChangesNothing, s3_noAccountYet, s4_theBindingIsTheServers, s5_googleFirst,
  s6_reset, s7_accountsFromBefore, s8_aFailedSetup, s9_linksAreOneTime, s10_removedAndReadded,
  s11_theBindingTestItself,
];
for (const step of steps) {
  try { await step(); }
  catch (e) { failed++; console.log(`  FAIL  ${step.name} threw: ${e.code || ''} ${e.message}`); }
}
console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
await Promise.all(apps.map(a => deleteApp(a).catch(() => {})));
process.exit(failed ? 1 : 0);
