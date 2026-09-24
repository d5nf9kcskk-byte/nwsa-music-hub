/**
 * Pins concert excusals (#concert-excusals). Four promises, each a one-liner
 * to break by accident:
 *   1. An excusal takes the student off the concerts NAMED and nothing else —
 *      not the next concert, not the same day's rehearsal, not their ensemble.
 *   2. The reason never rides on the pull-out: the override carries only the
 *      generic text (every Hub role reads it) and its public mirror none at
 *      all. The category and the record live on `concertExcusals`, which the
 *      rules close to assistants.
 *   3. The program's roster pages drop the student WITHOUT editing the chart,
 *      keeping chair order, so the next concert on that chart still seats them.
 *   4. A student in two ensembles on one concert, pulled from one, still plays.
 */
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { excusableConcerts, excusalOverrides, EXCUSAL_REASON } from './concertExcusal';
import { pulledFromEvent, removedIds, resolveRoster } from './rosterResolver';
import { publicOverrideFields } from './publicMirror';
import { seatsPlaying } from '../shared/concertRosters';
import type { CalendarEvent, RosterOverride, Student } from './types';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

const SYM = 'symphony', CAM = 'camerata';
const bass: Student = { id: 'bass1', name: 'Bass Player', status: 'Active', ensembleIds: [SYM, CAM] } as Student;
const cello: Student = { id: 'cello1', name: 'Cello Player', status: 'Active', ensembleIds: [SYM] } as Student;
const students = [bass, cello];

const ev = (id: string, date: string, type: CalendarEvent['type'], ensembleIds: string[], extra: Partial<CalendarEvent> = {}) =>
  ({ id, date, type, ensembleIds, ...extra }) as CalendarEvent;
const oct3 = ev('oct3', '2026-10-03', 'Concert', [SYM]);
const oct4 = ev('oct4', '2026-10-04', 'Concert', [SYM]);
const oct17 = ev('oct17', '2026-10-17', 'Concert', [SYM]);
const shared = ev('shared', '2026-11-01', 'Concert', [SYM, CAM]);
const rehearsal = ev('reh', '2026-10-03', 'Rehearsal', [CAM]);
const past = ev('past', '2026-09-01', 'Concert', [SYM]);
const cancelled = ev('cx', '2026-10-10', 'Concert', [SYM], { status: 'Cancelled' });
const audience = ev('aud', '2026-10-11', 'Concert', ['jazz'], { attendanceEnsembleIds: [SYM] });
const events = [oct3, oct4, oct17, shared, rehearsal, past, cancelled, audience];
const eventsById = Object.fromEntries(events.map(e => [e.id, e]));

// ── Which concerts are offered ─────────────────────────────────────────
const offered = excusableConcerts(bass, events, students, [], eventsById, '2026-09-24').map(c => c.event.id);
assert(offered.join('|') === 'oct3|oct4|oct17|shared', `offers upcoming concerts played, in date order (got ${offered.join('|')})`);

// ── 1. Off the named concerts, and only those ──────────────────────────
const picks = excusableConcerts(bass, events, students, [], eventsById, '2026-09-24')
  .filter(c => c.event.id === 'oct3' || c.event.id === 'oct4');
const written = excusalOverrides(bass.id, picks);
const overrides: RosterOverride[] = written.map((o, i) => ({ ...o, id: `x${i}` }));
assert(written.length === 2 && written.every(o => o.scope === 'event' && o.action === 'remove' && o.ensembleId === SYM),
  'one event-scoped Symphony pull-out per concert');

const onStage = (e: CalendarEvent, ens: string) =>
  resolveRoster(students, overrides, { ensembleId: ens, eventId: e.id, eventsById }).some(r => r.student.id === bass.id);
assert(!onStage(oct3, SYM) && !onStage(oct4, SYM), 'off Oct 3 and Oct 4');
assert(onStage(oct17, SYM), 'still on the NEXT Symphony concert');
assert(onStage(rehearsal, CAM), 'same-day Camerata rehearsal untouched');
assert(bass.ensembleIds?.includes(SYM), 'ensemble membership untouched');
assert(resolveRoster(students, overrides, { ensembleId: SYM, eventId: oct3.id, eventsById }).some(r => r.student.id === cello.id),
  'nobody else comes off');

// ── 2. The reason stays private ────────────────────────────────────────
for (const o of written) {
  assert(o.reason === EXCUSAL_REASON, 'the pull-out carries only the generic reason');
  assert(!('category' in o) && !('record' in o), 'no category or record on the pull-out');
  assert(!('reason' in publicOverrideFields(o)), 'the public mirror carries no reason at all');
}
const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
const block = rules.slice(rules.indexOf('match /concertExcusals/{doc}'));
const readRule = block.slice(0, block.indexOf('\n', block.indexOf('allow read')));
assert(/allow read: if isStaff\(\) \|\| isTeacherRole\(\);/.test(readRule),
  'concertExcusals is readable by directors and applied teachers only — never assistants, never public');
assert(!/allow update/.test(block.slice(0, block.indexOf('\n    }'))), 'an excusal is kept as filed: no update rule');

// ── 3. Program roster pages drop the player, not the chart ─────────────
const sections = [
  { section: 'Cello', seats: [{ studentId: cello.id }] },
  { section: 'Bass', seats: [{ studentId: bass.id }] },
];
const snapshot = JSON.stringify(sections);
const out = removedIds(overrides, { ensembleId: SYM, eventId: oct3.id, eventsById });
const printed = seatsPlaying(sections, out);
assert(printed.length === 1 && printed[0].section === 'Cello', 'an emptied section is dropped, the rest kept in order');
assert(JSON.stringify(sections) === snapshot, 'the chart itself is not edited');
assert(seatsPlaying(sections, removedIds(overrides, { ensembleId: SYM, eventId: oct17.id, eventsById })).length === 2,
  'the next concert on the same chart still seats them');

// ── 4. Two ensembles on one concert ────────────────────────────────────
const halfPulled: RosterOverride[] = [{ id: 'h', studentId: bass.id, ensembleId: SYM, action: 'remove', scope: 'event', eventId: 'shared' }];
assert(!pulledFromEvent(bass, shared, halfPulled, eventsById), 'pulled from Symphony only — still plays with Camerata');
const bothPulled = excusalOverrides(bass.id, excusableConcerts(bass, events, students, [], eventsById, '2026-09-24')
  .filter(c => c.event.id === 'shared')).map((o, i) => ({ ...o, id: `b${i}` }));
assert(bothPulled.length === 2, 'excusing a shared concert pulls from every ensemble played with');
assert(pulledFromEvent(bass, shared, bothPulled, eventsById), '…and then the student is off it');
assert(pulledFromEvent(bass, oct3, overrides, eventsById), 'the Gradebook sees Oct 3 as excused');
assert(!pulledFromEvent(bass, oct17, overrides, eventsById), '…and Oct 17 as required');

console.log('concertExcusal self-check: ok');
