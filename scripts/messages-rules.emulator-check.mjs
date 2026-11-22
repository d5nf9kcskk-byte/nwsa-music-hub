#!/usr/bin/env node
/**
 * The message rules, asked on the emulator (#messages, personnel orgs):
 * broadcasts (`memberMailQueue`), office threads (`threads`) and section
 * chat links (`sectionLinks`). Asserts: a wrong answer exits 1.
 *
 * Real sign-ins on the Auth emulator (staff on Google, players on a
 * password account the server "bound", the state passwordSetup leaves);
 * every verdict is the real firestore.rules. Project ids must start with
 * demo-. Everything here is made up. Run from the repo root:
 *
 *   PATH="/opt/homebrew/opt/openjdk/bin:$PATH" firebase emulators:exec \
 *     --config firebase.emulators.json --only auth,firestore \
 *     --project demo-messages-rules "node scripts/messages-rules.emulator-check.mjs"
 */
import { initializeApp, deleteApp } from 'firebase/app';
import {
  getAuth, connectAuthEmulator, signInWithCredential, createUserWithEmailAndPassword, GoogleAuthProvider,
} from 'firebase/auth';
import {
  getFirestore, connectFirestoreEmulator, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  collection, query, orderBy, terminate,
} from 'firebase/firestore';
import { initializeApp as initializeAdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';

const PROJECT = process.env.GCLOUD_PROJECT || 'demo-messages-rules';
if (!PROJECT.startsWith('demo-')) { console.error('Refusing: the project id must start with demo-.'); process.exit(2); }
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const FS_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
process.env.FIRESTORE_EMULATOR_HOST = FS_HOST;
process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_HOST;
const admin = initializeAdminApp({ projectId: PROJECT });
const adminDb = getAdminFirestore(admin);
const adminAuth = getAdminAuth(admin);

let failed = 0;
const say = (ok, label, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` (${detail})` : ''}`); };
const code = e => e?.code ?? String(e);
async function expect(label, want, fn) {
  try { await fn(); say(want === 'allow', label, `wanted ${want}, got allow`); }
  catch (e) { say(want === 'deny' && /permission-denied|PERMISSION_DENIED/i.test(code(e)), label, `wanted ${want}, got ${code(e)}`); }
}

const apps = [];
function client(name) {
  const app = initializeApp({ apiKey: 'demo-key', projectId: PROJECT }, name);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${AUTH_HOST}`, { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, ...FS_HOST.split(':').map((v, i) => (i ? Number(v) : v)));
  return { auth, db };
}
const google = (c, who) => signInWithCredential(c.auth, GoogleAuthProvider.credential(JSON.stringify({ sub: `google-${who}`, email: `${who}@orchestra.test`, email_verified: true })));

// ── Staff (bound Google, as bindGoogle leaves them) ──
const staff = {};
for (const [who, roles] of Object.entries({ owner: ['owner'], director: ['director'], assistant: ['assistant'], teacher: ['teacher'] })) {
  staff[who] = client(who);
  const { user } = await google(staff[who], who);
  await adminDb.doc(`directors/${who}@orchestra.test`).set({ email: `${who}@orchestra.test`, roles, googleSub: `google-${who}`, boundUid: user.uid, boundAt: 1 });
}
// ── Two players, each on a server-bound password account ──
async function player(who, personnelId, name) {
  const c = client(who);
  const email = `${who}@orchestra.test`;
  const { user } = await createUserWithEmailAndPassword(c.auth, email, 'correct horse battery');
  await adminAuth.updateUser(user.uid, { emailVerified: true });
  await adminDb.doc(`directors/${email}`).set({ roles: ['member'], personnelId, name, boundUid: user.uid, boundAt: 1, passwordSet: true });
  await user.getIdToken(true);
  return c;
}
await adminDb.doc('personnel/p1').set({ name: 'Ana Ruiz', section: 'Violin I', status: 'Contracted' });
await adminDb.doc('personnel/p2').set({ name: 'Ben Okoye', section: 'Cello', status: 'Contracted' });
const ana = await player('ana', 'p1', 'Ana Ruiz');
const ben = await player('ben', 'p2', 'Ben Okoye');
// A player whose entry is not bound: the same as no sign-in at all.
const rogue = client('rogue');
const rg = await createUserWithEmailAndPassword(rogue.auth, 'rogue@orchestra.test', 'correct horse battery');
await adminAuth.updateUser(rg.user.uid, { emailVerified: true });
await adminDb.doc('directors/rogue@orchestra.test').set({ roles: ['member'], personnelId: 'p1', boundUid: 'someone-else', passwordSet: true });
await rg.user.getIdToken(true);
const visitor = client('visitor');

