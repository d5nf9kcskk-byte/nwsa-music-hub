#!/usr/bin/env node
/**
 * Self-check for the Combine flow (#schedule-ux-redesign Phase 2) —
 * src/director/schedule/changePlan.ts.
 *
 * Two promises are being protected.
 *
 * 1. THE ROUND TRIP. Combine absorbs a block (deletes its event) and a revert
 *    must put everything back EXACTLY: the host's membership, time, room, and
 *    the absorbed event re-created byte-for-byte under its ORIGINAL doc id —
 *    ICS UIDs derive from doc ids, a frozen subscription contract. Students'
 *    resolved schedules (the same resolveRoster/studentExpectation the app
 *    and rotation-check.mjs use) must land exactly where they started.
 *
 * 2. OLD SNAPSHOTS STAY DUMB. A changeFrom captured by a plain time/room
 *    change never recorded ensembleIds; revert must not touch membership or
 *    sharedBlock for those, and with no snapshot at all it must not touch
 *    time/room (the live values are the only record).
 *
 * Run: node scripts/schedule-combine.selfcheck.mjs
 */
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';

// rosterResolver imports relative modules without extensions (vite resolves
// them); Node's ESM resolver does not. Same shim as rotation-check.mjs.
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

// rosterResolver → utils → i18n → src/org reads the build-time __ORG_CONFIG__.
globalThis.__ORG_CONFIG__ = JSON.parse(
  readFileSync(new URL('../config/orgs/nwsa.json', import.meta.url), 'utf8'));

const { snapshot, combineSnapshot, revertPlan } = await import('../src/director/schedule/changePlan.ts');
const { resolveRoster, studentExpectation } = await import('../src/director/rosterResolver.ts');

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failures++; }
}
const sortKeys = v =>
  Array.isArray(v) ? v.map(sortKeys)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sortKeys(v[k])]))
  : v;
const canon = v => JSON.stringify(sortKeys(v));
function eqDeep(actual, expected, msg) {
  if (canon(actual) !== canon(expected)) {
    console.error(`FAIL: ${msg}\n   expected: ${canon(expected)}\n   actual:   ${canon(actual)}`);
    failures++;
  }
}

/** Mirror of how useEvents.revertEvent applies a plan: undefined = delete. */
function applyFields(e, fields) {
  const out = { ...e };
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) delete out[k];
    else out[k] = v;
  }
  return out;
}

// ── fixtures (fictional — never real students) ────────────────────────
const D = '2026-08-25';
const we = { id: 'evt-we', type: 'Rehearsal', ensembleIds: ['we'], date: D, startTime: '14:00', endTime: '15:20', location: 'Band Room', status: 'Scheduled' };
const so = { id: 'evt-so', type: 'Rehearsal', ensembleIds: ['so'], date: D, startTime: '15:30', endTime: '16:50', location: 'Orchestra Room', status: 'Scheduled', rollTaken: { so: { at: 1, absent: 0 } } };
const students = [
  { id: 's-flute', name: 'Flute Only', status: 'Active', ensembleIds: ['we'] },
  { id: 's-cello', name: 'Cello Only', status: 'Active', ensembleIds: ['so'] },
  { id: 's-both', name: 'Doubles Both', status: 'Active', ensembleIds: ['we', 'so'] },
];
const overrides = [];

// ── combineSnapshot: fresh host ───────────────────────────────────────
const cf1 = combineSnapshot(we, [so]);
eqDeep(cf1.ensembleIds, ['we'], 'fresh combine captures the host’s pre-combine membership');
assert(!('sharedBlock' in cf1), 'host without a sharedBlock flag captures no sharedBlock key (revert deletes it)');
eqDeep(cf1.absorbed, [so], 'absorbed events are stored whole, doc id included');
eqDeep({ status: cf1.status, startTime: cf1.startTime, endTime: cf1.endTime, location: cf1.location },
  { status: 'Scheduled', startTime: '14:00', endTime: '15:20', location: 'Band Room' },
  'fresh combine also snapshots the host schedule');

// ── combineSnapshot: host already changed earlier that day ────────────
const weMoved = { ...we, startTime: '15:30', endTime: '16:50', changeNote: 'moved', changeFrom: snapshot(we) };
const cf2 = combineSnapshot(weMoved, [so]);
assert(cf2.startTime === '14:00', 'a prior change’s ORIGINAL time survives the combine snapshot');
eqDeep(cf2.ensembleIds, ['we'], 'membership added to an existing snapshot without disturbing it');

