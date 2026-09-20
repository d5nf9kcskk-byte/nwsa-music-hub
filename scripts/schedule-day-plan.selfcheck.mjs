#!/usr/bin/env node
/**
 * Self-check for the day-plan engine (#schedule-ux-two-doors §3, Phase 4c) —
 * planDayChange / applyPlan in src/director/schedule/changePlan.ts.
 *
 * Three promises are being protected.
 *
 * 1. DISPLACEMENT IS NEVER SILENT. A move onto an occupied slot must always
 *    report a collision guard, and only an explicit overlapAcknowledged
 *    clears it — the review sheet withholds Save until then (doc §6 exit
 *    test: no committed plan leaves an unacknowledged collision).
 *
 * 2. SNAPSHOT-ONCE RIDES ALONG. Every plan write carries the same changeFrom
 *    semantics as a hand-made change: the ORIGINAL schedule is captured on
 *    the first change and never overwritten by a second one.
 *
 * 3. BACK TO NORMAL ROUND-TRIPS THE DAY. After a swap, a combine, or a
 *    cancel, the backToNormal plan restores every event byte-for-byte —
 *    absorbed blocks re-created under their ORIGINAL doc ids (ICS UIDs
 *    derive from doc ids, a frozen subscription contract).
 *
 * 4. A CANCELLED DAY CANCELS THE RIGHT PROGRAM, AND TAKES THE LESSONS WITH IT
 *    (#college-hs-calendar-deps). MDCPS and Miami Dade College run separate
 *    calendars: on 2026-09-21, an MDCPS teacher planning day, MDC is in full
 *    session. MDC decides college, MDCPS decides high school, with no
 *    crossover — so a scoped cancel must leave the other program alone, and
 *    an unscoped one must still cancel everything (a hurricane closes both).
 *    Either way the day's private LESSONS go with the MDCPS day — they are in
 *    another collection, were never in `dayEvents`, and a lesson left behind
 *    cannot be swept up later, because `pendingSlotDates()` reads the week as
 *    already covered. Back to normal puts back only the lessons the day plan
 *    itself cancelled, never one a teacher cancelled.
 *
 * Run: node scripts/schedule-day-plan.selfcheck.mjs
 */
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';

// Same extensionless-import shim as schedule-combine.selfcheck.mjs.
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

globalThis.__ORG_CONFIG__ = JSON.parse(
  readFileSync(new URL('../config/orgs/nwsa.json', import.meta.url), 'utf8'));

const { planDayChange, applyPlan } = await import('../src/director/schedule/changePlan.ts');

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

// ── fixtures (fictional — never real students) ────────────────────────
const D = '2026-09-04'; // a Friday
const we = { id: 'evt-we', type: 'Rehearsal', ensembleIds: ['we'], date: D, startTime: '13:10', endTime: '14:25', location: 'Band Room', status: 'Scheduled' };
const so = { id: 'evt-so', type: 'Rehearsal', ensembleIds: ['so'], date: D, startTime: '14:30', endTime: '15:45', location: 'Orchestra Room', status: 'Scheduled', rollTaken: { so: { at: 1, absent: 0 } } };
const day = [we, so];
const labels = { 'evt-we': 'Wind Ensemble', 'evt-so': 'Symphony Orchestra' };

// ── swap: exact writes, snapshot-once, exact banner ───────────────────
{
  const p = planDayChange(day, { kind: 'swap', aId: 'evt-we', bId: 'evt-so' }, { labels });
  eqDeep(p.writes, [
    { op: 'update', id: 'evt-we', data: { startTime: '14:30', endTime: '15:45', location: 'Orchestra Room', changeNote: 'Block swap — now 2:30 PM – 3:45 PM in Orchestra Room', changeFrom: { status: 'Scheduled', startTime: '13:10', endTime: '14:25', location: 'Band Room' } } },
    { op: 'update', id: 'evt-so', data: { startTime: '13:10', endTime: '14:25', location: 'Band Room', changeNote: 'Block swap — now 1:10 PM – 2:25 PM in Band Room', changeFrom: { status: 'Scheduled', startTime: '14:30', endTime: '15:45', location: 'Orchestra Room' } } },
  ], 'swap plan writes both sides with the original schedule snapshotted');
  assert(p.bannerText === 'Block swap Fri, Sep 4: Wind Ensemble now 2:30 PM, Symphony Orchestra now 1:10 PM',
    `swap banner text is exact (got "${p.bannerText}")`);
  eqDeep(p.guards, [], 'a clean swap raises no guards');

  // Snapshot-once: swapping a block that was ALREADY changed must not
  // overwrite the original snapshot.
  const weMoved = { ...we, startTime: '14:00', changeNote: 'moved', changeFrom: { status: 'Scheduled', startTime: '13:10', endTime: '14:25', location: 'Band Room' } };
  const p2 = planDayChange([weMoved, so], { kind: 'swap', aId: 'evt-we', bId: 'evt-so' }, { labels });
  const w2 = p2.writes.find(w => w.id === 'evt-we');
  assert(!('changeFrom' in w2.data), 'an already-changed block keeps its ORIGINAL snapshot (no second capture)');

  // Round trip: swap, then back to normal → the day exactly as it started.
  const afterSwap = applyPlan(day, p.writes);
  const back = planDayChange(afterSwap, { kind: 'backToNormal' }, { labels });
  eqDeep(back.writes.map(w => w.op), ['revert', 'revert'], 'back-to-normal reverts every changed event');
  assert(back.bannerText === '', 'back-to-normal posts no new banner');
  eqDeep(applyPlan(afterSwap, back.writes), day, 'swap → back-to-normal restores the day byte-for-byte');
}

