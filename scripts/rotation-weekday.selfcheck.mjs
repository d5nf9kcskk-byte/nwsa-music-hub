#!/usr/bin/env node
/**
 * Self-check for the standing-rotation weekday filter
 * (`days` on RosterOverride → overrideApplies / resolveRoster in
 * src/director/rosterResolver.ts).
 *
 * If this breaks, students silently rehearse with the wrong ensemble: a
 * rotation fires on the wrong weekday, or — worse — an override with no
 * `days` (every existing lesson and hand-made pull-out) stops applying.
 *
 * Run: node scripts/rotation-weekday.selfcheck.mjs
 */
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';

// The app's TS sources import relative modules without a file extension (vite
// resolves them). Node's ESM resolver does not, so teach it the one rule it is
// missing; without this the import below fails on ./classSchedule.
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

// rosterResolver → utils → i18n → src/org, which reads __ORG_CONFIG__, a
// build-time global vite.config.ts injects via `define`. Mirror that here so
// the module loads under plain node (nothing else about ORG is exercised).
globalThis.__ORG_CONFIG__ = JSON.parse(
  readFileSync(new URL('../config/orgs/nwsa.json', import.meta.url), 'utf8'));

const { overrideApplies, resolveRoster } = await import('../src/director/rosterResolver.ts');

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failures++; }
}

const YEAR = { startDate: '2026-08-13', endDate: '2027-06-03' };
// Verified weekdays (UTC): the machine running this is west of UTC, where a
// bare new Date('2026-08-18').getDay() answers Mon for a Tuesday.
const MON = '2026-08-17', TUE = '2026-08-18', WED = '2026-08-19',
      THU = '2026-08-20', FRI = '2026-08-21';

// ── The regression guard that matters most: no `days` == the old behaviour ──
const plain = { scope: 'range', ...YEAR };
for (const d of [MON, TUE, WED, THU, FRI]) {
  assert(overrideApplies(plain, { ensembleId: 'x', date: d }), `no-days override still applies on ${d}`);
}
assert(!overrideApplies(plain, { ensembleId: 'x', date: '2026-08-12' }), 'before the span never applies');
assert(!overrideApplies(plain, { ensembleId: 'x', date: '2027-06-04' }), 'after the span never applies');
assert(overrideApplies({ scope: 'range', ...YEAR, days: [] }, { ensembleId: 'x', date: WED }),
  'empty days behaves as no days');

// ── Tue+Fri rotation fires on exactly those two weekdays ──
const tueFri = { scope: 'range', ...YEAR, days: [2, 5] };
assert(overrideApplies(tueFri, { ensembleId: 'x', date: TUE }), 'Tue is in days [2,5]');
assert(overrideApplies(tueFri, { ensembleId: 'x', date: FRI }), 'Fri is in days [2,5]');
assert(!overrideApplies(tueFri, { ensembleId: 'x', date: MON }), 'Mon is not');
assert(!overrideApplies(tueFri, { ensembleId: 'x', date: WED }), 'Wed is not');
assert(!overrideApplies(tueFri, { ensembleId: 'x', date: THU }), 'Thu is not');
// Weekday filter never widens the span.
assert(!overrideApplies(tueFri, { ensembleId: 'x', date: '2026-08-11' }), 'a Tuesday BEFORE the span is still out');

// ── The whole point: one doc moves a student between two ensembles ──
const bassist = { id: 's1', name: 'Testcase, Ada', status: 'Active', instrument: 'Bass',
                   ensembleIds: ['symphony-orchestra', 'camerata-string-orchestra'] };
const rotation = { id: 'o1', studentId: 's1', ensembleId: 'symphony-orchestra',
                   action: 'remove', kind: 'rotation', destEnsembleId: 'jazz-ensemble',
                   scope: 'range', ...YEAR, days: [2, 5] };
const on = (ens, date) => resolveRoster([bassist], [rotation], { ensembleId: ens, date }).map(r => r.student.id);

assert(on('jazz-ensemble', TUE).includes('s1'), 'Tue: subbed INTO jazz by destEnsembleId');
assert(!on('symphony-orchestra', TUE).includes('s1'), 'Tue: pulled OUT of symphony');
assert(on('symphony-orchestra', WED).includes('s1'), 'Wed: back in symphony');
assert(!on('jazz-ensemble', WED).includes('s1'), 'Wed: not in jazz');
assert(on('jazz-ensemble', FRI).includes('s1'), 'Fri: in jazz');
assert(!on('symphony-orchestra', FRI).includes('s1'), 'Fri: out of symphony');
// A rotation out of Symphony must not disturb her standing Camerata membership.
for (const d of [MON, TUE, WED, THU, FRI]) {
  assert(on('camerata-string-orchestra', d).includes('s1'), `Camerata untouched on ${d}`);
}

// ── The shipped model: base membership in BOTH ensembles, removals carving out
// the days they are elsewhere. The concert case is why it is built this way.
const SAT = '2026-08-22';
const trombonist = { id: 's2', name: 'Example, Bram', status: 'Active', instrument: 'Trombone',
                ensembleIds: ['symphony-orchestra', 'jazz-ensemble', 'wind-ensemble'] };
const outOfSym  = { id: 'o2', studentId: 's2', ensembleId: 'symphony-orchestra',
                    action: 'remove', kind: 'rotation', scope: 'range', ...YEAR, days: [2, 5] };
const outOfJazz = { id: 'o3', studentId: 's2', ensembleId: 'jazz-ensemble',
                    action: 'remove', kind: 'rotation', scope: 'range', ...YEAR, days: [3, 4] };
const k = (ens, date) => resolveRoster([trombonist], [outOfSym, outOfJazz], { ensembleId: ens, date })
  .map(r => r.student.id).includes('s2');

