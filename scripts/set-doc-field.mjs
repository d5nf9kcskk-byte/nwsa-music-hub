#!/usr/bin/env node
/**
 * set-doc-field.mjs
 *
 * Corrects ONE text field on ONE document that already exists — the typo fix
 * that has no business re-running a seed script. The Aug 2026 case: the viola
 * master class carried "Fleischmann" (two n's), and `seed-masterclass.mjs`
 * would have fixed it while also adding seven students to master class
 * rosters, a roster change nobody asked for.
 *
 * Deliberately narrow, because a general write tool run from a public repo's
 * Actions tab is a sharp thing to leave lying around:
 *   • the document must already exist — this never creates one;
 *   • one top-level field, one string value — no nested paths, no deletes,
 *     no arrays, no maps;
 *   • it refuses when the field is already right, so a re-run is a no-op;
 *   • --dry-run prints the before/after and writes nothing.
 *
 * It writes ONLY the field named. Collections with a public mirror
 * (students, rosterOverrides, lessons — see src/director/publicMirror.ts)
 * are mirrored by the app on write, NOT here: fixing one of those needs the
 * projection updated too, so do it in the app or extend the backfill script.
 *
 * Required env: FIREBASE_SERVICE_ACCOUNT_JSON, DOC_COLLECTION, DOC_ID,
 *               DOC_FIELD, DOC_VALUE.
 */
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Their writes must carry a matching public projection — out of scope here.
const MIRRORED = ['students', 'rosterOverrides', 'lessons'];

const DRY = process.argv.includes('--dry-run');
const collection = (process.env.DOC_COLLECTION ?? '').trim();
const docId = (process.env.DOC_ID ?? '').trim();
const field = (process.env.DOC_FIELD ?? '').trim();
const value = process.env.DOC_VALUE ?? '';

for (const [k, v] of [['DOC_COLLECTION', collection], ['DOC_ID', docId], ['DOC_FIELD', field]]) {
  if (!v) { console.error(`${k} is required.`); process.exit(1); }
}
if (field.includes('.')) {
  console.error(`DOC_FIELD "${field}" — nested paths are not supported, only a top-level field.`);
  process.exit(1);
}
if (MIRRORED.includes(collection)) {
  console.error(`${collection} has a public projection; fixing it here would leave the mirror stale. Use the app.`);
  process.exit(1);
}

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!raw) { console.error('FIREBASE_SERVICE_ACCOUNT_JSON is not set — aborting.'); process.exit(1); }
if (getApps().length === 0) initializeApp({ credential: cert(JSON.parse(raw)) });
const db = getFirestore();

const ref = db.collection(collection).doc(docId);
const snap = await ref.get();
if (!snap.exists) {
  console.error(`${collection}/${docId} does not exist — this script never creates documents.`);
  process.exit(1);
}

const before = snap.get(field);
console.log(`${collection}/${docId}`);
console.log(`  ${field}: ${JSON.stringify(before)} → ${JSON.stringify(value)}`);

if (before === value) { console.log('Already correct — nothing to do.'); process.exit(0); }
if (DRY) { console.log('--dry-run: nothing written.'); process.exit(0); }

await ref.update({ [field]: value });
console.log('Applied.');
