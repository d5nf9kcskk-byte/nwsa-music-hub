#!/usr/bin/env node
/**
 * The pay tier's rules, asked on the Firestore emulator (#personnel).
 * Covers what the paid-roster collections added for pay: `payMethod` and
 * `payHandle` on personnelContacts, and the /payments collection. It asserts
 * (unlike rules-verdicts.emulator-check.mjs, which only records): a wrong
 * answer exits 1.
 *
 * Real Google-style sign-ins on the Auth emulator; every verdict is the real
 * firestore.rules. Project ids must start with demo-. Everything here is made
 * up. Run from the repo root (Java is Homebrew's keg-only openjdk here):
 *
 *   PATH="/opt/homebrew/opt/openjdk/bin:$PATH" firebase emulators:exec \
 *     --config firebase.emulators.json --only auth,firestore \
 *     --project demo-personnel-rules "node scripts/personnel-rules.emulator-check.mjs"
 */
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithCredential, GoogleAuthProvider } from 'firebase/auth';
import { initializeApp as initializeAdminApp } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';

const PROJECT = process.env.GCLOUD_PROJECT || 'demo-personnel-rules';
if (!PROJECT.startsWith('demo-')) { console.error('Refusing: the project id must start with demo-.'); process.exit(2); }
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const FS_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
process.env.FIRESTORE_EMULATOR_HOST = FS_HOST;
const adminDb = getAdminFirestore(initializeAdminApp({ projectId: PROJECT }));

const PEOPLE = { owner: { roles: ['owner'] }, director: { roles: ['director'] }, teacher: { roles: ['teacher'] }, unlisted: null, nobody: undefined };
const emailOf = who => `${who}@orchestra.test`;
const apps = [];
const token = {};
for (const who of Object.keys(PEOPLE)) {
  if (PEOPLE[who] === undefined) continue;
  const app = initializeApp({ apiKey: 'demo-key', projectId: PROJECT }, who);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${AUTH_HOST}`, { disableWarnings: true });
  const cred = GoogleAuthProvider.credential(JSON.stringify({ sub: `google-${who}`, email: emailOf(who), email_verified: true }));
  const { user } = await signInWithCredential(auth, cred);
  token[who] = await user.getIdToken();
  if (PEOPLE[who]) await adminDb.doc(`directors/${emailOf(who)}`).set({ email: emailOf(who), ...PEOPLE[who] });
}

// Firestore REST value encoding: integers and doubles are different types, which is the point.
const enc = v => typeof v === 'number' ? (Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }) : { stringValue: v };
const body = o => ({ fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, enc(v)])) });
const base = `http://${FS_HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;
const call = (who, method, path, o) => fetch(`${base}${path}`, {
  method,
  headers: { 'Content-Type': 'application/json', ...(token[who] ? { Authorization: `Bearer ${token[who]}` } : {}) },
  ...(o ? { body: JSON.stringify(body(o)) } : {}),
}).then(r => r.status);

let failed = 0;
const expect = async (label, want, got) => {
  const status = await got;
  const ok = want === 'allow' ? status === 200 : status === 403 || status === 401;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label} (wanted ${want}, got ${status})`);
};

const contact = { email: 'a@example.org', phone: '555-0100', w9Status: 'on-file', payMethod: 'zelle', payHandle: 'a@example.org' };
const pay = { contractId: 'c1', personnelId: 'p1', amountCents: 11000, paidOn: '2027-01-03', method: 'venmo' };

for (const who of ['owner', 'director']) {
  await expect(`${who} saves a contact with a pay method and handle`, 'allow', call(who, 'PATCH', '/personnelContacts/p1', contact));
  await expect(`${who} clears the method with ''`, 'allow', call(who, 'PATCH', '/personnelContacts/p1', { payMethod: '', payHandle: '' }));
  await expect(`${who} saves an old-shape contact (no pay keys)`, 'allow', call(who, 'PATCH', '/personnelContacts/p2', { email: 'b@example.org', w9Status: 'requested' }));
  await expect(`${who} cannot save an unknown pay method`, 'deny', call(who, 'PATCH', '/personnelContacts/p1', { payMethod: 'bitcoin' }));
  await expect(`${who} cannot save a bank account key`, 'deny', call(who, 'PATCH', '/personnelContacts/p1', { bankAccount: '000123456' }));
  await expect(`${who} cannot save a taxpayer id key`, 'deny', call(who, 'PATCH', '/personnelContacts/p1', { ssn: '000-00-0000' }));
  await expect(`${who} cannot save a 121-character handle`, 'deny', call(who, 'PATCH', '/personnelContacts/p1', { payHandle: 'x'.repeat(121) }));
  await expect(`${who} records a payment`, 'allow', call(who, 'PATCH', `/payments/${who}-1`, { ...pay, reference: 'conf 123', note: 'dress' }));
  await expect(`${who} cannot record a fractional-cent payment`, 'deny', call(who, 'PATCH', `/payments/${who}-2`, { ...pay, amountCents: 110.5 }));
  await expect(`${who} cannot record an unknown method`, 'deny', call(who, 'PATCH', `/payments/${who}-3`, { ...pay, method: 'cash-app' }));
  await expect(`${who} cannot add an account-number key to a payment`, 'deny', call(who, 'PATCH', `/payments/${who}-4`, { ...pay, accountNumber: '000123456' }));
  await expect(`${who} cannot write a 61-character reference`, 'deny', call(who, 'PATCH', `/payments/${who}-5`, { ...pay, reference: 'x'.repeat(61) }));
  await expect(`${who} cannot write a payment dated in words`, 'deny', call(who, 'PATCH', `/payments/${who}-6`, { ...pay, paidOn: 'January 3' }));
  await expect(`${who} reads payments`, 'allow', call(who, 'GET', `/payments/${who}-1`));
  await expect(`${who} deletes a payment`, 'allow', call(who, 'DELETE', `/payments/${who}-1`));
}
for (const who of ['teacher', 'unlisted', 'nobody']) {
  await expect(`${who} cannot read a payment`, 'deny', call(who, 'GET', '/payments/owner-1'));
  await expect(`${who} cannot record a payment`, 'deny', call(who, 'PATCH', `/payments/${who}-1`, pay));
  await expect(`${who} cannot read a contact`, 'deny', call(who, 'GET', '/personnelContacts/p1'));
  await expect(`${who} cannot save a pay method`, 'deny', call(who, 'PATCH', '/personnelContacts/p9', contact));
}

for (const a of apps) await deleteApp(a);
console.log(failed ? `${failed} FAILED` : 'all pass');
process.exit(failed ? 1 : 0);