const now = () => Date.now();
const D = staff.director.db;
const broadcast = (who, o = {}) => ({
  byEmail: `${who}@orchestra.test`, subject: 'Call time moved', body: 'Dress is at 6.', audience: 'all', queuedAt: now(), ...o,
});

// ═══ Broadcasts (memberMailQueue) ═══
for (const who of ['owner', 'director']) {
  const db = staff[who].db;
  await expect(`${who} queues a broadcast to everyone`, 'allow', () => addDoc(collection(db, 'memberMailQueue'), broadcast(who)));
  await expect(`${who} queues one to a section`, 'allow', () => addDoc(collection(db, 'memberMailQueue'), broadcast(who, { audience: 'section', section: 'Cello' })));
  await expect(`${who} queues one to a single player`, 'allow', () => addDoc(collection(db, 'memberMailQueue'), broadcast(who, { audience: 'person', personnelId: 'p1' })));
  await expect(`${who} cannot send as somebody else (byEmail)`, 'deny', () => addDoc(collection(db, 'memberMailQueue'), broadcast(who, { byEmail: 'owner@orchestra.test' === `${who}@orchestra.test` ? 'director@orchestra.test' : 'owner@orchestra.test' })));
  await expect(`${who} cannot name an address in the request`, 'deny', () => addDoc(collection(db, 'memberMailQueue'), broadcast(who, { to: ['x@example.org'] })));
  await expect(`${who} cannot send an empty subject`, 'deny', () => addDoc(collection(db, 'memberMailQueue'), broadcast(who, { subject: '' })));
  await expect(`${who} cannot send a 151-character subject`, 'deny', () => addDoc(collection(db, 'memberMailQueue'), broadcast(who, { subject: 'x'.repeat(151) })));
  await expect(`${who} can send a 5000-character body`, 'allow', () => addDoc(collection(db, 'memberMailQueue'), broadcast(who, { body: 'x'.repeat(5000) })));
  await expect(`${who} cannot send a 5001-character body`, 'deny', () => addDoc(collection(db, 'memberMailQueue'), broadcast(who, { body: 'x'.repeat(5001) })));
  await expect(`${who} cannot target an unknown audience`, 'deny', () => addDoc(collection(db, 'memberMailQueue'), broadcast(who, { audience: 'everyone-ever' })));
  await expect(`${who} cannot target a section without naming it`, 'deny', () => addDoc(collection(db, 'memberMailQueue'), broadcast(who, { audience: 'section' })));
  await expect(`${who} cannot target a person without naming them`, 'deny', () => addDoc(collection(db, 'memberMailQueue'), broadcast(who, { audience: 'person' })));
  await expect(`${who} cannot forge a result on the request`, 'deny', () => addDoc(collection(db, 'memberMailQueue'), broadcast(who, { status: 'sent' })));
}
await adminDb.doc('memberMailQueue/b1').set({ byEmail: 'director@orchestra.test', subject: 'S', body: 'B', audience: 'all', queuedAt: 1 });
await adminDb.doc('memberMailQueue/b1/to/p1').set({ name: 'Ana Ruiz', state: 'sent' });
await expect('a director reads the Sent list', 'allow', () => getDocs(collection(D, 'memberMailQueue')));
await expect('a director reads who a broadcast reached', 'allow', () => getDocs(collection(D, 'memberMailQueue', 'b1', 'to')));
await expect('a director cannot edit a sent broadcast', 'deny', () => updateDoc(doc(D, 'memberMailQueue', 'b1'), { body: 'changed' }));
await expect('a director cannot delete one', 'deny', () => deleteDoc(doc(D, 'memberMailQueue', 'b1')));
await expect('a director cannot write a per-player result', 'deny', () => setDoc(doc(D, 'memberMailQueue', 'b1', 'to', 'p2'), { name: 'Ben', state: 'sent' }));
await expect('a director cannot rewrite a per-player result', 'deny', () => updateDoc(doc(D, 'memberMailQueue', 'b1', 'to', 'p1'), { state: 'failed' }));
for (const [who, c] of [['an assistant', staff.assistant], ['a teacher', staff.teacher], ['a player', ana], ['a visitor', visitor], ['an unbound player', rogue]]) {
  await expect(`${who} cannot queue a broadcast`, 'deny', () => addDoc(collection(c.db, 'memberMailQueue'), broadcast('assistant')));
  await expect(`${who} cannot read the Sent list`, 'deny', () => getDocs(collection(c.db, 'memberMailQueue')));
  await expect(`${who} cannot read who a broadcast reached`, 'deny', () => getDocs(collection(c.db, 'memberMailQueue', 'b1', 'to')));
}
await expect('nobody can write `mail` from a client (director)', 'deny', () => addDoc(collection(D, 'mail'), { to: ['x@example.org'], message: { subject: 's', text: 't' } }));
await expect('nobody can write `mail` from a client (player)', 'deny', () => addDoc(collection(ana.db, 'mail'), { to: ['x@example.org'], message: { subject: 's', text: 't' } }));
await expect('nobody can read `mail` (director)', 'deny', () => getDocs(collection(D, 'mail')));

