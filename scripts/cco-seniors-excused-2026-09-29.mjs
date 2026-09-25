#!/usr/bin/env node
/**
 * cco-seniors-excused-2026-09-29.mjs
 *
 * Tue Sept 29, 2026, the College Chamber Orchestra concert. Symphony and
 * Camerata are required to attend it (`attendanceEnsembleIds`). The director
 * (2026-09-25): the high school seniors are excused, because the school has
 * set up a college event for them.
 *
 * What this writes:
 *   oc26-cco-concert-sep   `attendanceExcusedGrades: ['12']` — the same value
 *      the Event form's "Seniors are excused" box stores (#audience-excusal),
 *      so the director can see it and turn it off in the app. That one field
 *      takes seniors off their schedules, their .ics feeds and the Gradebook's
 *      required-concert count. Plus one line appended to `notes`, so the
 *      concert's own description says it. Appended, never replacing: anything
 *      edited in the app since stays put.
 *   announcements          one post per required group (Symphony, Camerata),
 *      under fixed doc ids so a re-run updates rather than double-posting.
 *
 * Writes nothing about any student. The rule is a grade on a public event;
 * `studentsPublic` already carries grade (#student-data).
 *
 * Guards: refuses once the date has passed, refuses if the concert is
 * cancelled or no longer requires Symphony, and is idempotent.
 *
 * Preview needs no credentials (`events` is a world read):
 *   node scripts/cco-seniors-excused-2026-09-29.mjs --dry-run
 * Apply:
 *   FIREBASE_SERVICE_ACCOUNT_JSON=… node scripts/cco-seniors-excused-2026-09-29.mjs
 */

const DATE = '2026-09-29';
const EVENT_ID = 'oc26-cco-concert-sep';
const SENIOR_GRADE = '12'; // SENIOR_GRADE in src/shared/audienceExcusal.ts
const AUTHOR = 'Dr. Grant Gilman';

const NOTE = 'Seniors (12th grade) are excused from this concert. The school has set up a college event for you. Everyone else in Symphony and Camerata is still required to attend.';

const ANN_TITLE = 'Seniors are excused from the College Chamber Orchestra concert (Tue, Sept 29)';
const ANN_BODY = [
  'Seniors, you do not need to come to the College Chamber Orchestra concert on Tuesday, Sept 29. The school has set up a college event for you, so go to that instead.',
  'Everyone else is still required to attend. 6:30 PM at MDC Wolfson Auditorium. Don\'t forget to check in and check out!',
].join('\n\n');
const ANNOUNCEMENTS = [
  { id: 'cco-2026-09-29-seniors-excused-symphony', ensembleId: 'symphony-orchestra' },
  { id: 'cco-2026-09-29-seniors-excused-camerata', ensembleId: 'camerata-string-orchestra' },
];

const DRY = process.argv.includes('--dry-run');
const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!DRY && !raw) {
  console.error('FIREBASE_SERVICE_ACCOUNT_JSON is not set. Pass --dry-run to preview without it.');
  process.exit(1);
}

const todayNY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
if (todayNY > DATE) {
  console.error(`${DATE} has passed (today is ${todayNY}). Aborting.`);
  process.exit(1);
}

let db = null;
if (raw) {
  const { initializeApp, cert, getApps } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  if (getApps().length === 0) initializeApp({ credential: cert(JSON.parse(raw)) });
  db = getFirestore();
}

async function readEvent() {
  if (db) {
    const snap = await db.collection('events').doc(EVENT_ID).get();
    return snap.exists ? snap.data() : null;
  }
  const project = process.env.VITE_FIREBASE_PROJECT_ID || 'nwsa-hub';
  const res = await fetch(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/events/${EVENT_ID}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`events/${EVENT_ID}: HTTP ${res.status}`);
  const f = (await res.json()).fields ?? {};
  const val = v => v?.stringValue ?? (v?.arrayValue ? (v.arrayValue.values ?? []).map(val) : undefined);
  return {
    date: val(f.date), status: val(f.status), notes: val(f.notes),
    attendanceEnsembleIds: val(f.attendanceEnsembleIds), attendanceExcusedGrades: val(f.attendanceExcusedGrades),
  };
}

const ev = await readEvent();
if (!ev) { console.error(`events/${EVENT_ID} not found.`); process.exit(1); }
if (ev.date !== DATE) { console.error(`events/${EVENT_ID} is dated ${ev.date}, expected ${DATE}. Aborting.`); process.exit(1); }
if (ev.status === 'Cancelled') { console.error('The concert is cancelled. Nothing to excuse anyone from.'); process.exit(1); }
if (!(ev.attendanceEnsembleIds ?? []).includes('symphony-orchestra')) {
  console.error('Symphony is no longer required to attend this concert. Aborting rather than guessing.');
  process.exit(1);
}

const grades = ev.attendanceExcusedGrades ?? [];
const nextGrades = grades.includes(SENIOR_GRADE) ? grades : [...grades, SENIOR_GRADE];
const curNotes = (ev.notes ?? '').trim();
const nextNotes = curNotes.includes(NOTE) ? curNotes : [curNotes, NOTE].filter(Boolean).join('\n\n');

const patch = {};
if (nextGrades !== grades) patch.attendanceExcusedGrades = nextGrades;
if (nextNotes !== curNotes) patch.notes = nextNotes;

console.log(`events/${EVENT_ID}`);
console.log(`  attendanceExcusedGrades: ${JSON.stringify(grades)} -> ${JSON.stringify(nextGrades)}`);
console.log(`  notes:\n    ${JSON.stringify(curNotes)}\n    -> ${JSON.stringify(nextNotes)}`);
for (const a of ANNOUNCEMENTS) console.log(`announcements/${a.id} (${a.ensembleId}): ${ANN_TITLE}`);

if (DRY) { console.log('--dry-run: nothing written.'); process.exit(0); }

const batch = db.batch();
if (Object.keys(patch).length) {
  batch.update(db.collection('events').doc(EVENT_ID), { ...patch, updatedAt: Date.now(), updatedBy: AUTHOR });
}
for (const a of ANNOUNCEMENTS) {
  const ref = db.collection('announcements').doc(a.id);
  const existing = await ref.get();
  batch.set(ref, {
    ensembleId: a.ensembleId,
    title: ANN_TITLE,
    body: ANN_BODY,
    priority: 'important',
    createdAt: existing.exists ? existing.get('createdAt') : Date.now(),
    createdBy: AUTHOR,
    links: [{ label: 'College Chamber Orchestra Concert', url: `/event/${EVENT_ID}` }],
    expiresOn: DATE,
  });
}
await batch.commit();
console.log('Applied.');
