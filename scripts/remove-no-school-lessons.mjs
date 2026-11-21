#!/usr/bin/env node
/**
 * remove-no-school-lessons.mjs
 *
 * DELETES applied lessons sitting on a day MDCPS is closed (holidays, breaks,
 * teacher planning days) — #no-school-lessons, director's call 2026-11-21:
 * "these were never going to be lessons ... during days off and holidays
 * there are no lessons." A lesson marked "Cancelled" on Thanksgiving reads as
 * if a teacher called it off, so it is removed instead.
 *
 * This replaced cancel-no-school-lessons.mjs, which marked them Cancelled on
 * the theory that a delete would let the standing weekly time re-create them.
 * It cannot: slotDates() in lessonSchedule.ts never generates on an
 * MDCPS_NO_SCHOOL date. Lessons that tool cancelled are deleted too.
 *
 * WHY NOT set-doc-field.mjs: `lessons` has a public mirror. Every delete here
 * removes `lessonsPublic/<id>` in the same batch, so the student's own
 * feeds/student-<id>.ics drops it on the next feed refresh.
 *
 * WHAT IT WILL NOT DO:
 *   • A GRADED lesson happened. Reported, never deleted.
 *   • A lesson with files attached is reported, never deleted (its Storage
 *     objects would be orphaned; delete it in the app).
 *   • The PAST is left alone by default (--from=<date> widens it).
 *
 * NEVER logs a student name or a doc id: Actions logs are public.
 *
 *   FIREBASE_SERVICE_ACCOUNT_JSON=… node scripts/remove-no-school-lessons.mjs --dry-run
 *   FIREBASE_SERVICE_ACCOUNT_JSON=… node scripts/remove-no-school-lessons.mjs
 */
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { MDCPS_NO_SCHOOL } from '../src/shared/academicCalendars.ts';

const DRY = process.argv.includes('--dry-run');
const fromArg = process.argv.find(a => a.startsWith('--from='));
const FROM = (fromArg ? fromArg.slice('--from='.length) : new Date().toISOString().slice(0, 10)).trim();
if (!/^\d{4}-\d{2}-\d{2}$/.test(FROM)) {
  console.error(`--from must be YYYY-MM-DD (got "${FROM}")`);
  process.exit(1);
}

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!raw) { console.error('FIREBASE_SERVICE_ACCOUNT_JSON is not set — aborting.'); process.exit(1); }
if (getApps().length === 0) initializeApp({ credential: cert(JSON.parse(raw)) });
const db = getFirestore();

const snap = await db.collection('lessons').get();
const stranded = [];
const graded = [];
const withFiles = [];
const past = [];

for (const doc of snap.docs) {
  const l = doc.data();
  if (!l?.date || !MDCPS_NO_SCHOOL.has(l.date)) continue;
  if (String(l.grade ?? '').trim()) { graded.push(l.date); continue; }
  if (l.date < FROM) { past.push(l.date); continue; }
  if (Array.isArray(l.attachments) && l.attachments.length) { withFiles.push(l.date); continue; }
  stranded.push({ id: doc.id, date: l.date, startTime: l.startTime ?? '' });
}

stranded.sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));

const tally = (list) => {
  const m = new Map();
  for (const d of list) m.set(d, (m.get(d) ?? 0) + 1);
  return [...m].sort();
};

console.log(`lessons scanned: ${snap.size}`);
console.log(`on an MDCPS no-school day, from ${FROM} onward: ${stranded.length}`);
for (const [d, n] of tally(stranded.map(s => s.date))) console.log(`   ${d}  ${n}`);
if (past.length) {
  console.log(`\nleft alone — BEFORE ${FROM} (a past lesson either happened or did not; this cannot tell): ${past.length}`);
  for (const [d, n] of tally(past)) console.log(`   ${d}  ${n}`);
}
if (graded.length) {
  console.log(`\nleft alone — already GRADED, so it happened: ${graded.length}`);
  for (const [d, n] of tally(graded)) console.log(`   ${d}  ${n}`);
}
if (withFiles.length) {
  console.log(`\nleft alone — has files attached (delete in the app): ${withFiles.length}`);
  for (const [d, n] of tally(withFiles)) console.log(`   ${d}  ${n}`);
}

if (stranded.length === 0) {
  console.log('\nNothing to do.');
  process.exit(0);
}
if (DRY) {
  console.log(`\nDry run — would delete ${stranded.length} lesson(s) and their ${stranded.length} public mirror doc(s).`);
  console.log('Re-run without --dry-run to apply.');
  process.exit(0);
}

const CHUNK = 200; // two deletes per lesson, well inside the 500-op batch limit
let done = 0;
for (let i = 0; i < stranded.length; i += CHUNK) {
  const batch = db.batch();
  for (const l of stranded.slice(i, i + CHUNK)) {
    batch.delete(db.collection('lessons').doc(l.id));
    batch.delete(db.collection('lessonsPublic').doc(l.id));
    done++;
  }
  await batch.commit();
}
console.log(`\nDone: ${done} lesson(s) deleted with their public mirrors.`);
