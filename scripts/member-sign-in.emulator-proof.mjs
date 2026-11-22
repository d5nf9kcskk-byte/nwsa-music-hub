#!/usr/bin/env node
/**
 * Proof for player sign-in by invitation (#member-sign-in, personnel orgs).
 *
 * Real sign-ins on the Auth emulator; every verdict is the REAL
 * firestore.rules and storage.rules. The invitation and the password run the
 * REAL staffSendLink / requestSetup / completeSetup (functions/src/
 * passwordSetup.ts) over the real store (passwordSetupStore.ts,
 * freshAccount.ts, entryLock.ts) and the Admin SDK: the code the
 * `passwordSetup` function runs, minus its HTTP wrapper. The member functions'
 * sign-in test is the real memberFromToken (memberToken.ts) on a token the
 * emulator minted. Asserts: a wrong answer exits 1.
 *
 * What it pins:
 *   • staff invite a player from Personnel: create a member entry tied to a
 *     roster row that exists, nothing more; an assistant cannot;
 *   • the player sets their own password from the emailed link and signs in;
 *   • a signed-in player reads their own Directors entry and nothing else:
 *     no roster row, contract, payment or contact (those come through the
 *     memberHome projection), no school collection, no one else's entry;
 *   • the members-only parts path: a player and staff read, nobody writes,
 *     a visitor reads nothing;
 *   • a password on a STAFF entry is never honoured, and the password steps
 *     never mail a staff address; a password account the server did not bind
 *     is refused;
 *   • staff remove a player, and the player is out.
 *
 * Project ids must start with demo-. Everyone here is made up. Run from the
 * repo root (Java is Homebrew's keg-only openjdk on this Mac):
 *
 *   PATH="/opt/homebrew/opt/openjdk/bin:$PATH" firebase emulators:exec \
 *     --config firebase.emulators.json --only auth,firestore,storage \
 *     --project demo-member-sign-in "node scripts/member-sign-in.emulator-proof.mjs"
 */
import { initializeApp, deleteApp } from 'firebase/app';
import {
  getAuth, connectAuthEmulator, signInWithCredential, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, GoogleAuthProvider, signOut,
} from 'firebase/auth';
import {
  getFirestore, connectFirestoreEmulator, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  collection, query, where, terminate,
} from 'firebase/firestore';
import { getStorage, connectStorageEmulator, ref, getBytes, uploadString } from 'firebase/storage';
import { initializeApp as initializeAdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { getStorage as getAdminStorage } from 'firebase-admin/storage';
import { requestSetup, staffSendLink, completeSetup } from '../functions/src/passwordSetup.ts';
import { passwordSetupStore } from '../functions/src/passwordSetupStore.ts';
import { memberFromToken } from '../functions/src/memberToken.ts';
import { staffFromToken } from '../functions/src/staffToken.ts';
import { readSetupLink } from '../src/shared/passwordSetupLink.ts';

const PROJECT = process.env.GCLOUD_PROJECT || 'demo-member-sign-in';
if (!PROJECT.startsWith('demo-')) { console.error('Refusing: the project id must start with demo-.'); process.exit(2); }
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const FS_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const ST_HOST = process.env.FIREBASE_STORAGE_EMULATOR_HOST || '127.0.0.1:9199';
process.env.FIRESTORE_EMULATOR_HOST = FS_HOST;
process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_HOST;
process.env.FIREBASE_STORAGE_EMULATOR_HOST = ST_HOST;
const BUCKET = `${PROJECT}.appspot.com`;
const admin = initializeAdminApp({ projectId: PROJECT, storageBucket: BUCKET });
const adminDb = getAdminFirestore(admin);
const adminAuth = getAdminAuth(admin);

let failed = 0;
const say = (ok, label, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` (${detail})` : ''}`); };
const code = e => e?.code ?? String(e);
async function expect(label, want, fn) {
  try { await fn(); say(want === 'allow', label, `wanted ${want}, got allow`); }
  catch (e) {
    const denied = /permission-denied|unauthorized|storage\/unauthorized|PERMISSION_DENIED/i.test(code(e));
    say(want === 'deny' && denied, label, `wanted ${want}, got ${code(e)}`);
  }
}

const apps = [];
function client(name) {
  const app = initializeApp({ apiKey: 'demo-key', projectId: PROJECT, storageBucket: BUCKET }, name);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${AUTH_HOST}`, { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, ...FS_HOST.split(':').map((v, i) => (i ? Number(v) : v)));
  const st = getStorage(app);
  connectStorageEmulator(st, ...ST_HOST.split(':').map((v, i) => (i ? Number(v) : v)));
  return { app, auth, db, st };
}
const google = (c, who) => signInWithCredential(c.auth, GoogleAuthProvider.credential(JSON.stringify({ sub: `google-${who}`, email: `${who}@orchestra.test`, email_verified: true })));

