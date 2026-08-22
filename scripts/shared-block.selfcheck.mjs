#!/usr/bin/env node
/**
 * Self-check for shared (combined) blocks — `sharedBlock` on CalendarEvent and
 * src/shared/sharedBlock.ts.
 *
 * Two things are being protected here.
 *
 * 1. The MEANING. A combined block is one room; a student in two of its
 *    ensembles is one person in that room, listed once, and is not a
 *    double-booking. Get the predicate wrong and either a real clash goes
 *    unreported or every combined rehearsal screams about one.
 *
 * 2. The FROZEN ICS CONTRACT. src/shared/ics.ts is loaded directly by
 *    scripts/generate-feeds.mjs under Node's type-stripping loader, and its
 *    VEVENT shape is a live subscription contract. Adding the combined label
 *    must not disturb UID composition or line order for ANY event that is not
 *    a shared block — nobody's subscribed calendar may shift.
 *
 * Run: node scripts/shared-block.selfcheck.mjs
 */
import { readFileSync } from 'node:fs';

// Mirrors what vite's `define` injects; ics.ts itself needs no ORG, but keeping
// this here means the check still loads if ics.ts ever grows an ORG-aware line.
globalThis.__ORG_CONFIG__ = JSON.parse(
  readFileSync(new URL('../config/orgs/nwsa.json', import.meta.url), 'utf8'));

// Imported the SAME way generate-feeds.mjs imports them — plain node, explicit
// .ts, no resolver hook. If this import breaks, every ICS feed breaks with it.
const { isSharedBlock, sharedBlockLabel, mergeSharedRoster } =
  await import('../src/shared/sharedBlock.ts');
const { icsSummary, icsDescription, icsEvent } = await import('../src/shared/ics.ts');

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failures++; }
}
function eq(actual, expected, msg) {
  if (actual !== expected) {
    console.error(`FAIL: ${msg}\n   expected: ${JSON.stringify(expected)}\n   actual:   ${JSON.stringify(actual)}`);
    failures++;
  }
}

// ── isSharedBlock fails CLOSED ────────────────────────────────────────
assert(isSharedBlock({ sharedBlock: true, ensembleIds: ['a', 'b'] }), 'flag + two ensembles is shared');
assert(isSharedBlock({ sharedBlock: true, ensembleIds: ['a', 'b', 'c', 'd'] }), 'any number ≥ 2 is shared');
assert(!isSharedBlock({ sharedBlock: true, ensembleIds: ['a'] }),
  'a flag left behind after the second ensemble was removed is NOT a shared block');
assert(!isSharedBlock({ sharedBlock: true, ensembleIds: [] }), 'flag with no ensembles is not shared');
assert(!isSharedBlock({ sharedBlock: true }), 'flag with undefined ensembleIds is not shared');
assert(!isSharedBlock({ ensembleIds: ['a', 'b'] }),
  'two ensembles WITHOUT the flag stays ambiguous — a concert naming two groups is not a combined rehearsal');
assert(!isSharedBlock({ sharedBlock: false, ensembleIds: ['a', 'b'] }), 'explicit false is not shared');
// Only a real boolean true counts; a truthy stray must not turn a roster combined.
assert(!isSharedBlock({ sharedBlock: 'yes', ensembleIds: ['a', 'b'] }), 'non-boolean truthy is not shared');

// ── Label collapses instead of printing a paragraph ───────────────────
eq(sharedBlockLabel(['Wind Ensemble', 'Symphony Orchestra']),
  'Wind Ensemble + Symphony Orchestra', 'two names join with +');
eq(sharedBlockLabel(['A', 'B', 'C']), 'A + B + C', 'three names still fit');
eq(sharedBlockLabel(['A', 'B', 'C', 'D']), 'A + B + C + 1 more', 'four collapses');
eq(sharedBlockLabel(['A', 'B', 'C', 'D', 'E']), 'A + B + C + 2 more', 'five collapses');
eq(sharedBlockLabel(['A', 'B', 'C'], { total: 3 }), 'All ensembles', 'covering every ensemble says so');
eq(sharedBlockLabel(['A', 'B'], { total: 5 }), 'A + B', 'a partial block never claims "all"');
eq(sharedBlockLabel(['A', 'B', '', null].filter(Boolean)), 'A + B', 'blank names drop out');
eq(sharedBlockLabel([]), '', 'no names is empty, never "All ensembles"');
// A one-ensemble org must not have every rehearsal labelled "All ensembles".
eq(sharedBlockLabel(['Only'], { total: 1 }), 'Only', 'total < 2 never collapses to "All ensembles"');

// ── The combined roster is a union, deduped ───────────────────────────
const ada = { id: 's1', name: 'Testcase, Ada' };
const bram = { id: 's2', name: 'Example, Bram' };
const cleo = { id: 's3', name: 'Sample, Cleo' };
const merged = mergeSharedRoster([
  { ensembleId: 'we', students: [{ student: ada, isSub: false }, { student: bram, isSub: false }] },
  { ensembleId: 'so', students: [{ student: ada, isSub: false }, { student: cleo, isSub: false }] },
]);
eq(merged.length, 3, 'a doubling player is ONE person in the room');
eq(merged.find(r => r.student.id === 's1').ensembleIds.join(','), 'we,so', 'and remembers both ensembles');
eq(merged.find(r => r.student.id === 's2').ensembleIds.join(','), 'we', 'single-ensemble player keeps one');

