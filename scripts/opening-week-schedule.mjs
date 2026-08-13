#!/usr/bin/env node
/**
 * opening-week-schedule.mjs
 *
 * Director-confirmed opening week (clarified 2026-08-12 evening):
 *
 *   Thu 8/13 — Handbook reading 11:00–15:45.
 *     Instrumental (all non-choir music ensembles): Room 4302.
 *     Choir: Room 4204, same window.
 *     Everything else in that window stays Cancelled.
 *
 *   Fri 8/14 — P6 Camerata+Wind (normal Friday). P7 Camerata+Wind instead
 *     of Symphony/Jazz/Chamber Winds. Classes + choir unchanged.
 *
 *   Mon 8/17 — Fully normal Monday (P6 Camerata+Wind only). No extra P7
 *     ensembles. Jazz Theory restored.
 *
 *   Tue 8/18 — P6 Camerata+Wind instead of Symphony/Jazz/Chamber Winds.
 *     P7 Wind stays normal. Classes + choir unchanged. No Camerata P7.
 *
 *   Wed 8/19 — Double block Camerata+Wind (P6 normal + P7 instead of
 *     Symphony/Jazz/Chamber Winds). Classes + choir unchanged.
 *
 * Idempotent. Env: FIREBASE_SERVICE_ACCOUNT_JSON
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

const WIND = 'wind-ensemble';
const CAM = 'camerata-string-orchestra';
const CHOIR = 'high-school-choir';

const INSTRUMENTAL = [
  'symphony-orchestra', 'wind-ensemble', 'camerata-string-orchestra',
  'jazz-ensemble', 'chamber-winds', 'college-chamber-orchestra',
  'opera-orchestra', 'philharmonic',
];

const BY = 'opening-week-schedule';
const NOW = Date.now();
const del = FieldValue.delete();

function snapshot(e) {
  const s = { status: e.status ?? 'Scheduled' };
  if (e.startTime !== undefined) s.startTime = e.startTime;
  if (e.endTime !== undefined) s.endTime = e.endTime;
  if (e.location !== undefined) s.location = e.location;
  return s;
}
const captureOriginal = (e) => (e.changeFrom ? {} : { changeFrom: snapshot(e) });

async function eventsOn(date) {
  const snap = await db.collection('events').where('date', '==', date).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function cancelEvent(e, note) {
  if (e.status === 'Cancelled' && e.changeNote === note) {
    console.log(`  skip cancel: ${e.id}`);
    return;
  }
  await db.collection('events').doc(e.id).update({
    status: 'Cancelled',
    changeNote: note,
    updatedAt: NOW,
    updatedBy: BY,
    ...captureOriginal(e),
  });
  console.log(`  cancel: ${e.id}`);
}

/** Restore a cancelled/changed seeded event to its pre-change snapshot. */
async function revertEvent(id) {
  const ref = db.collection('events').doc(id);
  const doc = await ref.get();
  if (!doc.exists) {
    console.log(`  revert skip (missing): ${id}`);
    return;
  }
  const e = doc.data();
  const cf = e.changeFrom;
  const patch = {
    status: cf?.status ?? 'Scheduled',
    changeNote: del,
    changeFrom: del,
    changeAnnouncementId: del,
    updatedAt: del,
    updatedBy: del,
  };
  if (cf) {
    patch.startTime = 'startTime' in cf ? cf.startTime : del;
    patch.endTime = 'endTime' in cf ? cf.endTime : del;
    patch.location = 'location' in cf ? cf.location : del;
  }
  await ref.update(patch);
  console.log(`  revert: ${id}`);
}

/** Clear change stamps on a still-Scheduled event that is back to "normal". */
async function clearChangeStamp(id) {
  const ref = db.collection('events').doc(id);
  const doc = await ref.get();
  if (!doc.exists) return;
  const e = doc.data();
  if (!e.changeNote && !e.changeFrom) return;
  await ref.update({
    changeNote: del,
    changeFrom: del,
    changeAnnouncementId: del,
    updatedAt: del,
    updatedBy: del,
    status: 'Scheduled',
  });
  console.log(`  clear stamp: ${id}`);
}

async function deleteEvent(id) {
  const ref = db.collection('events').doc(id);
  const doc = await ref.get();
  if (!doc.exists) {
    console.log(`  delete skip (missing): ${id}`);
    return;
  }
  await ref.delete();
  console.log(`  delete: ${id}`);
}

async function upsertRehearsal({ id, ensId, date, start, end, room, note }) {
  const ref = db.collection('events').doc(id);
  const existing = await ref.get();
  const base = {
    type: 'Rehearsal',
    ensembleIds: [ensId],
    date,
    startTime: start,
    endTime: end,
    location: room,
    status: 'Scheduled',
    updatedAt: NOW,
    updatedBy: BY,
  };
  if (note) base.changeNote = note;
  if (!existing.exists) {
    await ref.set(base);
    console.log(`  add: ${id}`);
    return;
  }
  const e = { id, ...existing.data() };
  await ref.set({ ...base, ...captureOriginal(e) }, { merge: true });
  if (!note) await clearChangeStamp(id);
  else console.log(`  set: ${id}`);
}