// ── combineSnapshot: second combine appends ───────────────────────────
const jz = { id: 'evt-jz', type: 'Rehearsal', ensembleIds: ['jz'], date: D, startTime: '14:00', endTime: '15:20', location: 'Room 4302', status: 'Scheduled' };
const hostAfterFirst = { ...we, ensembleIds: ['we', 'so'], sharedBlock: true, location: 'Auditorium', changeNote: 'combined', changeFrom: cf1 };
const cf3 = combineSnapshot(hostAfterFirst, [jz]);
eqDeep(cf3.ensembleIds, ['we'], 'second combine keeps the ORIGINAL membership, not the first combine’s union');
eqDeep(cf3.absorbed.map(e => e.id), ['evt-so', 'evt-jz'], 'second combine appends its absorbed event');

// ── the round trip ────────────────────────────────────────────────────
// The exact write applyCombine performs: union + sharedBlock + chosen
// time/room + note + snapshot, absorbed event deleted.
const host = {
  ...we,
  ensembleIds: ['we', 'so'],
  sharedBlock: true,
  location: 'Auditorium',
  changeNote: 'Combined rehearsal — Wind Ensemble + Symphony Orchestra, 2:00 PM in Auditorium',
  changeFrom: combineSnapshot(we, [so]),
};

// During the combine: every student lands in ONE room, nobody is dropped.
const byIdCombined = { [host.id]: host };
for (const s of students) {
  const exp = studentExpectation(s.id, host, students, overrides, byIdCombined);
  assert(exp.expected, `${s.name} is expected at the combined block`);
}
eqDeep(
  studentExpectation('s-cello', host, students, overrides, byIdCombined).ensembleIds,
  ['so'],
  'the absorbed ensemble’s player attends the combined block VIA their own ensemble (roll stays per ensemble)');

// Revert: absorbed re-created under original ids, host restored exactly.
const plan = revertPlan(host);
const restored = [applyFields(host, plan.fields), ...plan.recreate.map(r => ({ id: r.id, ...r.data }))];
eqDeep(restored.find(e => e.id === 'evt-we'), we, 'revert restores the host byte-for-byte');
eqDeep(restored.find(e => e.id === 'evt-so'), so, 'revert re-creates the absorbed event byte-for-byte, SAME doc id (ICS UID contract)');

// Students' resolved schedules land exactly where they started.
const byIdBefore = { [we.id]: we, [so.id]: so };
const byIdAfter = Object.fromEntries(restored.map(e => [e.id, e]));
for (const ev of [we, so]) {
  for (const ensId of ev.ensembleIds) {
    const before = resolveRoster(students, overrides, { ensembleId: ensId, eventId: ev.id, eventsById: byIdBefore });
    const after = resolveRoster(students, overrides, { ensembleId: ensId, eventId: ev.id, eventsById: byIdAfter });
    eqDeep(after.map(r => r.student.id), before.map(r => r.student.id),
      `roster of ${ensId} on ${ev.id} is identical after combine + revert`);
  }
}
for (const s of students) {
  const before = [we, so].filter(ev => studentExpectation(s.id, ev, students, overrides, byIdBefore).expected).map(ev => ev.id);
  const after = restored.filter(ev => studentExpectation(s.id, ev, students, overrides, byIdAfter).expected).map(ev => ev.id);
  eqDeep(after, before, `${s.name}’s expected events are identical after combine + revert`);
}

// ── old snapshots stay dumb ───────────────────────────────────────────
const legacyChanged = { ...we, startTime: '15:00', changeNote: 'moved', changeFrom: snapshot(we) };
const legacyPlan = revertPlan(legacyChanged);
assert(!('ensembleIds' in legacyPlan.fields), 'a plain time-change revert never touches membership');
assert(!('sharedBlock' in legacyPlan.fields), 'a plain time-change revert never touches sharedBlock');
eqDeep(legacyPlan.recreate, [], 'a plain time-change revert re-creates nothing');

const noSnapshot = revertPlan({ ...we, changeNote: 'hand-typed', changeFrom: undefined });
assert(!('startTime' in noSnapshot.fields), 'no snapshot → revert must NOT touch the time (live values are the only record)');
assert(noSnapshot.fields.status === 'Scheduled' && 'changeNote' in noSnapshot.fields,
  'no snapshot → revert still un-cancels and clears the markers');

// ──────────────────────────────────────────────────────────────────────
if (failures > 0) {
  console.error(`\nschedule-combine selfcheck: ${failures} failure(s)`);
  process.exit(1);
}
console.log('schedule-combine selfcheck: all checks passed');
