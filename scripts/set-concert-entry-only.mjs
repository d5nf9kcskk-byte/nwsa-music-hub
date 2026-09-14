#!/usr/bin/env node
/**
 * set-concert-entry-only.mjs
 *
 * Flips `checkin.entryOnly` on the concerts named in
 * `config/entry-only-concerts.json`, so a night whose check-OUT failed still
 * credits the students who scanned in (#gradebook, #concert-checkin).
 *
 * Why a committed list rather than a command-line argument: this writes to
 * production attendance-adjacent data, and which concerts get the exemption is
 * exactly the kind of decision that should be visible in a diff and reviewable
 * afterwards, not buried in one person's shell history. The file is the record.
 *
 * Deliberately narrow. It writes ONE field, on events that already carry a
 * `concertAttendance` value, and nothing else. It never clears the flag and
 * never touches an event that is not in the list, so a mistake here can only
 * ever be "one extra concert was generous", never "a student lost credit".
 *
 * Idempotent: an event already flagged is reported and skipped, so re-running
 * does not churn `updatedAt`.
 *
 *   FIREBASE_SERVICE_ACCOUNT_JSON=… node scripts/set-concert-entry-only.mjs
 *   add --dry-run to preview.
 */
import { readFileSync } from 'node:fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!raw) {
  console.error('FIREBASE_SERVICE_ACCOUNT_JSON not set — aborting.');
  process.exit(1);
}
const DRY = process.argv.includes('--dry-run');

const LIST_PATH = new URL('../config/entry-only-concerts.json', import.meta.url);
const entries = JSON.parse(readFileSync(LIST_PATH, 'utf8'));
if (!Array.isArray(entries)) {
  console.error('config/entry-only-concerts.json must be an array — aborting.');
  process.exit(1);
}

if (getApps().length === 0) initializeApp({ credential: cert(JSON.parse(raw)) });
const db = getFirestore();

let wrote = 0;
let already = 0;
let missing = 0;

for (const entry of entries) {
  const id = typeof entry === 'string' ? entry : entry?.eventId;
  const why = typeof entry === 'string' ? '' : (entry?.reason ?? '');
  if (!id) {
    console.error('  SKIP  an entry with no eventId');
    missing += 1;
    continue;
  }

  const ref = db.collection('events').doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    console.error(`  MISS  ${id} — no such event`);
    missing += 1;
    continue;
  }

  const data = snap.data() ?? {};
  // The flag only means anything on a concert that counts toward the
  // obligation. Refusing the rest keeps this from becoming a way to quietly
  // write a field onto arbitrary calendar entries.
  if (data.concertAttendance !== 'required' && data.concertAttendance !== 'optional') {
    console.error(`  SKIP  ${id} (${data.title ?? 'untitled'}) — not a required or optional concert`);
    missing += 1;
    continue;
  }

  const label = `${data.date ?? '????-??-??'}  ${data.title ?? id}`;
  if (data.checkin?.entryOnly === true) {
    console.log(`  OK    ${label} — already entry-only`);
    already += 1;
    continue;
  }

  if (DRY) {
    console.log(`  WOULD ${label} — set checkin.entryOnly${why ? ` (${why})` : ''}`);
    wrote += 1;
    continue;
  }

  // Dotted path, so every other checkin setting on the event is left exactly
  // as it is. A whole-object write here would drop photoOptional, the window
  // overrides, and minStayMinutes.
  await ref.update({ 'checkin.entryOnly': true });
  console.log(`  SET   ${label}${why ? ` (${why})` : ''}`);
  wrote += 1;
}

console.log(
  `\n${DRY ? 'Dry run. ' : ''}${wrote} ${DRY ? 'would change' : 'updated'}, `
  + `${already} already set, ${missing} skipped.`,
);
if (missing > 0 && !DRY) process.exitCode = 1;
