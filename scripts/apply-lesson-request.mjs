#!/usr/bin/env node
/**
 * apply-lesson-request.mjs
 *
 * Receiving end of the applied-teacher lesson-request pipeline:
 *   Microsoft Form → Power Automate → (director approves in Teams) →
 *   HTTP POST to GitHub repository_dispatch → this script writes the
 *   lesson pull-out (RosterOverride, kind 'lesson') into Firestore.
 *
 * The student then shows a "Lesson 3:00–3:50 PM" badge on Take Roll for that
 * date, appears as out-for-a-window on their schedule, and the director's
 * Today view lists it — all through the existing lesson machinery.
 *
 * Payload (repository_dispatch client_payload / workflow_dispatch inputs):
 *   student   — student name as typed on the form (fuzzy-matched) OR exact id
 *   ensemble  — ensemble name (fuzzy-matched) OR exact id
 *   date      — YYYY-MM-DD
 *   start     — HH:MM (24h)  e.g. "15:00"
 *   end       — HH:MM (24h)  e.g. "15:50"
 *   teacher   — applied teacher's name (stored as the reason)
 *
 * Required env: FIREBASE_SERVICE_ACCOUNT_JSON, plus the payload via
 * LESSON_* environment variables (set by the workflow).
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const SERVICE_ACCOUNT_JSON = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!SERVICE_ACCOUNT_JSON) { console.error('FIREBASE_SERVICE_ACCOUNT_JSON not set.'); process.exit(1); }

const payload = {
  student:  (process.env.LESSON_STUDENT ?? '').trim(),
  ensemble: (process.env.LESSON_ENSEMBLE ?? '').trim(),
  date:     (process.env.LESSON_DATE ?? '').trim(),
  start:    (process.env.LESSON_START ?? '').trim(),
  end:      (process.env.LESSON_END ?? '').trim(),
  teacher:  (process.env.LESSON_TEACHER ?? '').trim(),
};

for (const k of ['student', 'ensemble', 'date', 'start', 'end']) {
  if (!payload[k]) { console.error(`Missing required field: ${k}`); process.exit(1); }
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.date)) { console.error(`Bad date "${payload.date}" — expected YYYY-MM-DD`); process.exit(1); }
if (!/^\d{2}:\d{2}$/.test(payload.start) || !/^\d{2}:\d{2}$/.test(payload.end)) {
  console.error('Bad times — expected HH:MM 24-hour'); process.exit(1);
}

let serviceAccount;
try { serviceAccount = JSON.parse(SERVICE_ACCOUNT_JSON); }
catch { console.error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.'); process.exit(1); }
if (getApps().length === 0) initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

/** Loose name normalization: lowercase, letters only, order-insensitive tokens. */
const norm = s => String(s).toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');

(async () => {
  // Resolve the student: exact id first, then fuzzy name match.
  const studentsSnap = await db.collection('students').get();
  const students = studentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  let student = students.find(s => s.id === payload.student);
  if (!student) {
    const want = norm(payload.student);
    const hits = students.filter(s => {
      const have = norm(s.name);
      return have === want || have.includes(want) || want.includes(have)
        || norm(s.name).split(' ').filter(t => want.includes(t)).length >= 2;
    });
    if (hits.length === 1) student = hits[0];
    else if (hits.length > 1) {
      console.error(`Ambiguous student "${payload.student}" — matches: ${hits.map(h => h.name).join(' | ')}. Not applied.`);
      process.exit(1);
    }
  }
  if (!student) { console.error(`No student matched "${payload.student}". Not applied.`); process.exit(1); }

  // Resolve the ensemble: exact id, then name contains.
  const ensSnap = await db.collection('ensembles').get();
  const ensembles = ensSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  let ensemble = ensembles.find(e => e.id === payload.ensemble);
  if (!ensemble) {
    const want = payload.ensemble.toLowerCase();
    const hits = ensembles.filter(e => e.name.toLowerCase().includes(want) || want.includes(e.name.toLowerCase()));
    if (hits.length === 1) ensemble = hits[0];
    else if (hits.length > 1) { console.error(`Ambiguous ensemble "${payload.ensemble}".`); process.exit(1); }
  }
  if (!ensemble) { console.error(`No ensemble matched "${payload.ensemble}".`); process.exit(1); }

  const start = payload.start;
  const end = payload.end <= start ? start.replace(/(\d+):(\d+)/, (_, h, m) => `${String((Number(h) + (Number(m) + 30 >= 60 ? 1 : 0)) % 24).padStart(2, '0')}:${String((Number(m) + 30) % 60).padStart(2, '0')}`) : payload.end;

  const id = `lesson-${student.id}-${payload.date}-${start.replace(':', '')}`;
  await db.collection('rosterOverrides').doc(id).set({
    studentId: student.id,
    ensembleId: ensemble.id,
    action: 'remove',
    scope: 'range',
    startDate: payload.date,
    endDate: payload.date,
    startTime: start,
    endTime: end,
    kind: 'lesson',
    reason: payload.teacher ? `Lesson — ${payload.teacher}` : 'Lesson (approved request)',
  }, { merge: true });

  console.log(`✓ Lesson applied: ${student.name} out of ${ensemble.name} on ${payload.date}, ${start}–${end}${payload.teacher ? ` (${payload.teacher})` : ''}`);
})();