// ── The orchestra: staff on Google (switch off, as a fresh project starts), a roster row ──
const STAFF = { owner: ['owner'], director: ['director'], assistant: ['assistant'] };
const staff = {};
for (const [who, roles] of Object.entries(STAFF)) {
  staff[who] = client(who);
  const { user } = await google(staff[who], who);
  // Bound, as bindGoogle leaves them: Storage always asks for the record.
  await adminDb.doc(`directors/${who}@orchestra.test`).set({ email: `${who}@orchestra.test`, roles, googleSub: `google-${who}`, boundUid: user.uid, boundAt: 1 });
}
await adminDb.doc('personnel/p1').set({ name: 'Ana Ruiz', instrument: 'Violin', section: 'Violin I', seat: 3, status: 'Contracted', notes: 'staff only' });
await adminDb.doc('personnelContacts/p1').set({ email: 'ana@orchestra.test', payMethod: 'zelle', payHandle: 'ana@orchestra.test' });
await adminDb.doc('contracts/c1').set({ personnelId: 'p1', personnelName: 'Ana Ruiz', category: 'chair', position: 'Section', status: 'Signed', baseRateCents: 15000, baseRateBasis: 'per-service', notes: 'staff only' });
await adminDb.doc('payments/y1').set({ contractId: 'c1', personnelId: 'p1', amountCents: 15000, paidOn: '2027-01-04', method: 'zelle' });
await adminDb.doc('students/s1').set({ name: 'A Student' });
await adminDb.doc('events/e1').set({ title: 'Dress rehearsal', date: '2027-01-02' });
await getAdminStorage(admin).bucket(BUCKET).file('members/parts/demo-piece/Violins I v2.pdf').save('%PDF-1.4 demo');

const ANA = 'ana@orchestra.test';
const entry = { roles: ['member'], personnelId: 'p1', name: 'Ana Ruiz', invitedAt: 1, invitedBy: 'director@orchestra.test' };
const d = staff.director.db;

// ── Staff invite ──
await expect('a director adds a player as a member, tied to their roster row', 'allow', () => setDoc(doc(d, 'directors', ANA), entry));
await expect('a director cannot add a member for a roster row that does not exist', 'deny', () => setDoc(doc(d, 'directors', 'x@orchestra.test'), { ...entry, personnelId: 'nope' }));
await expect('a director cannot add a member carrying a password record', 'deny', () => setDoc(doc(d, 'directors', 'y@orchestra.test'), { ...entry, passwordSet: true }));
await expect('a director cannot add a member who is also a director', 'deny', () => setDoc(doc(d, 'directors', 'z@orchestra.test'), { ...entry, roles: ['member', 'director'] }));
await expect('a director still cannot add a director', 'deny', () => setDoc(doc(d, 'directors', 'w@orchestra.test'), { roles: ['director'] }));
await expect('an assistant cannot add a member', 'deny', () => setDoc(doc(staff.assistant.db, 'directors', 'v@orchestra.test'), entry));
await expect('a director lists the members', 'allow', () => getDocs(query(collection(d, 'directors'), where('roles', '==', ['member']))));
await expect('a director still cannot list the whole Directors list', 'deny', () => getDocs(collection(d, 'directors')));
await expect('a director cannot edit a member entry', 'deny', () => updateDoc(doc(d, 'directors', ANA), { personnelId: 'p2' }));

