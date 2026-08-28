/**
 * Run: npx tsx src/director/directorAssignments.selfcheck.ts
 */
import {
  JAZZ_COMBO_NAME_PATTERN,
  hasJazzComboPattern,
  resolveAssignedEnsembleIds,
} from './directorAssignments';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const ensembles = [
  { id: 'jazz-ensemble', name: 'Jazz Ensemble' },
  { id: 'jc1', name: 'Jazz Combo #1' },
  { id: 'jc2', name: 'Jazz Combo #2' },
  { id: 'we', name: 'Wind Ensemble' },
];

assert(
  JSON.stringify(resolveAssignedEnsembleIds({ assignedEnsembleIds: ['we'] }, ensembles)) === '["we"]',
  'explicit ids',
);
assert(
  resolveAssignedEnsembleIds({
    assignedEnsembleIds: ['jazz-ensemble'],
    assignedEnsemblePatterns: [JAZZ_COMBO_NAME_PATTERN],
  }, ensembles).sort().join(',') === 'jazz-ensemble,jc1,jc2',
  'pattern picks up all jazz combos',
);
assert(hasJazzComboPattern({ assignedEnsemblePatterns: [JAZZ_COMBO_NAME_PATTERN] }), 'has jazz pattern');

console.log('directorAssignments.selfcheck.ts: ok');
