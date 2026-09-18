#!/usr/bin/env node
/**
 * post-assignment.mjs
 *
 * Posts one assignment into Firestore from a JSON file in `config/assignments/`,
 * for the times an exam has to go up and nobody is at a signed-in browser.
 * The Director Panel is still the normal way — this writes the same doc, the
 * same shape, by the service account instead of a director.
 *
 * The exam text lives in the repo rather than in a workflow input box on
 * purpose: an eighteen-part playing exam is too long to type into the Actions
 * tab, and putting it in a file makes it a reviewable diff instead of
 * somebody's shell history (the pattern `config/entry-only-concerts.json`
 * already uses). It is a PUBLIC document about coursework — `assignments` is
 * world-readable — so it is safe here in a way a roster never is.
 *
 * The doc id comes from the file, so re-running updates the same exam rather
 * than posting a second copy. Fields the APP owns are carried forward rather
 * than overwritten: `googleDriveFolderId` in particular is written by the
 * Connect Google Drive button and a blind overwrite would silently unhook the
 * folder from a live exam.
 *
 * Required env: FIREBASE_SERVICE_ACCOUNT_JSON, ASSIGNMENT_FILE.
 * Pass --dry-run to validate and print the doc without writing.
 */

import { readFileSync } from 'node:fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const TYPES = ['Playing Exam', 'Written Test', 'Performance', 'Other'];
/** Written by the director in the app; never clobbered by a re-run here. */
const APP_OWNED = ['googleDriveFolderId', 'attachments', 'rubric', 'publishAt', 'studentIds'];

const dryRun = process.argv.includes('--dry-run');
const file = (process.env.ASSIGNMENT_FILE ?? '').trim();
if (!file) { console.error('ASSIGNMENT_FILE is required (e.g. config/assignments/foo.json)'); process.exit(1); }

let spec;
try { spec = JSON.parse(readFileSync(file, 'utf8')); }
catch (e) { console.error(`Could not read ${file}: ${e.message}`); process.exit(1); }

const fail = msg => { console.error(`${file}: ${msg}`); process.exit(1); };

if (!spec.id || !/^[a-z0-9][a-z0-9-]*$/.test(spec.id)) fail('`id` must be a lowercase kebab-case doc id');
if (!spec.title?.trim()) fail('`title` is required');
if (!TYPES.includes(spec.type)) fail(`\`type\` must be one of ${TYPES.join(', ')}`);
if (!/^\d{4}-\d{2}-\d{2}$/.test(spec.dueDate ?? '')) fail('`dueDate` must be YYYY-MM-DD');
if (!Array.isArray(spec.ensembleIds) || spec.ensembleIds.length === 0) fail('`ensembleIds` must name at least one group');
if (spec.acceptsVideoSubmissions) {
  const secs = spec.maxVideoDurationSeconds;
  const mb = spec.maxVideoSizeMB;
  if (!Number.isInteger(secs) || secs < 60 || secs > 3600) fail('`maxVideoDurationSeconds` must be 60–3600');
  // storage.rules reads this off the doc and falls back to 500 MB when it is
  // ABSENT, so an assignment taking video must always carry its own ceiling.
  if (!Number.isInteger(mb) || mb < 10 || mb > 500) fail('`maxVideoSizeMB` must be 10–500');
}

const doc = {
  title: spec.title.trim(),
  type: spec.type,
  dueDate: spec.dueDate,
  ensembleIds: spec.ensembleIds,
  ...(spec.description ? { description: spec.description } : {}),
  ...(spec.formUrl ? { formUrl: spec.formUrl } : {}),
  ...(spec.acceptsVideoSubmissions ? {
    acceptsVideoSubmissions: true,
    maxVideoDurationSeconds: spec.maxVideoDurationSeconds,
    maxVideoSizeMB: spec.maxVideoSizeMB,
  } : {}),
  ...(spec.pieceIds?.length ? { pieceIds: spec.pieceIds } : {}),
};

if (dryRun && !process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  console.log(`--dry-run (no credential — ids unchecked). assignments/${spec.id}:`);
  console.log(JSON.stringify({ ...doc, createdAt: '(now, or kept)' }, null, 2));
  process.exit(0);
}

const SERVICE_ACCOUNT_JSON = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!SERVICE_ACCOUNT_JSON) { console.error('FIREBASE_SERVICE_ACCOUNT_JSON not set.'); process.exit(1); }
let serviceAccount;
try { serviceAccount = JSON.parse(SERVICE_ACCOUNT_JSON); }
catch { console.error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.'); process.exit(1); }
if (getApps().length === 0) initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// A mistyped id is silent otherwise: the exam posts, reaches nobody, and
// links to no music. Cheap to check while we are already connected.
for (const [coll, ids] of [['ensembles', doc.ensembleIds], ['repertoire', doc.pieceIds ?? []]]) {
  for (const id of ids) {
    if (!(await db.collection(coll).doc(id).get()).exists) fail(`${coll}/${id} does not exist`);
  }
}

const ref = db.collection('assignments').doc(spec.id);
const existing = await ref.get();
const kept = {};
if (existing.exists) {
  const prev = existing.data();
  for (const key of APP_OWNED) if (prev[key] !== undefined && spec[key] === undefined) kept[key] = prev[key];
}
const final = { ...doc, ...kept, createdAt: existing.exists ? existing.data().createdAt : Date.now() };

if (dryRun) {
  console.log(`--dry-run — nothing written. assignments/${spec.id} would be:`);
  console.log(JSON.stringify(final, null, 2));
  if (Object.keys(kept).length) console.log(`Kept from the live doc: ${Object.keys(kept).join(', ')}`);
  process.exit(0);
}

await ref.set(final);
console.log(`${existing.exists ? 'Updated' : 'Posted'} assignments/${spec.id}: ${final.title}`);
if (Object.keys(kept).length) console.log(`Kept from the live doc: ${Object.keys(kept).join(', ')}`);
