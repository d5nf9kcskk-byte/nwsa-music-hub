#!/usr/bin/env node
/**
 * reset-demo-org.mjs — wipe the ASYO demo sandbox (#org-config).
 *
 * Two explicit modes (no default — you must say which):
 *
 *   --to-demo   Wipe EVERYTHING (including staff accounts), then tell you to
 *               re-run seed-demo-org.mjs. Use during the demo period to hand
 *               the admin/conductor a pristine fictional sandbox again.
 *
 *   --go-live   The demo→pilot transition. Wipes every collection EXCEPT
 *               `directors` (staff keep their sign-ins) and leaves the org
 *               truly empty — zero fictional data — so real ensembles, the
 *               real roster (in-app CSV import), and the real season can go
 *               in. Same URL, same accounts, same feed links: the pilot
 *               starts the moment real data lands.
 *
 * SAFETY: hard-aborts unless the service account's project is exactly
 * `asyo-hub-demo` — this script must be physically unable to touch the NWSA
 * production project. It also prints what it is about to delete and requires
 * --yes to actually do it.
 *
 * Run:
 *   FIREBASE_SERVICE_ACCOUNT_JSON="$(cat asyo-hub-demo-key.json)" \
 *     node scripts/reset-demo-org.mjs --go-live --yes
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const DEMO_PROJECT_ID = 'asyo-hub-demo';

// Every collection in firestore.rules. Keep in sync when rules add one —
// a collection missing here silently survives resets.
const ALL_COLLECTIONS = [
  'activityLog', 'announcements', 'assignmentResults', 'assignmentSubmissions',
  'assignments', 'attendance', 'bulletinQueue', 'contacts', 'directors',
  'documents', 'ensembles', 'events', 'lessons', 'locations', 'loginEvents',
  'notifyQueue', 'parentMessages', 'plannedAbsences', 'progressNotes',
  'repertoire', 'rosterOverrides', 'rosterOverridesPublic', 'seatingCharts',
  'students', 'studentsPublic',
];

const args = new Set(process.argv.slice(2));
const toDemo = args.has('--to-demo');
const goLive = args.has('--go-live');
const confirmed = args.has('--yes');

if (toDemo === goLive) { // neither, or both
  console.error('Pick exactly one mode: --to-demo (full wipe for a fresh demo seed) or --go-live (wipe all except directors).');
  process.exit(1);
}

const SERVICE_ACCOUNT_JSON = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!SERVICE_ACCOUNT_JSON) {
  console.error('FIREBASE_SERVICE_ACCOUNT_JSON not set — aborting.');
  process.exit(1);
}
let serviceAccount;
try {
  serviceAccount = JSON.parse(SERVICE_ACCOUNT_JSON);
} catch {
  console.error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON — aborting.');
  process.exit(1);
}
if (serviceAccount.project_id !== DEMO_PROJECT_ID) {
  console.error(
    `REFUSING to run: service account is for "${serviceAccount.project_id}", `
    + `and this script only ever resets "${DEMO_PROJECT_ID}".`,
  );
  process.exit(1);
}

const collections = goLive
  ? ALL_COLLECTIONS.filter(c => c !== 'directors')
  : ALL_COLLECTIONS;

console.log(`Mode: ${goLive ? 'GO-LIVE (directors kept)' : 'TO-DEMO (full wipe)'}`);
console.log(`Project: ${DEMO_PROJECT_ID}`);
console.log(`Will delete every document in: ${collections.join(', ')}`);
if (!confirmed) {
  console.log('\nDry run — nothing deleted. Add --yes to execute.');
  process.exit(0);
}

if (getApps().length === 0) initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function wipeCollection(name) {
  let total = 0;
  // Page through in batches; batched deletes cap at 500 ops.
  for (;;) {
    const snap = await db.collection(name).limit(400).get();
    if (snap.empty) break;
    const batch = db.batch();
    for (const doc of snap.docs) batch.delete(doc.ref);
    await batch.commit();
    total += snap.size;
  }
  return total;
}

(async () => {
  let grand = 0;
  for (const name of collections) {
    const n = await wipeCollection(name);
    if (n > 0) console.log(`  ${name}: deleted ${n}`);
    grand += n;
  }
  console.log(`\nDeleted ${grand} documents.`);
  if (goLive) {
    console.log('Directors kept — everyone signs in exactly as before.');
    console.log('Next steps (see docs/demo-asyo-setup.md §"Go-live"):');
    console.log('  1. In-app: create the real ensembles (Ensembles screen).');
    console.log('  2. In-app: Roster → Import CSV with the real roster.');
    console.log('  3. In-app: build the real season calendar (or seed it from the admin\'s dates).');
    console.log('  4. Wait for the next deploy-demo cron (≤4h) or run the workflow so ICS feeds regenerate with real data.');
  } else {
    console.log('Now re-seed the fictional sandbox:');
    console.log('  FIREBASE_SERVICE_ACCOUNT_JSON=... node scripts/seed-demo-org.mjs');
  }
})();
