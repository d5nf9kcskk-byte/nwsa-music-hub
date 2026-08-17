#!/usr/bin/env node
/**
 * migrate-student-doc-ids.mjs (#privacy)
 *
 * One-time repair for the 2026–27 roster import, which created student docs
 * whose doc ID was the school-issued 7-digit Student ID. Doc IDs are
 * effectively public — the world-readable `studentsPublic` mirror shares IDs
 * with `students`, and they appear in public URLs (/student/<id>) and static
 * feed filenames (feeds/student-<id>.ics) — and the school ID was never on
 * the approved public field list. This script re-keys every such student to
 * a random Firestore ID and keeps the school ID as a staff-only `schoolId`
 * field on the `students` doc.
 *
 * Per student whose doc ID is 7 digits:
 *   1. stamp `migratedTo: <newId>` on the old students doc (resume marker);
 *   2. create students/<newId> (+ `schoolId`), studentsPublic/<newId>
 *      (public projection), and copy contacts/<oldId> → contacts/<newId>;
 *   3. rewrite every reference to the old ID:
 *        `studentId` field   — rosterOverrides (and its rosterOverridesPublic
 *                              mirror), attendance, progressNotes,
 *                              assignmentResults, assignmentSubmissions,
 *                              plannedAbsences, lessons
 *        `studentIds` array  — events, assignments
 *        nested seat refs    — seatingCharts sections[].seats[].studentId
 *   4. delete the old students / studentsPublic / contacts docs (last).
 *
 * DRY RUN by default — prints the full plan and touches nothing. Pass
 * `--live` to write. Idempotent: a re-run resumes from the `migratedTo`
 * markers and finished students no longer match.
 *
 * Run scripts/backfill-public-projections.mjs (or its workflow) afterwards to
 * converge the mirrors, and the deploy workflow to regenerate ICS feeds under
 * the new IDs. Saved schedules and personal-feed subscriptions made under the
 * old IDs stop resolving — that is the point — and families re-pick once.
 *
 * Env: FIREBASE_SERVICE_ACCOUNT_JSON — the service-account key JSON.
 * Usage: node scripts/migrate-student-doc-ids.mjs [--live]
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const rawSa = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!rawSa) {
  console.error('FIREBASE_SERVICE_ACCOUNT_JSON is not set — aborting.');
  process.exit(1);
}
const LIVE = process.argv.includes('--live');

const sa = JSON.parse(rawSa);
if (getApps().length === 0) initializeApp({ credential: cert(sa) });
const db = getFirestore();
console.log(`Project: ${sa.project_id} — ${LIVE ? 'LIVE RUN' : 'dry run (pass --live to write)'}`);

const SCHOOL_ID_RE = /^\d{7}$/;

// Keep in sync with src/director/publicMirror.ts.
const PUBLIC_STUDENT_KEYS = ['name', 'preferredName', 'instrument', 'section', 'ensembleIds', 'status', 'grade'];
function projectStudent(data) {
  const out = {};
  for (const k of PUBLIC_STUDENT_KEYS) if (data[k] !== undefined) out[k] = data[k];
  return out;
}

const STUDENT_ID_FIELD = ['rosterOverrides', 'attendance', 'progressNotes', 'assignmentResults', 'assignmentSubmissions', 'plannedAbsences', 'lessons'];
const STUDENT_IDS_ARRAY = ['events', 'assignments'];

const studentsSnap = await db.collection('students').get();
const toMigrate = studentsSnap.docs.filter(d => SCHOOL_ID_RE.test(d.id));

if (toMigrate.length === 0) {
  console.log(`No students with school-ID doc IDs (${studentsSnap.size} total) — nothing to do.`);
  process.exit(0);
}

// The import padded an empty school ID to '0000000', so several students
// missing an ID could have collapsed into one doc. Surface it for review.
if (toMigrate.some(d => d.id === '0000000')) {
  console.warn('WARNING: students/0000000 exists — rows without a school ID may have overwritten each other during import. Review that doc by hand after migrating.');
}

// oldId → newId, reusing resume markers from an interrupted run.
const idMap = new Map();
for (const d of toMigrate) {
  const prior = d.get('migratedTo');
  idMap.set(d.id, typeof prior === 'string' && prior ? prior : db.collection('students').doc().id);
}

const counts = {};
const bump = (name, n = 1) => { counts[name] = (counts[name] ?? 0) + n; };

const writer = db.bulkWriter();
writer.onWriteError(err => {
  if (err.failedAttempts < 5) return true;
  console.error('write failed', err.documentRef?.path, err.message);
  return false;
});

// 1. Resume markers first, so a crash mid-run keeps the ID mapping.
if (LIVE) {
  for (const d of toMigrate) writer.set(d.ref, { migratedTo: idMap.get(d.id) }, { merge: true });
  await writer.flush();
}

// 2. New docs under random IDs.
const now = Date.now();
for (const d of toMigrate) {
  const oldId = d.id;
  const newId = idMap.get(oldId);
  const { migratedTo, ...data } = d.data();
  void migratedTo;
  const next = { ...data, schoolId: oldId, updatedAt: now, updatedBy: 'migrate-student-doc-ids' };
  bump('students');
  if (LIVE) {
    writer.set(db.collection('students').doc(newId), next);
    writer.set(db.collection('studentsPublic').doc(newId), projectStudent(next));
  }
}
const contactRefs = toMigrate.map(d => db.collection('contacts').doc(d.id));
const contactSnaps = await db.getAll(...contactRefs);
for (const c of contactSnaps) {
  if (!c.exists) continue;
  bump('contacts');
  if (LIVE) writer.set(db.collection('contacts').doc(idMap.get(c.id)), c.data());
}
if (LIVE) await writer.flush();

// 3. Rewrite references. Full-collection scans beat per-student queries here:
// nine reads of small collections instead of hundreds of indexed queries.
for (const name of STUDENT_ID_FIELD) {
  const snap = await db.collection(name).get();
  for (const d of snap.docs) {
    const newId = idMap.get(d.get('studentId'));
    if (!newId) continue;
    bump(name);
    if (LIVE) {
      writer.update(d.ref, { studentId: newId });
      // The overrides mirror shares doc IDs with its source; patch it in the
      // same pass so public schedules never show a stale student link. The
      // backfill converges it fully afterwards either way.
      if (name === 'rosterOverrides') {
        writer.set(db.collection('rosterOverridesPublic').doc(d.id), { studentId: newId }, { merge: true });
      }
    }
  }
}

for (const name of STUDENT_IDS_ARRAY) {
  const snap = await db.collection(name).get();
  for (const d of snap.docs) {
    const ids = d.get('studentIds');
    if (!Array.isArray(ids) || !ids.some(id => idMap.has(id))) continue;
    bump(name);
    if (LIVE) writer.update(d.ref, { studentIds: ids.map(id => idMap.get(id) ?? id) });
  }
}

{
  const snap = await db.collection('seatingCharts').get();
  for (const d of snap.docs) {
    let changed = false;
    const sections = (d.get('sections') ?? []).map(sec => ({
      ...sec,
      seats: (sec.seats ?? []).map(seat => {
        const newId = idMap.get(seat.studentId);
        if (!newId) return seat;
        changed = true;
        return { ...seat, studentId: newId };
      }),
    }));
    if (!changed) continue;
    bump('seatingCharts');
    if (LIVE) writer.update(d.ref, { sections });
  }
}
if (LIVE) await writer.flush();

// 4. Old docs go last, once every replacement is in place.
for (const d of toMigrate) {
  if (!LIVE) continue;
  writer.delete(d.ref);
  writer.delete(db.collection('studentsPublic').doc(d.id));
  writer.delete(db.collection('contacts').doc(d.id));
}
await writer.close();

if (LIVE) {
  const after = await db.collection('students').get();
  const remaining = after.docs.filter(d => SCHOOL_ID_RE.test(d.id)).length;
  console.log(JSON.stringify({ ok: remaining === 0, migrated: toMigrate.length, remainingSchoolIdDocs: remaining, rewrites: counts }, null, 2));
  if (remaining > 0) process.exit(1);
} else {
  // No IDs in the log on purpose — the old-to-new mapping is the secret.
  console.log(JSON.stringify({
    dryRun: true,
    wouldMigrate: toMigrate.length,
    totalStudents: studentsSnap.size,
    rewrites: counts,
  }, null, 2));
}
