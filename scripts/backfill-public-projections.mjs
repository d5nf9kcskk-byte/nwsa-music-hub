#!/usr/bin/env node
/**
 * backfill-public-projections.mjs (#privacy)
 *
 * Converges the public projection mirrors from the full (staff-only)
 * collections using the Admin SDK (bypasses security rules):
 *
 *   students        → studentsPublic        (name, preferredName, instrument,
 *                                            section, ensembleIds, status, grade)
 *   rosterOverrides → rosterOverridesPublic (all fields EXCEPT reason)
 *   lessons         → lessonsPublic         (when/where only: studentId, date,
 *                                            times, status, location,
 *                                            teacherName, instrument — NEVER
 *                                            the mark, comments, repertoire
 *                                            or initials)
 *
 * Also deletes mirror docs whose source doc no longer exists, so re-running
 * always converges. Client writes keep the mirrors in sync day-to-day
 * (src/director/publicMirror.ts); this script exists for the initial
 * backfill and as a repair tool.
 *
 * Env: FIREBASE_SERVICE_ACCOUNT_JSON — the service-account key JSON.
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!raw) {
  console.error('FIREBASE_SERVICE_ACCOUNT_JSON is not set — aborting.');
  process.exit(1);
}
initializeApp({ credential: cert(JSON.parse(raw)) });
const db = getFirestore();

const PUBLIC_STUDENT_KEYS = ['name', 'preferredName', 'instrument', 'section', 'ensembleIds', 'status', 'grade'];

function projectStudent(data) {
  const out = {};
  for (const k of PUBLIC_STUDENT_KEYS) if (data[k] !== undefined) out[k] = data[k];
  return out;
}

function projectOverride(data) {
  const { reason, ...rest } = data;
  void reason;
  return rest;
}

// Allowlist, deliberately — the lesson doc IS the log sheet, so a denylist
// would publish the next field someone adds to it. Mirrors
// publicLessonFields() in src/director/publicMirror.ts and the key allowlist
// on /lessonsPublic in firestore.rules; all three change together.
const PUBLIC_LESSON_KEYS = ['studentId', 'date', 'startTime', 'endTime', 'status', 'location', 'teacherName', 'instrument'];

function projectLesson(data) {
  const out = {};
  for (const k of PUBLIC_LESSON_KEYS) if (data[k] !== undefined) out[k] = data[k];
  return out;
}

async function syncMirror(sourceName, mirrorName, project) {
  const [source, mirror] = await Promise.all([
    db.collection(sourceName).get(),
    db.collection(mirrorName).get(),
  ]);
  const sourceIds = new Set(source.docs.map(d => d.id));

  const writer = db.bulkWriter();
  for (const d of source.docs) {
    writer.set(db.collection(mirrorName).doc(d.id), project(d.data()));
  }
  let removed = 0;
  for (const d of mirror.docs) {
    if (!sourceIds.has(d.id)) { writer.delete(d.ref); removed++; }
  }
  await writer.close();
  console.log(`${mirrorName}: mirrored ${source.size} docs, removed ${removed} stale.`);
}

await syncMirror('students', 'studentsPublic', projectStudent);
await syncMirror('rosterOverrides', 'rosterOverridesPublic', projectOverride);
await syncMirror('lessons', 'lessonsPublic', projectLesson);
console.log('Public projections converged.');
