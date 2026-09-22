/**
 * Pins the grade email the Hub really sends (#grade-email). Run:
 *   npx tsx functions/src/gradeMail.selfcheck.ts
 *
 * Every assertion here guards something a FAMILY receives. This function runs
 * with the Admin SDK, so the rules do not judge what it writes — these checks
 * and `queueRequestOk` are what stand between a queue doc and the school's
 * mail account.
 */
import { buildGradeMail, escapeHtml, isDocId, queueRequestOk } from './gradeMail.ts';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

const ENSEMBLES = [
  { id: 'symphony', collegeLevel: false },
  { id: 'mdc', collegeLevel: true },
];
const ASSIGNMENT = { title: 'Symphony Playing Exam #2', type: 'Playing Exam', dueDate: '2026-09-23' };
const GRADED = {
  status: 'Pass' as const,
  score: '85',
  rubric: [
    { id: 'intonation', label: 'Intonation', max: 25, points: 21 },
    { id: 'rhythm', label: 'Rhythm', max: 20, points: 17 },
  ],
};
const TEEN = { name: 'Rose, William', ensembleIds: ['symphony'] };
const COLLEGIAN = { name: 'Pérez, Ana', ensembleIds: ['mdc'] };

const build = (over: Record<string, unknown> = {}) => buildGradeMail({
  assignment: ASSIGNMENT,
  result: GRADED,
  student: TEEN,
  contact: { id: 's', parentEmail: 'mum@example.com' },
  ensembles: ENSEMBLES,
  groupName: 'Symphony Orchestra',
  fromName: 'Dr. Grant Gilman',
  ...over,
} as Parameters<typeof buildGradeMail>[0]);

/* ── the request must be the row it claims to be ───────────────────────── */

const RESULT_REF = { assignmentId: 'exam1', studentId: 'stu1' };
assert(queueRequestOk({ assignmentId: 'exam1', studentId: 'stu1', resultId: 'r1' }, RESULT_REF),
  'a matching request is accepted');
assert(!queueRequestOk({ assignmentId: 'OTHER', studentId: 'stu1', resultId: 'r1' }, RESULT_REF),
  'a result belonging to another EXAM is refused — that id is what a classroom teacher\'s scope was checked against');
assert(!queueRequestOk({ assignmentId: 'exam1', studentId: 'OTHER', resultId: 'r1' }, RESULT_REF),
  "a mismatched student is refused — otherwise one student's marks go out under another's name");
assert(!queueRequestOk({ assignmentId: 'exam1', studentId: 'stu1' }, RESULT_REF),
  'a request naming no result at all is refused');
assert(!isDocId('../mail/x') && !isDocId('a/b') && !isDocId(''), 'an id carrying a path separator is not an id');
assert(isDocId('abc-123_XYZ'), 'an ordinary Firestore id is');

/* ── who it reaches ────────────────────────────────────────────────────── */

const teen = build()!;
assert(teen.to.join() === 'mum@example.com', "a school-age student's grade goes to the family address on file");

const collegian = build({
  student: COLLEGIAN,
  contact: { id: 's', email: 'ana@mdc.edu', parentEmail: 'old-import-guardian@example.com' },
})!;
assert(collegian.to.join() === 'ana@mdc.edu',
  'an ADULT (dual-enrollment) student is their own contact — their marks must NOT go to a guardian an old import left on the record');

assert(build({ contact: null }) === null, 'no contact record means nothing is sent, and that is not an error');
assert(build({ contact: { id: 's', parentEmail: 'not an address' } }) === null, 'nor is a junk address');
assert(build({ student: undefined }) === null, 'a student with no public record is not mailed — the name is half the message');

/* ── what it says ──────────────────────────────────────────────────────── */

assert(teen.message.subject.includes('Symphony Playing Exam #2') && teen.message.subject.includes('Rose, William'),
  'the subject names the exam and the student');
assert(teen.message.text.includes('Intonation — 21 of 25'), 'the body carries the stored breakdown');
// 21 + 17 of 25 + 20. Note this is NOT the stored `score` of '85': the body
// adds up the SNAPSHOT, so a grade filed on one rubric and re-weighted later
// still reads as what was actually given (#exam-rubric).
assert(teen.message.text.includes('Final score — 38 of 45 (84%)'),
  'the total comes from the snapshotted lines, not from the stored score field');
assert(teen.message.text.includes('— Dr. Grant Gilman'), 'signed by the person who pressed send');
assert(!teen.message.text.includes('Result — Pass'), 'no verdict beside a score — the same rule the mailto version keeps');

/* ── a row that is not a grade is never mailed ─────────────────────────── */

assert(build({ result: { status: 'Pending' } }) === null,
  'Pending is re-checked against the STORED result here, not trusted from the client');
assert(build({ result: { status: 'Exempt' } }) !== null, 'an Exempt with no number is still a grade');

/* ── the HTML half cannot carry markup out of a name ───────────────────── */

const nasty = build({ student: { name: '<script>alert(1)</script> Rose', ensembleIds: ['symphony'] } })!;
assert(!nasty.message.html.includes('<script>'), 'a name is escaped before it reaches the HTML body');
assert(nasty.message.html.includes('&lt;script&gt;'), 'and escaped rather than dropped, so the name still reads');
assert(escapeHtml(`&<>"'`) === '&amp;&lt;&gt;&quot;&#39;', 'every character that matters is covered');
assert(nasty.message.text.includes('<script>'), 'the PLAIN-text part is left alone — escaping it would show a family the entities');

console.log('grade mail self-check: ok');
