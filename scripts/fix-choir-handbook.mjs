#!/usr/bin/env node
/**
 * One-shot: choir handbook today is 11:05, Scheduled (not cancelled).
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
const id = 'evt-2026-08-13-handbook-choir';

await db.collection('events').doc(id).set({
  type: 'Event',
  title: 'Handbook Reading (Choir)',
  ensembleIds: ['high-school-choir'],
  date: '2026-08-13',
  startTime: '11:05',
  endTime: '15:45',
  location: 'Room 4204',
  status: 'Scheduled',
  changeNote: del,
  notes: 'Choir students report to Room 4204 for handbook reading, 11:05–3:45 (instrumental upstairs in 4302).',
  updatedAt: Date.now(),
  updatedBy: 'fix-choir-handbook',
}, { merge: true });

const after = (await db.collection('events').doc(id).get()).data();
console.log(JSON.stringify({
  ok: true,
  id,
  startTime: after.startTime,
  status: after.status,
  changeNote: after.changeNote ?? null,
  location: after.location,
}));
