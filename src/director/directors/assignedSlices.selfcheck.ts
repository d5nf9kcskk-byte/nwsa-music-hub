/**
 * Pins the two-controls-one-field split on the Directors screen. Run:
 *   npx tsx src/director/directors/assignedSlices.selfcheck.ts
 *
 * Every assertion here is a person's assignments quietly disappearing.
 * `assignedEnsembleIds` decides who is named on a class page, what the scoped
 * role shells show, and what arrives in someone's own calendar feed — and
 * nothing on screen tells a director that the picker they did not open just
 * dropped its half.
 */
import { splitAssigned, withClasses, withPerforming } from './assignedSlices.ts';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

const CLASSES = new Set(['ap-theory', 'masterclass-violin', 'college-forum']);
const PERFORMING = new Set(['symphony', 'camerata', 'jazz']);
const isClass = (id: string) => CLASSES.has(id);
const isPerforming = (id: string) => PERFORMING.has(id);
const split = (ids: string[]) => splitAssigned(ids, isClass, isPerforming);

// The case this module exists for: a director who conducts Symphony AND
// teaches AP Theory. Editing either picker must leave the other alone.
{
  const assigned = ['symphony', 'ap-theory'];
  const s = split(assigned);
  assert(withPerforming(s, ['symphony', 'camerata']).includes('ap-theory'),
    'editing the ensembles must not drop the class');
  assert(withClasses(s, ['ap-theory', 'college-forum']).includes('symphony'),
    'editing the classes must not drop the ensemble');
}

// Clearing one picker empties ONLY that slice.
{
  const s = split(['symphony', 'camerata', 'ap-theory']);
  assert(withPerforming(s, []).join() === 'ap-theory', 'clearing ensembles keeps the classes');
  assert(withClasses(s, []).sort().join() === 'camerata,symphony', 'clearing classes keeps the ensembles');
}

// An id belonging to neither list — a group renamed or deleted — survives
// both edits rather than being cleaned up by a screen nobody asked to clean.
{
  const s = split(['symphony', 'ap-theory', 'gone-group']);
  assert(s.other.join() === 'gone-group', 'an unknown id is its own slice');
  assert(withPerforming(s, []).includes('gone-group'), 'an unknown id survives an ensemble edit');
  assert(withClasses(s, []).includes('gone-group'), 'an unknown id survives a class edit');
}

// Lossless and duplicate-free: every id lands in exactly one slice.
{
  const assigned = ['symphony', 'ap-theory', 'gone-group', 'camerata', 'masterclass-violin'];
  const s = split(assigned);
  const all = [...s.performing, ...s.classes, ...s.other];
  assert(all.length === assigned.length, 'no id is lost splitting');
  assert(new Set(all).size === all.length, 'no id is in two slices');
  for (const id of assigned) assert(all.includes(id), `${id} fell out of every slice`);
  // A no-op edit round-trips to the same set.
  assert(withPerforming(s, s.performing).sort().join() === [...assigned].sort().join(),
    'replacing a slice with itself changes nothing');
}

// A master class is a CLASS, so it reaches the picker that can display it.
// If it landed in `performing`, the class picker would show it unticked while
// the field said otherwise, and the next save would drop it.
{
  const s = split(['masterclass-violin']);
  assert(s.classes.join() === 'masterclass-violin', 'a master class belongs to the class picker');
  assert(s.performing.length === 0, 'a master class is not also a performing assignment');
}

assert(split([]).performing.length === 0, 'an empty field splits into three empty slices');

console.log('assignedSlices.selfcheck: all assertions passed');
