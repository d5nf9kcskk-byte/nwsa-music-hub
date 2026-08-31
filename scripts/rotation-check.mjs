#!/usr/bin/env node
/**
 * rotation-check.mjs
 *
 * Answers ONE question, from outside the app, with no credentials:
 *
 *   "On <date>, which ensemble does each rotating student actually land in?"
 *
 * It resolves against the LIVE public projections using the SAME
 * src/director/rosterResolver.ts the Schedule screen, Take Roll, and the
 * public site use — so its answer is what a CURRENT client will render. If
 * this script and the app disagree, the app is the thing that is wrong
 * (stale bundle, stale offline cache, or a `students` / `rosterOverrides`
 * doc that never reached its public mirror), not the rotation plan.
 *
 * That distinction is the whole point. `scripts/rotation-weekday.selfcheck.mjs`
 * proves the LOGIC is right against fixtures; this proves the DATA currently
 * in Firestore resolves the way the director expects on a real school day.
 *
 *   node scripts/rotation-check.mjs                 # today
 *   node scripts/rotation-check.mjs 2026-08-21      # a specific date
 *   node scripts/rotation-check.mjs --week          # today's Mon–Fri
 *   node scripts/rotation-check.mjs --student uriel # just one student
 *
 * #privacy: reads `studentsPublic`, `rosterOverridesPublic`, `events` and
 * `ensembles` ONLY — the same four collections generate-feeds.mjs reads, all
 * world-readable by rule. Never add `students` or `rosterOverrides` here.
 *
 * Env: VITE_FIREBASE_PROJECT_ID (defaults to nwsa-hub, the NWSA project).
 */
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';

// The app's TS sources import relative modules without a file extension (vite
// resolves them); Node's ESM resolver does not. Same shim as the self-check.
registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith('.') && !/\.[cm]?[jt]s$/.test(spec)) {
      for (const suffix of ['.ts', '/index.ts']) {
        try { return next(spec + suffix, ctx); } catch { /* try the next shape */ }
      }
    }
    return next(spec, ctx);
  },
});

// rosterResolver → utils → i18n → src/org, which reads the build-time
// __ORG_CONFIG__ global. Mirror what vite's `define` injects.
const ORG_ID = process.env.ORG || process.env.VITE_ORG || 'nwsa';
globalThis.__ORG_CONFIG__ = JSON.parse(
  readFileSync(new URL(`../config/orgs/${ORG_ID}.json`, import.meta.url), 'utf8'));

const { resolveRoster } = await import('../src/director/rosterResolver.ts');
const { takesAttendance } = await import('../src/director/utils.ts');
const { isSharedBlock, sharedBlockLabel } = await import('../src/shared/sharedBlock.ts');

const PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID || 'nwsa-hub';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// ── args ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const WEEK = args.includes('--week');
const studentFlag = args.indexOf('--student');
const STUDENT_Q = studentFlag >= 0 ? (args[studentFlag + 1] ?? '').toLowerCase() : null;
const dateArg = args.find(a => /^\d{4}-\d{2}-\d{2}$/.test(a));

const DN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const dow = d => new Date(`${d}T00:00:00Z`).getUTCDay();
const shift = (d, n) => {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};

const anchor = dateArg ?? localToday();
const DATES = WEEK
  ? [1, 2, 3, 4, 5].map(target => shift(anchor, target - (dow(anchor) || 7)))
  : [anchor];

// ── Firestore REST (unauthenticated, public collections only) ─────────
function decode(v) {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(decode);
  if ('mapValue' in v) return flatten(v.mapValue.fields);
  return undefined;
}
function flatten(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields ?? {})) out[k] = decode(v);
  return out;
}
async function fetchCollection(name) {
  const docs = [];
  let token = null;
  do {
    const res = await fetch(`${BASE}/${name}?pageSize=300${token ? `&pageToken=${token}` : ''}`);
    if (!res.ok) { console.error(`Firestore ${name}: HTTP ${res.status}`); process.exit(1); }
    const json = await res.json();
    for (const d of json.documents ?? []) docs.push({ id: d.name.split('/').pop(), ...flatten(d.fields ?? {}) });
    token = json.nextPageToken ?? null;
  } while (token);
  return docs;
}

const [students, overrides, events, ensembles] = await Promise.all([
  fetchCollection('studentsPublic'),
  fetchCollection('rosterOverridesPublic'),
  fetchCollection('events'),
  fetchCollection('ensembles'),
]);
const eventsById = Object.fromEntries(events.map(e => [e.id, e]));
const ensName = Object.fromEntries(ensembles.map(e => [e.id, e.name]));
const studentById = Object.fromEntries(students.map(s => [s.id, s]));

// Everyone the rotation plan actually moves — a student with no rotation doc
// has nothing to get wrong, so listing them would bury the ones that do.
const allRotators = [...new Set(overrides.filter(o => o.kind === 'rotation').map(o => o.studentId))]
  .map(id => studentById[id])
  .filter(Boolean)
  .filter(s => !STUDENT_Q || s.name.toLowerCase().includes(STUDENT_Q))
  .sort((a, b) => a.name.localeCompare(b.name));

