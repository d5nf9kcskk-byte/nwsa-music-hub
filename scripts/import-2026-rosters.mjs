#!/usr/bin/env node
/**
 * import-2026-rosters.mjs
 *
 * One-shot 2026–27 roster load from the private Excel exports (parsed to JSON
 * outside the repo — never commit student PII).
 *
 *   python3 … > /tmp/nwsa-roster-2026-27.json   # see script header in chat / CURRENT
 *   FIREBASE_SERVICE_ACCOUNT_JSON=… node scripts/import-2026-rosters.mjs /tmp/nwsa-roster-2026-27.json
 *   … --dry-run   # print plan only
 *
 * Ensemble rules (rotations later):
 *   Strings → Camerata + Philharmonic + Symphony
 *   Winds   → Wind Ensemble + Symphony + Philharmonic
 *   Sax     → Jazz (also, in addition to winds if dual)
 *   Perc    → Symphony + Wind Ensemble + Philharmonic
 *   Vocal   → High School Choir
 *   Theory  → Jazz Theory if in Jazz; else by grade (9 / 10 / Music History 11–12)
 *
 * Matching: staff-only `schoolId` field first, then name tokens
 * (order-independent). New docs get RANDOM Firestore IDs — never the school
 * Student ID (#privacy: doc IDs surface publicly via studentsPublic,
 * /student/<id> URLs, and feeds/student-<id>.ics; the school ID lives only in
 * the staff-only `schoolId` field / contacts).
 * Leavers (Active, not on the new list) → archive "Not on 2026-27 roster".
 * Graduated seniors are left alone. Contacts merge into `contacts`.
 */

import { readFileSync } from 'node:fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const rawSa = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!rawSa) {
  console.error('FIREBASE_SERVICE_ACCOUNT_JSON is not set — aborting.');
  process.exit(1);
}
const jsonPath = process.argv[2];
if (!jsonPath) {
  console.error('Usage: node scripts/import-2026-rosters.mjs <roster.json> [--dry-run]');
  process.exit(1);
}
const DRY = process.argv.includes('--dry-run');

if (getApps().length === 0) initializeApp({ credential: cert(JSON.parse(rawSa)) });
const db = getFirestore();

const PUBLIC_KEYS = ['name', 'preferredName', 'instrument', 'section', 'ensembleIds', 'status', 'grade'];
function projectStudent(data) {
  const out = {};
  for (const k of PUBLIC_KEYS) if (data[k] !== undefined) out[k] = data[k];
  return out;
}

const ENS = {
  symphony: 'symphony-orchestra',
  wind: 'wind-ensemble',
  jazz: 'jazz-ensemble',
  camerata: 'camerata-string-orchestra',
  phil: 'philharmonic',
  choir: 'high-school-choir',
};

const STRING_RE = /\b(violin|viola|cello|bass|harp)\b/i;
const WIND_RE = /\b(flute|oboe|clarinet|bassoon|saxophone|sax|trumpet|horn|trombone|euphonium|tuba)\b/i;
const SAX_RE = /\b(saxophone|sax)\b/i;
const PERC_RE = /\bpercussion\b/i;

/** Split "Oboe/Saxophone" into parts for family checks. */
function instrumentParts(instrument) {
  return String(instrument ?? '').split('/').map(s => s.trim()).filter(Boolean);
}

export function ensembleIdsFor({ division, instrument }) {
  if (division === 'vocal') return [ENS.choir];
  const parts = instrumentParts(instrument);
  const ids = new Set();
  const hit = (re) => parts.some(p => re.test(p));
  if (hit(STRING_RE)) {
    ids.add(ENS.camerata); ids.add(ENS.phil); ids.add(ENS.symphony);
  }
  if (hit(WIND_RE)) {
    ids.add(ENS.wind); ids.add(ENS.symphony); ids.add(ENS.phil);
  }
  if (hit(SAX_RE)) ids.add(ENS.jazz);
  if (hit(PERC_RE)) {
    ids.add(ENS.symphony); ids.add(ENS.wind); ids.add(ENS.phil);
  }
  return [...ids];
}

