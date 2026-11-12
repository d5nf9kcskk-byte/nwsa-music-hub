#!/usr/bin/env node
/**
 * Proof for email-and-password staff sign-in (#password-sign-in; spec section
 * 10.4 of docs/superpowers/specs/2026-11-11-hub2-integrated-design.md).
 *
 * Runs REAL sign-ins against the Firebase Auth emulator and reads through the
 * Firestore emulator with the REAL firestore.rules, so the token the rules
 * judge is the one the sign-in service actually minted (not a hand-made one).
 * "Listing an address" runs the REAL ensureStaffAccount from
 * functions/src/staffAccount.ts through the real Admin SDK, which is exactly
 * what the staffAccountOnListing trigger does.
 * Nothing here can reach production: the project id starts with "demo-".
 *
 * Run from the repo root (Java is Homebrew's keg-only openjdk on this Mac):
 *
 *   PATH="/opt/homebrew/opt/openjdk/bin:$PATH" firebase emulators:exec \
 *     --config firebase.emulators.json --only auth,firestore \
 *     --project demo-password-sign-in \
 *     "node scripts/password-sign-in.emulator-proof.mjs"
 *
 * NOT in .github/actions/self-checks: those are pure and offline, and this
 * needs Java and two emulators. Run it by hand before switching
 * features.passwordSignIn on, and again after any change to the sign-in
 * screen, to staffAccount.ts, or to the verified-email checks in
 * firestore.rules.
 *
 * What an emulator can and cannot prove: the RULES verdicts are exact (same
 * rules engine as production). The sign-in service's own behaviour is the
 * emulator's MODEL of production, so those lines say "emulator" on purpose.
 */
