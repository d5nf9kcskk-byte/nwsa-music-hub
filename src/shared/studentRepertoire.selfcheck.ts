// Pins #student-repertoire: a student's practice list holds only what they PLAY.
// Run: npx tsx --import ./scripts/vite-defines-shim.mjs src/shared/studentRepertoire.selfcheck.ts
import assert from 'node:assert/strict';
import type { CalendarEvent, RepertoirePiece, SeatingChart } from '../director/types';
import { studentEventPieces } from './studentRepertoire';

const piece = (id: string, ensembleIds: string[], extra: Partial<RepertoirePiece> = {}) =>
  ({ id, title: id, ensembleIds, order: 0, ...extra }) as RepertoirePiece;
const piecesById = Object.fromEntries([
  piece('nutcracker', ['symphony']),
  piece('souvenir', ['chamber']),
  piece('anthem', []),
  piece('mozart', ['symphony']),
  piece('linked', ['chamber'], { eventIds: ['c1'] }),
].map(p => [p.id, p]));
const concert = {
  id: 'c1', date: '2026-10-01', type: 'Concert', ensembleIds: ['symphony', 'chamber'],
  pieceIds: ['nutcracker', 'souvenir', 'anthem', 'mozart'],
} as unknown as CalendarEvent;
const ids = (xs: RepertoirePiece[]) => xs.map(p => p.id).sort();

// 1. Audience only: nothing — the reported bug.
assert.deepEqual(studentEventPieces('ava', concert, { expected: true, attendanceOnly: true, ensembleIds: ['chamber'] }, piecesById), []);
// Not on the event at all: nothing.
assert.deepEqual(studentEventPieces('ava', concert, { expected: false, attendanceOnly: false, ensembleIds: [] }, piecesById), []);

// 2. Shared program: only their ensemble's works (+ works naming no ensemble).
assert.deepEqual(ids(studentEventPieces('ava', concert, { expected: true, attendanceOnly: false, ensembleIds: ['symphony'] }, piecesById)),
  ['anthem', 'mozart', 'nutcracker']);
// Linked from the piece side (eventIds) is judged the same way.
assert.deepEqual(ids(studentEventPieces('ava', concert, { expected: true, attendanceOnly: false, ensembleIds: ['chamber'] }, piecesById)),
  ['anthem', 'linked', 'souvenir']);

// 3. A named performer (soloist) is never trimmed.
const solo = { ...concert, studentIds: ['ava'] } as CalendarEvent;
assert.equal(studentEventPieces('ava', solo, { expected: true, attendanceOnly: false, ensembleIds: ['symphony'] }, piecesById).length, 5);

// 4. Per-work personnel: a chart for the Mozart that does not seat them drops it.
const chart = (seated: string[]) => ({
  id: 'ch', ensembleId: 'symphony', pieceIds: ['mozart'], createdAt: 1,
  sections: [{ section: 'Winds', seats: seated.map(studentId => ({ studentId })) }],
}) as SeatingChart;
const exp = { expected: true, attendanceOnly: false, ensembleIds: ['symphony'] };
assert.ok(!ids(studentEventPieces('ava', concert, exp, piecesById, [chart(['ben'])])).includes('mozart'));
assert.ok(ids(studentEventPieces('ava', concert, exp, piecesById, [chart(['ava'])])).includes('mozart'));

console.log('studentRepertoire self-check: ok');