// ═══ Office threads ═══
const msg = (o = {}) => ({ from: 'member', text: 'Can I get the cello part early?', at: now(), ...o });
const staffMsg = (who, o = {}) => ({ from: 'staff', text: 'Yes, it is in your Hub.', at: now(), byEmail: `${who}@orchestra.test`, byName: 'Camille', ...o });
const mine = c => collection(c.db, 'threads', 'p1', 'messages');
await expect('a player writes to the office, in their own thread', 'allow', () => addDoc(mine(ana), msg()));
await expect('a player cannot post as staff', 'deny', () => addDoc(mine(ana), msg({ from: 'staff' })));
await expect('a player cannot add a staff-only key (byEmail)', 'deny', () => addDoc(mine(ana), msg({ byEmail: 'director@orchestra.test' })));
await expect('a player cannot write in someone else\'s thread', 'deny', () => addDoc(collection(ana.db, 'threads', 'p2', 'messages'), msg()));
await expect('a player cannot write an empty message', 'deny', () => addDoc(mine(ana), msg({ text: '' })));
await expect('a player can write a 2000-character message', 'allow', () => addDoc(mine(ana), msg({ text: 'x'.repeat(2000) })));
await expect('a player cannot write a 2001-character message', 'deny', () => addDoc(mine(ana), msg({ text: 'x'.repeat(2001) })));
await expect('a player cannot date a message a week ahead', 'deny', () => addDoc(mine(ana), msg({ at: now() + 7 * 86400000 })));
await expect('a player cannot date a message a week back', 'deny', () => addDoc(mine(ana), msg({ at: now() - 7 * 86400000 })));
await expect('a player cannot send a message with a non-integer time', 'deny', () => addDoc(mine(ana), msg({ at: 'now' })));
await expect('a player reads their own thread', 'allow', () => getDocs(query(mine(ana), orderBy('at'))));
await expect('a player cannot read another player\'s thread', 'deny', () => getDocs(query(collection(ana.db, 'threads', 'p2', 'messages'), orderBy('at'))));
await expect('a player cannot list all threads', 'deny', () => getDocs(collection(ana.db, 'threads')));
await expect('an unbound player reads nothing in a thread', 'deny', () => getDocs(query(mine(rogue), orderBy('at'))));
await expect('an unbound player cannot write one', 'deny', () => addDoc(mine(rogue), msg()));
await expect('a visitor reads nothing', 'deny', () => getDocs(query(mine(visitor), orderBy('at'))));
await expect('a visitor writes nothing', 'deny', () => addDoc(mine(visitor), msg()));

