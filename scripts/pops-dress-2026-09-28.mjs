#!/usr/bin/env node
/**
 * pops-dress-2026-09-28.mjs
 *
 * Mon Sept 28, 2026, the Pops concert day. The director's schedule
 * (2026-09-25):
 *
 *   1:10 – 2:25  Wind Ensemble + Symphony, on the Chapman stage
 *   2:25         College students released for class (Richard Fleischman
 *                asked that Music from 1900–1945 not be cancelled), back 3:45
 *   2:30 – 3:45  Choir + Wind Ensemble on stage; Symphony stays with
 *                Dr. Gilman in Chapman, off the stage
 *   3:45 – 5:30  Everyone together, released at 5:30
 *   6:30         Call time; the concert is 7:00
 *
 * What was live before this: ONE block, 1:10–5:30 in Chapman, carrying all
 * three ensembles (the choir's 2:25 block with the Wind Ensemble's 1:10 block
 * combined into it and Symphony added). That told every choir student to be
 * there at 1:10 and never showed Symphony leaving the stage at 2:30.
 *
 * What this writes, as the app's own change machinery would have written it,
 * so "Back to normal" still works:
 *
 *   A  reh-…-wind-ensemble-1310      re-created under its ORIGINAL doc id (ICS
 *      UIDs derive from doc ids), 1:10–2:25, WE + Symphony. Its changeFrom is
 *      the seeded Monday block (13:10–14:25, Room 4302, WE only), so a revert
 *      puts the normal Monday back.
 *   B  reh-…-high-school-choir-1430  the choir's own block, 2:30–3:45, Choir +
 *      WE. changeFrom keeps the choir's normal Monday (14:25–15:45, Room 4204)
 *      and DROPS `absorbed`: the WE block is its own doc again (A), and a
 *      revert that also re-created it from the stale absorbed copy would
 *      overwrite A's snapshot.
 *   C  reh-…-symphony-orchestra-1430 NEW, 2:30–3:45, Symphony off stage.
 *   D  reh-…-pops-combined-1545      NEW, 3:45–5:30, all three.
 *   oc26-hs-pops                     callTime 18:30.
 *
 * C and D are ADDED blocks (Symphony has no Monday rehearsal to change), so
 * "Back to normal" clears their change note and leaves them standing. Delete
 * them by hand if the day is ever put back.
 *
 * Nothing else on the date is touched: the classes the director already
 * cancelled stay cancelled, and Fleischman's class stays on.
 *
 * Guards: refuses after the date has passed, refuses if any block it touches
 * already has roll taken, and refuses if some OTHER live rehearsal for these
 * three ensembles has appeared on the date since this was written (a block
 * added by hand in the app would double-book students). Idempotent: a doc
 * already in its target state is skipped, so a re-run writes nothing.
 *
 * Preview needs no credentials (`events` is a world read):
 *   node scripts/pops-dress-2026-09-28.mjs --dry-run
 * Apply:
 *   FIREBASE_SERVICE_ACCOUNT_JSON=… node scripts/pops-dress-2026-09-28.mjs
 */

const DATE = '2026-09-28';
const BY = 'pops-dress-2026-09-28';
const CHAPMAN = 'Chapman Conference Center';
const SYM = 'symphony-orchestra';
const WE = 'wind-ensemble';
const CHOIR = 'high-school-choir';
const POPS = [SYM, WE, CHOIR];

const ID = {
  A: `reh-${DATE}-wind-ensemble-1310`,
  B: `reh-${DATE}-high-school-choir-1430`,
  C: `reh-${DATE}-symphony-orchestra-1430`,
  D: `reh-${DATE}-pops-combined-1545`,
  concert: 'oc26-hs-pops',
};

// Concert order. Hoe-Down is tagged Symphony only, so it stays off the
// Choir + WE block; everything else has a part for someone in every block.
const PIECES = [
  'rp26-star-spangled-banner', 'rp26-american-salute', 'rp26-hoe-down',
  'rp26-battle-hymn-wilhousky', 'rp26-1812-finale-modified', 'rp26-stars-and-stripes',
];
const PIECES_NO_HOEDOWN = PIECES.filter(p => p !== 'rp26-hoe-down');

const DAY = [
  'The whole day:',
  '1:10 to 2:25: Wind Ensemble + Symphony on the Chapman stage',
  '2:25: College students released for class',
  '2:30 to 3:45: Choir + Wind Ensemble on stage. Symphony stays with Dr. Gilman in Chapman',
  '3:45 to 5:30: Everyone on stage, college students back',
  '6:30: Call time',
  '7:00: Concert',
].join('\n');

