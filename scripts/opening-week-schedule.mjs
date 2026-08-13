#!/usr/bin/env node
/**
 * opening-week-schedule.mjs
 *
 * First-week schedule overrides (director-confirmed 2026-08-12):
 *
 *   Thu 2026-08-13 — Handbook reading, Room 4302, both blocks.
 *     Cancel every rehearsal/class with startTime in [11:00, 15:45).
 *     Add one all-music Event covering 13:10–15:45.
 *
 *   Fri 14 / Mon 17 / Tue 18 / Wed 19 — Camerata + Wind Ensemble both blocks
 *     (Jim out; no Jazz). Cancel other instrumental rehearsals those days;
 *     ensure Wind (4302) + Camerata (4304) exist for 13:10–14:25 and
 *     14:30–15:45. Leave choir + academic classes except Jazz Theory on Mon
 *     (room conflict with Camerata in 4304).
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

const ALL_MUSIC = [
  'symphony-orchestra', 'wind-ensemble', 'camerata-string-orchestra',
  'jazz-ensemble', 'chamber-winds', 'college-chamber-orchestra',
  'high-school-choir', 'opera-orchestra', 'philharmonic',
];

const WIND = 'wind-ensemble';
const CAM = 'camerata-string-orchestra';
const INSTRUMENTAL = new Set([
  'symphony-orchestra', 'wind-ensemble', 'camerata-string-orchestra',
  'jazz-ensemble', 'chamber-winds', 'college-chamber-orchestra',
  'opera-orchestra', 'philharmonic',
]);

const BY = 'opening-week-schedule';
const NOW = Date.now();

function snapshot(e) {
  const s = { status: e.status ?? 'Scheduled' };
  if (e.startTime !== undefined) s.startTime = e.startTime;
  if (e.endTime !== undefined) s.endTime = e.endTime;
  if (e.location !== undefined) s.location = e.location;
  return s;
}

function captureOriginal(e) {
  return e.changeFrom ? {} : { changeFrom: snapshot(e) };
}

async function eventsOn(date) {
  const snap = await db.collection('events').where('date', '==', date).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function cancelEvent(e, note) {
  if (e.status === 'Cancelled' && e.changeNote === note) {
    console.log(`  skip (already cancelled): ${e.id}`);
    return;
  }
  const patch = {
    status: 'Cancelled',
    changeNote: note,
    updatedAt: NOW,
    updatedBy: BY,
    ...captureOriginal(e),
  };
  await db.collection('events').doc(e.id).update(patch);
  console.log(`  cancel: ${e.id} (${e.title || e.type} ${e.startTime || ''})`);
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
    changeNote: note,
    updatedAt: NOW,
    updatedBy: BY,
  };
  if (!existing.exists) {
    await ref.set(base);
    console.log(`  add: ${id}`);
    return;
  }
  const e = existing.data();
  const patch = {
    ...base,
    ...captureOriginal({ id, ...e }),
  };
  // Don't wipe pieceIds / notes if somehow present
  await ref.set(patch, { merge: true });
  console.log(`  set: ${id}`);
}

/** Thu Aug 13 — handbook day */
async function applyThursday() {
  const date = '2026-08-13';
  const note = 'Handbook reading — all music students report to Room 4302 (both blocks)';
  console.log(`\n=== ${date} Handbook Reading ===`);
  const day = await eventsOn(date);
  for (const e of day) {
    if (e.id.startsWith('cal-')) continue; // school markers (First Day of School)
    if (e.id === 'evt-2026-08-13-handbook-reading') continue;
    const start = e.startTime;
    if (!start || start < '11:00' || start >= '15:45') continue;
    await cancelEvent(e, note);
  }

  const handbookId = 'evt-2026-08-13-handbook-reading';
  await db.collection('events').doc(handbookId).set({
    type: 'Event',
    title: 'Handbook Reading',
    ensembleIds: ALL_MUSIC,
    date,
    startTime: '13:10',
    endTime: '15:45',
    location: 'Room 4302',
    status: 'Scheduled',
    changeNote: 'First day of school — both blocks',
    notes: 'All music students report to Room 4302 for handbook reading. No regular rehearsals or classes 11:00–3:45.',
    updatedAt: NOW,
    updatedBy: BY,
  }, { merge: true });
  console.log(`  handbook event: ${handbookId}`);
}

/**
 * Ensure Wind + Camerata both blocks; cancel other instrumental rehearsals.
 * dates: Fri 14, Mon 17, Tue 18, Wed 19.
 */
async function applyCamWindDays() {
  const dates = ['2026-08-14', '2026-08-17', '2026-08-18', '2026-08-19'];
  const note = 'Opening week — Camerata + Wind Ensemble both blocks (no Jazz)';
  const blocks = [
    { start: '13:10', end: '14:25', slug: '1310' },
    { start: '14:30', end: '15:45', slug: '1430' },
  ];

  for (const date of dates) {
    console.log(`\n=== ${date} Camerata + Wind both blocks ===`);
    const day = await eventsOn(date);

    for (const e of day) {
      if (e.type !== 'Rehearsal') continue;
      const ens = (e.ensembleIds || [])[0];
      if (!ens || !INSTRUMENTAL.has(ens)) continue; // leave choir alone
      if (ens === WIND || ens === CAM) continue; // keep / reshape below
      await cancelEvent(e, note);
    }

    // Mon Jazz Theory shares 4304 with Camerata P7 — cancel that class only.
    if (date === '2026-08-17') {
      const jazzTheory = day.find(e => e.id.includes('jazz-theory'));
      if (jazzTheory) await cancelEvent(jazzTheory, note + ' — Room 4304 used by Camerata');
    }

    for (const b of blocks) {
      await upsertRehearsal({
        id: `reh-${date}-${WIND}-${b.slug}`,
        ensId: WIND,
        date,
        start: b.start,
        end: b.end,
        room: 'Room 4302',
        note,
      });
      await upsertRehearsal({
        id: `reh-${date}-${CAM}-${b.slug}`,
        ensId: CAM,
        date,
        start: b.start,
        end: b.end,
        room: 'Room 4304',
        note,
      });
    }
  }
}

await applyThursday();
await applyCamWindDays();
console.log(JSON.stringify({ ok: true }));
