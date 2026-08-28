/**
 * seed-academic-classes.mjs
 *
 * Creates the NWSA academic music classes as class GROUPS (#classes), so each
 * one has a roster, takes roll, and holds its own assignments and documents.
 * Until now they existed only as calendar entries with a title and no roster.
 *
 * Rosters are NOT re-derived here. `src/director/classSchedule.ts` already
 * decides which theory/history class a student belongs to (by grade, with Jazz
 * Ensemble members taking Jazz Theory) and which classes are the choir's —
 * it is what puts these on a student's personal schedule today. This script
 * imports that module directly so enrollment and the schedule can never drift
 * apart. Node's type-stripping loader handles the .ts import; the explicit
 * extension is required for it (same rule as calendarView.ts / signupEligibility.ts).
 *
 * AP Theory: every 12th grader (daily block, separate from afternoon theory).
 *
 * Idempotent: groups merge by fixed doc id, and a student already enrolled is
 * skipped. Safe to re-run after adding students.
 *
 *   FIREBASE_SERVICE_ACCOUNT_JSON=… node scripts/seed-academic-classes.mjs --dry-run
 *   FIREBASE_SERVICE_ACCOUNT_JSON=… node scripts/seed-academic-classes.mjs
 */
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { academicClassTitlesFor } from '../src/director/classSchedule.ts';
import { ACADEMIC_CLASSES, academicClassIdForTitle } from '../src/director/academicClasses.ts';

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!raw) { console.error('FIREBASE_SERVICE_ACCOUNT_JSON is not set — aborting.'); process.exit(1); }
const DRY = process.argv.includes('--dry-run');
if (getApps().length === 0) initializeApp({ credential: cert(JSON.parse(raw)) });
const db = getFirestore();

const PUBLIC_KEYS = ['name', 'preferredName', 'instrument', 'section', 'ensembleIds', 'status', 'grade'];
const project = d => Object.fromEntries(PUBLIC_KEYS.filter(k => d[k] !== undefined).map(k => [k, d[k]]));

const ops = [];

// ── 1. The class groups ───────────────────────────────────────────────
for (const c of ACADEMIC_CLASSES) {
  console.log(`  class       ${c.id.padEnd(22)} ${c.title.padEnd(26)} ${c.room || '(no room)'}`);
  ops.push(b => b.set(db.collection('ensembles').doc(c.id), {
    kind: 'class',
    name: c.title,
    order: c.order,
    ...(c.room ? { defaultLocation: c.room } : {}),
    defaultStartTime: c.start,
    defaultEndTime: c.end,
    meetingDays: c.days,
  }, { merge: true }));
}

// ── 2. Rosters, from the rules that already exist ─────────────────────
const students = await db.collection('students').get();
const byClass = Object.fromEntries(ACADEMIC_CLASSES.map(c => [c.id, []]));
let enrolled = 0;

for (const d of students.docs) {
  const data = d.data();
  if (data.status !== 'Active') continue;

  const titles = academicClassTitlesFor(data);
  const addIds = ACADEMIC_CLASSES.filter(c => titles.includes(c.title)).map(c => c.id);
  if (addIds.length === 0) continue;
  for (const id of addIds) byClass[id].push(data.name);

  const have = data.ensembleIds ?? [];
  const missing = addIds.filter(id => !have.includes(id));
  if (missing.length === 0) continue;
  enrolled += 1;

  const next = [...have, ...missing];
  ops.push(b => {
    b.update(d.ref, { ensembleIds: next, updatedAt: Date.now(), updatedBy: 'academic-class seed' });
    b.set(db.collection('studentsPublic').doc(d.id), project({ ...data, ensembleIds: next }), { merge: true });
  });
}

for (const c of ACADEMIC_CLASSES) {
  const n = byClass[c.id].length;
  console.log(`  roster      ${c.title.padEnd(26)} ${n} student(s)${n === 0 ? '  ← fill in by hand' : ''}`);
}

// ── 3. Link Class calendar events to their group ──────────────────────
const events = await db.collection('events').get();
let linked = 0;
for (const d of events.docs) {
  const e = d.data();
  if (e.type !== 'Class' || !e.title) continue;
  const classId = academicClassIdForTitle(e.title);
  if (!classId) continue;
  if ((e.ensembleIds ?? []).includes(classId)) continue;
  linked += 1;
  ops.push(b => b.update(d.ref, { ensembleIds: [classId] }));
}
console.log(`  calendar    ${linked} Class event(s) to link to a group`);

console.log(`\n${ACADEMIC_CLASSES.length} class group(s); ${enrolled} student(s) to enrol.`);

if (DRY) { console.log('--dry-run: nothing written.'); process.exit(0); }

for (let i = 0; i < ops.length; i += 200) {
  const batch = db.batch();
  for (const op of ops.slice(i, i + 200)) op(batch);
  await batch.commit();
}
console.log('Applied.');
