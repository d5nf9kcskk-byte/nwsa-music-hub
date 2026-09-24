/**
 * Pins movement-selection semantics for concerts (#pieceMovements):
 *   absent key  → whole work
 *   []          → none (director cleared "All movements")
 *   [i,…]       → those indices, in THAT order (performance order —
 *                  e.g. Carmen III, then I; never re-sorted into score order)
 */
import { eventPieceMovements, eventRestrictsMovements } from './utils.ts';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

const piece = {
  id: 'p1',
  movements: [
    { title: 'I' },
    { title: 'II' },
    { title: 'III' },
  ],
};

assert(eventPieceMovements({}, piece).length === 3, 'absent = all');
assert(!eventRestrictsMovements({}, piece), 'absent is not a restriction');

assert(eventPieceMovements({ pieceMovements: { p1: [] } }, piece).length === 0, 'empty = none');
assert(eventRestrictsMovements({ pieceMovements: { p1: [] } }, piece), 'empty restricts');

assert(
  eventPieceMovements({ pieceMovements: { p1: [0, 2] } }, piece).map(m => m.title).join('|') === 'I|III',
  'subset keeps order',
);
assert(eventRestrictsMovements({ pieceMovements: { p1: [0, 2] } }, piece), 'subset restricts');
assert(!eventRestrictsMovements({ pieceMovements: { p1: [0, 1, 2] } }, piece), 'full explicit list is not a restriction');

assert(
  eventPieceMovements({ pieceMovements: { p1: [2, 0] } }, piece).map(m => m.title).join('|') === 'III|I',
  'stored order is performance order',
);
assert(
  eventPieceMovements({ pieceMovements: { p1: [2, 0, 1] } }, piece).map(m => m.title).join('|') === 'III|I|II',
  'whole work reordered keeps the new order',
);
assert(!eventRestrictsMovements({ pieceMovements: { p1: [2, 0, 1] } }, piece), 'reordered whole work is not a subset');

console.log('pieceMovements.selfcheck: ok');
