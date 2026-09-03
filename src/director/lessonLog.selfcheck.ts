/**
 * Pins High School lesson-log completeness and mail gating (#applied).
 * Incomplete / cancelled rows must never look "ready to email."
 */
import {
  defaultPayrollMinutes,
  suggestTeacherInitials,
  schoolYearLabel,
  isLogCompleteForMail,
  logMaterialChanged,
  contactRecipients,
  initialsOk,
  repertoireLine,
  termForDate,
  sheetKey,
  juryRows,
  trimJuryRows,
  logRowsWithDraft,
  draftRowIndex,
  termOf,
  sameTerm,
  termRank,
  JURY_REPERTOIRE_SLOTS,
  LESSON_TERMS,
  type LogMaterialFields,
} from './lessonLog';
import type { Lesson, StudentContact } from './types';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

assert(defaultPayrollMinutes('12') === 60, '12th → 60');
assert(defaultPayrollMinutes('12th') === 60, '12th label → 60');
assert(defaultPayrollMinutes('9') === 45, '9th → 45');
assert(defaultPayrollMinutes('11') === 45, '11th → 45');
assert(defaultPayrollMinutes(undefined) === 45, 'missing grade → 45');

assert(suggestTeacherInitials('Grant Gilman') === 'GG', 'teacher initials');
assert(suggestTeacherInitials('Madonna') === 'M', 'single-name initials');
assert(suggestTeacherInitials('') === '', 'empty name → empty initials');

assert(schoolYearLabel('2025-09-01') === '2025-2026', 'fall school year');
assert(schoolYearLabel('2026-03-01') === '2025-2026', 'spring school year');
assert(schoolYearLabel('2026-08-15') === '2026-2027', 'August rolls forward');

assert(initialsOk('AB') && initialsOk('abc') && !initialsOk('A') && !initialsOk(''), 'initials min 2');

const base: Pick<Lesson, 'status' | 'grade' | 'studentInitials'> = {
  status: 'Scheduled', grade: '92', studentInitials: 'SG',
};
assert(isLogCompleteForMail(base), 'graded + initialed is complete');
assert(!isLogCompleteForMail({ ...base, status: 'Cancelled' }), 'cancelled never mails');
assert(!isLogCompleteForMail({ ...base, grade: undefined }), 'ungraded never mails');
assert(!isLogCompleteForMail({ ...base, studentInitials: 'S' }), 'short initials never mail');
assert(!isLogCompleteForMail({ ...base, grade: 'good' }), 'free-text grade never mails');
assert(!isLogCompleteForMail({ ...base, grade: 'A' }), 'a retired letter never mails');

// Everything the student's initial attests to. Change any of it and they
// must re-initial — including the date and time, which are on the log now.
const line: LogMaterialFields = {
  date: '2026-09-04', startTime: '15:00', endTime: '15:45',
  grade: '92', gradeNote: 'x', repertoireComposer: 'Bach', repertoireTitle: 'Suite', payrollMinutes: 45,
};
assert(!logMaterialChanged(line, { ...line }), 'identical log is not material');
assert(logMaterialChanged(line, { ...line, grade: '85' }), 'grade change is material');
assert(logMaterialChanged(line, { ...line, date: '2026-09-05' }), 'date change is material');
assert(logMaterialChanged(line, { ...line, startTime: '16:00' }), 'start time change is material');
assert(logMaterialChanged(line, { ...line, endTime: '16:00' }), 'end time change is material');
assert(logMaterialChanged(line, { ...line, gradeNote: 'y' }), 'comment change is material');
assert(logMaterialChanged(line, { ...line, payrollMinutes: 60 }), 'payroll change is material');

// Term, and the sheet key that keeps Fall and Spring apart.
assert(LESSON_TERMS.length === 2, 'two terms on the form');
assert(termForDate('2026-09-04') === 'Fall' && termForDate('2026-12-31') === 'Fall', 'Aug–Dec is Fall');
assert(termForDate('2027-01-05') === 'Spring' && termForDate('2027-07-31') === 'Spring', 'Jan–Jul is Spring');
assert(sheetKey('s1', '2026-2027', 'Fall') !== sheetKey('s1', '2026-2027', 'Spring'), 'one sheet per term');
assert(sheetKey('s1', '2026-2027', 'Fall') !== sheetKey('s2', '2026-2027', 'Fall'), 'one sheet per student');
assert(sheetKey('s1', '2025-2026', 'Fall') !== sheetKey('s1', '2026-2027', 'Fall'), 'one sheet per school year');
assert(!sheetKey('s1', '2026-2027', 'Fall').includes('.'), 'no dots in a map key');

