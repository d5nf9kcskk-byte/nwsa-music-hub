import { MASTERCLASS_SECTIONS, masterclassIdForTitle, masterclassSectionFor } from './masterclassSections.ts';

const assert = (ok: boolean, msg: string) => { if (!ok) throw new Error(msg); };

assert(MASTERCLASS_SECTIONS.length === 4, 'four string sections');
assert(MASTERCLASS_SECTIONS.every(s => s.id.startsWith('masterclass-')), 'ids use masterclass- prefix');
assert(masterclassIdForTitle('Violin Masterclass') === 'masterclass-violin', 'title → id');
assert(MASTERCLASS_SECTIONS.every(s => s.days.includes(2)), 'Tuesday sections');

// Enrollment is by instrument AND grade. Both seeders (the in-app setup and
// the seed-masterclass workflow) go through masterclassSectionFor, so these
// pin what either one will do to a roster.
assert(masterclassSectionFor({ instrument: 'Viola', grade: '10th' })?.id === 'masterclass-viola',
  'a high school violist lands in the viola section');
assert(masterclassSectionFor({ instrument: 'Violin', grade: '9th' })?.id === 'masterclass-violin',
  'every high school grade label works, 9th included');
for (const grade of ['College', 'College Freshman', 'College Sophomore', 'College Junior', 'College Senior']) {
  assert(masterclassSectionFor({ instrument: 'Viola', grade }) === undefined,
    `${grade} violist stays out of the high school master class`);
}
// Fails CLOSED: an unfamiliar or missing grade is not swept in.
assert(masterclassSectionFor({ instrument: 'Cello', grade: '' }) === undefined, 'blank grade stays out');
assert(masterclassSectionFor({ instrument: 'Cello' }) === undefined, 'missing grade stays out');
assert(masterclassSectionFor({ instrument: 'Cello', grade: 'Graduate' }) === undefined, 'unknown grade stays out');
// Grade labels vary on the roster; the leading digit is what counts.
assert(masterclassSectionFor({ instrument: 'Bass', grade: '12' })?.id === 'masterclass-bass', 'bare "12"');
assert(masterclassSectionFor({ instrument: 'Bass', grade: '12th Grade' })?.id === 'masterclass-bass', '"12th Grade"');
// Non-string players are in no section, whatever their grade.
assert(masterclassSectionFor({ instrument: 'Bassoon', grade: '11th' }) === undefined, 'Bassoon is not Bass');

console.log('masterclassSections.selfcheck: ok');
