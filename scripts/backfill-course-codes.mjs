/**
 * backfill-course-codes.mjs
 *
 * Writes the CATALOG FIELDS — `courseCode` and `term` — onto the college class
 * ensemble docs, and NOTHING else. (The file keeps its name so the workflow
 * that calls it does not have to be re-found.)
 *
 * The catalog numbers have been in `COLLEGE_CLASSES` since those classes were
 * seeded, but only ever reached an event's `notes` string — so the class page
 * had no number to print. This puts them on the group, where
 * `Ensemble.courseCode` reads them.
 *
 * `term` is the semester the course runs, and it has to be STORED
 * (#college-hs-calendar-deps). The class page first derived it from
 * `ORG.terms`, which is the MDCPS calendar — an MDC course's fall ends Dec 11
 * rather than Dec 19 — and derived the CURRENT term at that, so all sixteen
 * classes printed the same string. It cannot come from the group's own
 * meetings either: `collegeClassEventDocs()` generates every college class
 * across the whole year with no term filter.
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
import { COLLEGE_CLASSES, COLLEGE_TERM } from '../src/director/collegeClasses.ts';

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!raw) { console.error('FIREBASE_SERVICE_ACCOUNT_JSON is not set — aborting.'); process.exit(1); }
const DRY = process.argv.includes('--dry-run');
if (getApps().length === 0) initializeApp({ credential: cert(JSON.parse(raw)) });
const db = getFirestore();

// Every class gets a term; only most of them have a catalog number (College
// Forum has none, and a class whose spec carries no code is left alone rather
// than having one blanked).
const withCodes = COLLEGE_CLASSES.filter(c => c.courseCode);
console.log(`${withCodes.length} of ${COLLEGE_CLASSES.length} college classes carry a course code;`);
console.log(`all ${COLLEGE_CLASSES.length} carry a semester (default "${COLLEGE_TERM}").\n`);

const writes = [];
for (const c of COLLEGE_CLASSES) {
  const ref = db.collection('ensembles').doc(c.id);
  const snap = await ref.get();
  if (!snap.exists) {
    console.log(`  skip     ${c.id.padEnd(30)} no ensemble doc — run Seed College first`);
    continue;
  }
  const data = snap.data();
  const patch = {};
  if (c.courseCode && data.courseCode !== c.courseCode) patch.courseCode = c.courseCode;
  const term = c.term ?? COLLEGE_TERM;
  if (data.term !== term) patch.term = term;
  if (Object.keys(patch).length === 0) {
    console.log(`  ok       ${c.id.padEnd(30)} already ${[data.courseCode, data.term].filter(Boolean).join(' · ')}`);
    continue;
  }
  console.log(`  set      ${c.id.padEnd(30)} ${Object.entries(patch).map(([k, v]) => `${k}=${v}`).join(' ')}`);
  writes.push({ ref, patch });
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
for (const w of writes) batch.update(w.ref, w.patch);
await batch.commit();
console.log(`\nDone: ${writes.length} ensembles updated.`);