// ── combine: union + delete + guards, and the ICS round trip ──────────
{
  const overrides = [
    { id: 'ov-1', studentId: 's-1', ensembleId: 'we', action: 'remove', scope: 'event', eventId: 'evt-so' },
    { id: 'ov-2', studentId: 's-2', ensembleId: 'so', action: 'remove', scope: 'range', startDate: D, endDate: D, kind: 'lesson', startTime: '15:00', endTime: '15:30' },
  ];
  const p = planDayChange(day, { kind: 'combine', hostId: 'evt-we', absorbedIds: ['evt-so'], location: 'Auditorium', groupLabel: 'Wind Ensemble + Symphony Orchestra' }, { labels, overrides });
  const host = p.writes.find(w => w.id === 'evt-we');
  eqDeep(host.data.ensembleIds, ['we', 'so'], 'combine host takes the union of ensembles');
  assert(host.data.sharedBlock === true, 'combine host is a shared block');
  eqDeep(host.data.changeFrom.absorbed.map(e => e.id), ['evt-so'], 'absorbed event stored whole in the snapshot');
  eqDeep(p.writes.find(w => w.id === 'evt-so'), { op: 'delete', id: 'evt-so' }, 'absorbed event is deleted');
  assert(p.bannerText === 'Wind Ensemble + Symphony Orchestra combined rehearsal Fri, Sep 4: 1:10 PM in Auditorium',
    `combine banner text is exact (got "${p.bannerText}")`);
  assert(p.guards.some(g => g.kind === 'rollTaken' && g.eventId === 'evt-so'),
    'roll already taken on the absorbed block is guarded');
  assert(p.guards.some(g => g.kind === 'strandedOverride' && g.overrideId === 'ov-1'),
    'an event-scoped override on the absorbed block is guarded as stranded');
  assert(p.guards.some(g => g.kind === 'lessonWindow' && g.overrideId === 'ov-2'),
    'a lesson window outside the combined time (15:00–15:30 vs 13:10–14:25) is guarded');

  // Round trip: combine, then back to normal → absorbed block re-created
  // under its ORIGINAL doc id (ICS UID contract), day exactly as it started.
  const afterCombine = applyPlan(day, p.writes);
  eqDeep(afterCombine.map(e => e.id), ['evt-we'], 'after the combine only the host remains');
  const back = planDayChange(afterCombine, { kind: 'backToNormal' });
  eqDeep(applyPlan(afterCombine, back.writes), day,
    'combine → back-to-normal restores the day byte-for-byte, absorbed event under its ORIGINAL doc id');
}

// ── move: displacement is never silent ────────────────────────────────
{
  const move = { kind: 'move', id: 'evt-we', startTime: '14:30', endTime: '15:45', location: 'Band Room' };
  const p = planDayChange(day, move, { labels });
  eqDeep(p.guards, [{ kind: 'collision', movingId: 'evt-we', occupantId: 'evt-so' }],
    'moving onto an occupied slot ALWAYS reports the collision');
  assert(p.bannerText === '⚠ Wind Ensemble: now 2:30 PM (Fri, Sep 4)',
    `move banner text is exact (got "${p.bannerText}")`);

  const ack = planDayChange(day, { ...move, overlapAcknowledged: true }, { labels });
  eqDeep(ack.guards, [], 'an acknowledged overlap clears the collision guard (and only then)');
  eqDeep(ack.writes, p.writes, 'acknowledging changes nothing about the writes');

  const cancelled = planDayChange([we, { ...so, status: 'Cancelled' }], move, { labels });
  eqDeep(cancelled.guards, [], 'a cancelled block does not occupy its slot');

  const room = planDayChange(day, { kind: 'move', id: 'evt-we', startTime: '13:10', endTime: '14:25', location: 'Auditorium' }, { labels });
  eqDeep(room.guards, [], 'a room-only move in its own slot raises no collision');
  assert(room.bannerText === '⚠ Wind Ensemble: in Auditorium (Fri, Sep 4)', 'room-only banner text is exact');
}