// An archived (non-Active) student is skipped by every roster resolve, so
// their leftover rotation docs are inert — landing "in NOTHING" is by
// design, not a broken plan. Note them once instead of flagging every day.
const rotators = allRotators.filter(s => s.status === 'Active');
const archived = allRotators.filter(s => s.status !== 'Active');
for (const s of archived) {
  console.log(`note: ${s.name} is archived (${s.status}) but still has rotation docs — inert; delete via the Rotations page if unwanted.`);
}
if (archived.length) console.log('');

if (rotators.length === 0) {
  console.log(STUDENT_Q
    ? `No active student on a standing rotation matches "${STUDENT_Q}".`
    : archived.length
      ? 'Only archived students have rotation docs — nobody active is on a standing rotation.'
      : 'No kind:"rotation" overrides exist — nobody is on a standing rotation.');
  process.exit(0);
}

console.log(`Project ${PROJECT_ID} · ${rotators.length} student(s) on a standing rotation\n`);

let problems = 0;

for (const date of DATES) {
  // Roll-taking events only: a rotation describes a rehearsal block, so a
  // concert is deliberately NOT where a rotation applies (rosterResolver.ts).
  // A Cancelled block is not a place a student can be (the app never resolves
  // rosters for one — lessonConflicts.ts) and schedule changes keep the
  // cancelled doc as the receipt beside its replacement (opening week, swaps),
  // so counting it would flag every changed day as a phantom double-booking.
  const dayEvents = events
    .filter(e => e.date === date && e.status !== 'Cancelled'
      && takesAttendance(e.type) && (e.ensembleIds ?? []).length > 0)
    .sort((a, b) => (a.startTime ?? '99').localeCompare(b.startTime ?? '99'));

  console.log(`── ${DN[dow(date)]} ${date} ${'─'.repeat(46)}`);
  if (dayEvents.length === 0) { console.log('   no roll-taking ensemble events\n'); continue; }

  // ensembleId → resolved roster, computed once per (event, ensemble) pair.
  const rosters = dayEvents.flatMap(e => (e.ensembleIds ?? []).map(ensembleId => ({
    event: e,
    ensembleId,
    ids: new Set(resolveRoster(students, overrides, { ensembleId, date, eventId: e.id, eventsById })
      .map(r => r.student.id)),
  })));

  for (const s of rotators) {
    const hits = rosters.filter(r => r.ids.has(s.id));
    // Blocks this student COULD have been in today: any ensemble they rotate
    // through that meets today. Landing in none of them is the failure the
    // director sees as "the app doesn't show them anywhere".
    const rotatesThrough = new Set([
      ...(s.ensembleIds ?? []),
      ...overrides.filter(o => o.studentId === s.id).map(o => o.ensembleId),
    ]);
    const couldHave = rosters.filter(r => rotatesThrough.has(r.ensembleId));

    const label = s.name.padEnd(28);
    if (hits.length === 0) {
      console.log(`   ${label} ⚠ in NOTHING today` +
        (couldHave.length ? ` (${couldHave.length} block(s) they rotate through do meet)` : ''));
      if (couldHave.length) problems++;
      continue;
    }

    // Two rosters at the same time is the other half of a broken rotation: the
    // student is told to be in two rooms at once. Two rosters on the SAME event
    // is not that — one event has one location, so those ensembles are in one
    // room together. Collapse per event first, then judge the slot.
    const bySlot = {};
    for (const h of hits) {
      const slot = (bySlot[`${h.event.startTime}-${h.event.endTime}`] ??= new Map());
      const entry = slot.get(h.event.id) ?? { event: h.event, ensembleIds: [] };
      entry.ensembleIds.push(h.ensembleId);
      slot.set(h.event.id, entry);
    }
    const parts = [];
    for (const [slot, byEvent] of Object.entries(bySlot).sort()) {
      const entries = [...byEvent.values()];
      const describe = e => {
        const names = e.ensembleIds.map(id => ensName[id] ?? id);
        const room = e.event.location || 'room ?';
        // An event carrying several ensembles without the flag is ambiguous,
        // not wrong — one location says they are together, but nobody SAID so.
        // Name it rather than silently accepting or rejecting it.
        if (e.ensembleIds.length > 1 && !isSharedBlock(e.event)) {
          return `${sharedBlockLabel(names)} (${room}) — untagged shared block?`;
        }
        return e.ensembleIds.length > 1
          ? `${sharedBlockLabel(names)} together (${room})`
          : `${names[0]} (${room})`;
      };
      // Only DIFFERENT events at the same time are a real clash.
      const clash = entries.length > 1;
      if (clash) problems++;
      parts.push(`${slot} ${clash ? '⚠ BOTH ' : ''}${entries.map(describe).join(' + ')}`);
    }
    console.log(`   ${label} ${parts.join('   ·   ')}`);
  }
  console.log('');
}

if (problems) {
  console.log(`${problems} problem(s) above: a student with no block, or two at the same time.`);
  console.log('Fix the plan and re-run scripts/apply-rotations.mjs — the app reads this same data.');
  process.exit(1);
}
console.log('Every rotating student lands in exactly one ensemble per meeting block.');
console.log('If the app shows otherwise, the app is out of date — see "App version" in the director menu.');