const m1 = (await getDocs(query(mine(ana), orderBy('at')))).docs[0].id;
await expect('a player cannot edit a message', 'deny', () => updateDoc(doc(ana.db, 'threads', 'p1', 'messages', m1), { text: 'edited' }));
await expect('a player cannot delete a message', 'deny', () => deleteDoc(doc(ana.db, 'threads', 'p1', 'messages', m1)));

for (const who of ['owner', 'director']) {
  const c = staff[who];
  await expect(`${who} answers a player, as staff`, 'allow', () => addDoc(mine(c), staffMsg(who)));
  await expect(`${who} cannot answer under another staff member's address`, 'deny', () => addDoc(mine(c), staffMsg(who, { byEmail: 'nobody@orchestra.test' })));
  await expect(`${who} cannot answer without a name`, 'deny', () => addDoc(mine(c), { from: 'staff', text: 'hi', at: now(), byEmail: `${who}@orchestra.test` }));
  await expect(`${who} cannot post as the player`, 'deny', () => addDoc(mine(c), msg()));
  await expect(`${who} cannot write to a thread for someone not on the roster`, 'deny', () => addDoc(collection(c.db, 'threads', 'ghost', 'messages'), staffMsg(who)));
  await expect(`${who} reads every thread`, 'allow', () => getDocs(collection(c.db, 'threads')));
  await expect(`${who} reads a thread's messages`, 'allow', () => getDocs(query(mine(c), orderBy('at'))));
  await expect(`${who} cannot edit a message`, 'deny', () => updateDoc(doc(c.db, 'threads', 'p1', 'messages', m1), { text: 'edited' }));
  await expect(`${who} cannot delete a message`, 'deny', () => deleteDoc(doc(c.db, 'threads', 'p1', 'messages', m1)));
}
for (const [who, c] of [['an assistant', staff.assistant], ['a teacher', staff.teacher]]) {
  await expect(`${who} cannot read the office inbox`, 'deny', () => getDocs(collection(c.db, 'threads')));
  await expect(`${who} cannot read a thread's messages`, 'deny', () => getDocs(query(mine(c), orderBy('at'))));
  await expect(`${who} cannot write to a player`, 'deny', () => addDoc(mine(c), staffMsg('assistant')));
}