import { initializeApp, deleteApp } from 'firebase/app';
import {
  getAuth, connectAuthEmulator, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signInWithCredential, GoogleAuthProvider,
  sendEmailVerification, sendPasswordResetEmail, applyActionCode,
  confirmPasswordReset,
} from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, getDoc, setLogLevel } from 'firebase/firestore';
import { initializeApp as initializeAdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { ensureStaffAccount, carriesPassword } from '../functions/src/staffAccount.ts';

const PROJECT = process.env.GCLOUD_PROJECT || 'demo-password-sign-in';
if (!PROJECT.startsWith('demo-')) {
  console.error(`Refusing to run against "${PROJECT}": the project id must start with demo-.`);
  process.exit(2);
}
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const FS_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
// The Admin SDK talks to the emulator only when this is set. Set it BEFORE
// the admin app exists, so there is no way for it to look for the real thing.
process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_HOST;
const [FS_NAME, FS_PORT] = FS_HOST.split(':');
const adminAuth = getAdminAuth(initializeAdminApp({ projectId: PROJECT }));

setLogLevel('silent'); // every refused read logs PERMISSION_DENIED; that is the point, not noise worth printing

const apps = [];
/** One browser: its own sign-in state and its own Firestore connection. */
function device(name) {
  const app = initializeApp({ apiKey: 'demo-key', projectId: PROJECT }, `${name}-${apps.length}`);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${AUTH_HOST}`, { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, FS_NAME, Number(FS_PORT));
  return { name, auth, db };
}

/** Admin write that bypasses the rules, as the seed scripts do. */
async function seed(path, fields) {
  const res = await fetch(`http://${FS_HOST}/v1/projects/${PROJECT}/databases/(default)/documents/${path}`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`seed ${path}: ${res.status} ${await res.text()}`);
}
/** The directors doc alone, with no account made: only the rules stand guard. */
const docOnly = email => seed(`directors/${email.toLowerCase()}`, { role: { stringValue: 'director' } });
/** What the owner pressing Add does: the doc, then the trigger's work. */
async function list(email) {
  await docOnly(email);
  return ensureStaffAccount(adminAuth, email.toLowerCase(), { replacePassworded: true });
}

/** The inbox: the newest link the sign-in service "emailed" to this address. */
async function inbox(email, requestType) {
  const res = await fetch(`http://${AUTH_HOST}/emulator/v1/projects/${PROJECT}/oobCodes`);
  const { oobCodes = [] } = await res.json();
  const mine = oobCodes.filter(c => c.email.toLowerCase() === email.toLowerCase() && c.requestType === requestType);
  if (!mine.length) throw new Error(`no ${requestType} email for ${email}`);
  return mine[mine.length - 1].oobCode;
}

const withTimeout = (p, what) => Promise.race([
  p,
  new Promise((_, rej) => setTimeout(() => rej(new Error(`timed out: ${what}`)), 15000)),
]);

/**
 * Do the rules let this browser in as staff? Asks the two reads AuthGate and
 * every staff screen depend on: its own directors doc (verifiedSelf) and the
 * staff-only roster (isKnownRole). Both must agree, or the proof is confused.
 */
async function getsIn(dev, email) {
  const tryRead = async ref => {
    try { await withTimeout(getDoc(ref), ref.path); return true; }
    catch (e) {
      if (e.code === 'permission-denied') return false;
      throw e;
    }
  };
  const own = await tryRead(doc(dev.db, 'directors', email.toLowerCase()));
  const roster = await tryRead(doc(dev.db, 'students', 'probe'));
  if (own !== roster) throw new Error(`${dev.name}: directors read ${own} but students read ${roster}`);
  return own;
}

/** Re-mint this browser's token. Returns the error code if the service refuses. */
async function refresh(dev) {
  try {
    await dev.auth.currentUser.reload();
    await dev.auth.currentUser.getIdToken(true);
    return 'ok';
  } catch (e) { return e.code || String(e); }
}

const fakeGoogle = email => GoogleAuthProvider.credential(
  JSON.stringify({ sub: `google-${email}`, email, email_verified: true }),
);

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

/**
 * The one way a password is ever chosen: the emailed reset link. Returns the
 * signed-in user. The Hub's screen does exactly this and nothing more.
 */
async function setPasswordByLink(dev, email, password) {
  await sendPasswordResetEmail(dev.auth, email);
  await confirmPasswordReset(dev.auth, await inbox(email, 'PASSWORD_RESET'), password);
  return (await signInWithEmailAndPassword(dev.auth, email, password)).user;
}

// ────────────────────────────────────────────────────────────────────────────

async function a_unverifiedIsRefused() {
  section('(a) The rules refuse a password account whose email was never verified');
  const email = 'ada@school.test';
  await docOnly(email); // deliberately NOT list(): this is the rules alone, with no account made by the Hub
  const d = device('ada-phone');
  const { user } = await createUserWithEmailAndPassword(d.auth, email, 'correct horse 1');
  const claims = (await user.getIdTokenResult()).claims;
  must(claims.email === email && claims.email_verified === false, 'such an account\'s token says email_verified: false');
  must(await getsIn(d, email) === false, 'refused by the rules, though the email IS on the Directors list');
  await d.auth.signOut();
  await signInWithEmailAndPassword(d.auth, email, 'correct horse 1');
  must(await getsIn(d, email) === false, 'still refused after signing out and back in with the password');
}

async function b_listingMakesTheAccount() {
  section('(b) Listing an address makes its account, and the emailed link is the only way to a password');
  const typed = 'Ben.Stone@School.test'; // typed with capitals; the Directors list stores lowercase
  const email = typed.toLowerCase();
  must(await list(email) === 'created', 'the Hub makes the account when the address is listed');
  const made = await adminAuth.getUserByEmail(email);
  must(!carriesPassword(made) && made.emailVerified === false, 'it is empty: no password, and not marked verified');

  const other = device('someone-else');
  const create = await codeOf(createUserWithEmailAndPassword(other.auth, email, 'not bens pass 1'));
  must(create === 'auth/email-already-in-use', `nobody else can make an account on a listed address (${create})`);
  const guess = await codeOf(signInWithEmailAndPassword(other.auth, email, 'not bens pass 1'));
  must(guess !== 'ok', `and nobody can sign in to the empty one (${guess})`);

  const phone = device('ben-phone');
  const user = await setPasswordByLink(phone, typed, 'bens own pass 1');
  fact(`emulator: straight after the reset link, emailVerified is ${user.emailVerified}`);
  if (!user.emailVerified) {
    // The screen's fallback: the person, already signed in with the password
    // they chose by link, presses "Email me the link".
    await sendEmailVerification(user);
    await applyActionCode(device('ben-mail-app').auth, await inbox(email, 'VERIFY_EMAIL'));
    await refresh(phone);
  }
  must(user.uid === made.uid, 'the person who opens the inbox chooses the password, on the account the Hub made');
  must(await getsIn(phone, email) === true, 'and gets in (capitals in the typed email do not matter)');

  const laptop = device('ben-laptop');
  const g = await signInWithCredential(laptop.auth, fakeGoogle(email));
  must(g.user.uid === made.uid && await getsIn(laptop, email) === true, 'Google sign-in with the same address opens the SAME account, and gets in');
  const tablet = device('ben-tablet');
  const p = await signInWithEmailAndPassword(tablet.auth, email, 'bens own pass 1');
  must(p.user.uid === made.uid && await getsIn(tablet, email) === true, 'the password still works afterwards, same account, gets in');

  must(await ensureStaffAccount(adminAuth, email, { replacePassworded: false }) === 'has-password', 'a later sweep of the whole list reports the password and leaves it');
  must(await codeOf(signInWithEmailAndPassword(device('ben-again').auth, email, 'bens own pass 1')) === 'ok', 'so the password Ben chose still works after the sweep');
}

async function c_googleFirst() {
  section('(c) A director who has always used Google is untouched, and can add a password');
  const email = 'cara@school.test';
  const laptop = device('cara-laptop');
  const g = await signInWithCredential(laptop.auth, fakeGoogle(email));
  must(await list(email) === 'exists', 'listing finds the Google account and leaves it exactly as it is');
  must((await adminAuth.getUserByEmail(email)).uid === g.user.uid, 'same account as before');
  must(await refresh(laptop) === 'ok' && await getsIn(laptop, email) === true, 'the browser already signed in with Google stays signed in, and gets in');

  const phone = device('cara-phone');
  const p = await setPasswordByLink(phone, email, 'caras own pass 1');
  must(p.uid === g.user.uid && await getsIn(phone, email) === true, 'a password set by the emailed link opens the same account, and gets in');
  const g2 = await signInWithCredential(device('cara-laptop-again').auth, fakeGoogle(email));
  must(g2.user.uid === g.user.uid, 'and Google still opens it afterwards');
}

/**
 * An account that carried a password BEFORE its address was listed. Nothing
 * shows who chose that password, so listing must leave it useless, in every
 * state the account could be in.
 */
async function d_passwordBeforeListing() {
  const variants = [
    { key: 'unverified', label: 'never verified' },
    { key: 'verified', label: 'already verified' },
    { key: 'google', label: 'verified, with Google on it as well' },
  ];
  for (const v of variants) {
    section(`(d) An account that carried a password before its address was listed: ${v.label}`);
    const email = `dan-${v.key}@school.test`;
    const earlier = device('earlier-holder');
    const before = (await createUserWithEmailAndPassword(earlier.auth, email, 'earlier pass 1')).user;
    await sendEmailVerification(before);
    const oldLink = await inbox(email, 'VERIFY_EMAIL');
    if (v.key !== 'unverified') {
      await applyActionCode(device('a-mail-app').auth, oldLink);
      await refresh(earlier);
    }
    if (v.key === 'google') await signInWithCredential(device('dan-laptop').auth, fakeGoogle(email));

    must(await list(email) === 'replaced', 'listing replaces it with an empty account');
    const now = await adminAuth.getUserByEmail(email);
    must(now.uid !== before.uid && !carriesPassword(now) && now.emailVerified === false, 'what stands on the address now is new, empty and unverified');

    const old = await codeOf(signInWithEmailAndPassword(device('earlier-holder-again').auth, email, 'earlier pass 1'));
    must(old !== 'ok', `the earlier password no longer signs in (${old})`);
    const renew = await refresh(earlier);
    must(renew !== 'ok', `a browser left signed in to the old account cannot renew its sign-in (${renew})`);
    const again = await codeOf(createUserWithEmailAndPassword(device('earlier-holder-third').auth, email, 'earlier pass 2'));
    must(again === 'auth/email-already-in-use', 'and nobody can make another account on the address');

    if (v.key === 'unverified') {
      const tapped = await codeOf(applyActionCode(device('dan-mail-app').auth, oldLink));
      fact(`emulator: a verification link emailed before the listing, tapped after it, answers: ${tapped}`);
      must(await getsIn(earlier, email) === false, 'tapping that old link lets nobody in');
      must(await codeOf(signInWithEmailAndPassword(device('earlier-holder-fourth').auth, email, 'earlier pass 1')) !== 'ok', 'and the earlier password still does not sign in');
    }

    const phone = device('dan-phone');
    const user = await setPasswordByLink(phone, email, 'dans own pass 1');
    if (!user.emailVerified) {
      await sendEmailVerification(user);
      await applyActionCode(device('dan-mail-app-2').auth, await inbox(email, 'VERIFY_EMAIL'));
      await refresh(phone);
    }
    must(user.uid === now.uid && await getsIn(phone, email) === true, 'the real person sets a password by the emailed link and gets in');
    if (v.key === 'google') {
      const laptop = device('dan-laptop-again');
      const g = await signInWithCredential(laptop.auth, fakeGoogle(email));
      must(g.user.uid === now.uid && await getsIn(laptop, email) === true, 'and the real person still gets in with Google, on the new account');
    }
  }
}

async function e_notOnTheList() {
  section('(control) A verified password account that is NOT on the Directors list');
  const email = 'stranger@elsewhere.test';
  const d = device('stranger');
  const { user } = await createUserWithEmailAndPassword(d.auth, email, 'strangers pass 1');
  await sendEmailVerification(user);
  await applyActionCode(d.auth, await inbox(email, 'VERIFY_EMAIL'));
  await refresh(d);
  let roster = 'read';
  try { await withTimeout(getDoc(doc(d.db, 'students', 'probe')), 'students/probe'); }
  catch (e) { roster = e.code; }
  must(roster === 'permission-denied', 'cannot read the staff-only roster (verifying an address grants nothing by itself)');
}

await seed('students/probe', { name: { stringValue: 'Probe Student (fictional)' } });
const steps = [a_unverifiedIsRefused, b_listingMakesTheAccount, c_googleFirst, d_passwordBeforeListing, e_notOnTheList];
for (const step of steps) {
  try { await step(); }
  catch (e) { failed++; console.log(`  FAIL  ${step.name} threw: ${e.code || ''} ${e.message}`); }
}
console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
await Promise.all(apps.map(a => deleteApp(a).catch(() => {})));
process.exit(failed ? 1 : 0);
