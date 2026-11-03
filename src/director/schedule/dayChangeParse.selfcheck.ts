/**
 * Self-check for "Type what changed" (#day-change-parse) —
 * src/director/schedule/dayChangeParse.ts.
 *
 * Three promises:
 *  1. The four sentences the feature was asked for come out as the EXACT
 *     DayAction a chip or block menu would build — so they land in the same
 *     review sheet and "Back to normal" undoes them the same way.
 *  2. A sentence it cannot pin to specific blocks on a specific day is
 *     REFUSED, never guessed: unknown group, two blocks for one name, a
 *     whole-day verb, nothing to change.
 *  3. Parsing writes nothing and there is no model behind the seam.
 *
 * Fixtures are fictional groups and blocks — never real students.
 * Run: npx tsx src/director/schedule/dayChangeParse.selfcheck.ts
 */
import { parseDayChange, DAY_CHANGE_MODEL_FALLBACK } from './dayChangeParse.ts';
import type { ParseContext } from './dayChangeParse.ts';
import type { CalendarEvent } from '../types.ts';

let failures = 0;
const fail = (msg: string) => { console.error('FAIL:', msg); failures++; };
const eq = (a: unknown, b: unknown, msg: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) fail(`${msg}\n   expected: ${JSON.stringify(b)}\n   actual:   ${JSON.stringify(a)}`);
};

// Tue Nov 3 2026, mid-morning. Thursday = Nov 5, Friday = Nov 6, tomorrow = Nov 4.
const now = new Date(2026, 10, 3, 9, 30);
const ev = (id: string, date: string, ensembleIds: string[], startTime: string, endTime: string, location: string, extra: Partial<CalendarEvent> = {}) =>
  ({ id, type: 'Rehearsal', date, ensembleIds, startTime, endTime, location, status: 'Scheduled', ...extra }) as CalendarEvent;

const events: CalendarEvent[] = [
  ev('so-thu', '2026-11-05', ['so'], '13:10', '14:25', 'Orchestra Room'),
  ev('cam-thu', '2026-11-05', ['cam'], '14:30', '15:45', 'Room 121'),
  ev('cam-tue', '2026-11-03', ['cam'], '14:30', '15:45', 'Room 121'),
  ev('ph-tue', '2026-11-03', ['ph'], '14:30', '15:45', 'Orchestra Room'),
  ev('ph-fri', '2026-11-06', ['ph'], '14:30', '15:45', 'Orchestra Room'),
  ev('cam-fri', '2026-11-06', ['cam'], '14:30', '15:45', 'Room 121'),
  ev('so-wed', '2026-11-04', ['so'], '13:10', '14:25', 'Orchestra Room'),
  ev('jz-wed-a', '2026-11-04', ['jz'], '13:10', '14:25', 'Band Room'),
  ev('jz-wed-b', '2026-11-04', ['jz'], '16:00', '17:00', 'Band Room', { type: 'Sectional' }),
  ev('we-tue-off', '2026-11-03', ['we'], '13:10', '14:25', 'Band Room', { status: 'Cancelled' }),
];
const ctx: ParseContext = {
  now,
  defaultDate: '2026-11-03',
  events,
  groups: [
    { id: 'so', name: 'Symphony Orchestra', order: 1 },
    { id: 'ph', name: 'Philharmonic Orchestra', order: 2 },
    { id: 'cam', name: 'Camerata', order: 3 },
    { id: 'jz', name: 'Jazz Band', order: 4 },
    { id: 'we', name: 'Wind Ensemble', order: 5 },
  ],
  aliases: [{ slug: 'so', match: ['symphony'] }, { slug: 'cam', match: ['camerata'] }, { slug: 'phil', match: ['philharmonic'] }],
  locations: [{ room: 'Recital Hall', label: 'Recital Hall' }],
};
const ok = (s: string, c: ParseContext = ctx) => {
  const r = parseDayChange(s, c);
  if (!r.ok) { fail(`"${s}" was refused: ${r.reason}`); return null; }
  return r;
};
const refused = (s: string, why: string, c: ParseContext = ctx) => {
  const r = parseDayChange(s, c);
  if (r.ok) fail(`"${s}" should be refused (${why}) but read as ${JSON.stringify(r.action)}`);
  else if (!r.reason) fail(`"${s}" refused with no reason to show`);
};

