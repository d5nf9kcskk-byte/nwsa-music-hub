/**
 * Runnable self-check:
 *   node --experimental-strip-types functions/src/lessonLogMail.selfcheck.ts
 *
 * Pins the guards on the lesson-log family email (#applied). This function
 * can mail a parent as the school, so the things it must refuse matter more
 * than the things it sends:
 *
 *   • an incomplete or cancelled log line never reaches a family;
 *   • the recipients come from the student's OWN contact record, never from
 *     the queue doc the teacher wrote;
 *   • a request whose student does not match the lesson it names is refused,
 *     which is what stops a teacher mailing another teacher's family;
 *   • a document id can never carry a path separator.
 *
 * Runs in deploy-functions.yml BEFORE any credential is written.
 */
import {
  buildLessonLogMail, escapeHtml, isDocId, queueRequestOk, validEmail, MAX_RECIPIENTS,
} from './lessonLogMail.ts';
import type { Lesson, Student, StudentContact } from '../../src/director/types.ts';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const LESSON: Lesson = {
  id: 'lesson1',
  teacherEmail: 'teacher@nwsa.org',
  teacherName: 'Grant Gilman',
  studentId: 'stu1',
  date: '2026-09-04',
  startTime: '15:00',
  endTime: '15:45',
  status: 'Scheduled',
  grade: '92',
  gradeNote: 'Bow distribution in the upper half.',
  repertoireComposer: 'Bach',
  repertoireTitle: 'Partita No. 2',
  teacherInitials: 'GG',
  studentInitials: 'ME',
  payrollMinutes: 45,
  createdAt: 0,
};
const STUDENT = { id: 'stu1', name: 'Maya Ellison', status: 'Active' } as Student;
const CONTACT: StudentContact = {
  id: 'stu1',
  email: 'maya@students.nwsa.org',
  parentEmail: 'parent@example.com',
};

// ── The happy path ────────────────────────────────────────────────────
const mail = buildLessonLogMail(LESSON, STUDENT, CONTACT)!;
assert(mail, 'a complete line with contacts on file produces an email');
assert(
  mail.to.join(',') === 'maya@students.nwsa.org,parent@example.com',
  'student and guardian, in that order',
);
assert(mail.message.subject.includes('Maya Ellison'), 'the subject names the student');
assert(mail.message.subject.includes('2026-09-04'), 'and the date');
assert(mail.message.text.includes('92'), 'the body carries the numeric grade');
assert(mail.message.text.includes('Bach, Partita No. 2'), 'and the repertoire');
assert(!('from' in mail), 'the sender is the extension config, never chosen here');

// ── What it must refuse ───────────────────────────────────────────────
assert(buildLessonLogMail({ ...LESSON, status: 'Cancelled' }, STUDENT, CONTACT) === null,
  'a cancelled lesson is never emailed');
assert(buildLessonLogMail({ ...LESSON, grade: undefined }, STUDENT, CONTACT) === null,
  'an ungraded lesson is never emailed');
assert(buildLessonLogMail({ ...LESSON, grade: 'A' }, STUDENT, CONTACT) === null,
  'a lesson left on a retired letter grade is never emailed');
assert(buildLessonLogMail({ ...LESSON, studentInitials: '' }, STUDENT, CONTACT) === null,
  'a line the student has not initialled is never emailed');
assert(buildLessonLogMail(LESSON, STUDENT, null) === null,
  'no contact record → nothing sent, rather than sent nowhere');
assert(buildLessonLogMail(LESSON, STUDENT, { id: 'stu1' }) === null,
  'a contact record with no addresses sends nothing');
assert(buildLessonLogMail(LESSON, STUDENT, { id: 'stu1', email: 'not-an-address' }) === null,
  'a malformed address is dropped, and dropping them all sends nothing');

// The recipient list is bounded — the school's SMTP account is not a
// broadcast tool, whatever ends up on a contact record.
const many: StudentContact = {
  id: 'stu1',
  guardians: Array.from({ length: 40 }, (_, i) => ({ email: `g${i}@example.com` })),
};
assert(buildLessonLogMail(LESSON, STUDENT, many)!.to.length === MAX_RECIPIENTS,
  'the recipient list is capped');

// ── The queue doc is a request, not the content ───────────────────────
assert(queueRequestOk({ studentId: 'stu1' }, LESSON), 'a request for its own lesson is allowed');
assert(!queueRequestOk({ studentId: 'someone-else' }, LESSON),
  "a request naming another teacher's student is refused");
assert(!queueRequestOk({}, LESSON), 'a request with no student is refused');
assert(!queueRequestOk({ studentId: 42 }, LESSON), 'a non-string student id is refused');

// ── Ids are ids, never paths ──────────────────────────────────────────
assert(isDocId('abc123_-'), 'an ordinary Firestore id');
assert(!isDocId('a/b'), 'a slash would address a different collection');
assert(!isDocId('../mail/x'), 'and so would a traversal');
assert(!isDocId(''), 'an empty id is not an id');
assert(!isDocId('x'.repeat(129)), 'and neither is an unbounded one');

// ── Addresses and escaping ────────────────────────────────────────────
assert(validEmail('a@b.co') && !validEmail('a@b') && !validEmail(''), 'address shape');
assert(!validEmail(`${'a'.repeat(250)}@b.co`), 'an over-long address is refused');
assert(escapeHtml('<script>&"\'') === '&lt;script&gt;&amp;&quot;&#39;', 'html is escaped');
assert(
  buildLessonLogMail({ ...LESSON, gradeNote: '<b>bold</b>' }, STUDENT, CONTACT)!.message.html
    .includes('&lt;b&gt;bold&lt;/b&gt;'),
  "a teacher's comment cannot inject markup into the email",
);
assert(
  buildLessonLogMail({ ...LESSON, gradeNote: 'one\ntwo' }, STUDENT, CONTACT)!.message.html
    .includes('one<br>two'),
  'multi-line comments keep their line breaks in the html part',
);

console.log('lessonLogMail.selfcheck: ok');