// ── cancel the day ────────────────────────────────────────────────────
{
  const p = planDayChange([we, { ...so, status: 'Cancelled' }], { kind: 'cancelDay' }, { labels });
  eqDeep(p.writes.map(w => w.id), ['evt-we'], 'cancel-the-day skips already-cancelled blocks');
  eqDeep(p.writes[0].data.changeFrom, { status: 'Scheduled', startTime: '13:10', endTime: '14:25', location: 'Band Room' },
    'cancel snapshots the original schedule');
  assert(p.bannerText === '🚫 Wind Ensemble: CANCELLED Fri, Sep 4', `cancel banner is exact (got "${p.bannerText}")`);

  const full = planDayChange(day, { kind: 'cancelDay' }, { labels });
  const afterCancel = applyPlan(day, full.writes);
  assert(afterCancel.every(e => e.status === 'Cancelled'), 'cancel-the-day cancels every live block');
  const back = planDayChange(afterCancel, { kind: 'backToNormal' });
  eqDeep(applyPlan(afterCancel, back.writes), day, 'cancel → back-to-normal restores the day byte-for-byte');
}

// ── cancelling the RIGHT calendar's day (#college-hs-calendar-deps) ───
//
// 2026-09-21 is an MDCPS teacher planning day and an ordinary Monday at
// Miami Dade College. The reported bug: "Cancel the day" cancelled the
// dual-enrollment classes that were still meeting.
//
// MDC decides college, MDCPS decides high school, and there is no crossover:
// College Chamber Orchestra is a college ENSEMBLE and goes with the college
// day; a master class is a high school class and goes with the high school
// day.
{
  const M = '2026-09-21';
  const hsReh = { id: 'evt-hs', type: 'Rehearsal', ensembleIds: ['we'], date: M, startTime: '13:10', endTime: '14:25', status: 'Scheduled' };
  const collegeCls = { id: 'evt-mdc', type: 'Class', ensembleIds: ['class-college-piano-1'], date: M, startTime: '08:00', endTime: '08:50', status: 'Scheduled' };
  const ccoReh = { id: 'evt-cco', type: 'Rehearsal', ensembleIds: ['college-chamber-orchestra'], date: M, startTime: '14:30', endTime: '15:45', status: 'Scheduled' };
  const mcls = { id: 'evt-mc', type: 'Class', ensembleIds: ['masterclass-violin'], date: M, startTime: '12:00', endTime: '12:50', status: 'Scheduled' };
  const mday = [collegeCls, mcls, hsReh, ccoReh];
  const groups = {
    we: { kind: 'ensemble' },
    'class-college-piano-1': { kind: 'class', collegeLevel: true },
    'college-chamber-orchestra': { kind: 'ensemble', collegeLevel: true },
    'masterclass-violin': { kind: 'masterclass' },
  };
  const mlabels = { 'evt-hs': 'Wind Ensemble', 'evt-mdc': 'Class Piano 1', 'evt-cco': 'College Chamber Orchestra', 'evt-mc': 'Violin Masterclass' };

  const hs = planDayChange(mday, { kind: 'cancelDay', campus: 'mdcps' }, { labels: mlabels, groups });
  eqDeep(hs.writes.map(w => w.id).sort(), ['evt-hs', 'evt-mc'],
    'the high school day cancels the high school rehearsal and the master class — and never a college group');

  const mdc = planDayChange(mday, { kind: 'cancelDay', campus: 'mdc' }, { labels: mlabels, groups });
  eqDeep(mdc.writes.map(w => w.id).sort(), ['evt-cco', 'evt-mdc'],
    'the college day cancels the college class AND the College Chamber Orchestra rehearsal — it is a college ensemble, not a high school one');

  const both = planDayChange(mday, { kind: 'cancelDay' }, { labels: mlabels, groups });
  eqDeep(both.writes.map(w => w.id).sort(), ['evt-cco', 'evt-hs', 'evt-mc', 'evt-mdc'],
    'an UNSCOPED cancel still closes both programs — a hurricane is a real verb');

  // Should not exist: the two programs are separate. Fail-safe, not a rule.
  const shared = { id: 'evt-mix', type: 'Rehearsal', ensembleIds: ['class-college-piano-1', 'we'], date: M, startTime: '10:00', endTime: '11:00', status: 'Scheduled' };
  eqDeep(planDayChange([shared], { kind: 'cancelDay', campus: 'mdc' }, { groups }).writes, [],
    'a block that somehow mixes the two programs is not the college day\'s to cancel');

  // No groups handed over at all: everything reads MDCPS, so the high school
  // day still closes them and the college day touches nothing. Failing the
  // other way would leave a block running on a day just cancelled.
  eqDeep(planDayChange(mday, { kind: 'cancelDay', campus: 'mdcps' }, {}).writes.map(w => w.id).sort(),
    ['evt-cco', 'evt-hs', 'evt-mc', 'evt-mdc'], 'an unresolvable group reads as MDCPS, never as college');
}

