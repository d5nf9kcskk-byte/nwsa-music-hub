/**
 * Pins what `Ensemble.kind` means (#classes). The whole point of the field is
 * that groups created before it existed keep working as performing ensembles,
 * and that master classes list WITH the classes while behaving differently
 * inside a meeting. Both promises are one-liners to break by accident.
 */
import {
  isClassGroup, isMasterClass, performingEnsembles, classGroups, musicEnsembles, groupKindLabel,
  highSchoolEnsembles, collegeEnsembles, highSchoolClasses, collegeClasses, collegeGroups,
} from './utils';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

const groups = [
  { name: 'Camerata' },                                    // legacy: no kind
  { name: 'Symphony Orchestra', kind: 'ensemble' as const },
  { name: 'Music Theory', kind: 'class' as const },
  { name: 'Violin Masterclass', kind: 'masterclass' as const },
  { name: 'Dance' },                                       // a school division
];

// Absent kind = performing ensemble. Every group that predates the field.
assert(!isClassGroup(groups[0]), 'no kind is an ensemble, not a class');
assert(performingEnsembles(groups).some(e => e.name === 'Camerata'), 'legacy group still performs');

// Both class kinds list together…
assert(isClassGroup(groups[2]) && isClassGroup(groups[3]), 'theory and masterclass are both classes');
assert(classGroups(groups).map(e => e.name).join('|') === 'Music Theory|Violin Masterclass', 'classes list together');

// …but only a master class asks for performers instead of a unit.
assert(!isMasterClass(groups[2]), 'a theory class is not a master class');
assert(isMasterClass(groups[3]), 'a master class is');

// Classes never land in an ensemble-only list, divisions never land in either.
assert(!performingEnsembles(groups).some(isClassGroup), 'no class in the performing list');
assert(!performingEnsembles(groups).some(e => e.name === 'Dance'), 'no division in the performing list');
assert(!classGroups(groups).some(e => e.name === 'Dance'), 'no division in the class list');

// musicEnsembles stays the wider "not a division" list both are built on.
assert(musicEnsembles(groups).length === 4, 'musicEnsembles still includes classes');

// groupKindLabel is the ONE spelling of what a class is — the director's
// list and the public class list both read it, so a college master class can
// never be "college masterclass" on one screen and "master class" on the other.
assert(groupKindLabel({ name: 'Camerata' } as never) === '', 'an ensemble has no kind label');
assert(groupKindLabel(groups[2]) === 'class', 'a theory section reads "class"');
assert(groupKindLabel(groups[3]) === 'master class', 'a master class reads "master class"');
assert(
  groupKindLabel({ kind: 'class', collegeLevel: true }) === 'college class',
  'a dual-enrollment course reads "college class"',
);
assert(
  groupKindLabel({ kind: 'masterclass', collegeLevel: true }) === 'college master class',
  'both flags compose',
);
assert(
  groupKindLabel({ kind: 'ensemble', collegeLevel: true }) === 'college ensemble',
  'college flag labels a performing ensemble',
);

const withCollege = [
  { name: 'Symphony', kind: 'ensemble' as const },
  { name: 'College Chamber', kind: 'ensemble' as const, collegeLevel: true },
  { name: 'AP Theory', kind: 'class' as const },
  { name: 'Class Piano 1', kind: 'class' as const, collegeLevel: true },
];
assert(highSchoolEnsembles(withCollege).map(e => e.name).join('|') === 'Symphony', 'HS ensembles drop college');
assert(collegeEnsembles(withCollege).map(e => e.name).join('|') === 'College Chamber', 'college ensembles only');
assert(highSchoolClasses(withCollege).map(e => e.name).join('|') === 'AP Theory', 'HS classes drop college');
assert(collegeClasses(withCollege).map(e => e.name).join('|') === 'Class Piano 1', 'college classes only');
assert(collegeGroups(withCollege).length === 2, 'collegeGroups is ensembles + classes');

console.log('groupKind.selfcheck: ok');
