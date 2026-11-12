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
 * (googleBindingStore.ts) and the real Admin SDK, on the claims of a token
 * the Admin SDK verified: what the `bindGoogle` function does, minus only
 * its HTTP wrapper.
 *
 * Three gates are asked, and reported separately, because they are meant to
 * differ in one situation (see the top of storage.rules):
 *   Firestore   the person's own directors doc, and the staff-only roster.
 *               The tie is required once the server-only switch is on.
 *   Storage     a staff-only listing. The tie is always required.
 *   Functions   verifyIdToken, staffFromToken, the role check. Always required.
 *
 * Nothing here can reach production: the project id starts with "demo-".
 *
 * Run from the repo root (Java is Homebrew's keg-only openjdk on this Mac):
 *
 *   PATH="/opt/homebrew/opt/openjdk/bin:$PATH" firebase emulators:exec \
 *     --config firebase.emulators.json --only auth,firestore,storage \
 *     --project demo-google-binding \
 *     "node scripts/google-binding.emulator-proof.mjs"
 *
 * NOT in .github/actions/self-checks: those are pure and offline, and this
 * needs Java and three emulators. Run it by hand after any change to
 * firestore.rules, storage.rules, staffToken.ts, googleBinding.ts or the
 * sign-in screen.
 *
 * What an emulator can and cannot prove: the rules verdicts are exact (same
 * rules engine as production). What the sign-in service itself does when an
 * address is already taken is the emulator's MODEL of production, so those
 * lines are printed as FACT, not PASS.
 */
import { initializeApp, deleteApp } from 'firebase/app';
import {
  getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInAnonymously,
  signInWithCredential, GoogleAuthProvider, sendEmailVerification, applyActionCode,
  updateEmail, verifyBeforeUpdateEmail,
} from 'firebase/auth';
import { initializeApp as initializeAdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
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

/** A Google sign-in as the emulator models it: Google says who this is. `id` is Google's id for the person. */
const fakeGoogle = (email, id = `google-${email}`) => GoogleAuthProvider.credential(
  JSON.stringify({ sub: id, email, email_verified: true }),
);
const google = async (name, email, id) => {
  const d = device(name);
  const { user } = await signInWithCredential(d.auth, fakeGoogle(email, id));
  return { d, user };
};
const tokenOf = dev => dev.auth.currentUser.getIdToken();

/** What the app does by itself after a Google sign-in: ask the server to tie this entry. */
const askToBind = async dev => bindGoogle(store, await adminAuth.verifyIdToken(await tokenOf(dev)));

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
const all = async (dev, email, want) => {
  const g = await gates(await tokenOf(dev), email);
  return g.firestore === want && g.storage === want && g.functions === want;
};
const shape = g => `Firestore ${g.firestore ? 'in' : 'out'}, Storage ${g.storage ? 'in' : 'out'}, functions ${g.functions ? 'in' : 'out'}`;

async function serviceLink(email, requestType) {
  const res = await fetch(`http://${AUTH_HOST}/emulator/v1/projects/${PROJECT}/oobCodes`);
  const { oobCodes = [] } = await res.json();
  const to = c => (c.newEmail ?? c.email ?? '').toLowerCase(); // a change-of-address link is recorded under the NEW address
  const mine = oobCodes.filter(c => to(c) === email.toLowerCase() && c.requestType === requestType);
  if (!mine.length) throw new Error(`no ${requestType} email for ${email}`);
  return mine[mine.length - 1].oobCode;
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

// ────────────────────────────────────────────────────────────────────────────

async function s1_switchOff() {
  section('(1) The switch is off: Firestore answers exactly as it does today');
  await requireTie(false);
  const email = 'ada@school.test';
  await list(email);
  const ada = await google('ada-laptop', email);
  const g = await gates(await tokenOf(ada.d), email);
  must(g.firestore === true, 'a listed person signed in with Google, not tied yet: Firestore lets them in, as today');
  must(g.storage === false && g.functions === false, 'Storage and the functions wait for the tie (they exist only where the server step does)');
  const stranger = await google('unlisted', 'nobody@elsewhere.test');
  const st = await tokenOf(stranger.d);
  must(await fsGet('students/probe', st) === 403 && await fsGet('directors/nobody@elsewhere.test', st) === 404,
    'a Google account that is not listed: refused, and told "no such entry" as today (not an error)');
  must(await askToBind(stranger.d) === 'not-listed' && !await entry('nobody@elsewhere.test'), 'asking to be tied does not put anyone on the list');

  must(await askToBind(ada.d) === 'bound', 'the app asks, and the server ties Ada to her Google account');
  const e = await entry(email);
  must(e.googleSub === `google-${email}` && Number.isInteger(e.googleBoundAt), 'her entry now carries Google\'s id for her');
  must(await all(ada.d, email, true), 'and all three gates let her in, with the token she already had');

  await adminDb.doc('serverConfig/signIn').delete();
  const bea = 'bea@school.test';
  await list(bea);
  const b = await google('bea-laptop', bea);
  must((await gates(await tokenOf(b.d), bea)).firestore === true, 'with no switch document at all (a demo project): the same as off');
}

async function s2_switchOn_everyRole() {
  section('(2) The switch is on: nobody in until tied, then everybody in. Every role.');
  await requireTie(true);
  const roles = [['owner', 'owner'], ['director', 'director'], ['legacy', null], ['teacher', 'teacher'], ['classroom', 'classroom'], ['assistant', 'assistant']];
  for (const [who, role] of roles) {
    const email = `${who}@school.test`;
    await list(email, role);
    const p = await google(`${who}-phone`, email); // signed in on an up-to-date copy of the Hub
    const before = await gates(await tokenOf(p.d), email);
    const out = !before.firestore && !before.storage && !before.functions;
    const answer = await askToBind(p.d);
    const after = await gates(await tokenOf(p.d), email);
    // Storage's probe is an Owner-and-Director listing; the other roles' own Storage paths are covered by scripts/rules-verdicts.emulator-check.mjs.
    const storageWant = ['owner', 'director', 'legacy'].includes(who);
    must(out && answer === 'bound' && after.firestore && after.functions && after.storage === storageWant,
      `${who}: out before (${shape(before)}); the app asks, "${answer}"; in after, with the same token`);
  }
}

async function s3_whoMayWriteTheTie() {
  section('(3) Only the server writes the tie');
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
  const roles = { arrayValue: { values: [s('director')] } };
  const before = await entry(other);

  must(await patch(`directors/${other}`, { googleSub: s('some-other-google-account') }, ['googleSub'], ownerToken) === 403, 'the Owner cannot point a tie at another Google account');
  must(await patch('directors/new@school.test', { email: s('new@school.test'), roles, googleSub: s('x') }, null, ownerToken) === 403, 'the Owner cannot add a person already tied');
  must(await patch('directors/new@school.test', { email: s('new@school.test'), roles }, null, ownerToken) === 200, 'the Owner can add a person the ordinary way');
  must(await patch('directors/new@school.test', { googleSub: s('x') }, ['googleSub'], ownerToken) === 403, 'and cannot tie them afterwards');
  must(await patch(`directors/${other}`, { googleSub: s('x') }, ['googleSub'], otherToken) === 403, 'a person cannot alter their own tie');
  must(await patch(`directors/${other}`, {}, ['googleSub', 'googleBoundAt'], otherToken) === 403, 'or clear it');
  must(await patch(`directors/${other}`, { name: s('D. Example') }, ['name'], otherToken) === 200, 'but can still edit their own name');
  must(await patch(`directors/${other}`, { name: s('Director Example') }, ['name'], ownerToken) === 200, 'an ordinary edit by the Owner goes through');
  must(await patch(`directors/${owner}`, {}, ['googleSub', 'googleBoundAt'], ownerToken) === 403, 'the Owner cannot clear their OWN tie (it could not be undone from the app)');
  must(await patch(`directors/${other}`, {}, ['googleSub'], ownerToken) === 403, 'the Owner cannot clear half a tie');
  const now = await entry(other);
  must(now.googleSub === before.googleSub && now.googleBoundAt === before.googleBoundAt, 'after all of that the tie is exactly what the server wrote');
  must(await fsGet('serverConfig/signIn', ownerToken) === 403 && await patch('serverConfig/signIn', { googleTieRequired: { booleanValue: false } }, null, ownerToken) === 403,
    'the switch itself cannot be read or written by the Owner\'s browser');

  must(await patch(`directors/${other}`, {}, ['googleSub', 'googleBoundAt'], ownerToken) === 200, 'the Owner CAN clear another person\'s tie whole (Reset on the Directors screen)');
  must(await all(d.d, other, false), 'which lets that person in nowhere');
  must(await askToBind(d.d) === 'bound' && await all(d.d, other, true), 'until they open the Hub again: it ties them again by itself, and they are in');
}

async function s4_notTheirOwnGoogleAccount() {
  section('(4) An account that only carries a listed address is never tied, and never in');
  {
    // An account that carries a listed address, verified, while the Google
    // identity on it is Google's account for a DIFFERENT address. Put
    // together here directly with the Admin SDK.
    const email = 'cyd@school.test';
    await list(email);
    const account = await adminAuth.createUser({ email, emailVerified: true });
    await adminAuth.updateUser(account.uid, { providerToLink: { providerId: 'google.com', uid: 'google-someone', email: 'someone@gmail.test' } });
    const other = await google('another-google-account', 'someone@gmail.test', 'google-someone');
    const c = (await other.d.auth.currentUser.getIdTokenResult()).claims;
    must(other.user.uid === account.uid && c.email === email && c.email_verified === true && c.firebase.sign_in_provider === 'google.com',
      'its token carries the listed address, verified, signed in by Google');
    must(await all(other.d, email, false), 'refused by Firestore, Storage and the functions');
    must(await askToBind(other.d) === 'mismatch' && (await entry(email)).googleSub === undefined, 'the server will not tie it: Google\'s own address for it is not the listed one');
    must(await all(other.d, email, false), 'and it stays refused');
  }
  {
    const email = 'dee@school.test';
    await list(email);
    const d = device('password-account');
    const { user } = await createUserWithEmailAndPassword(d.auth, email, 'some password 1');
    await sendEmailVerification(user);
    await applyActionCode(device('link').auth, await serviceLink(email, 'VERIFY_EMAIL'));
    await user.getIdToken(true);
    must(await all(d, email, false) && await askToBind(d) === 'mismatch' && await all(d, email, false), 'a verified password account on a listed address: refused, not tied, still refused');
    await adminAuth.deleteUser(user.uid);
  }
  {
    const email = 'eli@school.test';
    await list(email);
    const d = device('anonymous');
    const { user } = await signInAnonymously(d.auth);
    if (await codeOf(updateEmail(user, email)) !== 'ok') {
      await verifyBeforeUpdateEmail(user, email);
      await applyActionCode(device('link').auth, await serviceLink(email, 'VERIFY_AND_CHANGE_EMAIL'));
    } else {
      await sendEmailVerification(user);
      await applyActionCode(device('link').auth, await serviceLink(email, 'VERIFY_EMAIL'));
    }
    await user.getIdToken(true);
    must(await all(d, email, false) && await askToBind(d) === 'mismatch' && await all(d, email, false), 'an anonymous account given a listed address: refused, not tied, still refused');
  }
}

async function s5_theOtherWaysPeopleArrive() {
  section('(5) The ordinary cases');
  {
    const email = 'fay@school.test';
    await list(email);
    const old = await google('fay-phone-on-an-old-copy', email); // an old copy of the Hub never asks to be tied
    must(await all(old.d, email, false), 'an old copy of the Hub that never asks: out, until it is refreshed');
    await requireTie(false);
    must((await gates(await tokenOf(old.d), email)).firestore === true, '(with the switch off that same old copy is in, which is why the switch waits for everyone)');
    await requireTie(true);
    must(await askToBind(old.d) === 'bound' && await all(old.d, email, true), 'once refreshed it asks, is tied, and is in, without signing in again');
    const second = await google('fay-laptop', email);
    must(await all(second.d, email, true), 'her other devices are in at once: the tie is to her Google account, not to a device');
    must(await askToBind(second.d) === 'bound' && (await entry(email)).googleSub === `google-${email}`, 'and asking again changes nothing');
  }
  {
    // Tied people need nothing from the server step ever again.
    const email = 'gus@school.test';
    await list(email);
    const gus = await google('gus-phone', email);
    await askToBind(gus.d);
    const later = await google('gus-phone-next-week', email); // no call to the server step at all
    must(await all(later.d, email, true), 'a tied person signs in and is in with no help from the server step (it can be unreachable)');
  }
  {
    // The person's Google account itself changed: same address, a different Google account.
    const email = 'hal@school.test';
    await list(email);
    const first = await google('hal-old-google', email, 'google-hal-old');
    await askToBind(first.d);
    await adminAuth.deleteUser(first.user.uid);
    const second = await google('hal-new-google', email, 'google-hal-new');
    must(await all(second.d, email, false), 'a different Google account for the same address: out');
    must(await askToBind(second.d) === 'other-account' && (await entry(email)).googleSub === 'google-hal-old', 'the server will not move the tie by itself: the person is told to ask the Owner');
    await adminDb.doc(`directors/${email}`).update({ googleSub: '', googleBoundAt: 0 }); // what "Reset", or a blanked field, leaves
    must(await all(second.d, email, false), 'a blank tie lets nobody in');
    must(await askToBind(second.d) === 'bound' && await all(second.d, email, true), 'after the Owner resets it, the Hub ties the new Google account and they are in');
  }
  {
    const email = 'ivy@school.test';
    await list(email);
    const ivy = await google('ivy-phone', email);
    await askToBind(ivy.d);
    must(await all(ivy.d, email, true), 'tied and in');
    await adminDb.doc(`directors/${email}`).delete();
    must(await all(ivy.d, email, false), 'taken off the list: out');
    must(await askToBind(ivy.d) === 'not-listed' && !await entry(email), 'and asking to be tied does not put her back');
    await list(email); // added again: a new entry, with no tie
    must(await all(ivy.d, email, false), 'added again: out until tied');
    must(await askToBind(ivy.d) === 'bound' && await all(ivy.d, email, true), 'the Hub ties her again by itself, and she is in');
  }
}

async function s6_reversible() {
  section('(6) Turning the switch back off');
  const email = 'jon@school.test';
  await list(email);
  const jon = await google('jon-phone', email);
  must((await gates(await tokenOf(jon.d), email)).firestore === false, 'switch on, not tied: Firestore out');
  await requireTie(false);
  must((await gates(await tokenOf(jon.d), email)).firestore === true, 'switch off: in again at once, with the same token. One write undoes it.');
  await requireTie(true);
}

await adminDb.doc('students/probe').set({ name: 'Probe Student (fictional)' });
const steps = [s1_switchOff, s2_switchOn_everyRole, s3_whoMayWriteTheTie, s4_notTheirOwnGoogleAccount, s5_theOtherWaysPeopleArrive, s6_reversible];
for (const step of steps) {
  try { await step(); }
  catch (e) { failed++; console.log(`  FAIL  ${step.name} threw: ${e.code || ''} ${e.message}`); }
}
console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
await Promise.all(apps.map(a => deleteApp(a).catch(() => {})));
process.exit(failed ? 1 : 0);
