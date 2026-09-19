#!/usr/bin/env node
/**
 * cancel-no-school-lessons.mjs
 *
 * Cancels applied lessons sitting on a day MDCPS is closed
 * (#college-hs-calendar-deps).
 *
 * WHY THIS EXISTS AS A SCRIPT. `slotDates()` in lessonSchedule.ts learned to
 * skip MDCPS no-school days in Sept 2026, so nothing generated since then can
 * land on one. Every lesson generated BEFORE that is still sitting where the
 * old generator put it — on Thanksgiving, on Christmas Eve, on Memorial Day —
 * and nothing in the app ever looks. Worse, it cannot be tidied up by
 * re-running anything: `pendingSlotDates()` reads a week that holds any lesson
 * as already covered, so the standing weekly time will never notice.
 *
 * WHY NOT set-doc-field.mjs. That tool refuses `lessons` on purpose, because
 * the collection has a public projection: writing `status` there alone would
 * leave `lessonsPublic` saying the lesson is still on, and the student's own
 * feeds/student-<id>.ics would keep carrying it. Every write here batches the
 * mirror with its source doc, the same contract useLessons.ts keeps.
 *
 * WHAT IT WILL NOT DO:
 *   • A lesson that is already cancelled is left alone.
 *   • A GRADED lesson is a record of one that HAPPENED — a teacher who taught
 *     through a closure is telling you something true. Reported, never
 *     rewritten.
 *   • The PAST is left alone by default. A lesson on a no-school day last
 *     month either happened or did not, and this script cannot tell which;
 *     cancelling it retroactively would falsify the log. Pass --from=<date>
 *     to widen deliberately.
 *   • It never deletes. `status: 'Cancelled'` is what keeps the standing
 *     weekly time from silently re-creating the lesson on the next expansion
 *     (see useLessons.cancelLesson) — a delete would hand it straight back.
 *
 * Each cancel carries `changeFrom: { status }`, the same receipt the day board
 * writes, so "Back to normal" on that day can put it back and a teacher's own
 * cancellation is still distinguishable from this one.
 *
 * NEVER logs a student name or a doc id with a name beside it: Actions logs on
 * this repo are public, and a lesson is a record about a minor (#student-data).
 * Counts, dates and times only.
 *
 *   FIREBASE_SERVICE_ACCOUNT_JSON=… node scripts/cancel-no-school-lessons.mjs --dry-run
 *   FIREBASE_SERVICE_ACCOUNT_JSON=… node scripts/cancel-no-school-lessons.mjs
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

// The exact allowlist publicMirror.ts publishes. Spelled out rather than
// imported because that module reaches types the Node loader would have to
// resolve; the mirror write here only ever needs `status`, and pinning the
// whole list makes it obvious that nothing else is being sent.
const PUBLIC_LESSON_KEYS = [
  'studentId', 'date', 'startTime', 'endTime', 'status', 'location', 'teacherName', 'instrument',
];

const snap = await db.collection('lessons').get();
const stranded = [];
const graded = [];
const alreadyOff = [];
const past = [];

for (const doc of snap.docs) {
  const l = doc.data();
  if (!l?.date || !MDCPS_NO_SCHOOL.has(l.date)) continue;
  if (l.status === 'Cancelled') { alreadyOff.push(l.date); continue; }
  if (String(l.grade ?? '').trim()) { graded.push(l.date); continue; }
  if (l.date < FROM) { past.push(l.date); continue; }
  stranded.push({ id: doc.id, date: l.date, startTime: l.startTime, status: l.status ?? 'Scheduled', changeFrom: l.changeFrom });
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
if (alreadyOff.length) console.log(`\nalready cancelled: ${alreadyOff.length}`);

if (stranded.length === 0) {
  console.log('\nNothing to do.');
  process.exit(0);
}
if (DRY) {
  console.log(`\nDry run — would cancel ${stranded.length} lesson(s) and update ${stranded.length} mirror doc(s).`);
  console.log('Re-run without --dry-run to apply.');
  process.exit(0);
}

const CHUNK = 200; // two writes per lesson, well inside the 500-op batch limit
let done = 0;
for (let i = 0; i < stranded.length; i += CHUNK) {
  const batch = db.batch();
  for (const l of stranded.slice(i, i + CHUNK)) {
    const patch = {
      status: 'Cancelled',
      updatedAt: Date.now(),
      updatedBy: 'cancel-no-school-lessons',
      // Snapshot-once, like every other cancel: never overwrite an existing one.
      ...(l.changeFrom ? {} : { changeFrom: { status: l.status } }),
    };
    batch.update(db.collection('lessons').doc(l.id), patch);
    // The mirror carries ONLY allowlisted keys — here, the new status.
    const mirror = Object.fromEntries(
      Object.entries({ status: 'Cancelled' }).filter(([k]) => PUBLIC_LESSON_KEYS.includes(k)));
    batch.set(db.collection('lessonsPublic').doc(l.id), mirror, { merge: true });
    done++;
  }
  await batch.commit();
}
console.log(`\nDone: ${done} lesson(s) cancelled, mirrors updated.`);
