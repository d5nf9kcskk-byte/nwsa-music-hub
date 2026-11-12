/**
 * seed-college.mjs
 *
 * Creates the NWSA college program in Firestore:
 *   • College Chamber Orchestra + College Vocal Ensemble (collegeLevel)
 *   • Fall 2026 dual-enrollment classes with teacher names
 *   • Class calendar sessions on the MDC term calendar
 *
 * No student enrollment: rosters are managed in the Hub. Basic Conducting is
 * omitted (not offered this semester).
 *
 * BY DEFAULT IT ONLY ADDS WHAT IS MISSING. It creates the groups and class
 * meetings that do not exist and touches nothing that does: no group, no
 * meeting, no room patch. It skips a meeting that a combined block is
 * holding, so a combine is not undone by a second copy. `missingCollegeDocs()`
 * in src/director/collegeSchedule.ts is the one decision, shared with the
 * in-app "Add college program" button. Use it to add meetings a calendar fix
 * made newly due (March 29, 2027 was one). `--missing-only` is accepted and
 * means the same thing.
 *
 * `--overwrite` IS THE OLD RUN, AND IT OVERWRITES. Every write is a merge and
 * the generator's fields win: a class meeting somebody cancelled goes back to
 * `status: 'Scheduled'` (its change note stays, so it reads as a live class
 * wearing a "Cancelled" note), a moved one gets its old time and room back,
 * and an edited title or note is replaced. Checked against the live calendar
 * on 2026-11-12: it would un-cancel 7 meetings and replace one edited note.
 * It exists to push a change in the class list onto every meeting. Run it
 * with `--dry-run` first, and only when that is what you mean.
 *
 * It refuses any credential that is not for the `nwsa-hub` project.
 *
 *   FIREBASE_SERVICE_ACCOUNT_JSON=… node scripts/seed-college.mjs --dry-run
 *   FIREBASE_SERVICE_ACCOUNT_JSON=… node scripts/seed-college.mjs
 *   FIREBASE_SERVICE_ACCOUNT_JSON=… node scripts/seed-college.mjs --overwrite --dry-run
 *   FIREBASE_SERVICE_ACCOUNT_JSON=… node scripts/seed-college.mjs --overwrite
 */
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { DEFAULT_PROJECT, projectMismatch } from './lib/hubTool.mjs';
import {
  absorbedEventIds, collegeChamberRehearsalPatches, collegeClassEventDocs, collegeGroupDocs, missingCollegeDocs,
} from '../src/director/collegeSchedule.ts';

const abort = msg => { console.error(msg); process.exit(1); };

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!raw) abort('FIREBASE_SERVICE_ACCOUNT_JSON is not set. Aborting.');
const DRY = process.argv.includes('--dry-run');
const OVERWRITE = process.argv.includes('--overwrite');
if (OVERWRITE && process.argv.includes('--missing-only')) abort('Pass --overwrite or --missing-only, not both.');

let serviceAccount;
try { serviceAccount = JSON.parse(raw); } catch { abort('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON. Aborting.'); }
const wrongProject = projectMismatch(serviceAccount, DEFAULT_PROJECT);
if (wrongProject) abort(wrongProject);
console.log(`Project: ${DEFAULT_PROJECT}. Mode: ${OVERWRITE ? 'OVERWRITE (merges onto existing docs)' : 'missing only (creates what does not exist)'}${DRY ? ', dry run' : ''}.`);

if (getApps().length === 0) initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// Each op is one doc: { col, id, data }.
let ops;
if (OVERWRITE) {
  const sessions = collegeClassEventDocs();
  const patches = collegeChamberRehearsalPatches();
  ops = [
    ...collegeGroupDocs().map(d => ({ col: 'ensembles', ...d })),
    ...sessions.map(d => ({ col: 'events', ...d })),
    ...patches.map(d => ({ col: 'events', ...d })),
  ];
  console.log(`  groups      ${ops.length - sessions.length - patches.length} college ensembles and classes`);
  console.log(`  sessions    ${sessions.length} class calendar events`);
  console.log(`  cco patch   ${patches.length} College Chamber rehearsal rooms → 4302`);
} else {
  // Ids only, plus the one field that says a combined block is holding a
  // meeting. Nothing about any event's content is read beyond that.
  const groupSnap = await db.collection('ensembles').select().get();
  const eventSnap = await db.collection('events').select('changeFrom').get();
  const { groups, sessions } = missingCollegeDocs({
    groupIds: new Set(groupSnap.docs.map(d => d.id)),
    eventIds: new Set(eventSnap.docs.map(d => d.id)),
    absorbed: absorbedEventIds(eventSnap.docs.map(d => d.data())),
  });
  ops = [...groups.map(d => ({ col: 'ensembles', ...d })), ...sessions.map(d => ({ col: 'events', ...d }))];
  console.log(`\n${groups.length} group(s) and ${sessions.length} class meeting(s) do not exist yet. Everything else is left exactly as it is.`);
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
    // create() fails if the doc appeared since the read, so nothing is ever
    // overwritten. The merge is the --overwrite run only.
    if (OVERWRITE) batch.set(ref, data, { merge: true });
    else batch.create(ref, data);
  }
  await batch.commit();
}
console.log(OVERWRITE ? `\nDone: merged ${ops.length} doc(s).` : `\nDone: created ${ops.length} missing doc(s).`);