function matchKey(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');
}

/** 7-digit school ID, or '' when the row has none (never pad an empty value —
 *  padding '' to '0000000' once collapsed ID-less students into one doc). */
function normalizeSchoolId(v) {
  const digits = String(v ?? '').replace(/\D/g, '');
  return digits ? digits.padStart(7, '0') : '';
}

function compact(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v != null && v !== ''));
}

function contactPayload(row) {
  const guardians = [];
  if (row.guardianName || row.guardianEmail || row.guardianPhone) {
    guardians.push(compact({
      name: row.guardianName,
      email: row.guardianEmail,
      phone: row.guardianPhone,
    }));
  }
  if (row.guardian2Name || row.guardian2Phone || row.contact2Email) {
    guardians.push(compact({
      name: row.guardian2Name,
      email: row.contact2Email,
      phone: row.guardian2Phone,
    }));
  }
  const g0 = guardians[0] ?? {};
  const extra = {};
  if (row.schoolId) extra['Student ID'] = row.schoolId;
  if (row.address) extra.Address = row.address;
  if (row.city) extra.City = row.city;
  if (row.state) extra.State = row.state;
  if (row.division) extra.Division = row.division;
  const data = {
    email: row.email || '',
    parentEmail: g0.email || '',
    phone: g0.phone || row.phone || '',
  };
  if (guardians.length) data.guardians = guardians;
  if (Object.keys(extra).length) data.extra = extra;
  return data;
}

const rows = JSON.parse(readFileSync(jsonPath, 'utf8'));
if (!Array.isArray(rows) || rows.length === 0) {
  console.error('Roster JSON is empty or not an array.');
  process.exit(1);
}

const planned = rows.map(row => ({
  row,
  ensembleIds: ensembleIdsFor(row),
  name: row.name,
  instrument: row.instrument || '',
  grade: row.grade || '',
  schoolId: normalizeSchoolId(row.schoolId),
}));

// Self-check a few known rules before touching Firestore.
{
  const sax = ensembleIdsFor({ division: 'instrumental', instrument: 'Saxophone' });
  if (!sax.includes(ENS.jazz) || !sax.includes(ENS.wind)) throw new Error('sax rule broken');
  const vn = ensembleIdsFor({ division: 'instrumental', instrument: 'Violin' });
  if (!vn.includes(ENS.camerata) || vn.includes(ENS.jazz)) throw new Error('violin rule broken');
  const perc = ensembleIdsFor({ division: 'instrumental', instrument: 'Percussion' });
  if (!perc.includes(ENS.wind) || !perc.includes(ENS.symphony)) throw new Error('perc rule broken');
  const voice = ensembleIdsFor({ division: 'vocal', instrument: 'Voice' });
  if (voice.join() !== ENS.choir) throw new Error('vocal rule broken');
}

async function sleep(ms) {
  await new Promise(r => setTimeout(r, ms));
}

async function withQuotaRetry(label, fn) {
  for (let attempt = 1; attempt <= 30; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const exhausted = e?.code === 8 || /RESOURCE_EXHAUSTED|Quota exceeded/i.test(String(e?.message ?? e));
      if (!exhausted || attempt === 30) throw e;
      const wait = Math.min(60_000, 2000 * attempt);
      console.warn(`${label}: quota hit (attempt ${attempt}), waiting ${wait}ms`);
      await sleep(wait);
    }
  }
}

async function loadStudents() {
  // Paginate slowly — free-tier quota was exhausted during prep.
  const out = [];
  let last = null;
  for (;;) {
    const snap = await withQuotaRetry('students page', async () => {
      let q = db.collection('students').orderBy('name').limit(40);
      if (last) q = q.startAfter(last);
      return q.get();
    });
    if (snap.empty) break;
    for (const d of snap.docs) out.push({ id: d.id, ...d.data() });
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < 40) break;
    await sleep(1500);
  }
  return out;
}