// The thread summary: the function's, with one read stamp for each side.
await adminDb.doc('threads/p1').set({ personnelId: 'p1', name: 'Ana Ruiz', lastAt: 5, lastFrom: 'member', lastText: 'hi' });
await adminDb.doc('threads/p2').set({ personnelId: 'p2', name: 'Ben Okoye', lastAt: 5, lastFrom: 'member', lastText: 'hi' });
await expect('a player reads their own thread summary', 'allow', () => getDoc(doc(ana.db, 'threads', 'p1')));
await expect('a player cannot read another\'s thread summary', 'deny', () => getDoc(doc(ana.db, 'threads', 'p2')));
await expect('a player stamps their own thread read', 'allow', () => updateDoc(doc(ana.db, 'threads', 'p1'), { memberReadAt: now() }));
await expect('a player cannot stamp the office\'s read mark', 'deny', () => updateDoc(doc(ana.db, 'threads', 'p1'), { staffReadAt: now() }));
await expect('a player cannot rewrite the summary', 'deny', () => updateDoc(doc(ana.db, 'threads', 'p1'), { lastText: 'forged', memberReadAt: now() }));
await expect('a player cannot stamp another player\'s thread', 'deny', () => updateDoc(doc(ana.db, 'threads', 'p2'), { memberReadAt: now() }));
await expect('a player cannot create a thread summary', 'deny', () => setDoc(doc(ana.db, 'threads', 'p9'), { personnelId: 'p9', memberReadAt: now() }));
await expect('a player cannot delete their thread', 'deny', () => deleteDoc(doc(ana.db, 'threads', 'p1')));
await expect('staff stamp a thread read for the whole office', 'allow', () => updateDoc(doc(D, 'threads', 'p1'), { staffReadAt: now() }));
await expect('staff cannot stamp the player\'s read mark', 'deny', () => updateDoc(doc(D, 'threads', 'p1'), { memberReadAt: now() }));
await expect('staff cannot rewrite the summary', 'deny', () => updateDoc(doc(D, 'threads', 'p1'), { lastFrom: 'staff', staffReadAt: now() }));
await expect('staff cannot create a thread summary', 'deny', () => setDoc(doc(D, 'threads', 'p9'), { staffReadAt: now() }));
await expect('staff cannot delete a thread', 'deny', () => deleteDoc(doc(D, 'threads', 'p1')));
await expect('an assistant cannot stamp a thread', 'deny', () => updateDoc(doc(staff.assistant.db, 'threads', 'p1'), { staffReadAt: now() }));

// ═══ Section chat links ═══
const link = (o = {}) => ({ section: 'Violin I', url: 'https://chat.whatsapp.com/abc123', updatedAt: now(), updatedBy: 'Camille', ...o });
for (const who of ['owner', 'director']) {
  const c = staff[who].db;
  await expect(`${who} sets a section's chat link`, 'allow', () => setDoc(doc(c, 'sectionLinks', 'violin-i'), link()));
  await expect(`${who} cannot set a link that is not https`, 'deny', () => setDoc(doc(c, 'sectionLinks', 'x'), link({ url: 'http://example.org/g' })));
  await expect(`${who} cannot set a javascript: link`, 'deny', () => setDoc(doc(c, 'sectionLinks', 'x'), link({ url: 'javascript:alert(1)' })));
  await expect(`${who} cannot set a link with a space in it`, 'deny', () => setDoc(doc(c, 'sectionLinks', 'x'), link({ url: 'https://a.example/ b' })));
  await expect(`${who} cannot set a 301-character link`, 'deny', () => setDoc(doc(c, 'sectionLinks', 'x'), link({ url: 'https://a.example/' + 'x'.repeat(283) })));
  await expect(`${who} cannot add another key`, 'deny', () => setDoc(doc(c, 'sectionLinks', 'x'), link({ members: ['p1'] })));
}
await expect('a player reads the section links', 'allow', () => getDocs(collection(ana.db, 'sectionLinks')));
await expect('a director reads the section links', 'allow', () => getDocs(collection(D, 'sectionLinks')));
await expect('a player cannot set a link', 'deny', () => setDoc(doc(ana.db, 'sectionLinks', 'violin-i'), link({ url: 'https://evil.example/' })));
await expect('a player cannot delete a link', 'deny', () => deleteDoc(doc(ana.db, 'sectionLinks', 'violin-i')));
await expect('an assistant cannot read the section links', 'deny', () => getDocs(collection(staff.assistant.db, 'sectionLinks')));
await expect('an unbound player cannot read the section links', 'deny', () => getDocs(collection(rogue.db, 'sectionLinks')));
await expect('a visitor cannot read the section links', 'deny', () => getDocs(collection(visitor.db, 'sectionLinks')));
await expect('a director removes a link', 'allow', () => deleteDoc(doc(D, 'sectionLinks', 'violin-i')));

for (const c of [...Object.values(staff), ana, ben, rogue, visitor]) await terminate(c.db);
for (const x of apps) await deleteApp(x);
console.log(failed ? `${failed} FAILED` : 'all pass');
process.exit(failed ? 1 : 0);
