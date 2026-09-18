import type { Ensemble } from './types';
import {
  classGroups, collegeClasses, collegeEnsembles, highSchoolClasses,
  highSchoolEnsembles, isMasterClass,
} from './utils';

/**
 * How a list of groups is split into headed sections for `GroupPicker`
 * (#group-picker). Its own module so the self-check can import it without a
 * component, and because a non-component export in the .tsx trips
 * `react-refresh/only-export-components`.
 *
 * **It buckets exactly what it is handed and never filters.** That is the
 * whole contract, and it is not cosmetic: the Event form deliberately offers
 * Dance, Theater and Visual Arts — the calendar covers every division — while
 * the roster and repertoire forms hand over `musicEnsembles(...)` and never
 * want them. A picker that decided for itself would have quietly dropped
 * three divisions off the Event form the day it was swapped in. Deciding
 * WHICH groups a screen offers stays with the screen; this only decides what
 * order they read in.
 *
 * Anything that matches no named bucket still comes out, in a trailing one,
 * so a group can never be handed in and silently not offered.
 */
export interface GroupBucket {
  label: string;
  groups: Ensemble[];
}

export function groupBuckets(groups: Ensemble[]): GroupBucket[] {
  const list = [...groups].sort((a, b) => a.order - b.order);
  const classes = classGroups(list);
  // `utils.ts` owns every predicate here — no second answer to "is it a
  // class" lives in this file (#classes). Master classes are lifted out of
  // the two class buckets rather than listed twice.
  const named: GroupBucket[] = [
    { label: 'Ensembles',         groups: highSchoolEnsembles(list) },
    { label: 'Master classes',    groups: classes.filter(isMasterClass) },
    { label: 'Classes',           groups: highSchoolClasses(list).filter(e => !isMasterClass(e)) },
    { label: 'College ensembles', groups: collegeEnsembles(list) },
    { label: 'College classes',   groups: collegeClasses(list).filter(e => !isMasterClass(e)) },
  ];
  const placed = new Set(named.flatMap(b => b.groups.map(e => e.id)));
  return [
    ...named,
    // Divisions (Dance, Theater, Visual Arts) land here, and so would any
    // future kind nobody remembered to give a heading.
    { label: 'Other divisions', groups: list.filter(e => !placed.has(e.id)) },
  ].filter(b => b.groups.length > 0);
}
