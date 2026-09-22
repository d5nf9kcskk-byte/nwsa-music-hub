/**
 * backfill-course-codes.mjs
 *
 * Writes `courseCode` onto the college class ensemble docs, and NOTHING else.
 *
 * The catalog numbers have been in `COLLEGE_CLASSES` since those classes were
 * seeded, but only ever reached an event's `notes` string — so the class page
 * had no number to print. This puts them on the group, where
 * `Ensemble.courseCode` reads them.
 *
 * It exists as its own script rather than "just re-run seed-college" because
 * that seed rewrites every class SESSION event with `set()` and no merge: a
 * re-run to pick up one new field would flatten cancellations, change notes
 * and anything else edited on an individual meeting since. This touches one
 * field on at most a dozen ensemble docs and cannot reach an event at all.
 *
 * Idempotent, and a no-op once it has run: a doc that already says the right
 * thing is skipped, so `updatedAt` does not churn. A class whose spec carries
 * no code is left alone rather than having one blanked.
 *
 *   FIREBASE_SERVICE_ACCOUNT_JSON=… node scripts/backfill-course-codes.mjs --dry-run
 *   FIREBASE_SERVICE_ACCOUNT_JSON=… node scripts/backfill-course-codes.mjs
 */
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { COLLEGE_CLASSES } from '../src/director/collegeClasses.ts';

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!raw) { console.error('FIREBASE_SERVICE_ACCOUNT_JSON is not set — aborting.'); process.exit(1); }
const DRY = process.argv.includes('--dry-run');
if (getApps().length === 0) initializeApp({ credential: cert(JSON.parse(raw)) });
const db = getFirestore();

const withCodes = COLLEGE_CLASSES.filter(c => c.courseCode);
console.log(`${withCodes.length} of ${COLLEGE_CLASSES.length} college classes carry a course code.\n`);

const writes = [];
for (const c of withCodes) {
  const ref = db.collection('ensembles').doc(c.id);
  const snap = await ref.get();
  if (!snap.exists) {
    console.log(`  skip     ${c.id.padEnd(30)} no ensemble doc — run Seed College first`);
    continue;
  }
  const current = snap.data().courseCode;
  if (current === c.courseCode) {
    console.log(`  ok       ${c.id.padEnd(30)} already ${c.courseCode}`);
    continue;
  }
  console.log(`  set      ${c.id.padEnd(30)} ${current ? `${current} → ` : ''}${c.courseCode}`);
  writes.push({ ref, courseCode: c.courseCode });
}

if (writes.length === 0) {
  console.log('\nNothing to change.');
  process.exit(0);
}
if (DRY) {
  console.log(`\nDry run — would update ${writes.length} ensembles. Re-run without --dry-run to apply.`);
  process.exit(0);
}

const batch = db.batch();
for (const w of writes) batch.update(w.ref, { courseCode: w.courseCode });
await batch.commit();
console.log(`\nDone: ${writes.length} ensembles updated.`);