// The real invitation: staffSendLink writes a `mail` doc with the link.
const deps = passwordSetupStore(adminDb, adminAuth, { publicUrl: 'https://hub.example/', appName: 'Orchestra Hub' });
say(await staffSendLink(deps, ANA) === 'sent', 'the invitation is sent to the player');
const lastLink = async to => {
  const mails = (await adminDb.collection('mail').get()).docs.map(m => m.data()).filter(m => m.to?.[0] === to);
  const m = mails.map(x => x.message.text.match(/https:\S+/)?.[0]).filter(Boolean).pop();
  return m ? readSetupLink(m.slice(m.indexOf('#'))) : null;
};
const link = await lastLink(ANA);
say(!!link && link.email === ANA, 'the mail carries a one-time link for that address');
say(await staffSendLink(deps, 'director@orchestra.test') === 'not-listed', 'an invitation is never sent to a staff address');
await requestSetup({ ...deps, sleepUntil: async () => {} }, 'owner@orchestra.test', '1.1.1.1');
say(!(await lastLink('owner@orchestra.test')), 'and asking for a staff address sends nothing: staff keep Google');

// A player who has not set a password yet: nothing.
const ana = client('ana');
try { await signInWithEmailAndPassword(ana.auth, ANA, 'correct horse battery'); say(false, 'before the link is used, there is no password to sign in with'); }
catch (e) { say(/auth\/(user-not-found|invalid-credential|wrong-password)/.test(code(e)), 'before the link is used, there is no password to sign in with', code(e)); }

// The player chooses their password.
const out = await completeSetup(deps, link.token, 'correct horse battery', '2.2.2.2');
say(out.status === 'done', 'the player sets their own password from the link', out.status);
const rec = (await adminDb.doc(`directors/${ANA}`).get()).data();
say(rec.passwordSet === true && typeof rec.boundUid === 'string', 'the entry records the account the server made');
say((await completeSetup(deps, link.token, 'another password 1', '2.2.2.2')).status === 'expired', 'the link works once');

// ── The player, signed in ──
const { user } = await signInWithEmailAndPassword(ana.auth, ANA, 'correct horse battery');
say(user.uid === rec.boundUid, 'the player signs in with their password, on the bound account');
const a = ana.db;
await expect('the player reads their own Directors entry', 'allow', () => getDoc(doc(a, 'directors', ANA)));
await expect('the player cannot edit their own entry (name)', 'deny', () => updateDoc(doc(a, 'directors', ANA), { name: 'Someone' }));
await expect('the player cannot give themself a role', 'deny', () => updateDoc(doc(a, 'directors', ANA), { roles: ['director'] }));
await expect('the player cannot read anyone else\'s entry', 'deny', () => getDoc(doc(a, 'directors', 'director@orchestra.test')));
await expect('the player cannot list the members', 'deny', () => getDocs(query(collection(a, 'directors'), where('roles', '==', ['member']))));
for (const [label, path] of [['roster row', 'personnel/p1'], ['contact', 'personnelContacts/p1'], ['contract', 'contracts/c1'], ['payment', 'payments/y1'], ['student (school)', 'students/s1']]) {
  await expect(`the player cannot read a ${label} directly (it comes through memberHome)`, 'deny', () => getDoc(doc(a, ...path.split('/'))));
}
await expect('the player cannot query their own contracts directly either', 'deny', () => getDocs(query(collection(a, 'contracts'), where('personnelId', '==', 'p1'))));
await expect('the player cannot write a payment', 'deny', () => setDoc(doc(a, 'payments', 'y9'), { contractId: 'c1', personnelId: 'p1', amountCents: 1, paidOn: '2027-01-04', method: 'zelle' }));
await expect('the player cannot write the sign-in log', 'deny', () => setDoc(doc(a, 'loginEvents', 'l1'), { email: ANA, role: 'member', at: 1 }));
await expect('the player reads the public schedule like anyone', 'allow', () => getDoc(doc(a, 'events', 'e1')));
await expect('the player opens a members-only part', 'allow', () => getBytes(ref(ana.st, 'members/parts/demo-piece/Violins I v2.pdf')));
await expect('the player cannot upload a part', 'deny', () => uploadString(ref(ana.st, 'members/parts/demo-piece/x.pdf'), 'x'));
await expect('the player cannot upload a document', 'deny', () => uploadString(ref(ana.st, 'documents/x.pdf'), 'x'));
await expect('the player cannot open the check-in photos', 'deny', () => getBytes(ref(ana.st, 'checkins/x.jpg')));

