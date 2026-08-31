/**
 * Runnable self-check: npx tsx src/shared/concertDayBanner.selfcheck.ts
 */
import { concertsToday, repertoireLine, showCheckinLink } from './concertToday.ts';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const events = [
  { id: '1', type: 'Concert', date: '2026-08-31', status: undefined },
  { id: '2', type: 'Concert', date: '2026-08-31', status: 'Cancelled' },
  { id: '3', type: 'Concert', date: '2026-09-01', status: undefined },
  { id: '4', type: 'Rehearsal', date: '2026-08-31', status: undefined },
];

const today = concertsToday(events, '2026-08-31');
assert(today.length === 1 && today[0].id === '1', 'only today\'s non-cancelled concert');

assert(showCheckinLink({ concertAttendance: 'required', checkin: { enabled: true } }), 'required + enabled shows link');
assert(!showCheckinLink({ concertAttendance: 'required', checkin: { enabled: false } }), 'required but station off hides link');
assert(!showCheckinLink({ concertAttendance: 'optional', checkin: { enabled: true } }), 'optional never shows link');
assert(!showCheckinLink({ checkin: { enabled: true } }), 'untracked never shows link');

const pieceById = (id: string) =>
  ({ p1: { title: 'Rip Van Winkle', composer: 'Nazareth' }, p2: { title: 'Untitled' } } as Record<string, { title: string; composer?: string }>)[id];

assert(repertoireLine({ repertoire: 'bars 40–90', pieceIds: ['p1', 'p2'] }, pieceById)
  === 'bars 40–90 · Rip Van Winkle — Nazareth · Untitled', 'joins free text and pieces');
assert(repertoireLine({}, pieceById) === '', 'empty when nothing set');
assert(repertoireLine({ pieceIds: ['missing'] }, pieceById) === '', 'drops unresolved piece ids');

console.log('concertToday.selfcheck: ok');