// ── 1. The four asked-for sentences, exact actions ─────────────────────
{
  const r = ok("Move Thursday's Symphony block to 3:30");
  if (r) {
    eq(r.date, '2026-11-05', '"Thursday\'s" reads as the coming Thursday');
    eq(r.action, { kind: 'move', id: 'so-thu', startTime: '15:30', endTime: '16:45', location: 'Orchestra Room' },
      'a bare 3:30 is the afternoon, the block keeps its length and its room');
  }
}
{
  const r = ok('Cancel Camerata today');
  if (r) {
    eq(r.date, '2026-11-03', '"today" is today');
    eq(r.action, { kind: 'cancel', ids: ['cam-tue'] }, 'cancel names one block — not the day');
  }
}
{
  const r = ok('Combine Philharmonic and Camerata on Friday');
  if (r) {
    eq(r.date, '2026-11-06', '"on Friday" reads as the coming Friday');
    eq(r.action, { kind: 'combine', hostId: 'ph-fri', absorbedIds: ['cam-fri'] }, 'combine: first named hosts, the other is absorbed');
  }
}
{
  const r = ok('Symphony is in the Recital Hall tomorrow');
  if (r) {
    eq(r.date, '2026-11-04', '"tomorrow" is tomorrow');
    eq(r.action, { kind: 'move', id: 'so-wed', startTime: '13:10', endTime: '14:25', location: 'Recital Hall' },
      'a room-only move keeps the time');
  }
}

// ── variations that should still read ──────────────────────────────────
{
  const r = ok('cancel cam');
  if (r) eq(r.action, { kind: 'cancel', ids: ['cam-tue'] }, 'a vanity slug names its group; no date = the day on screen');
  const r2 = ok('Combine Philharmonic and Camerata today in the Recital Hall at 2');
  if (r2) eq(r2.action, { kind: 'combine', hostId: 'ph-tue', absorbedIds: ['cam-tue'], startTime: '14:00', endTime: '15:15', location: 'Recital Hall' },
    'a combine can carry its own time and room');
  const r3 = ok('swap symphony and jazz tomorrow', { ...ctx, events: events.filter(e => e.id !== 'jz-wed-b') });
  if (r3) eq(r3.action, { kind: 'swap', aId: 'so-wed', bId: 'jz-wed-a' }, 'swap reads two blocks');
  const r4 = ok('Move Symphony Orchestra Thursday to 3:30-5');
  if (r4) eq(r4.action, { kind: 'move', id: 'so-thu', startTime: '15:30', endTime: '17:00', location: 'Orchestra Room' },
    'an explicit range sets both ends; a full name is one mention');
}

// ── 2. Refusals ────────────────────────────────────────────────────────
refused('Cancel Mariachi today', 'no such group');
refused('Cancel Jazz tomorrow', 'two Jazz blocks that day — never pick one');
refused('Cancel Wind Ensemble today', 'already cancelled, nothing live to cancel');
refused('Cancel the day', 'whole-day verbs stay on the campus-scoped chips');
refused('Back to normal', 'whole-day verbs stay on the campus-scoped chips');
refused('Symphony Thursday', 'nothing says what changes');
refused('Combine Camerata today', 'a combine needs two groups');
refused('Move Philharmonic and Camerata today to 4', 'a move is one block');
refused('Push Symphony to Thursday at 2', 'moving to another DAY is not a day change');
refused('Move Camerata to tomorrow', 'moving to another DAY is not a day change');
{
  const r = ok('Symphony now at 4pm Thursday');
  if (r) eq(r.action, { kind: 'move', id: 'so-thu', startTime: '16:00', endTime: '17:15', location: 'Orchestra Room' },
    '"now" is a word, not the clock — the written 4pm is the time');
}
refused('', 'empty');
refused('hello there', 'no group, no verb');

// ── 3. No model behind the seam ────────────────────────────────────────
if (DAY_CHANGE_MODEL_FALLBACK !== null) fail('the model fallback seam must stay empty until a provider is approved');

if (failures > 0) {
  console.error(`\ndayChangeParse selfcheck: ${failures} failure(s)`);
  process.exit(1);
}
console.log('dayChangeParse selfcheck: all checks passed');
