/**
 * Pins the group picker's sections (#group-picker). Run:
 *   npx tsx --import ./scripts/vite-defines-shim.mjs src/director/groupBuckets.selfcheck.ts
 *
 * The promise that matters is LOSSLESSNESS. This picker replaced a plain
 * `list.map(...)` on eight screens, each of which hands it a different subset
 * on purpose — the Event form offers Dance, Theater and Visual Arts because
 * the calendar covers every division; the roster and repertoire forms hand
 * over music groups only. A picker that filtered for itself, or that had no
 * heading for something, would drop those groups off the form in silence:
 * nothing throws, nothing fails to build, the group is simply un-pickable and
 * whoever needed it assumes the Hub cannot do it.
 */
import { groupBuckets } from './groupBuckets.ts';
import type { Ensemble } from './types.ts';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

let n = 0;
const g = (name: string, extra: Partial<Ensemble> = {}): Ensemble =>
  ({ id: `g${++n}`, name, order: n, ...extra }) as Ensemble;

const SYMPHONY = g('Symphony Orchestra');
const CAMERATA = g('Camerata String Orchestra');
const VIOLIN_MC = g('Violin Masterclass', { kind: 'masterclass' });
const AP_THEORY = g('AP Theory', { kind: 'class' });
const COLLEGE_ORCH = g('College Chamber Orchestra', { collegeLevel: true });
const OPERA_WORKSHOP = g('Opera Workshop / Theater', { kind: 'class', collegeLevel: true });
const COLLEGE_MC = g('College Cello Masterclass', { kind: 'masterclass', collegeLevel: true });
const DANCE = g('Dance');
const THEATRE = g('Theatre');
const VISUAL = g('Visual Arts');

const ALL = [SYMPHONY, CAMERATA, VIOLIN_MC, AP_THEORY, COLLEGE_ORCH,
  OPERA_WORKSHOP, COLLEGE_MC, DANCE, THEATRE, VISUAL];

const flat = (bs: ReturnType<typeof groupBuckets>) => bs.flatMap(b => b.groups.map(e => e.id));
const labelOf = (bs: ReturnType<typeof groupBuckets>, e: Ensemble) =>
  bs.find(b => b.groups.some(x => x.id === e.id))?.label;

// ── Nothing handed in is ever dropped, and nothing is listed twice ──
{
  const bs = groupBuckets(ALL);
  const ids = flat(bs);
  assert(ids.length === ALL.length, `every group is offered — got ${ids.length} of ${ALL.length}`);
  assert(new Set(ids).size === ids.length, 'no group appears in two buckets');
  for (const e of ALL) assert(ids.includes(e.id), `${e.name} fell out of every bucket`);
}

// The case that would have regressed the Event form: divisions come back.
{
  const bs = groupBuckets(ALL);
  for (const d of [DANCE, THEATRE, VISUAL]) {
    assert(labelOf(bs, d) === 'Other divisions', `${d.name} must still be offered`);
  }
}

// ── Each kind reads under its own heading ──
{
  const bs = groupBuckets(ALL);
  assert(labelOf(bs, SYMPHONY) === 'Ensembles', 'a performing group is an Ensemble');
  assert(labelOf(bs, VIOLIN_MC) === 'Master classes', 'a master class is not a plain class');
  assert(labelOf(bs, AP_THEORY) === 'Classes', 'a theory section is a Class');
  assert(labelOf(bs, COLLEGE_ORCH) === 'College ensembles', 'college flag splits the ensembles');
  assert(labelOf(bs, OPERA_WORKSHOP) === 'College classes', 'Opera Workshop is a college class');
  // A college master class is a master class FIRST — listing it under both
  // would put the same checkbox on screen twice, and two checkboxes for one
  // id disagree the moment one is ticked.
  assert(labelOf(bs, COLLEGE_MC) === 'Master classes', 'a college master class is listed once');
}

// ── A caller that filters first gets only what it passed ──
{
  const bs = groupBuckets([SYMPHONY, CAMERATA]);
  assert(bs.length === 1 && bs[0].label === 'Ensembles', 'empty buckets are not rendered');
  assert(flat(bs).length === 2, 'a narrowed list is not widened back out');
}

// ── Order: the caller's own `order`, not the bucket's arrival order ──
{
  const bs = groupBuckets([
    { ...SYMPHONY, order: 9 } as Ensemble,
    { ...CAMERATA, order: 1 } as Ensemble,
  ]);
  assert(bs[0].groups[0].name === 'Camerata String Orchestra', 'sorted by the group order field');
}

// An empty list renders no headings at all rather than six empty ones.
assert(groupBuckets([]).length === 0, 'no groups means no buckets');

console.log('groupBuckets.selfcheck: all assertions passed');
