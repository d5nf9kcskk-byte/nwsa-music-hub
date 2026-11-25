/**
 * Runnable self-check:
 *   npx tsx --tsconfig tsconfig.app.json src/director/personnel/concertRoster.selfcheck.ts
 *
 * Pins the Personnel screen's arithmetic (docs/aiso-personnel-screen.md):
 * the concert's own section order wins, chairs are counted and never stored,
 * a seatless section stays seatless, a voided contract takes a player off the
 * concert, a name in the Email column is not an address, the importer's
 * taxpayer-id guard refuses a typed value, and parts follow section and seat.
 * Everyone here is invented.
 */
import { sectionCards, fillLabel, isOpen, nextSeat, contractFor, usualFeeCents, usableEmail, partsFor } from './concertRoster.ts';
import { refusedCell } from './importPlan.ts';
import type { Contract, Personnel } from '../types.ts';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const p = (id: string, section?: string, seat?: number): Personnel => ({ id, name: `Player, ${id}`, section, seat, status: 'Contracted' });
const people = [p('a', 'Violin 1', 2), p('b', 'Violin 1', 1), p('c', 'Flute', 1), p('d', 'Percussion'), p('e')];

// 1. Stored order wins; unlisted sections follow in score order; the seatless close the list.
const cards = sectionCards(people, [{ name: 'Violin 1', needed: 12 }, { name: 'Viola', needed: 6 }]);
assert(cards.map(c => c.name).join('|') === 'Violin 1|Viola|Flute|Percussion|', `order: ${cards.map(c => c.name).join('|')}`);
assert(cards[0].people.map(x => x.id).join() === 'b,a', 'seats sort inside a section');
assert(fillLabel(cards[0]) === '2/12' && isOpen(cards[0]), 'counted, open');
assert(fillLabel(cards[2]) === '1 seated · chairs needed not set' && !isOpen(cards[2]), 'no count is not open');
assert(fillLabel({ name: 'Tuba', needed: 1, people: [p('x'), p('y')] }) === '2/1 · 1 over', 'over');
assert(!isOpen(cards[4]), 'the unsectioned card has no chairs');

// 2. Nothing stored: the roster's sections join, empty, in score order (Flute before Violin).
const fresh = sectionCards([], undefined, ['Violin 1', 'Flute', 'violin 1 ']);
assert(fresh.map(c => c.name.toLowerCase()).join('|') === 'flute|violin 1', `fresh: ${fresh.map(c => c.name).join('|')}`);
assert(sectionCards([], [{ name: 'Harp' }], ['Flute']).length === 1, 'stored sections replace the roster default');

// 3. Seats.
assert(nextSeat([]) === 1 && nextSeat([p('a', 'V', 3), p('b', 'V', 1)]) === 4, 'next seat');
assert(nextSeat([p('d', 'Percussion')]) === undefined, 'percussion stays seatless');

// 4. This concert's contract: live, calling them, newest.
const concert = { id: 'nyc', date: '2027-01-03', ensembleIds: ['orch'], pieceIds: ['w', 'm'] };
const k = (id: string, extra: Partial<Contract>): Contract => ({
  id, personnelId: 'a', personnelName: 'Player, a', category: 'chair', position: 'Section',
  baseRateCents: 25000, baseRateBasis: 'flat', status: 'Draft', ...extra,
});
const contracts = [
  k('old', { eventIds: ['nyc'], status: 'Void', createdAt: 3 }),
  k('season', { ensembleIds: ['orch'], startDate: '2026-09-01', endDate: '2027-05-31', createdAt: 1 }),
  k('other', { eventIds: ['spring'], createdAt: 4 }),
];
assert(contractFor(contracts, concert, 'a')?.id === 'season', 'a season contract covers the concert; void and other concerts do not');
assert(contractFor(contracts.slice(0, 1), concert, 'a') === undefined, 'voided = off the concert');
assert(usualFeeCents([k('1', {}), k('2', {}), k('3', { baseRateCents: 32000 })]) === 25000, 'usual fee');

// 5. A name in the Email column, and the guard.
assert(usableEmail('ada.whitlock@example.org') && !usableEmail('Ada Whitlock') && !usableEmail(''), 'usable email');
assert(refusedCell('123-45-6789') && refusedCell('12-3456789') && !refusedCell('555-0100') && !refusedCell('@ada'), 'tax-id guard');

// 6. Parts follow section and seat, in program order.
const pieces = [
  { id: 'm', title: 'March', memberParts: [{ label: 'Violins I', role: 'part' as const, path: '', sha256: '' }, { label: 'Flute 2', role: 'part' as const, path: '', sha256: '' }] },
  { id: 'w', title: 'Waltz', memberParts: [{ label: 'Score', role: 'score' as const, path: '', sha256: '' }, { label: 'Violins I', role: 'part' as const, path: '', sha256: '' }] },
  { id: 'z', title: 'Not on it', memberParts: [{ label: 'Violins I', role: 'part' as const, path: '', sha256: '' }] },
];
assert(partsFor(pieces, concert, { section: 'Violin 1', seat: 3 }).map(x => x.piece).join() === 'Waltz,March', 'violin parts, program order');
assert(partsFor(pieces, concert, { section: 'Flute', seat: 2 }).map(x => x.label).join() === 'Flute 2', 'flute 2 by seat');
assert(partsFor(pieces, concert, { section: 'Flute', seat: 1 }).length === 0, 'flute 1 gets no flute 2 part');

console.log('concertRoster self-check: all pass');
