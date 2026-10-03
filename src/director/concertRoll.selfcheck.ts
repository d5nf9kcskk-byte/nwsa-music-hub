/**
 * Pins concert roll (#concert-roll). Run:
 *   npx tsx --import ./scripts/vite-defines-shim.mjs src/director/concertRoll.selfcheck.ts
 *
 * Three promises, each one a line someone could "tidy" without a test failing:
 *   1. A concert is on Take Roll — a cancelled one is not, and an ordinary
 *      event still isn't.
 *   2. A concert is STILL not a rehearsal for everything else. `takesAttendance`
 *      decides what a standing rotation and a lesson conflict apply to, and a
 *      rotation says nothing about a performance: widening it would drop every
 *      Wed/Thu rotator off a Jazz concert (rosterResolver.overrideApplies). So
 *      the roll list asks its own question, `takesRoll`.
 *   3. "Take Roll" opens on the right roll: straight onto it when one group
 *      plays, onto that day's list when several do (so each group's director
 *      picks their own, rather than landing on the first group alphabetically).
 */
import { overrideApplies } from './rosterResolver';
import { rollTarget, takesAttendance, takesRoll } from './utils';
import type { CalendarEvent, RosterOverride } from './types';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

const ev = (id: string, type: CalendarEvent['type'], ensembleIds: string[], extra: Partial<CalendarEvent> = {}) =>
  ({ id, type, ensembleIds, date: '2026-10-06', status: 'Scheduled', ...extra }) as CalendarEvent;

// ── 1. Who is on Take Roll ─────────────────────────────────────────────
for (const t of ['Rehearsal', 'Sectional', 'Class'] as const) {
  assert(takesRoll(ev('x', t, ['sym'])), `${t} still takes roll`);
}
assert(takesRoll(ev('c', 'Concert', ['sym'])), 'a concert takes roll');
assert(takesRoll({ type: 'Concert' }), 'a concert with no status written (every old doc) takes roll');
assert(!takesRoll(ev('c', 'Concert', ['sym'], { status: 'Cancelled' })), 'a cancelled concert has nobody to call');
assert(!takesRoll(ev('e', 'Event', ['sym'])), 'a one-off event is not rolled');

// ── 2. …and is still not a rehearsal ───────────────────────────────────
assert(!takesAttendance('Concert'), 'takesAttendance must stay false for a concert — rotations and lesson conflicts read it');
const concert = ev('oct6', 'Concert', ['jazz']);
const rehearsal = ev('reh', 'Rehearsal', ['jazz'], { date: '2026-10-07' });
const eventsById = { [concert.id]: concert, [rehearsal.id]: rehearsal };
// Standing rotation: out of Jazz on Wednesdays (Oct 7, 2026 is a Wednesday).
const rotation: RosterOverride = {
  id: 'r', studentId: 's', ensembleId: 'jazz', action: 'remove', kind: 'rotation', scope: 'range',
  startDate: '2026-08-01', endDate: '2027-05-31', days: [3],
};
assert(overrideApplies(rotation, { ensembleId: 'jazz', eventId: rehearsal.id, eventsById }),
  'the rotation removes the student from a Wednesday REHEARSAL');
assert(!overrideApplies(rotation, { ensembleId: 'jazz', eventId: concert.id, eventsById, date: '2026-10-07' }),
  'but never from a CONCERT — on stage they play with whichever ensemble is on stage');

// ── 3. Where "Take Roll" opens ─────────────────────────────────────────
const one = rollTarget(ev('c1', 'Concert', ['sym']));
assert(one.ensembleId === 'sym' && one.eventId === 'c1' && one.date === '2026-10-06',
  'one group on the concert: straight onto its roll');
const many = rollTarget(ev('c2', 'Concert', ['sym', 'wind', 'choir']));
assert(many.ensembleId === undefined && many.eventId === 'c2' && many.date === '2026-10-06',
  'several groups: onto that day\'s list, so each picks their own');
const reh = rollTarget(ev('r1', 'Rehearsal', ['sym', 'wind']));
assert(reh.ensembleId === 'sym' && reh.eventId === 'r1', 'a rehearsal opens as it always did, now onto the exact block');
assert(rollTarget(ev('c3', 'Concert', [])).ensembleId === undefined, 'a concert with no group has no roll to open');

console.log('concertRoll self-check: ok');
