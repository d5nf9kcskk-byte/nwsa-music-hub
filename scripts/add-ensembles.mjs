#!/usr/bin/env node
/**
 * add-ensembles.mjs
 *
 * One-shot admin script (run via the "Add Ensembles" GitHub Action) that adds
 * ensembles to the live Firestore without touching anything that exists:
 *   • College Chamber Orchestra — weekly rehearsal Thursday 2:30–3:45 PM
 *     (rehearsal events seeded Aug 13 2026 → Jun 3 2027, skipping MDCPS
 *     no-school days — adjust later if the college calendar differs)
 *   • High School Choir — no weekly schedule yet (page + all elements exist;
 *     rehearsals added once the schedule is known)
 *   • Opera Orchestra — no weekly schedule yet
 *
 * Idempotent: stable document IDs, so re-running never duplicates.
 *
 * Required env: FIREBASE_SERVICE_ACCOUNT_JSON (GitHub secret)
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const SERVICE_ACCOUNT_JSON = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!SERVICE_ACCOUNT_JSON) {
  console.error('FIREBASE_SERVICE_ACCOUNT_JSON not set — aborting.');
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(SERVICE_ACCOUNT_JSON);
} catch {
  console.error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON — aborting.');
  process.exit(1);
}

if (getApps().length === 0) initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const ENSEMBLES = [
  {
    id: 'college-chamber-orchestra',
    name: 'College Chamber Orchestra',
    order: 6,
    defaultStartTime: '14:30',
    defaultEndTime: '15:45',
    meetingDays: [4], // Thursday
  },
  { id: 'high-school-choir', name: 'High School Choir', order: 7 },
  { id: 'opera-orchestra',   name: 'Opera Orchestra',   order: 8 },
];

// Same MDCPS 2026-27 no-school set as src/director/seedCalendar.ts.
const NO_SCHOOL = new Set([
  '2026-08-10', '2026-08-11', '2026-08-12',
  '2026-09-07', '2026-09-21', '2026-11-03', '2026-11-11',
  '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27',
  '2026-12-18',
  '2026-12-21', '2026-12-22', '2026-12-23', '2026-12-24', '2026-12-25',
  '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01',
  '2027-01-15', '2027-01-18', '2027-02-15', '2027-03-10',
  '2027-03-22', '2027-03-23', '2027-03-24', '2027-03-25', '2027-03-26',
  '2027-03-29', '2027-05-31',
]);

(async () => {
  const batchDocs = [];

  for (const { id, ...data } of ENSEMBLES) {
    batchDocs.push({ col: 'ensembles', id, data });
  }

  // College Chamber Orchestra: Thursdays, Aug 13 2026 → Jun 3 2027.
  const startMs = Date.UTC(2026, 7, 13);
  const endMs   = Date.UTC(2027, 5, 3);
  let cco = 0;
  for (let ms = startMs; ms <= endMs; ms += 86_400_000) {
    const d = new Date(ms);
    if (d.getUTCDay() !== 4) continue; // Thursdays only
    const dateStr = d.toISOString().slice(0, 10);
    if (NO_SCHOOL.has(dateStr)) continue;
    batchDocs.push({
      col: 'events',
      id: `reh-${dateStr}-college-chamber-orchestra-1430`,
      data: {
        type: 'Rehearsal',
        ensembleIds: ['college-chamber-orchestra'],
        date: dateStr,
        startTime: '14:30',
        endTime: '15:45',
        status: 'Scheduled',
      },
    });
    cco++;
  }

  const CHUNK = 499;
  for (let i = 0; i < batchDocs.length; i += CHUNK) {
    const batch = db.batch();
    for (const { col, id, data } of batchDocs.slice(i, i + CHUNK)) {
      batch.set(db.collection(col).doc(id), data, { merge: true });
    }
    await batch.commit();
  }

  console.log(`Done: ${ENSEMBLES.length} ensembles ensured, ${cco} College Chamber Orchestra rehearsals written.`);
})();