// ── the day's private lessons go with it ──────────────────────────────
{
  const M = '2026-09-21';
  const hsReh = { id: 'evt-hs', type: 'Rehearsal', ensembleIds: ['we'], date: M, startTime: '13:10', endTime: '14:25', status: 'Scheduled' };
  const collegeCls = { id: 'evt-mdc', type: 'Class', ensembleIds: ['class-college-piano-1'], date: M, startTime: '08:00', endTime: '08:50', status: 'Scheduled' };
  const groups = { we: { kind: 'ensemble' }, 'class-college-piano-1': { kind: 'class', collegeLevel: true } };
  const mlabels = { 'evt-hs': 'Wind Ensemble', 'evt-mdc': 'Class Piano 1' };
  const violin = { id: 'les-1', studentId: 's-1', date: M, startTime: '15:00', endTime: '15:45', status: 'Scheduled' };
  const alreadyOff = { id: 'les-2', studentId: 's-2', date: M, startTime: '16:00', endTime: '16:45', status: 'Cancelled' };
  const graded = { id: 'les-3', studentId: 's-3', date: M, startTime: '17:00', endTime: '17:45', status: 'Scheduled', grade: '92' };
  const lessons = [violin, alreadyOff, graded];

  const p = planDayChange([hsReh, collegeCls], { kind: 'cancelDay' }, { labels: mlabels, groups, lessons });
  eqDeep(p.writes.filter(w => w.op === 'cancelLesson'), [{ op: 'cancelLesson', id: 'les-1' }],
    'a cancelled day cancels the day\'s live lessons — the violin lesson left behind is the reported bug');
  eqDeep(p.guards, [{ kind: 'gradedLesson', lessonId: 'les-3', studentId: 's-3' }],
    'a GRADED lesson is left alone and reported, never silently rewritten');
  assert(p.bannerText === '🚫 Wind Ensemble, Class Piano 1: CANCELLED Mon, Sep 21',
    `the public banner names blocks only, never lessons (got "${p.bannerText}")`);

  const collegeOnly = planDayChange([hsReh, collegeCls], { kind: 'cancelDay', campus: 'mdc' }, { groups, lessons });
  eqDeep(collegeOnly.writes.filter(w => w.op === 'cancelLesson'), [],
    'a college-scoped cancel takes NO lessons — a lesson is taught in an NWSA room');

  const hsOnly = planDayChange([hsReh, collegeCls], { kind: 'cancelDay', campus: 'mdcps' }, { groups, lessons });
  eqDeep(hsOnly.writes.filter(w => w.op === 'cancelLesson'), [{ op: 'cancelLesson', id: 'les-1' }],
    'the high school day takes the lessons with it');

  // The day board previews BLOCKS. A lesson write must never reach it.
  eqDeep(applyPlan([hsReh, collegeCls], p.writes).map(e => e.id).sort(), ['evt-hs', 'evt-mdc'],
    'applyPlan ignores lesson writes rather than inventing or dropping a block');

  // Back to normal restores the day plan's lessons and NOT the teacher's own.
  const afterCancel = [
    { ...violin, status: 'Cancelled', changeFrom: { status: 'Scheduled' } },
    alreadyOff,
    graded,
  ];
  const back = planDayChange(applyPlan([hsReh, collegeCls], p.writes), { kind: 'backToNormal' }, { groups, lessons: afterCancel });
  eqDeep(back.writes.filter(w => w.op === 'revertLesson'), [{ op: 'revertLesson', id: 'les-1' }],
    'back-to-normal puts back only the lesson the day plan cancelled — a teacher\'s own cancellation is theirs');
}

// ── back to normal with nothing changed does nothing ──────────────────
eqDeep(planDayChange(day, { kind: 'backToNormal' }).writes, [], 'an unchanged day has nothing to revert');

// ──────────────────────────────────────────────────────────────────────
if (failures > 0) {
  console.error(`\nschedule-day-plan selfcheck: ${failures} failure(s)`);
  process.exit(1);
}
console.log('schedule-day-plan selfcheck: all checks passed');
