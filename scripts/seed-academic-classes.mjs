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
 * AP Theory has no rule in classSchedule.ts — nothing in the Hub knows who
 * takes it — so it is created EMPTY for the director to fill in. That is the
 * honest outcome; guessing a roster would be worse than an empty one.
 *
 * Idempotent: groups merge by fixed doc id, and a student already enrolled is
 * skipped. Safe to re-run after adding students.
 *
 *   FIREBASE_SERVICE_ACCOUNT_JSON=… node scripts/seed-academic-classes.mjs --dry-run
 *   FIREBASE_SERVICE_ACCOUNT_JSON=… node scripts/seed-academic-classes.mjs
 */
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { theoryClassTitleFor, isChoirClassTitle } from '../src/director/classSchedule.ts';

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!raw) { console.error('FIREBASE_SERVICE_ACCOUNT_JSON is not set — aborting.'); process.exit(1); }
const DRY = process.argv.includes('--dry-run');
if (getApps().length === 0) initializeApp({ credential: cert(JSON.parse(raw)) });
const db = getFirestore();

const CHOIR_ID = 'high-school-choir';

// Doc ids are the slugs seedCalendar.ts already derives from these titles, so
// a class group and its calendar entries line up by name without a lookup
// table. `title` must match seedCalendar's CLASSES exactly — that string is
// what classSchedule.ts returns and what the roster rules key on.
const CLASSES = [
  { id: 'class-ap-theory',        title: 'AP Theory',                 room: 'Room 4204', start: '12:10', end: '13:00', days: [1, 2, 3, 4, 5], order: 40 },
  { id: 'class-jazz-theory',      title: 'Jazz Theory',               room: 'Room 4304', start: '14:30', end: '15:45', days: [1, 4],          order: 41 },
  { id: 'class-music-history',    title: 'Music History — 11th–12th', room: 'Room 4309', start: '14:30', end: '15:45', days: [1, 4],          order: 42 },
  { id: 'class-theory-9',         title: 'Theory — 9th Grade',        room: 'Room 4213', start: '14:25', end: '15:45', days: [1, 4],          order: 43 },
  { id: 'class-theory-10',        title: 'Theory — 10th Grade',       room: 'Room 4210', start: '14:25', end: '15:45', days: [1, 4],          order: 44 },
  { id: 'class-vocal-lit',        title: 'Vocal Lit',                 room: '',          start: '13:10', end: '14:15', days: [1, 3, 5],       order: 45 },
  { id: 'class-vocal-forum',      title: 'Vocal Forum',               room: '',          start: '13:10', end: '14:15', days: [2, 4],          order: 46 },
];

const PUBLIC_KEYS = ['name', 'preferredName', 'instrument', 'section', 'ensembleIds', 'status', 'grade'];
const project = d => Object.fromEntries(PUBLIC_KEYS.filter(k => d[k] !== undefined).map(k => [k, d[k]]));

const ops = [];

// ── 1. The class groups ───────────────────────────────────────────────
for (const c of CLASSES) {
  console.log(`  class       ${c.id.padEnd(22)} ${c.title.padEnd(26)} ${c.room || '(no room)'}`);
  ops.push(b => b.set(db.collection('ensembles').doc(c.id), {
    kind: 'class',
    name: c.title,
    order: c.order,
    defaultLocation: c.room || undefined,
    defaultStartTime: c.start,
    defaultEndTime: c.end,
    meetingDays: c.days,
  }, { merge: true }));
}

// ── 2. Rosters, from the rules that already exist ─────────────────────
const students = await db.collection('students').get();
const byClass = Object.fromEntries(CLASSES.map(c => [c.id, []]));
let enrolled = 0;

for (const d of students.docs) {
  const data = d.data();
  if (data.status !== 'Active') continue;

  // Every class this student belongs to: their theory/history class, plus the
  // vocal classes if they are in the choir.
  const titles = [];
  const theory = theoryClassTitleFor(data);
  if (theory) titles.push(theory);
  if ((data.ensembleIds ?? []).includes(CHOIR_ID)) {
    titles.push(...CLASSES.map(c => c.title).filter(isChoirClassTitle));
  }

  const addIds = CLASSES.filter(c => titles.includes(c.title)).map(c => c.id);
  if (addIds.length === 0) continue;
  for (const id of addIds) byClass[id].push(data.name);

  const have = data.ensembleIds ?? [];
  const missing = addIds.filter(id => !have.includes(id));
  if (missing.length === 0) continue;         // already enrolled — idempotent
  enrolled += 1;

  const next = [...have, ...missing];
  ops.push(b => {
    b.update(d.ref, { ensembleIds: next, updatedAt: Date.now(), updatedBy: 'academic-class seed' });
    // The public mirror carries ensembleIds, so it must move with the source
    // doc in the same batch (see publicMirror.ts) or the two diverge.
    b.set(db.collection('studentsPublic').doc(d.id), project({ ...data, ensembleIds: next }), { merge: true });
  });
}

for (const c of CLASSES) {
  const n = byClass[c.id].length;
  console.log(`  roster      ${c.title.padEnd(26)} ${n} student(s)${n === 0 ? '  ← fill in by hand' : ''}`);
}
console.log(`\n${CLASSES.length} class group(s); ${enrolled} student(s) to enrol.`);

if (DRY) { console.log('--dry-run: nothing written.'); process.exit(0); }

for (let i = 0; i < ops.length; i += 200) {
  const batch = db.batch();
  for (const op of ops.slice(i, i + 200)) op(batch);
  await batch.commit();
}
console.log('Applied.');
