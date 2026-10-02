#!/usr/bin/env node
/**
 * post-signup.mjs
 *
 * Writes one sign-up into Firestore from a JSON file in `config/signups/`,
 * for the times one has to go up and nobody is at a signed-in browser —
 * first used for the Freedom Tower field-trip form (#sign-pdf), the night
 * before it was due. The Director Panel is still the normal way; this writes
 * the same doc, the same shape, by the service account instead of a director.
 *
 * A sign-up is world-readable (`signupForms` is `allow read`), and so is
 * everything in the file: a title, the groups it is for, a deadline, and the
 * address of a BLANK form. It is safe in a public repo for exactly that
 * reason. Never put a student, a response, or an invite list in one — those
 * are made in the app.
 *
 * The doc id comes from the file, so a re-run updates the same sign-up.
 * Fields the APP owns are carried forward, never overwritten: `closed`
 * (the director's Close-now button), `questions`, the signature statements,
 * `createdAt`.
 *
 * Refuses an ensemble id that does not exist (the sign-up would reach
 * nobody, silently) and a `signPdf.url` that does not answer with a PDF
 * (families would get "the form could not be loaded" on every phone).
 *
 * Required env: FIREBASE_SERVICE_ACCOUNT_JSON, SIGNUP_FILE.
 * Pass --dry-run to validate and print the doc without writing.
 */

import { readFileSync } from 'node:fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const dryRun = process.argv.includes('--dry-run');
const file = (process.env.SIGNUP_FILE ?? '').trim();
if (!file) { console.error('SIGNUP_FILE is required (e.g. config/signups/foo.json)'); process.exit(1); }

let spec;
try { spec = JSON.parse(readFileSync(file, 'utf8')); }
catch (e) { console.error(`Could not read ${file}: ${e.message}`); process.exit(1); }
const fail = msg => { console.error(`${file}: ${msg}`); process.exit(1); };

if (!spec.id || !/^[a-z0-9][a-z0-9-]*$/.test(spec.id)) fail('`id` must be a lowercase kebab-case doc id');
if (!spec.title?.trim()) fail('`title` is required');
if (!Array.isArray(spec.ensembleIds) || spec.ensembleIds.length === 0) fail('`ensembleIds` must name at least one group');
if (spec.deadline && !/^\d{4}-\d{2}-\d{2}$/.test(spec.deadline)) fail('`deadline` must be YYYY-MM-DD');
const FIELD_SOURCES = ['studentName', 'studentId', 'grade'];
for (const f of spec.signPdfFields ?? []) {
  if (!spec.signPdf) fail('`signPdfFields` needs a `signPdf`');
  if (!FIELD_SOURCES.includes(f.source)) fail(`signPdfFields: source must be one of ${FIELD_SOURCES.join(', ')}`);
  if (![f.page, f.x, f.y].every(n => typeof n === 'number' && n >= 0)) fail('signPdfFields: page, x, y must be numbers ≥ 0');
}
if (spec.signPdf) {
  if (!/^https:\/\//.test(spec.signPdf.url ?? '')) fail('`signPdf.url` must be an https URL');
  const res = await fetch(spec.signPdf.url, { method: 'GET' });
  const type = res.headers.get('content-type') ?? '';
  if (!res.ok || !type.includes('pdf')) fail(`\`signPdf.url\` answered ${res.status} ${type} — deploy the PDF first`);
  const size = Number(res.headers.get('content-length') ?? (await res.arrayBuffer()).byteLength);
  spec.signPdf = { name: spec.signPdf.name ?? spec.signPdf.url.split('/').pop(), url: spec.signPdf.url, size };
}

const doc = {
  title: spec.title.trim(),
  ...(spec.intro ? { intro: spec.intro.trim() } : {}),
  ensembleIds: spec.ensembleIds,
  families: spec.families ?? [],
  ...(spec.deadline ? { deadline: spec.deadline } : {}),
  ...(spec.signPdf ? { signPdf: spec.signPdf } : {}),
  ...(spec.ownerName ? { ownerName: spec.ownerName } : {}),
  ...(spec.highSchoolOnly ? { highSchoolOnly: true } : {}),
  ...(spec.signPdfFields ? { signPdfFields: spec.signPdfFields } : {}),
  updatedAt: Date.now(),
  updatedBy: spec.updatedBy ?? 'Hub (post-signup workflow)',
};

if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  console.log(JSON.stringify({ id: spec.id, ...doc }, null, 2));
  if (dryRun) process.exit(0);
  fail('FIREBASE_SERVICE_ACCOUNT_JSON is required to write');
}

if (!getApps().length) initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)) });
const db = getFirestore();

for (const id of doc.ensembleIds) {
  if (!(await db.doc(`ensembles/${id}`).get()).exists) fail(`ensemble \`${id}\` does not exist`);
}

const ref = db.doc(`signupForms/${spec.id}`);
const existing = await ref.get();
const write = existing.exists ? doc : { ...doc, questions: [], createdAt: Date.now() };

console.log(`${existing.exists ? 'Updating' : 'Creating'} signupForms/${spec.id}:`);
console.log(JSON.stringify(write, null, 2));
if (dryRun) { console.log('Dry run — nothing written.'); process.exit(0); }

// mergeFields, not merge:true — merge deep-merges maps, so an old signPdf's
// keys would survive a replacement. Only the keys written here are touched.
await ref.set(write, { mergeFields: Object.keys(write) });
console.log(`Done. Public page: /signup/${spec.id}`);