const existing = await loadStudents();
const byKey = new Map();
const bySchoolId = new Map();
for (const s of existing) {
  if ((s.status ?? 'Active') !== 'Active') continue; // don't revive Graduated/Inactive via name match
  const k = matchKey(s.name);
  if (!byKey.has(k)) byKey.set(k, []);
  byKey.get(k).push(s);
  if (s.schoolId) bySchoolId.set(s.schoolId, s);
}

const creates = [];
const updates = [];
const ambiguous = [];
const matchedIds = new Set();

for (const p of planned) {
  // schoolId is authoritative (survives name changes); fall back to name.
  const byId = p.schoolId ? bySchoolId.get(p.schoolId) : undefined;
  if (byId) {
    matchedIds.add(byId.id);
    updates.push({ id: byId.id, prev: byId, next: p });
    continue;
  }
  const matches = byKey.get(matchKey(p.name)) ?? [];
  if (matches.length > 1) { ambiguous.push(p); continue; }
  if (matches.length === 1) {
    const s = matches[0];
    matchedIds.add(s.id);
    updates.push({ id: s.id, prev: s, next: p });
    continue;
  }
  creates.push(p);
}

const leavers = existing.filter(s => (s.status ?? 'Active') === 'Active' && !matchedIds.has(s.id)
  && !creates.some(c => c.schoolId && (c.schoolId === s.schoolId || c.schoolId === s.id)));

console.log(JSON.stringify({
  dryRun: DRY,
  incoming: planned.length,
  creates: creates.length,
  updates: updates.length,
  ambiguous: ambiguous.map(a => a.name),
  leaversToArchive: leavers.length,
  leaverNames: leavers.slice(0, 20).map(s => s.name),
}, null, 2));

if (DRY) process.exit(0);
if (ambiguous.length) {
  console.error('Ambiguous name matches — fix by hand before importing.');
  process.exit(1);
}

const now = Date.now();
const writer = db.bulkWriter();
writer.onWriteError(err => {
  if (err.failedAttempts < 5) return true;
  console.error('write failed', err.documentRef?.path, err.message);
  return false;
});

for (const p of creates) {
  // Random ID always (#privacy) — the school ID is a staff-only FIELD.
  const id = db.collection('students').doc().id;
  const data = {
    name: p.name,
    instrument: p.instrument,
    grade: p.grade,
    ensembleIds: p.ensembleIds,
    status: 'Active',
    updatedAt: now,
    updatedBy: 'import-2026-rosters',
  };
  if (p.schoolId) data.schoolId = p.schoolId;
  writer.set(db.collection('students').doc(id), data);
  writer.set(db.collection('studentsPublic').doc(id), projectStudent(data));
  writer.set(db.collection('contacts').doc(id), contactPayload(p.row), { merge: true });
}

for (const { id, prev, next } of updates) {
  const data = {
    name: next.name,
    instrument: next.instrument,
    grade: next.grade,
    ensembleIds: next.ensembleIds,
    status: 'Active',
    updatedAt: now,
    updatedBy: 'import-2026-rosters',
  };
  if (next.schoolId) data.schoolId = next.schoolId;
  writer.set(db.collection('students').doc(id), data, { merge: true });
  // Project the MERGED doc, not just the imported fields — a bare
  // projectStudent(data) once wiped section/preferredName off the mirror.
  writer.set(db.collection('studentsPublic').doc(id), projectStudent({ ...prev, ...data }));
  writer.set(db.collection('contacts').doc(id), contactPayload(next.row), { merge: true });
}

for (const s of leavers) {
  const patch = {
    status: 'Inactive',
    archivedAt: now,
    archivedLabel: 'Not on 2026-27 roster',
    updatedAt: now,
    updatedBy: 'import-2026-rosters',
  };
  writer.set(db.collection('students').doc(s.id), patch, { merge: true });
  writer.set(db.collection('studentsPublic').doc(s.id), projectStudent({ ...s, ...patch }));
}

await writer.close();
console.log(JSON.stringify({
  ok: true,
  created: creates.length,
  updated: updates.length,
  archivedLeavers: leavers.length,
}, null, 2));