// The member functions' test, on the token the emulator minted.
const claims = await adminAuth.verifyIdToken(await user.getIdToken());
const load = async email => (await adminDb.doc(`directors/${email}`).get()).data();
const m = await memberFromToken(claims, load);
say(m?.director.personnelId === 'p1', 'memberHome would serve this player their own roster row (personnelId from the entry)');
say(await staffFromToken(claims, load) === null, 'and no staff function honours a player\'s password sign-in');

// ── Staff and visitors on the parts path ──
await expect('a director opens a members-only part', 'allow', () => getBytes(ref(staff.director.st, 'members/parts/demo-piece/Violins I v2.pdf')));
await expect('a director cannot upload a part from the app (the ingest does, with the Admin SDK)', 'deny', () => uploadString(ref(staff.director.st, 'members/parts/demo-piece/y.pdf'), 'y'));
await expect('an assistant cannot open a members-only part', 'deny', () => getBytes(ref(staff.assistant.st, 'members/parts/demo-piece/Violins I v2.pdf')));
const visitor = client('visitor');
await expect('a visitor cannot open a members-only part', 'deny', () => getBytes(ref(visitor.st, 'members/parts/demo-piece/Violins I v2.pdf')));
const stranger = client('stranger');
await google(stranger, 'stranger');
await expect('an unlisted Google account cannot open a members-only part', 'deny', () => getBytes(ref(stranger.st, 'members/parts/demo-piece/Violins I v2.pdf')));

// ── Passwords that must not count ──
// A staff entry with a password the server "set" (made by hand here): refused everywhere.
const staffPw = client('staffpw');
const sp = await createUserWithEmailAndPassword(staffPw.auth, 'pwdirector@orchestra.test', 'correct horse battery');
await adminAuth.updateUser(sp.user.uid, { emailVerified: true });
await adminDb.doc('directors/pwdirector@orchestra.test').set({ roles: ['director'], boundUid: sp.user.uid, boundAt: 1, passwordSet: true });
await sp.user.getIdToken(true);
await expect('a password on a DIRECTOR entry is not honoured (own entry)', 'deny', () => getDoc(doc(staffPw.db, 'directors', 'pwdirector@orchestra.test')));
await expect('a password on a DIRECTOR entry is not honoured (roster)', 'deny', () => getDoc(doc(staffPw.db, 'personnel', 'p1')));
await expect('a password on a DIRECTOR entry is not honoured (Storage)', 'deny', () => getBytes(ref(staffPw.st, 'members/parts/demo-piece/Violins I v2.pdf')));
// A member whose password account the server did not bind.
const rogue = client('rogue');
const rg = await createUserWithEmailAndPassword(rogue.auth, 'bo@orchestra.test', 'correct horse battery');
await adminAuth.updateUser(rg.user.uid, { emailVerified: true });
await adminDb.doc('directors/bo@orchestra.test').set({ ...entry, name: 'Bo', boundUid: 'some-other-account', passwordSet: true });
await rg.user.getIdToken(true);
await expect('a member password account the server did not bind is refused', 'deny', () => getDoc(doc(rogue.db, 'directors', 'bo@orchestra.test')));
await expect('and opens no part', 'deny', () => getBytes(ref(rogue.st, 'members/parts/demo-piece/Violins I v2.pdf')));
await adminDb.doc('directors/bo@orchestra.test').update({ boundUid: rg.user.uid, passwordSet: false });
await expect('a member entry with passwordSet false is refused', 'deny', () => getDoc(doc(rogue.db, 'directors', 'bo@orchestra.test')));

// ── Staff remove a player ──
await expect('a director cannot remove another director', 'deny', () => deleteDoc(doc(d, 'directors', 'owner@orchestra.test')));
await expect('a director removes a player', 'allow', () => deleteDoc(doc(d, 'directors', ANA)));
await expect('and the player is out', 'deny', () => getDoc(doc(a, 'directors', ANA)));
await expect('and opens no part', 'deny', () => getBytes(ref(ana.st, 'members/parts/demo-piece/Violins I v2.pdf')));

for (const c of [ana, staffPw, rogue, stranger, visitor, ...Object.values(staff)]) { await signOut(c.auth).catch(() => {}); await terminate(c.db); }
for (const x of apps) await deleteApp(x);
console.log(failed ? `${failed} FAILED` : 'all pass');
process.exit(failed ? 1 : 0);
