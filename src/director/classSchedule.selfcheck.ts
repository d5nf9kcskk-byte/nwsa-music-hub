import { academicClassTitlesFor, theoryClassTitleFor, isChoirClassTitle } from './classSchedule.ts';

const assert = (ok: boolean, msg: string) => { if (!ok) throw new Error(msg); };

assert(theoryClassTitleFor({ grade: '9th', ensembleIds: ['wind-ensemble'] }) === 'Theory — 9th Grade', '9th');
assert(theoryClassTitleFor({ grade: '10th', ensembleIds: [] }) === 'Theory — 10th Grade', '10th');
assert(theoryClassTitleFor({ grade: '11th', ensembleIds: ['symphony-orchestra'] }) === 'Music History — 11th–12th', '11th');
assert(theoryClassTitleFor({ grade: '12th', ensembleIds: [] }) === 'Music History — 11th–12th', '12th afternoon');
assert(
  theoryClassTitleFor({ grade: '10th', ensembleIds: ['jazz-ensemble', 'wind-ensemble'] }) === 'Jazz Theory',
  'jazz overrides grade',
);
assert(theoryClassTitleFor({ grade: '', ensembleIds: [] }) === null, 'no grade');
assert(isChoirClassTitle('Vocal Lit') && isChoirClassTitle('Vocal Forum'), 'choir classes');
assert(!isChoirClassTitle('AP Theory'), 'not choir');

const twelfth = academicClassTitlesFor({ grade: '12th', ensembleIds: ['symphony-orchestra'] });
assert(twelfth.includes('AP Theory') && twelfth.includes('Music History — 11th–12th'), '12th AP + history');
assert(!academicClassTitlesFor({ grade: '11th', ensembleIds: [] }).includes('AP Theory'), '11th not AP');

console.log('classSchedule.selfcheck: ok');
