/**
 * Resolving which ensembles/classes a director is assigned to (#roles).
 * Explicit ids live on `assignedEnsembleIds`; name patterns (e.g. every
 * Jazz Combo) live on `assignedEnsemblePatterns` and are expanded at read
 * time so new combos join automatically.
 */
import type { Ensemble } from './types';

/** Matches "Jazz Combo", "Jazz Combo #1", "jazz combo #2", etc. */
export const JAZZ_COMBO_NAME_PATTERN = '^jazz\\s*combo';

export type DirectorAssignmentFields = {
  assignedEnsembleIds?: string[];
  assignedEnsemblePatterns?: string[];
};

export function resolveAssignedEnsembleIds(
  d: DirectorAssignmentFields | undefined | null,
  ensembles: Pick<Ensemble, 'id' | 'name'>[],
): string[] {
  const ids = new Set(d?.assignedEnsembleIds ?? []);
  for (const pat of d?.assignedEnsemblePatterns ?? []) {
    let re: RegExp;
    try {
      re = new RegExp(pat, 'i');
    } catch {
      continue;
    }
    for (const e of ensembles) {
      if (re.test(e.name)) ids.add(e.id);
    }
  }
  return [...ids];
}

export function hasJazzComboPattern(d: DirectorAssignmentFields | undefined | null): boolean {
  return (d?.assignedEnsemblePatterns ?? []).includes(JAZZ_COMBO_NAME_PATTERN);
}

export function assignmentSummary(
  d: DirectorAssignmentFields | undefined | null,
  ensembles: Pick<Ensemble, 'id' | 'name'>[],
): string {
  const byId = Object.fromEntries(ensembles.map(e => [e.id, e.name]));
  const names = resolveAssignedEnsembleIds(d, ensembles).map(id => byId[id] ?? id);
  if ((d?.assignedEnsemblePatterns ?? []).length && !names.length) {
    return 'Jazz Combos (pattern)';
  }
  return names.join(', ');
}
