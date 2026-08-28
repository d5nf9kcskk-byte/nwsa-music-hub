import { studentMatchesQuery, studentSearchFields } from './studentSearch.ts';

const assert = (ok: boolean, msg: string) => { if (!ok) throw new Error(msg); };

assert(studentMatchesQuery({ name: 'Ada', instrument: 'Violin', grade: '12th' }, '12'), 'grade digit');
assert(studentMatchesQuery({ name: 'Ada', instrument: 'Violin', grade: '12th' }, 'violin'), 'instrument');
assert(studentMatchesQuery({ name: 'Ada Lovelace', instrument: 'Piano', grade: '9th' }, 'ada'), 'name');
assert(!studentMatchesQuery({ name: 'Bob', instrument: 'Cello', grade: '10th' }, '12'), 'no false match');
assert(studentSearchFields({ name: 'Bob', instrument: 'Cello', grade: '10th' }).some(f => f.includes('10')), 'grade field');

console.log('studentSearch.selfcheck: ok');