// The jury list always renders five rows, and saves only what was filled in.
assert(juryRows().length === JURY_REPERTOIRE_SLOTS, 'an empty sheet still renders five rows');
assert(juryRows({ juryRepertoire: [{ composer: 'Bach', title: 'Suite' }] })[0]!.composer === 'Bach', 'row 1 keeps its piece');
assert(juryRows({ juryRepertoire: [{ composer: 'Bach', title: 'Suite' }] })[4]!.title === '', 'unfilled rows are blank');
assert(trimJuryRows(juryRows()).length === 0, 'five blanks save as nothing');
assert(
  trimJuryRows([
    { composer: 'Bach', title: 'Suite' }, { composer: '', title: '' },
    { composer: 'Ravel', title: 'Tzigane' }, { composer: '', title: '' }, { composer: '', title: '' },
  ]).length === 3,
  'a gap between pieces is kept, trailing blanks are dropped',
);
assert(trimJuryRows([{ composer: ' Bach ', title: ' Suite ' }])[0]!.composer === 'Bach', 'saved pieces are trimmed');

// A term bundles a school year with Fall or Spring, and two dates in the same
// half of the same year land on the same sheet.
assert(sameTerm(termOf('2026-09-04'), termOf('2026-11-20')), 'two Fall dates share a sheet');
assert(!sameTerm(termOf('2026-11-20'), termOf('2027-02-10')), 'Fall and Spring are different sheets');
assert(termRank(termOf('2026-09-04')) < termRank(termOf('2027-02-10')), 'Fall sorts before its own Spring');
assert(termRank(termOf('2027-02-10')) < termRank(termOf('2027-09-04')), 'and both before the next year');

// The reason the log form is a page: on lesson five the four earlier lines
// are above the row being filled in, in the same columns.
const sheet = ['a', 'b', 'c', 'd'].map(id => ({ id }));
const adding = logRowsWithDraft(sheet);
assert(adding.length === 5 && draftRowIndex(adding) === 4, 'a new lesson is row 5, under the other four');
assert(adding.slice(0, 4).every((r, i) => r === sheet[i]), 'the four earlier lessons stay above it, in order');
assert(logRowsWithDraft([]).length === 1 && draftRowIndex(logRowsWithDraft([])) === 0, 'the first lesson is row 1');

// Editing keeps its own place — lesson 2 is still lesson 2, and only the rows
// that really came before it show above the blanks.
const editing = logRowsWithDraft(sheet, 'b');
assert(editing.length === 4 && draftRowIndex(editing) === 1, 'editing lesson 2 leaves it at row 2');
assert(editing[0] === sheet[0] && editing[2] === sheet[2] && editing[3] === sheet[3], 'the other rows keep their order');
assert(!editing.includes(sheet[1]!), 'the edited lesson appears once, as the draft');

// An id that is not on this sheet (the date moved to another term) must not
// silently drop a row — it is treated as a new line at the bottom.
const stray = logRowsWithDraft(sheet, 'zz');
assert(stray.length === 5 && draftRowIndex(stray) === 4, 'an unknown id adds a row instead of losing one');

assert(repertoireLine({ repertoireComposer: 'Bach', repertoireTitle: 'Suite' }) === 'Bach, Suite', 'repertoire line');
assert(repertoireLine({ repertoireTitle: 'Suite' }) === 'Suite', 'title only');

const contact: StudentContact = {
  id: 's1',
  email: 'student@x.org',
  parentEmail: 'parent@x.org',
  guardians: [{ email: 'parent@x.org' }, { email: 'other@x.org' }],
};
assert(
  contactRecipients(contact).join(',') === 'student@x.org,parent@x.org,other@x.org',
  'recipients dedupe parentEmail with guardians',
);
assert(contactRecipients(null).length === 0, 'no contact → no recipients');

console.log('lessonLog.selfcheck: ok');