// A sub in one ensemble but a full member of another is not a sub in that room.
const mixed = mergeSharedRoster([
  { ensembleId: 'we', students: [{ student: ada, isSub: true }] },
  { ensembleId: 'so', students: [{ student: ada, isSub: false }] },
]);
eq(mixed.length, 1, 'still one person');
assert(mixed[0].isSub === false, 'full membership anywhere in the room outranks a sub badge');
const bothSub = mergeSharedRoster([
  { ensembleId: 'we', students: [{ student: ada, isSub: true }] },
  { ensembleId: 'so', students: [{ student: ada, isSub: true }] },
]);
assert(bothSub[0].isSub === true, 'a sub in every ensemble present is still a sub');
// Same ensemble listed twice (a caller bug) must not duplicate the tag.
const dupEns = mergeSharedRoster([
  { ensembleId: 'we', students: [{ student: ada, isSub: false }] },
  { ensembleId: 'we', students: [{ student: ada, isSub: false }] },
]);
eq(dupEns[0].ensembleIds.join(','), 'we', 'a repeated ensembleId is recorded once');

// ── ICS: the combined label appears, and ONLY for shared blocks ───────
const lookups = {
  ensembleName: id => ({ we: 'Wind Ensemble', so: 'Symphony Orchestra' }[id] ?? ''),
  piece: () => undefined,
};
const branding = { uidDomain: 'ggmuze.nwsa', namePrefix: 'NWSA', prodId: '-//NWSA Music//ggmuze//EN' };
const base = {
  id: 'reh-1', type: 'Rehearsal', date: '2026-09-14',
  startTime: '13:10', endTime: '14:25', location: 'Room 4302', status: 'Scheduled',
};

eq(icsSummary({ ...base, ensembleIds: ['we', 'so'] }, lookups, branding),
  'Wind Ensemble, Symphony Orchestra',
  'FROZEN: an ordinary multi-ensemble event keeps its comma list, unchanged');
eq(icsSummary({ ...base, ensembleIds: ['we'] }, lookups, branding),
  'Wind Ensemble', 'FROZEN: a single-ensemble event is untouched');
eq(icsSummary({ ...base, ensembleIds: ['we', 'so'], sharedBlock: true }, lookups, branding),
  'Wind Ensemble + Symphony Orchestra (combined)',
  'a combined block names everyone in the room — "Wind Ensemble" alone sends half of it to the wrong place');
eq(icsSummary({ ...base, ensembleIds: ['we'], sharedBlock: true }, lookups, branding),
  'Wind Ensemble', 'a stale flag never fabricates a combined label');
eq(icsSummary({ ...base, ensembleIds: ['we', 'so'], sharedBlock: true, title: 'Pops Night' }, lookups, branding),
  'Pops Night', 'an explicit title still wins — the director said what to call it');
eq(icsSummary({ ...base, ensembleIds: ['we', 'so'], sharedBlock: true, status: 'Cancelled' }, lookups, branding),
  '[CANCELLED] Wind Ensemble + Symphony Orchestra (combined)',
  'the cancelled prefix still leads');

assert(icsDescription({ ...base, ensembleIds: ['we', 'so'], sharedBlock: true }, lookups)
  .startsWith('Combined block: '), 'the description says it is combined');
assert(!icsDescription({ ...base, ensembleIds: ['we', 'so'] }, lookups).includes('Combined'),
  'FROZEN: an ordinary event\'s description gains nothing');

// ── FROZEN: VEVENT line order and UID composition are untouched ───────
const vevent = icsEvent({ ...base, ensembleIds: ['we', 'so'] }, lookups, branding).split('\r\n');
eq(vevent[0], 'BEGIN:VEVENT', 'line 1 BEGIN');
eq(vevent[1], 'UID:reh-1@ggmuze.nwsa', 'line 2 UID — the subscription identity, never reformatted');
assert(vevent[2].startsWith('SUMMARY:'), 'line 3 SUMMARY');
assert(vevent[3].startsWith('DTSTART:'), 'line 4 DTSTART');
assert(vevent[4].startsWith('DTEND:'), 'line 5 DTEND');
assert(vevent[5].startsWith('STATUS:'), 'line 6 STATUS');
eq(vevent[vevent.length - 1], 'END:VEVENT', 'last line END');
// A shared block is the same VEVENT shape — only the SUMMARY text differs.
const sharedVevent = icsEvent({ ...base, ensembleIds: ['we', 'so'], sharedBlock: true }, lookups, branding).split('\r\n');
eq(sharedVevent.length, vevent.length, 'a shared block adds no lines');
eq(sharedVevent[1], vevent[1], 'and does not touch the UID');

if (failures) { console.error(`\n${failures} check(s) failed.`); process.exit(1); }
console.log('shared-block self-check: all checks passed');
