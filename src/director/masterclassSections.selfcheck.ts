import { MASTERCLASS_SECTIONS, masterclassIdForTitle } from './masterclassSections.ts';

const assert = (ok: boolean, msg: string) => { if (!ok) throw new Error(msg); };

assert(MASTERCLASS_SECTIONS.length === 4, 'four string sections');
assert(MASTERCLASS_SECTIONS.every(s => s.id.startsWith('masterclass-')), 'ids use masterclass- prefix');
assert(masterclassIdForTitle('Violin Masterclass') === 'masterclass-violin', 'title → id');
assert(MASTERCLASS_SECTIONS.every(s => s.days.includes(2)), 'Tuesday sections');

console.log('masterclassSections.selfcheck: ok');
