import { ACADEMIC_CLASSES, academicClassIdForTitle } from './academicClasses.ts';
import { theoryClassTitleFor } from './classSchedule.ts';

const assert = (ok: boolean, msg: string) => { if (!ok) throw new Error(msg); };

assert(ACADEMIC_CLASSES.length === 7, 'seven academic classes');
assert(academicClassIdForTitle('Theory — 9th Grade') === 'class-theory-9', 'theory 9 id');
assert(academicClassIdForTitle('String Masterclass') === undefined, 'masterclass not in academic list');

const theoryTitle = theoryClassTitleFor({ grade: '9th', ensembleIds: ['wind-ensemble'] });
assert(theoryTitle !== null, 'theory title');
assert(academicClassIdForTitle(theoryTitle!) === 'class-theory-9', 'theory title maps to group id');

console.log('academicClasses.selfcheck: ok');
