/**
 * Pins the jury running-order rules (#juries). Run in deploy.yml.
 *
 * What must not regress: adding a roster never disturbs an order a director
 * already sequenced, an inactive student never lands in a jury, the same
 * student added twice appears once, and a sort never silently drops an id
 * whose student record is gone.
 *
 * No org import, so no defines shim needed:
 *   npx tsx src/director/juries/runningOrder.selfcheck.ts
 */
import { appendInScoreOrder, sortIntoScoreOrder, bySection } from './runningOrder';
import type { Student } from '../types';

// Own assert, like groupKind.selfcheck.ts — `src/` is typechecked by the app
// build, which has no node types.
function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}
const eq = (a: unknown, b: unknown, msg: string) =>
  assert(JSON.stringify(a) === JSON.stringify(b), `${msg} — got ${JSON.stringify(a)}`);

const s = (id: string, name: string, instrument: string, status: Student['status'] = 'Active') =>
  ({ id, name, instrument, status, ensembleIds: [] }) as unknown as Student;

const flute = s('f', 'Ana Flute', 'Flute');
const horn = s('h', 'Bo Horn', 'Horn');
const violin = s('v', 'Cy Violin', 'Violin');
const cello = s('c', 'Dee Cello', 'Cello');
const gone = s('x', 'Ex Student', 'Viola', 'Inactive');

// Score order: winds before brass before strings; violin before cello.
const sorted = [cello, violin, horn, flute].sort(bySection).map(x => x.id).join('');
assert(sorted === 'fhvc', `score order, got ${sorted}`);

// A hand-sequenced prefix survives a bulk add — the new names go after it.
const kept = appendInScoreOrder(['c', 'v'], [flute, horn, violin, cello]);
eq(kept, ['c', 'v', 'f', 'h'], 'existing order is never reshuffled by an add');

// Inactive students never enter a jury, and a doubly-offered student lands once.
const clean = appendInScoreOrder([], [violin, gone, violin, flute]);
eq(clean, ['f', 'v'], 'inactive dropped, duplicate collapsed');

// Sorting keeps every id: a student whose record is gone goes to the end,
// rather than disappearing from a jury the director already built.
const byId: Record<string, Student> = { f: flute, h: horn, v: violin };
const resorted = sortIntoScoreOrder(['v', 'ghost', 'h', 'f'], byId);
eq(resorted, ['f', 'h', 'v', 'ghost'], 'sort loses nobody');

// The stub stays a stub: none of this invents a time, a room, or a score.
eq(appendInScoreOrder([], []), [], 'an empty jury stays empty');

console.log('runningOrder.selfcheck: ok');