const COLLEGE = 'College students: you are released at 2:25 so you can get to class. Be back in Chapman by 3:45 for the full rehearsal.';

const TARGET = {
  [ID.A]: {
    type: 'Rehearsal', date: DATE, status: 'Scheduled',
    startTime: '13:10', endTime: '14:25', location: CHAPMAN,
    ensembleIds: [WE, SYM], sharedBlock: true, pieceIds: PIECES,
    changeNote: 'Pops dress rehearsal: on stage in Chapman, 1:10 PM',
    notes: [
      'Attendance is 100% absolutely mandatory. Do not be late. We start at 1:10 on the dot.',
      `${COLLEGE} If this rehearsal means missing a class, tell that teacher ahead of time and make up the work before the rehearsal, not after.`,
      DAY,
    ].join('\n\n'),
    changeFrom: { status: 'Scheduled', startTime: '13:10', endTime: '14:25', location: 'Room 4302', ensembleIds: [WE] },
  },
  [ID.B]: {
    type: 'Rehearsal', date: DATE, status: 'Scheduled',
    startTime: '14:30', endTime: '15:45', location: CHAPMAN,
    ensembleIds: [CHOIR, WE], sharedBlock: true, pieceIds: PIECES_NO_HOEDOWN,
    changeNote: 'Pops dress rehearsal: on stage in Chapman, 2:30 PM',
    notes: [
      'Choir: this is your call. Be in Chapman and ready to sing at 2:30. Attendance is mandatory.',
      'Wind Ensemble: stay on stage from the first block.',
      COLLEGE,
      DAY,
    ].join('\n\n'),
    changeFrom: { status: 'Scheduled', startTime: '14:25', endTime: '15:45', location: 'Room 4204', ensembleIds: [CHOIR] },
  },
  [ID.C]: {
    type: 'Rehearsal', date: DATE, status: 'Scheduled',
    startTime: '14:30', endTime: '15:45', location: CHAPMAN,
    ensembleIds: [SYM], pieceIds: PIECES,
    changeNote: 'Pops dress rehearsal: with Dr. Gilman in Chapman, off stage',
    notes: [
      'Symphony stays with Dr. Gilman in Chapman while Choir and Wind Ensemble have the stage.',
      COLLEGE,
      DAY,
    ].join('\n\n'),
  },
  [ID.D]: {
    type: 'Rehearsal', date: DATE, status: 'Scheduled',
    startTime: '15:45', endTime: '17:30', location: CHAPMAN,
    ensembleIds: [SYM, WE, CHOIR], sharedBlock: true, pieceIds: PIECES,
    changeNote: 'Pops dress rehearsal: everyone on stage in Chapman until 5:30',
    notes: [
      'Everyone together on the Chapman stage. College students are back for this one. We release at 5:30, and call time for the concert is 6:30.',
      DAY,
    ].join('\n\n'),
  },
  [ID.concert]: { callTime: '18:30' },
};

const DRY = process.argv.includes('--dry-run');
const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!DRY && !raw) {
  console.error('FIREBASE_SERVICE_ACCOUNT_JSON is not set. Pass --dry-run to preview without it.');
  process.exit(1);
}

const todayNY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
if (todayNY > DATE) {
  console.error(`${DATE} has passed (today is ${todayNY}). A past day is a record, not a schedule. Aborting.`);
  process.exit(1);
}

