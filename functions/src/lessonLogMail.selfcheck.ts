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
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  attachmentsToSign, buildLessonLogMail, escapeHtml, isDocId, linkOk, queueRequestOk,
  signedUrlOptions, validEmail, MAX_RECIPIENTS,
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

// ── Attachments (#lesson-attachments) ────────────────────────────────
// The link is EXPIRING, 30 days, and v2 (v4 cannot outlive seven days).
{
  const now = Date.UTC(2026, 10, 3);
  const o = signedUrlOptions(now);
  assert(o.version === 'v2' && o.action === 'read', 'a read link, signed v2');
  assert(o.expires === now + 30 * 86_400_000, 'the link expires in exactly 30 days');
  assert(Number.isFinite(o.expires) && o.expires > now, 'an expiry is always set');
}

// Only paths inside this lesson's own folder are ever signed.
{
  const withFiles = {
    ...LESSON,
    attachments: [
      { name: 'Scales.pdf', path: 'lessonAttachments/lesson1/1-Scales.pdf', contentType: 'application/pdf', size: 10 },
      { name: 'Selfie', path: 'checkins/ev1/stu1/in.jpg', contentType: 'image/jpeg', size: 10 },
      { name: 'Other', path: 'lessonAttachments/lesson2/1-x.pdf', contentType: 'application/pdf', size: 10 },
      { name: 'Deep', path: 'lessonAttachments/lesson1/a/b.pdf', contentType: 'application/pdf', size: 10 },
      { name: 'Signed form', path: 'signupSignedForms/f/stu1/x.pdf', contentType: 'application/pdf', size: 10 },
    ],
  } as Lesson;
  const signed = attachmentsToSign(withFiles);
  assert(signed.length === 1 && signed[0]!.path === 'lessonAttachments/lesson1/1-Scales.pdf',
    'a path outside lessonAttachments/<this lesson>/ is never signed');
  assert(attachmentsToSign(LESSON).length === 0, 'no attachments, nothing to sign');
}

// The links ride in the email; a link that is not Google Storage https does not.
{
  const url = 'https://storage.googleapis.com/nwsa-hub.firebasestorage.app/lessonAttachments/lesson1/1-Scales.pdf?GoogleAccessId=x&Expires=1&Signature=y';
  const m = buildLessonLogMail(LESSON, STUDENT, CONTACT, [
    { name: 'Scales.pdf', url },
    { name: 'Evil', url: 'javascript:alert(1)' },
  ])!;
  assert(m.message.text.includes(`Scales.pdf: ${url}`), 'the text part carries the signed link');
  assert(m.message.text.includes('30 days'), 'and says how long it works');
  assert(m.message.html.includes('href="https://storage.googleapis.com/'), 'the html part links it');
  assert(!m.message.text.includes('javascript:') && !m.message.html.includes('javascript:'), 'a non-storage link is dropped');
  assert(m.message.text.includes('could not be linked'), 'and counted as unlinked');
  assert(!linkOk('https://firebasestorage.googleapis.com/v0/b/x/o/y?alt=media&token=abc'),
    'a permanent Firebase download-token URL is not an acceptable link');
  assert(linkOk(url), 'a v2 signed URL is');
}

// Signing failed: the email still goes, with no link and a sentence saying so.
{
  const m = buildLessonLogMail(LESSON, STUDENT, CONTACT, [], 2)!;
  assert(m && !m.message.text.includes('http'), 'no link when signing failed');
  assert(m.message.text.includes('2 files that could not be linked'), 'the family is told to ask');
}

// No attachment, no attachment text: the email is exactly what it was.
{
  const m = buildLessonLogMail(LESSON, STUDENT, CONTACT)!;
  assert(!m.message.text.includes('Files from this lesson') && !m.message.text.includes('could not be linked'),
    'a lesson with no files mails exactly as before');
}

// Source pins: the trigger signs with signedUrlOptions, and nothing on the
// mail path mints a permanent link or writes a public collection.
{
  const here = dirname(fileURLToPath(import.meta.url));
  const index = readFileSync(resolve(here, 'index.ts'), 'utf8');
  const mailSrc = readFileSync(resolve(here, 'lessonLogMail.ts'), 'utf8');
  const start = index.indexOf('export const lessonLogMailSend');
  const end = index.indexOf('export const', start + 10);
  assert(start > 0 && end > start, 'lessonLogMailSend is in index.ts');
  const block = index.slice(start, end);
  assert(block.includes('getSignedUrl(opts)') && block.includes('signedUrlOptions(Date.now())'),
    'the trigger signs every link with signedUrlOptions');
  assert(block.includes('attachmentsToSign(lesson)'), 'and only the paths attachmentsToSign allows');
  for (const banned of ['getDownloadURL', 'makePublic', 'firebaseStorageDownloadTokens', 'downloadTokens']) {
    assert(!block.includes(banned) && !mailSrc.includes(banned), `no ${banned} on the lesson mail path`);
  }
  const writes = [...block.matchAll(/db\.doc\(`([^`/]+)\//g)].map(m => m[1]);
  for (const c of writes) {
    assert(['lessons', 'studentsPublic', 'contacts', 'mail'].includes(c!), `unexpected collection ${c}`);
  }
  assert(!/lessonsPublic|\.set\(|\.update\(\{[^}]*attachments/.test(block),
    'the trigger writes nothing public and never copies attachments anywhere');
  assert(!/console\.(log|error|warn)\([^)]*\burl\b/.test(block), 'a signed URL is never logged');
}

console.log('lessonLogMail.selfcheck: ok');
