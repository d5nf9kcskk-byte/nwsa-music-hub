#!/usr/bin/env node
/**
 * The roster importer's REAL write path (importWrite.ts, the code the dialog
 * runs) against the Firestore emulator, under the real firestore.rules.
 * Run from the repo root (tsx for the .ts imports, Homebrew's keg-only Java):
 *
 *   PATH="/opt/homebrew/opt/openjdk/bin:$PATH" firebase emulators:exec \
 *     --config firebase.emulators.json --only auth,firestore \
 *     --project demo-personnel-import "npx tsx --tsconfig tsconfig.app.json scripts/personnel-import.emulator-check.mjs"
 *
 * Everything here is made up. Exits 1 on any wrong answer.
 */
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithCredential, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { initializeApp as initializeAdminApp } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { planPersonnelImport } from '../src/director/personnel/importPlan.ts';
import { writeImport } from '../src/director/personnel/importWrite.ts';

const PROJECT = process.env.GCLOUD_PROJECT || 'demo-personnel-import';
if (!PROJECT.startsWith('demo-')) { console.error('Refusing: the project id must start with demo-.'); process.exit(2); }
const [AH, AP] = (process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099').split(':');
const [FH, FP] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
process.env.FIRESTORE_EMULATOR_HOST = `${FH}:${FP}`;
const admin = getAdminFirestore(initializeAdminApp({ projectId: PROJECT }));

const apps = [];
async function clientAs(who, role) {
  const app = initializeApp({ apiKey: 'demo-key', projectId: PROJECT }, who);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${AH}:${AP}`, { disableWarnings: true });
  const email = `${who}@orchestra.test`;
  await signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({ sub: `google-${who}`, email, email_verified: true })));
  await admin.doc(`directors/${email}`).set({ email, roles: [role] });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, FH, Number(FP));
  return db;
}

let failed = 0;
const check = (label, ok, more = '') => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${more ? ` (${more})` : ''}`); };
const stamp = { updatedAt: Date.now(), updatedBy: 'Owner', updatedByRole: 'owner' };
const count = async c => (await admin.collection(c).get()).size;

const csv = [
  'Name,Instrument,Seat,Status,Email,Phone,Pay method,Pay handle,W-9,Fee,Services,Notes',
  'Ada Example,Violin,1,Contracted,ada@example.org,555-0101,Zelle,ada@example.org,on file,110,4,front desk',
  'Ben Sample,Cello,2,Contracted,ben@example.org,,Check,,,,,',
  'Cy Placeholder,Oboe,,Sub list,,,,,,95,,',
].join('\n');
const plan = planPersonnelImport(csv, []);
check('the sample file plans 3 people, not refused', plan.people.length === 3 && !plan.refused, plan.refused ?? '');

const owner = await clientAs('owner', 'owner');
await writeImport(owner, plan.people, 'ens-a', stamp);
check('owner import writes 3 personnel', await count('personnel') === 3, String(await count('personnel')));
check('and 2 private contacts (Cy has no contact fields, so none)', await count('personnelContacts') === 2, String(await count('personnelContacts')));
check('and 2 Draft contracts (Ada, Cy have a fee)', await count('contracts') === 2, String(await count('contracts')));
const ada = (await admin.collection('personnel').where('name', '==', plan.people[0].name).get()).docs[0];
const adaContact = (await admin.doc(`personnelContacts/${ada.id}`).get()).data();
check('Ada keeps her pay method and handle', adaContact?.payMethod === 'zelle' && adaContact?.payHandle === 'ada@example.org', JSON.stringify(adaContact));
const adaContract = (await admin.collection('contracts').where('personnelId', '==', ada.id).get()).docs[0]?.data();
check('Ada\'s draft is per-service, 4 × 11000 cents', adaContract?.baseRateBasis === 'per-service' && adaContract?.baseRateCents === 11000 && adaContract?.baseRateQuantity === 4 && adaContract?.status === 'Draft', JSON.stringify(adaContract));

// More than one batch (150 people per batch).
const big = ['Name,Instrument'];
for (let i = 0; i < 160; i++) big.push(`Player${String(i).padStart(3, '0')} Fictional,Violin`);
const bigPlan = planPersonnelImport(big.join('\n'), plan.people.map(p => p.name));
await writeImport(owner, bigPlan.people, 'ens-a', stamp);
check('160 more people cross two batches', await count('personnel') === 163, String(await count('personnel')));

const teacher = await clientAs('teacher', 'teacher');
let denied = false;
try { await writeImport(teacher, plan.people.slice(0, 1), 'ens-a', stamp); } catch { denied = true; }
check('a teacher\'s import is refused by the rules', denied);
check('and wrote nothing', await count('personnel') === 163);

for (const a of apps) await deleteApp(a);
console.log(failed ? `${failed} FAILED` : 'all pass');
process.exit(failed ? 1 : 0);
