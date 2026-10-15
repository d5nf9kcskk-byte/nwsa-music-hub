/**
 * Pins part books on a concert (#part-books, src/shared/partBooks.ts):
 *   1. Blank rows never render, order is kept, and an event with neither books
 *      nor a folder shows nothing (every event that predates the field).
 *   2. A student's own book comes from the SAME matcher as a piece's own part:
 *      an exact label wins ("Bass" is never handed the Bassoon book), a bare
 *      "Violin" gets what it gets on a piece, and an instrument with no book
 *      gets none rather than a neighbour's.
 *   3. Only a performer is offered a book of their own: an ensemble that is
 *      only required to ATTEND does not make a student a player.
 */
/// <reference types="node" />
import { partBooksOf, hasPartBooks, myPartBook, performsOn } from './partBooks';
import { findPartForInstrument } from '../director/utils';
import type { CalendarEvent, PiecePartLink } from '../director/types';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

const url = (s: string) => `https://drive.google.com/file/d/${s}/view`;
const books: PiecePartLink[] = [
  'Flute', 'Oboe', 'Clarinet', 'Bassoon', 'Tenor Saxophone', 'Trumpet', 'Tenor Trombone', 'Bass Trombone',
  'Percussion 1', 'Percussion 2', 'Harp', 'Piano', 'Violin I', 'Violin II', 'Viola', 'Cello', 'Bass',
].map(instrument => ({ instrument, url: url(instrument.toLowerCase().replace(/\s+/g, '-')) }));

const CCO = 'college-chamber-orchestra', SYM = 'symphony-orchestra';
const concert = {
  id: 'oc26', type: 'Concert', date: '2026-10-26', status: 'Scheduled',
  ensembleIds: [CCO], attendanceEnsembleIds: [SYM], studentIds: ['soloist'],
  partBooks: [...books, { instrument: '  ', url: url('blank') }, { instrument: 'Guitar', url: '' }],
  partBooksSharedUrl: 'https://drive.google.com/drive/folders/abc',
} as CalendarEvent;

// 1. Blank rows drop, order holds; nothing at all reads as no books.
const shown = partBooksOf(concert);
assert(shown.length === books.length, `blank rows dropped (${shown.length})`);
assert(shown.map(b => b.instrument).join('|') === books.map(b => b.instrument).join('|'), 'stored order kept');
assert(hasPartBooks(concert), 'books show');
assert(!hasPartBooks({}), 'an event that predates the field shows nothing');
assert(!hasPartBooks({ partBooks: [], partBooksSharedUrl: '  ' }), 'cleared books show nothing');
assert(hasPartBooks({ partBooks: [], partBooksSharedUrl: 'https://drive.google.com/drive/folders/x' }),
  'a folder alone is still something to show');

// 2. The same matcher as a piece's own part.
const asPiece = { partsLinks: books };
for (const instr of ['Flute', 'Bass', 'Bassoon', 'Violin', 'Viola', 'Cello', 'Saxophone', 'Trombone', 'Percussion', 'Piano']) {
  assert(myPartBook(concert, instr)?.instrument === findPartForInstrument(asPiece, instr)?.instrument,
    `${instr}: book and part matcher agree`);
}
assert(myPartBook(concert, 'Bass')?.instrument === 'Bass', 'exact label wins over Bassoon');
assert(myPartBook(concert, 'Bassoon')?.instrument === 'Bassoon', 'bassoon gets the bassoon book');
assert(myPartBook(concert, 'Saxophone')?.instrument === 'Tenor Saxophone', 'saxophone finds the tenor sax book');
assert(myPartBook(concert, 'Violin II')?.instrument === 'Violin II', 'second violin never gets the first violin book');
assert(myPartBook(concert, 'Guitar') === undefined, 'no book for an instrument with none, and a blank-link row is no book');
assert(myPartBook(concert, undefined) === undefined, 'no instrument, no book');

// 3. Only a performer gets their own.
assert(performsOn(concert, { id: 'a', ensembleIds: [CCO] }), 'an ensemble member plays');
assert(performsOn(concert, { id: 'soloist', ensembleIds: [] }), 'a named performer plays');
assert(!performsOn(concert, { id: 'b', ensembleIds: [SYM] }), 'required to attend is not playing');
assert(!performsOn(concert, null), 'nobody saved, nobody playing');

console.log('partBooks self-check: OK');
