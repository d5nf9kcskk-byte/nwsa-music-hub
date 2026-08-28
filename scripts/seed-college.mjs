/**
 * seed-college.mjs
 *
 * Creates the NWSA college program in Firestore:
 *   • College Chamber Orchestra + College Vocal Ensemble (collegeLevel)
 *   • Fall 2026 dual-enrollment classes with teacher names
 *   • Class calendar sessions on the MDC term calendar
 *
 * Idempotent (stable doc ids). No student enrollment — rosters are managed
 * in the Hub. Basic Conducting is omitted (not offered this semester).
 *
 *   FIREBASE_SERVICE_ACCOUNT_JSON=… node scripts/seed-college.mjs --dry-run
 *   FIREBASE_SERVICE_ACCOUNT_JSON=… node scripts/seed-college.mjs
 */
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { COLLEGE_CLASSES, COLLEGE_ENSEMBLES } from '../src/director/collegeClasses.ts';
import { collegeChamberRehearsalPatches, collegeClassEventDocs } from '../src/director/collegeSchedule.ts';

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!raw) { console.error('FIREBASE_SERVICE_ACCOUNT_JSON is not set — aborting.'); process.exit(1); }
const DRY = process.argv.includes('--dry-run');
if (getApps().length === 0) initializeApp({ credential: cert(JSON.parse(raw)) });
const db = getFirestore();

const ops = [];

for (const e of COLLEGE_ENSEMBLES) {
  const { id, ...data } = e;
  console.log(`  ensemble    ${id.padEnd(28)} ${data.name}`);
  ops.push(b => b.set(db.collection('ensembles').doc(id), {
    ...data,
    kind: 'ensemble',
    collegeLevel: true,
  }, { merge: true }));
}

for (const c of COLLEGE_CLASSES) {
  console.log(`  class       ${c.id.padEnd(28)} ${c.title.padEnd(36)} ${c.teacher}`);
  ops.push(b => b.set(db.collection('ensembles').doc(c.id), {
    kind: 'class',
    collegeLevel: true,
    name: c.title,
    order: c.order,
    conductorName: c.teacher,
    ...(c.room ? { defaultLocation: c.room } : {}),
    defaultStartTime: c.start,
    defaultEndTime: c.end,
    meetingDays: c.days,
  }, { merge: true }));
}

const sessions = collegeClassEventDocs();
console.log(`  sessions    ${sessions.length} class calendar events`);
for (const { id, data } of sessions) {
  ops.push(b => b.set(db.collection('events').doc(id), data));
}

const patches = collegeChamberRehearsalPatches();
console.log(`  cco patch   ${patches.length} College Chamber rehearsal rooms → 4302`);
for (const { id, data } of patches) {
  ops.push(b => b.set(db.collection('events').doc(id), data, { merge: true }));
}

if (DRY) {
  console.log(`\nDry run — would write ${ops.length} ops. Re-run without --dry-run to apply.`);
  process.exit(0);
}

const CHUNK = 499;
for (let i = 0; i < ops.length; i += CHUNK) {
  const batch = db.batch();
  for (const op of ops.slice(i, i + CHUNK)) op(batch);
  await batch.commit();
}
console.log(`\nDone: ${COLLEGE_ENSEMBLES.length} ensembles, ${COLLEGE_CLASSES.length} classes, ${sessions.length} class sessions.`);
