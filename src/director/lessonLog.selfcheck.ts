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
  status: 'Scheduled', grade: 'A', studentInitials: 'SG',
};
assert(isLogCompleteForMail(base), 'graded + initialed is complete');
assert(!isLogCompleteForMail({ ...base, status: 'Cancelled' }), 'cancelled never mails');
assert(!isLogCompleteForMail({ ...base, grade: undefined }), 'ungraded never mails');
assert(!isLogCompleteForMail({ ...base, studentInitials: 'S' }), 'short initials never mail');
assert(!isLogCompleteForMail({ ...base, grade: 'good' }), 'legacy free-text grade never mails');

assert(
  logMaterialChanged(
    { grade: 'A', gradeNote: 'x', repertoireComposer: 'Bach', repertoireTitle: 'Suite', payrollMinutes: 45 },
    { grade: 'B', gradeNote: 'x', repertoireComposer: 'Bach', repertoireTitle: 'Suite', payrollMinutes: 45 },
  ),
  'grade change is material',
);
assert(
  !logMaterialChanged(
    { grade: 'A', gradeNote: 'x', repertoireComposer: 'Bach', repertoireTitle: 'Suite', payrollMinutes: 45 },
    { grade: 'A', gradeNote: 'x', repertoireComposer: 'Bach', repertoireTitle: 'Suite', payrollMinutes: 45 },
  ),
  'identical log is not material',
);

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
