#!/usr/bin/env node
/**
 * seed-masterclass.mjs
 *
 * String Masterclass meets as FOUR simultaneous sections in four rooms, so it
 * needs four rosters and four attendance sheets — one per section. This script:
 *
 *   1. creates/updates the four masterclass groups (kind: masterclass);
 *   2. adds each string player to their section by instrument
 *      (Violin / Viola / Cello / Bass — nobody else);
 *   3. replaces each generic "String Masterclass" Class event with four
 *      section events at the same date/time, each in its own room.
 *
 * One event per section rather than one shared event: a CalendarEvent carries a
 * single `location`, so a shared event would show three of the four sections the
 * wrong room. Roll is per-ensemble either way (`rollTaken` is keyed by ensemble).
 *
 * Deterministic doc ids, so re-running converges instead of duplicating.
 *
 *   FIREBASE_SERVICE_ACCOUNT_JSON=… node scripts/seed-masterclass.mjs
 *   … --dry-run
 */
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { MASTERCLASS_SECTIONS } from '../src/director/masterclassSections.ts';

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!raw) { console.error('FIREBASE_SERVICE_ACCOUNT_JSON is not set — aborting.'); process.exit(1); }
const DRY = process.argv.includes('--dry-run');
if (getApps().length === 0) initializeApp({ credential: cert(JSON.parse(raw)) });
const db = getFirestore();

const PUBLIC_KEYS = ['name', 'preferredName', 'instrument', 'section', 'ensembleIds', 'status', 'grade'];
const project = d => Object.fromEntries(PUBLIC_KEYS.filter(k => d[k] !== undefined).map(k => [k, d[k]]));

const ops = [];
let ensCount = 0, stuCount = 0, evCreate = 0, evDelete = 0;

// ── 1. Class groups (masterclass kind — not performing ensembles) ───────
for (const s of MASTERCLASS_SECTIONS) {
  ensCount++;
  const doc = {
    kind: 'masterclass',
    name: s.name, order: s.order, defaultLocation: s.room,
    defaultStartTime: s.start, defaultEndTime: s.end,
    meetingDays: s.days,
    ...(s.conductorName ? { conductorName: s.conductorName } : {}),
  };
  console.log(`  class       ${s.id.padEnd(20)} ${s.name.padEnd(20)} room ${s.room}` +
    (s.conductorName ? ` · ${s.conductorName}` : ' · (no conductor name set)'));
  ops.push(b => b.set(db.collection('ensembles').doc(s.id), doc, { merge: true }));
}

// ── 2. Rosters, by instrument ─────────────────────────────────────────
const students = await db.collection('students').get();
const bySection = Object.fromEntries(MASTERCLASS_SECTIONS.map(s => [s.id, []]));
for (const d of students.docs) {
  const data = d.data();
  if (data.status !== 'Active') continue;
  const sec = MASTERCLASS_SECTIONS.find(s => s.instrument === data.instrument);
  if (!sec) continue;
  bySection[sec.id].push(data.name);
  const have = data.ensembleIds ?? [];
  if (have.includes(sec.id)) continue;
  stuCount++;
  const next = [...have, sec.id];
  ops.push(b => {
    b.update(d.ref, { ensembleIds: next, updatedAt: Date.now(), updatedBy: 'masterclass seed' });
    b.set(db.collection('studentsPublic').doc(d.id), project({ ...data, ensembleIds: next }), { merge: true });
  });
}
for (const s of MASTERCLASS_SECTIONS) console.log(`  roster      ${s.name.padEnd(20)} ${bySection[s.id].length} student(s)`);

// ── 3. Events: one per section per date, replacing the generic one ────
const events = await db.collection('events').get();
const generic = events.docs.filter(d => /^String Masterclass$/i.test(d.data().title ?? ''));
console.log(`  found ${generic.length} generic "String Masterclass" event(s) to replace`);

for (const g of generic) {
  const e = g.data();
  const hhmm = (e.startTime ?? '14:30').replace(':', '');
  for (const s of MASTERCLASS_SECTIONS) {
    evCreate++;
    const id = `class-${e.date}-${s.id}-${hhmm}`;
    ops.push(b => b.set(db.collection('events').doc(id), {
      type: 'Class', title: s.name, ensembleIds: [s.id],
      date: e.date, startTime: e.startTime ?? s.start, endTime: e.endTime ?? s.end,
      location: s.room, status: e.status ?? 'Scheduled',
      ...(e.notes ? { notes: e.notes } : {}),
    }, { merge: true }));
  }
  evDelete++;
  ops.push(b => b.delete(g.ref));
}

console.log(`\n${ensCount} class group(s), ${stuCount} student roster add(s), ` +
  `${evCreate} event(s) created, ${evDelete} generic event(s) deleted.`);
if (DRY) { console.log('--dry-run: nothing written.'); process.exit(0); }

for (let i = 0; i < ops.length; i += 200) {
  const batch = db.batch();
  for (const op of ops.slice(i, i + 200)) op(batch);
  await batch.commit();
}
console.log('Applied.');