async function applyThursday() {
  const date = '2026-08-13';
  const note = 'Handbook reading 11:00–3:45 (first day of school)';
  console.log(`\n=== ${date} Handbook ===`);
  const day = await eventsOn(date);
  for (const e of day) {
    if (e.id.startsWith('cal-')) continue;
    if (e.id.startsWith('evt-2026-08-13-handbook')) continue;
    const start = e.startTime;
    if (!start || start < '11:00' || start >= '15:45') continue;
    await cancelEvent(e, note);
  }

  await db.collection('events').doc('evt-2026-08-13-handbook-reading').set({
    type: 'Event',
    title: 'Handbook Reading',
    ensembleIds: INSTRUMENTAL,
    date,
    startTime: '11:00',
    endTime: '15:45',
    location: 'Room 4302',
    status: 'Scheduled',
    changeNote: 'First day — instrumental students',
    notes: 'All instrumental music students report to Room 4302 for handbook reading, 11:00–3:45. No regular rehearsals or classes.',
    updatedAt: NOW,
    updatedBy: BY,
  }, { merge: true });
  console.log('  handbook instrumental: Room 4302');

  await db.collection('events').doc('evt-2026-08-13-handbook-choir').set({
    type: 'Event',
    title: 'Handbook Reading (Choir)',
    ensembleIds: [CHOIR],
    date,
    startTime: '11:00',
    endTime: '15:45',
    location: 'Room 4204',
    status: 'Scheduled',
    changeNote: 'First day — choir students',
    notes: 'Choir students report to Room 4204 for handbook reading, 11:00–3:45 (same window as instrumental upstairs in 4302).',
    updatedAt: NOW,
    updatedBy: BY,
  }, { merge: true });
  console.log('  handbook choir: Room 4204');
}

async function applyFriday() {
  const date = '2026-08-14';
  const noteP7 = 'Opening week — Camerata + Wind Ensemble (instead of Symphony / Jazz)';
  console.log(`\n=== ${date} Fri: P6 normal, P7 Cam+Wind ===`);
  const day = await eventsOn(date);
  for (const e of day) {
    if (e.type !== 'Rehearsal') continue;
    const ens = (e.ensembleIds || [])[0];
    if (!ens || ens === CHOIR || ens === WIND || ens === CAM) continue;
    if (e.startTime === '14:30') await cancelEvent(e, noteP7);
  }
  // P6 = normal Friday — clear our earlier "opening week" stamps
  await clearChangeStamp(`reh-${date}-${WIND}-1310`);
  await clearChangeStamp(`reh-${date}-${CAM}-1310`);
  await upsertRehearsal({
    id: `reh-${date}-${WIND}-1430`, ensId: WIND, date,
    start: '14:30', end: '15:45', room: 'Room 4302', note: noteP7,
  });
  await upsertRehearsal({
    id: `reh-${date}-${CAM}-1430`, ensId: CAM, date,
    start: '14:30', end: '15:45', room: 'Room 4304', note: noteP7,
  });
}

async function applyMonday() {
  const date = '2026-08-17';
  console.log(`\n=== ${date} Mon: normal schedule ===`);
  // Remove the extra P7 Cam/Wind we added
  await deleteEvent(`reh-${date}-${WIND}-1430`);
  await deleteEvent(`reh-${date}-${CAM}-1430`);
  // Restore Jazz Theory
  await revertEvent(`class-${date}-jazz-theory-1430`);
  // P6 Cam/Wind are normal Monday — clear stamps
  await clearChangeStamp(`reh-${date}-${WIND}-1310`);
  await clearChangeStamp(`reh-${date}-${CAM}-1310`);
}

async function applyTuesday() {
  const date = '2026-08-18';
  const noteP6 = 'Opening week — Camerata + Wind Ensemble (instead of Symphony / Jazz)';
  console.log(`\n=== ${date} Tue: Cam+Wind P6 only ===`);
  const day = await eventsOn(date);
  for (const e of day) {
    if (e.type !== 'Rehearsal') continue;
    const ens = (e.ensembleIds || [])[0];
    if (!ens || ens === CHOIR || ens === WIND || ens === CAM) continue;
    if (e.startTime === '13:10') await cancelEvent(e, noteP6);
  }
  await upsertRehearsal({
    id: `reh-${date}-${WIND}-1310`, ensId: WIND, date,
    start: '13:10', end: '14:25', room: 'Room 4302', note: noteP6,
  });
  await upsertRehearsal({
    id: `reh-${date}-${CAM}-1310`, ensId: CAM, date,
    start: '13:10', end: '14:25', room: 'Room 4304', note: noteP6,
  });
  // No Camerata P7 — delete if we added it. Wind P7 is normal Tuesday.
  await deleteEvent(`reh-${date}-${CAM}-1430`);
  await clearChangeStamp(`reh-${date}-${WIND}-1430`);
}

async function applyWednesday() {
  const date = '2026-08-19';
  const noteP7 = 'Opening week — Camerata + Wind Ensemble double block';
  console.log(`\n=== ${date} Wed: double block Cam+Wind ===`);
  const day = await eventsOn(date);
  for (const e of day) {
    if (e.type !== 'Rehearsal') continue;
    const ens = (e.ensembleIds || [])[0];
    if (!ens || ens === CHOIR || ens === WIND || ens === CAM) continue;
    if (e.startTime === '14:30') await cancelEvent(e, noteP7);
  }
  await clearChangeStamp(`reh-${date}-${WIND}-1310`);
  await clearChangeStamp(`reh-${date}-${CAM}-1310`);
  await upsertRehearsal({
    id: `reh-${date}-${WIND}-1430`, ensId: WIND, date,
    start: '14:30', end: '15:45', room: 'Room 4302', note: noteP7,
  });
  await upsertRehearsal({
    id: `reh-${date}-${CAM}-1430`, ensId: CAM, date,
    start: '14:30', end: '15:45', room: 'Room 4304', note: noteP7,
  });
}

await applyThursday();
await applyFriday();
await applyMonday();
await applyTuesday();
await applyWednesday();
console.log(JSON.stringify({ ok: true }));
