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
 * A PLAIN RE-RUN OVERWRITES. Every write is a merge, and the generator's
 * fields win: a class meeting somebody cancelled goes back to
 * `status: 'Scheduled'` (its change note stays, so it reads as a live class
 * wearing a "Cancelled" note), a moved one gets its old time and room back,
 * and an edited title or note is replaced. Checked against the live calendar
 * on 2026-11-12: a plain re-run would un-cancel 7 meetings and replace one
 * edited note.
 *
 * `--missing-only` is the safe re-run. It creates the docs that do not exist
 * and touches nothing that does: no group, no meeting, no room patch. It also
 * skips a meeting that a combined block is holding, so a combine is not
 * undone by a second copy. Use it to add meetings a calendar fix made newly
 * due (March 29, 2027 was one).
 *
 *   FIREBASE_SERVICE_ACCOUNT_JSON=… node scripts/seed-college.mjs --dry-run
 *   FIREBASE_SERVICE_ACCOUNT_JSON=… node scripts/seed-college.mjs --missing-only --dry-run
 *   FIREBASE_SERVICE_ACCOUNT_JSON=… node scripts/seed-college.mjs --missing-only
 *   FIREBASE_SERVICE_ACCOUNT_JSON=… node scripts/seed-college.mjs
 */
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { COLLEGE_CLASSES, COLLEGE_ENSEMBLES, COLLEGE_TERM } from '../src/director/collegeClasses.ts';
import { collegeChamberRehearsalPatches, collegeClassEventDocs } from '../src/director/collegeSchedule.ts';

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!raw) { console.error('FIREBASE_SERVICE_ACCOUNT_JSON is not set — aborting.'); process.exit(1); }
const DRY = process.argv.includes('--dry-run');
const MISSING_ONLY = process.argv.includes('--missing-only');
if (getApps().length === 0) initializeApp({ credential: cert(JSON.parse(raw)) });
const db = getFirestore();

// Each op is one doc: { col, id, data }. `patch` marks a write that only
// makes sense on a doc that already exists.
let ops = [];

for (const e of COLLEGE_ENSEMBLES) {
  const { id, ...data } = e;
  console.log(`  ensemble    ${id.padEnd(28)} ${data.name}`);
  ops.push({ col: 'ensembles', id, data: {
    ...data,
    kind: 'ensemble',
    collegeLevel: true,
  } });
}

for (const c of COLLEGE_CLASSES) {
  console.log(`  class       ${c.id.padEnd(28)} ${c.title.padEnd(36)} ${c.teacher}`);
  ops.push({ col: 'ensembles', id: c.id, data: {
    kind: 'class',
    collegeLevel: true,
    name: c.title,
    order: c.order,
    conductorName: c.teacher,
    ...(c.room ? { defaultLocation: c.room } : {}),
    // The catalog number, onto the GROUP. It has been in COLLEGE_CLASSES since
    // these were seeded but only ever reached an event's `notes` string, so the
    // class page could not print the one number a dual-enrollment student is
    // registered under. A class with no code in the spec leaves the field
    // alone rather than blanking one typed in the editor.
    ...(c.courseCode ? { courseCode: c.courseCode } : {}),
    term: c.term ?? COLLEGE_TERM,
    defaultStartTime: c.start,
    defaultEndTime: c.end,
    meetingDays: c.days,
  } });
}

const sessions = collegeClassEventDocs();
console.log(`  sessions    ${sessions.length} class calendar events`);
// The write below merges, which is load-bearing (see the same line in
// src/director/seedCollege.ts): a bare set() REPLACED each session doc and
// wiped its `changeNote`. A merge still overwrites the fields the generator
// writes, `status` among them. `--missing-only` is the run that overwrites
// nothing.
for (const { id, data } of sessions) ops.push({ col: 'events', id, data });

const patches = collegeChamberRehearsalPatches();
console.log(`  cco patch   ${patches.length} College Chamber rehearsal rooms → 4302`);
for (const { id, data } of patches) ops.push({ col: 'events', id, data, patch: true });

if (MISSING_ONLY) {
  // Ids only, plus the one field that says a combined block is holding a
  // meeting. Nothing about any event's content is printed.
  const groupIds = new Set((await db.collection('ensembles').select().get()).docs.map(d => d.id));
  const eventSnap = await db.collection('events').select('changeFrom').get();
  const have = { ensembles: groupIds, events: new Set(eventSnap.docs.map(d => d.id)) };
  const absorbed = new Set(eventSnap.docs.flatMap(d => (d.get('changeFrom')?.absorbed ?? []).map(a => a.id)));
  const total = ops.length;
  ops = ops.filter(o => !o.patch && !have[o.col].has(o.id) && !absorbed.has(o.id));
  console.log(`\n--missing-only: ${ops.length} of ${total} docs do not exist yet. The rest are left exactly as they are.`);
  for (const o of ops) console.log(`  create ${o.col}/${o.id}`);
}

if (DRY) {
  console.log(`\nDry run — would write ${ops.length} ops. Re-run without --dry-run to apply.`);
  process.exit(0);
}

const CHUNK = 499;
for (let i = 0; i < ops.length; i += CHUNK) {
  const batch = db.batch();
  for (const { col, id, data } of ops.slice(i, i + CHUNK)) {
    const ref = db.collection(col).doc(id);
    // create() fails if the doc appeared since the read, so nothing is ever overwritten.
    if (MISSING_ONLY) batch.create(ref, data);
    else batch.set(ref, data, { merge: true });
  }
  await batch.commit();
}
console.log(MISSING_ONLY
  ? `\nDone: created ${ops.length} missing doc(s).`
  : `\nDone: ${COLLEGE_ENSEMBLES.length} ensembles, ${COLLEGE_CLASSES.length} classes, ${sessions.length} class sessions.`);
