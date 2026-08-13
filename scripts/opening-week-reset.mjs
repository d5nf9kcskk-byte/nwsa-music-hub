#!/usr/bin/env node
/**
 * opening-week-reset.mjs
 *
 * One-shot opening-week cleanup (2026-08):
 *   1. Archive active 12th-graders as Class of 2026 (status Graduated)
 *   2. Delete demo Hub events (Indoctrination + Hub Stuff)
 *   3. Wipe attendance, progressNotes, rosterOverrides (+ public mirrors)
 *   4. Clear demo rollTaken receipts on events
 *
 * Does NOT touch: repertoire, concerts, Oct 6 block swaps, All-State, or
 * any other seeded/official calendar content.
 *
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

const DELETE_EVENT_IDS = [
  'oo8c6wDKjiRziR3qytip', // Hub Indoctrination! in Zoom (2026-07-30)
  'Q2Oomeu04EcACRbOe3dZ', // Hub Stuff (2026-08-04)
];

const ARCHIVE_LABEL = 'Class of 2026';
const PUBLIC_STUDENT_KEYS = ['name', 'preferredName', 'instrument', 'section', 'ensembleIds', 'status', 'grade'];

function projectStudent(data) {
  const out = {};
  for (const k of PUBLIC_STUDENT_KEYS) if (data[k] !== undefined) out[k] = data[k];
  return out;
}

async function wipeCollection(name) {
  const snap = await db.collection(name).get();
  if (snap.empty) {
    console.log(`${name}: already empty`);
    return 0;
  }
  const writer = db.bulkWriter();
  for (const d of snap.docs) writer.delete(d.ref);
  await writer.close();
  console.log(`${name}: deleted ${snap.size}`);
  return snap.size;
}

async function archiveSeniors() {
  const snap = await db.collection('students').get();
  const seniors = snap.docs.filter(d => {
    const s = d.data();
    const status = s.status ?? 'Active';
    const grade = String(s.grade ?? '');
    return status === 'Active' && grade.startsWith('12');
  });
  if (seniors.length === 0) {
    console.log('seniors: none to archive');
    return 0;
  }
  const writer = db.bulkWriter();
  const archivedAt = Date.now();
  for (const d of seniors) {
    const patch = {
      status: 'Graduated',
      archivedAt,
      archivedLabel: ARCHIVE_LABEL,
      updatedAt: archivedAt,
      updatedBy: 'opening-week-reset',
    };
    writer.update(d.ref, patch);
    const merged = { ...d.data(), ...patch };
    writer.set(db.collection('studentsPublic').doc(d.id), projectStudent(merged));
  }
  await writer.close();
  console.log(`seniors: archived ${seniors.length} as "${ARCHIVE_LABEL}"`);
  for (const d of seniors) console.log(`  - ${d.data().name || d.id}`);
  return seniors.length;
}

async function deleteDemoEvents() {
  let n = 0;
  for (const id of DELETE_EVENT_IDS) {
    const ref = db.collection('events').doc(id);
    const doc = await ref.get();
    if (!doc.exists) {
      console.log(`events/${id}: already gone`);
      continue;
    }
    console.log(`events/${id}: deleting "${doc.data().title || id}"`);
    await ref.delete();
    n++;
  }
  return n;
}

async function clearRollTaken() {
  const all = await db.collection('events').get();
  const withRoll = all.docs.filter(d => d.data().rollTaken && Object.keys(d.data().rollTaken).length > 0);
  if (withRoll.length === 0) {
    console.log('rollTaken: none');
    return 0;
  }
  const writer = db.bulkWriter();
  for (const d of withRoll) {
    writer.update(d.ref, { rollTaken: FieldValue.delete() });
    console.log(`rollTaken cleared: ${d.id} (${d.data().date})`);
  }
  await writer.close();
  return withRoll.length;
}

const archived = await archiveSeniors();
const deleted = await deleteDemoEvents();
await wipeCollection('attendance');
await wipeCollection('progressNotes');
await wipeCollection('rosterOverrides');
await wipeCollection('rosterOverridesPublic');
const rolls = await clearRollTaken();

console.log(JSON.stringify({ ok: true, archived, deletedEvents: deleted, rollTakenCleared: rolls }));
