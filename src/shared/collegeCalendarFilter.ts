import type { Ensemble } from '../director/types';
import { collegeClasses, collegeEnsembles, collegeGroups } from '../director/utils';

/** Calendar filter presets for college ensembles / classes / both. */
export type CollegeFilterPreset = 'ensembles' | 'classes' | 'all';

export function collegeFilterIds(
  ensembles: Pick<Ensemble, 'id' | 'name' | 'kind' | 'collegeLevel'>[],
  preset: CollegeFilterPreset,
): string[] {
  const list =
    preset === 'ensembles' ? collegeEnsembles(ensembles)
    : preset === 'classes' ? collegeClasses(ensembles)
    : collegeGroups(ensembles);
  return list.map(e => e.id).sort();
}

export function activeCollegePreset(
  selected: string[],
  ensembles: Pick<Ensemble, 'id' | 'name' | 'kind' | 'collegeLevel'>[],
): CollegeFilterPreset | null {
  if (selected.length === 0) return null;
  const sorted = [...selected].sort().join(',');
  for (const p of ['ensembles', 'classes', 'all'] as const) {
    if (collegeFilterIds(ensembles, p).join(',') === sorted) return p;
  }
  return null;
}