// ── Read the day ─────────────────────────────────────────────────────
let db = null;
async function readDay() {
  if (raw) {
    const { initializeApp, cert, getApps } = await import('firebase-admin/app');
    const { getFirestore } = await import('firebase-admin/firestore');
    if (getApps().length === 0) initializeApp({ credential: cert(JSON.parse(raw)) });
    db = getFirestore();
    const snap = await db.collection('events').where('date', '==', DATE).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
  // Unauthenticated REST: `events` is `allow read` in firestore.rules.
  const project = process.env.VITE_FIREBASE_PROJECT_ID || 'nwsa-hub';
  const url = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents:runQuery`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: 'events' }],
      where: { fieldFilter: { field: { fieldPath: 'date' }, op: 'EQUAL', value: { stringValue: DATE } } },
    } }),
  });
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error(`Firestore read failed: ${JSON.stringify(rows)}`);
  const val = (v) => {
    if ('stringValue' in v) return v.stringValue;
    if ('booleanValue' in v) return v.booleanValue;
    if ('integerValue' in v) return Number(v.integerValue);
    if ('doubleValue' in v) return v.doubleValue;
    if ('nullValue' in v) return null;
    if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(val);
    if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, val(x)]));
    return undefined;
  };
  return rows.filter(r => r.document).map(r => ({
    id: r.document.name.split('/').pop(),
    ...Object.fromEntries(Object.entries(r.document.fields ?? {}).map(([k, v]) => [k, val(v)])),
  }));
}

const before = await readDay();
const byId = Object.fromEntries(before.map(e => [e.id, e]));

// ── Guards ───────────────────────────────────────────────────────────
const fail = (msg) => { console.error(`ABORT: ${msg}`); process.exit(1); };

if (!byId[ID.B]) fail(`${ID.B} (the choir's Monday block) is missing. The day has changed since this was written; look before writing.`);
if (!byId[ID.concert]) fail(`${ID.concert} (the Pops concert) is missing.`);
for (const id of [ID.A, ID.B, ID.C, ID.D]) {
  if (byId[id] && Object.keys(byId[id].rollTaken ?? {}).length > 0) fail(`${id} already has roll taken; rewriting it would orphan the receipt.`);
}
const ours = new Set(Object.values(ID));
const strays = before.filter(e => !ours.has(e.id)
  && e.type === 'Rehearsal' && e.status !== 'Cancelled'
  && (e.ensembleIds ?? []).some(x => POPS.includes(x)));
if (strays.length > 0) {
  fail(`another live rehearsal for these ensembles is on ${DATE}: ${strays.map(e => `${e.id} ${e.startTime}-${e.endTime}`).join(', ')}. Resolve it in the app first.`);
}

// ── Plan ─────────────────────────────────────────────────────────────
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const writes = [];
for (const [id, target] of Object.entries(TARGET)) {
  const live = byId[id];
  const changed = Object.keys(target).filter(k => !same(live?.[k], target[k]));
  if (live && changed.length === 0) { console.log(`  ok      ${id}`); continue; }
  writes.push({ id, create: !live, data: { ...target, updatedAt: Date.now(), updatedBy: BY } });
  console.log(`  ${live ? 'update' : 'create'}  ${id}${live ? `  (${changed.join(', ')})` : ''}`);
}

// ── The day after, and who is where ──────────────────────────────────
const after = before.map(e => ({ ...e }));
for (const w of writes) {
  const i = after.findIndex(e => e.id === w.id);
  if (i >= 0) after[i] = { ...after[i], ...w.data };
  else after.push({ id: w.id, ...w.data });
}
const t = (s) => { if (!s) return '?'; const [h, m] = s.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')}`; };
after.sort((a, b) => (a.startTime ?? '99').localeCompare(b.startTime ?? '99'));

console.log(`\n${DATE} after this runs (rehearsals and the concert):`);
for (const e of after.filter(e => e.type === 'Rehearsal' || e.type === 'Concert')) {
  const tag = e.status === 'Cancelled' ? ' [CANCELLED]' : '';
  const call = e.callTime ? `  call ${t(e.callTime)}` : '';
  console.log(`  ${t(e.startTime)}-${t(e.endTime)}  ${(e.title || (e.ensembleIds ?? []).join(' + '))}  @ ${e.location ?? ''}${call}${tag}`);
}

let overlap = false;
console.log('\nEach ensemble\'s day:');
for (const ens of POPS) {
  const mine = after.filter(e => e.type === 'Rehearsal' && e.status !== 'Cancelled' && (e.ensembleIds ?? []).includes(ens));
  console.log(`  ${ens}: ${mine.map(e => `${t(e.startTime)}-${t(e.endTime)}`).join(', ')}`);
  for (let i = 1; i < mine.length; i++) {
    if (mine[i].startTime < mine[i - 1].endTime) { overlap = true; console.error(`    OVERLAP: ${mine[i - 1].id} and ${mine[i].id}`); }
  }
}
if (overlap) fail('the result would book an ensemble into two blocks at once.');

if (writes.length === 0) { console.log('\nAlready applied. Nothing to write.'); process.exit(0); }
if (DRY) { console.log(`\nDry run: ${writes.length} write(s) planned, none made.`); process.exit(0); }

// One batch: the day is either the old shape or the new one, never half.
const batch = db.batch();
for (const w of writes) {
  const ref = db.collection('events').doc(w.id);
  if (w.create) batch.set(ref, w.data);
  else batch.update(ref, w.data);
}
await batch.commit();
console.log(`\nWrote ${writes.length} doc(s).`);
