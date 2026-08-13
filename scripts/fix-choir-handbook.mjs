#!/usr/bin/env node
/**
 * One-shot: both handbook readings are P6+P7 (13:10–15:45), Scheduled.
 * Env: FIREBASE_SERVICE_ACCOUNT_JSON
 */
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!raw) {
  console.error('FIREBASE_SERVICE_ACCOUNT_JSON is not set — aborting.');
  process.exit(1);
}
if (getApps().length === 0) initializeApp({ credential: cert(JSON.parse(raw)) });
const db = getFirestore();
const del = FieldValue.delete();
const NOW = Date.now();
const BY = 'fix-handbook-p6p7';

const INSTRUMENTAL = [
  'symphony-orchestra', 'wind-ensemble', 'camerata-string-orchestra',
  'jazz-ensemble', 'chamber-winds', 'college-chamber-orchestra',
  'opera-orchestra', 'philharmonic',
];

const patches = [
  {
    id: 'evt-2026-08-13-handbook-reading',
    data: {
      type: 'Event',
      title: 'Handbook Reading',
      ensembleIds: INSTRUMENTAL,
      date: '2026-08-13',
      startTime: '13:10',
      endTime: '15:45',
      location: 'Room 4302',
      status: 'Scheduled',
      changeNote: del,
      notes: 'All instrumental music students report to Room 4302 for handbook reading, 1:10–3:45 (P6+P7).',
      updatedAt: NOW,
      updatedBy: BY,
    },
  },
  {
    id: 'evt-2026-08-13-handbook-choir',
    data: {
      type: 'Event',
      title: 'Handbook Reading (Choir)',
      ensembleIds: ['high-school-choir'],
      date: '2026-08-13',
      startTime: '13:10',
      endTime: '15:45',
      location: 'Room 4204',
      status: 'Scheduled',
      changeNote: del,
      notes: 'Choir students report to Room 4204 for handbook reading, 1:10–3:45 (P6+P7; instrumental upstairs in 4302).',
      updatedAt: NOW,
      updatedBy: BY,
    },
  },
];

for (const { id, data } of patches) {
  await db.collection('events').doc(id).set(data, { merge: true });
  const after = (await db.collection('events').doc(id).get()).data();
  console.log(JSON.stringify({
    id,
    startTime: after.startTime,
    endTime: after.endTime,
    status: after.status,
    location: after.location,
    changeNote: after.changeNote ?? null,
  }));
}

// Also refresh cancel notes on P6/P7 events that still say 11:00–3:45
const snap = await db.collection('events').where('date', '==', '2026-08-13').get();
const note = 'Handbook reading 1:10–3:45 (first day of school)';
for (const d of snap.docs) {
  if (d.id.startsWith('evt-2026-08-13-handbook') || d.id.startsWith('cal-')) continue;
  const e = d.data();
  if (e.status !== 'Cancelled') continue;
  const start = e.startTime;
  if (!start || start < '13:10' || start >= '15:45') continue;
  if (e.changeNote === note) continue;
  await d.ref.update({ changeNote: note, updatedAt: NOW, updatedBy: BY });
  console.log('updated cancel note:', d.id);
}

// Restore anything before P6 that was wrongly cancelled for an 11:00 handbook window.
for (const d of snap.docs) {
  if (d.id.startsWith('evt-2026-08-13-handbook') || d.id.startsWith('cal-')) continue;
  const e = d.data();
  if (e.status !== 'Cancelled') continue;
  const start = e.startTime;
  if (!start || start >= '13:10') continue;
  if (!String(e.changeNote || '').includes('Handbook reading')) continue;
  const cf = e.changeFrom || {};
  await d.ref.update({
    status: cf.status ?? 'Scheduled',
    startTime: 'startTime' in cf ? cf.startTime : e.startTime,
    endTime: 'endTime' in cf ? cf.endTime : e.endTime,
    location: 'location' in cf ? cf.location : e.location,
    changeNote: del,
    changeFrom: del,
    changeAnnouncementId: del,
    updatedAt: NOW,
    updatedBy: BY,
  });
  console.log('restored pre-P6:', d.id);
}

console.log(JSON.stringify({ ok: true }));