assert(k('jazz-ensemble', TUE) && !k('symphony-orchestra', TUE), 'Tue: jazz, not symphony');
assert(k('symphony-orchestra', WED) && !k('jazz-ensemble', WED), 'Wed: symphony, not jazz');
assert(k('symphony-orchestra', THU) && !k('jazz-ensemble', THU), 'Thu: symphony, not jazz');
assert(k('jazz-ensemble', FRI) && !k('symphony-orchestra', FRI), 'Fri: jazz, not symphony');
// On a day neither rotation covers, the student is a member of BOTH.
assert(k('jazz-ensemble', SAT), 'Sat: still in jazz');
assert(k('symphony-orchestra', SAT), 'Sat: still in symphony');

// THE concert guard. A Saturday proves nothing — it is a weekday no rotation
// names, so the bug cannot fire there. The real case is a concert ON a rotation
// weekday: the trombonist is rotated out of Jazz on Wed, but a Wednesday JAZZ
// CONCERT is a performance, and they play it. Rotations govern rehearsals only.
const trombonistEvents = {
  reh: { id: 'reh', type: 'Rehearsal', date: WED, ensembleIds: ['jazz-ensemble'], status: 'Scheduled' },
  con: { id: 'con', type: 'Concert',   date: WED, ensembleIds: ['jazz-ensemble'], status: 'Scheduled' },
  sec: { id: 'sec', type: 'Sectional', date: WED, ensembleIds: ['jazz-ensemble'], status: 'Scheduled' },
};
const kEv = (ens, eventId) => resolveRoster([trombonist], [outOfSym, outOfJazz],
  { ensembleId: ens, eventId, eventsById: trombonistEvents }).map(r => r.student.id).includes('s2');
assert(!kEv('jazz-ensemble', 'reh'), 'Wed REHEARSAL: rotated out of jazz');
assert(!kEv('jazz-ensemble', 'sec'), 'Wed SECTIONAL: rotated out of jazz (a sectional is a rehearsal)');
assert(kEv('jazz-ensemble', 'con'), 'Wed CONCERT: still in jazz — a rotation must not pull a player from a performance');
assert(kEv('symphony-orchestra', 'con'), 'Wed concert: symphony membership intact too');
// Wind Ensemble has no rotation, so it is untouched every day.
for (const d of [MON, TUE, WED, THU, FRI, SAT]) assert(k('wind-ensemble', d), `WE untouched on ${d}`);
// Nobody is ever in both halves of a shared block.
for (const d of [TUE, WED, THU, FRI]) {
  assert(k('jazz-ensemble', d) !== k('symphony-orchestra', d), `exactly one of jazz/symphony on ${d}`);
}

// ── generate-feeds.mjs keeps its OWN copy of this logic (plain node, no src
// imports) and ships unauthenticated on a 4-hour cron, so divergence is silent.
// Pull the two functions out of the real source text and hold them to the
// resolver's answers. `days` arriving as REST integerValue is the case that
// already broke once: a string-only array decode turned [2,5] into ['',''].
const feedsSrc = readFileSync(new URL('./generate-feeds.mjs', import.meta.url), 'utf8');
function extract(re, what) {
  const m = feedsSrc.match(re);
  if (!m) { console.error(`FAIL: could not find ${what} in generate-feeds.mjs`); process.exit(1); }
  return m[0];
}
const { flattenFields, feedApplies } = await import('data:text/javascript,' + encodeURIComponent(
  `${extract(/function flattenFields\(fields\) \{[\s\S]*?\n\}/, 'flattenFields')}
   ${extract(/const TAKES_ROLL = new Set\(\[[^\]]*\]\);/, 'TAKES_ROLL')}
   ${extract(/const overrideApplies = \(o, event\) => \{[\s\S]*?\n\s*\};/, 'overrideApplies')}
   export { flattenFields, overrideApplies as feedApplies };`));

// The exact REST payload firebase-admin produces for days: [2, 5].
const decoded = flattenFields({
  days: { arrayValue: { values: [{ integerValue: '2' }, { integerValue: '5' }] } },
  ensembleId: { stringValue: 'symphony-orchestra' },
});
assert(JSON.stringify(decoded.days) === '[2,5]',
  `REST decode of days must be numbers, got ${JSON.stringify(decoded.days)}`);
assert(decoded.ensembleId === 'symphony-orchestra', 'string arrays/scalars still decode');

// And the feed predicate must agree with the resolver, date for date...
const feedDoc = { scope: 'range', ...YEAR, days: decoded.days };
for (const d of [MON, TUE, WED, THU, FRI, SAT]) {
  const mine = feedApplies(feedDoc, { date: d, id: 'e1', type: 'Rehearsal' });
  const theirs = overrideApplies(feedDoc, { ensembleId: 'x', date: d });
  assert(mine === theirs, `feeds and resolver disagree on ${d}: feeds=${mine} resolver=${theirs}`);
}
// ...including the concert rule, which lives in both copies.
const feedRot = { ...feedDoc, kind: 'rotation' };
for (const [type, want] of [['Rehearsal', true], ['Sectional', true], ['Class', true],
                            ['Concert', false], ['Event', false]]) {
  const ev = { id: 'e2', date: TUE, type };
  assert(feedApplies(feedRot, ev) === want, `feeds: rotation on a ${type} should be ${want}`);
  const res = overrideApplies(feedRot, { ensembleId: 'x', eventId: 'e2', eventsById: { e2: ev } });
  assert(res === want, `resolver: rotation on a ${type} should be ${want}`);
}

if (failures) { console.error(`\n${failures} check(s) failed.`); process.exit(1); }
console.log('rotation weekday self-check: all checks passed');
