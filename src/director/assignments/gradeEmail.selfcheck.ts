/**
 * Pins the grade email (#grade-email). Run:
 *   npx tsx --import ./scripts/vite-defines-shim.mjs src/director/assignments/gradeEmail.selfcheck.ts
 *
 * A wrong answer here is something a FAMILY reads: a staff-only comment posted
 * out of the building, a mark that isn't the one that was given, or a message
 * that silently never opens.
 */
import { gradeEmailBody, gradeEmailSubject, gradeRecipients, hasGradeToSend } from './gradeEmail.ts';
import { gradeMailDigest, gradeMailPlan } from './gradeMailLinks.ts';
import { personalMailto, MAILTO_MAX } from '../rosterEmail.ts';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

const RESULT = {
  status: 'Pass' as const,
  score: '74',
  notes: 'Watch the shifting — tell him at the next lesson, not the family.',
  rubric: [
    { id: 'auto:listening', label: 'Listening', max: 60, points: 40 },
    { id: 'S3Q2', label: 'Why is Gregorian chant called a Frankish political project with a Roman brand name?', max: 20, points: 18 },
    { id: 'S6Q1', label: 'Compare troubadours and trouvères', max: 20, points: 16 },
  ],
};

const body = gradeEmailBody({
  studentName: 'William Rose',
  assignmentTitle: 'Survey Music History 1 - Exam 1',
  assignmentType: 'Written Test',
  dueDate: '2026-09-22',
  groupName: 'Survey Music History 1',
  result: RESULT,
  fromName: 'Dr. Grant Gilman',
});

/* ── the staff-only comment never leaves the building ──────────────────── */

assert(!body.includes('shifting'), 'LEAK: the staff-only comment is in a message to a family');
assert(!body.toLowerCase().includes('staff'), 'LEAK: nothing from the staff note reaches the body');

/* ── every section, and a final score ──────────────────────────────────── */

assert(body.includes('Listening — 40 of 60'), 'each section names its own points');
assert(body.includes('— 18 of 20') && body.includes('— 16 of 20'), 'every rubric line is printed, not just the first');
assert(body.includes('Final score — 74 of 100'), 'the final score is the sum of the lines');
assert(!body.includes('(74%)'), 'a rubric already out of 100 does not print the percent twice');
assert(body.includes('William Rose'), 'the message names the student it is about');
assert(body.includes('Survey Music History 1 - Exam 1'), 'and the exam');
assert(body.trimEnd().endsWith('— Dr. Grant Gilman'), 'it is signed by the person sending it');

const outOf60 = gradeEmailBody({
  studentName: 'Ana Pérez', assignmentTitle: 'Scale Check', assignmentType: 'Playing Exam',
  result: { status: 'Pass', score: '75', rubric: [{ id: 'a', label: 'Scales', max: 60, points: 45 }] },
});
assert(outOf60.includes('Final score — 45 of 60 (75%)'), 'a rubric not out of 100 prints the percent, because the number is not obvious');

/* ── a question is printed WHOLE ───────────────────────────────────────── */

const longLine = body.split('\n').find(l => l.includes('Gregorian'))!;
assert(longLine.includes('with a Roman brand name?'),
  'a long exam question is printed to its last word — elided, it names the question only to someone who already remembers it');
assert(!longLine.includes('…'), 'nothing is cut');
assert(body.split('\n').filter(l => l.startsWith('  • ')).length === 3,
  'and each one stays ONE bullet — a prompt with a line break in it must not read as two questions');
const wrapped = gradeEmailBody({
  studentName: 'X', assignmentTitle: 'T', assignmentType: 'Written Test',
  result: { status: 'Pass', rubric: [{ id: 'a', label: 'First line\n\nsecond line', max: 10, points: 9 }] },
});
assert(wrapped.includes('• First line second line — 9 of 10'), 'a typed line break is flattened, not obeyed');

/* ── grades that are not numbers ───────────────────────────────────────── */

const plain = gradeEmailBody({
  studentName: 'Chris Lee', assignmentTitle: 'Jury', assignmentType: 'Performance',
  result: { status: 'Pass', score: '92' },
});
assert(plain.includes('Final score — 92'), 'an exam with no rubric still sends its score');
assert(!plain.includes('Result — Pass'),
  'a score is the message — "92" followed by "Pass" says it twice, and the second saying sounds like a verdict');
assert(!body.includes('Result —'), 'nor beside a rubric total');

const exempt = gradeEmailBody({
  studentName: 'Chris Lee', assignmentTitle: 'Jury', assignmentType: 'Performance',
  result: { status: 'Exempt' },
});
assert(exempt.includes('Result — Exempt') && !exempt.includes('Final score'),
  'an exam with NO number keeps its mark — it is the only grade there is, and dropping it would send a family their child\'s name and nothing else');
const failNoScore = gradeEmailBody({
  studentName: 'Chris Lee', assignmentTitle: 'Jury', assignmentType: 'Performance',
  result: { status: 'Fail' },
});
assert(failNoScore.includes('Result — Fail'), 'same for an unscored Fail');

/* ── nothing to send is not an empty email ─────────────────────────────── */

assert(!hasGradeToSend(undefined), 'a student with no result offers no button');
assert(!hasGradeToSend({ status: 'Pending' }), 'Pending is not a grade — do not mail "your grade is blank"');
assert(hasGradeToSend({ status: 'Pending', score: '80' }), 'a score is a grade even while the status is Pending');
assert(hasGradeToSend({ status: 'Fail' }), 'so is a mark with no number');

/* ── the link: TO not BCC, and an over-long one is REPORTED ────────────── */

const mail = personalMailto(['rose@example.edu', 'mum@example.com'], gradeEmailSubject({
  studentName: 'William Rose', assignmentTitle: 'Survey Music History 1 - Exam 1',
  assignmentType: 'Written Test', result: RESULT,
}), body)!;
assert(mail.href.startsWith('mailto:') && !mail.href.includes('bcc='), "one family is addressed openly — BCC is for a ROSTER's addresses");
assert(mail.href.includes('subject=') && mail.href.includes('body='), 'the subject and the body both ride in the link');
assert(!mail.overLong, 'an ordinary grade mail is well under the cap');
assert(personalMailto([], 'x', 'y') === null, 'no usable address means no link at all, rather than mailto:?body=…');
assert(personalMailto(['not an address'], 'x', 'y') === null, 'and a junk address is not one');

const huge = personalMailto(['a@b.co'], 'Grades', 'x'.repeat(MAILTO_MAX * 2))!;
assert(huge.overLong, 'a body past the cap is REPORTED — an over-long mailto opens empty and reports nothing on its own');
assert(huge.href.length > MAILTO_MAX, 'and the link is still returned, so Copy has something to hand over');

/* ── who a grade reaches: the rule the FUNCTION shares ─────────────────── */
// Both the mailto link and the Cloud Function call this. If they ever answered
// differently, a college student's marks would go to a stranger from one path
// and to them from the other.

const FAMILY = {
  id: 's', email: 'student@school.edu', parentEmail: 'mum@example.com',
  guardians: [{ name: 'Dad', email: 'dad@example.com' }, { name: 'Gran', email: '   ' }],
};
const teenTo = gradeRecipients(FAMILY, false);
assert(teenTo.join() === 'student@school.edu,mum@example.com,dad@example.com',
  'a school-age student reaches the student and every guardian with an address');
assert(!teenTo.includes(''), 'a blank guardian address is dropped, not sent to');

const adultTo = gradeRecipients(FAMILY, true);
assert(adultTo.join() === 'student@school.edu',
  'an ADULT student is their own contact — no guardian on the record is written to, however it got there');

assert(gradeRecipients(null, false).length === 0, 'no contact record reaches nobody');
assert(gradeRecipients({ parentEmail: 'nope' }, false).length === 0, 'a junk address is not an address');
assert(
  gradeRecipients({ email: 'A@b.co', parentEmail: 'a@B.CO' }, false).length === 1,
  'one address written two ways is one recipient',
);
assert(
  gradeRecipients({ guardians: Array.from({ length: 30 }, (_, i) => ({ email: `g${i}@x.co` })) }, false).length === 10,
  'a family, not a mailing list — the ceiling holds',
);

/* ── emailing the whole sheet ──────────────────────────────────────────── */
// A wrong answer here is a family who was not written to while the director
// believed they had been.

const ENSEMBLES = [{ id: 'symphony', collegeLevel: false }, { id: 'mdc', collegeLevel: true }];
const stu = (id: string, name: string, ensembleIds: string[] = ['symphony']) =>
  ({ id, name, ensembleIds, instrument: 'Violin', status: 'Active' } as never);

const plan = gradeMailPlan({
  students: [
    stu('a', 'Rose, William'),      // graded, has an address
    stu('b', 'Blades, Vincent'),    // graded, NO address
    stu('c', 'Lee, Chris'),         // not graded
    stu('d', 'Pérez, Ana', ['mdc']), // graded, adult (college) — their own address
  ],
  resultMap: {
    a: { id: 'r1', assignmentId: 'x', studentId: 'a', status: 'Pass', score: '88' },
    b: { id: 'r2', assignmentId: 'x', studentId: 'b', status: 'Pass', score: '71' },
    c: { id: 'r3', assignmentId: 'x', studentId: 'c', status: 'Pending' },
    d: { id: 'r4', assignmentId: 'x', studentId: 'd', status: 'Pass', score: '95' },
  },
  contacts: {
    a: { id: 'a', parentEmail: 'mum@example.com' },
    // b has a record with nothing usable on it
    b: { id: 'b', parentEmail: 'not an address' },
    c: { id: 'c', parentEmail: 'irrelevant@example.com' },
    d: { id: 'd', email: 'ana@mdc.edu', parentEmail: 'old-import-guardian@example.com' },
  },
  ensembles: ENSEMBLES,
  assignment: { title: 'Symphony Playing Exam #2', type: 'Playing Exam', dueDate: '2026-09-23' },
  groupName: 'Symphony Orchestra',
  fromName: 'Dr. Grant Gilman',
});

assert(plan.items.length === 2, 'one message per graded student who can be reached — not one message to everybody');
assert(plan.items[0].studentId === 'a' && plan.items[1].studentId === 'd', 'in the order the roster was handed over');
assert(plan.noAddress.length === 1 && plan.noAddress[0].id === 'b',
  'a graded student nobody can be written to is REPORTED — silently sending 31 of 40 is the whole failure this guards');
assert(plan.ungraded === 1, 'and the ungraded are counted, so "23 of 32" is on screen');
assert(!plan.items.some(i => i.studentId === 'c'), 'a Pending row is never mailed');

assert(plan.items[1].to.join() === 'ana@mdc.edu',
  "an ADULT student's grade goes to THEM, not to a guardian an old import left on the record");
assert(!plan.items[1].to.some(a => a.includes('old-import-guardian')), 'and that guardian is not written to at all');

assert(plan.items.every(i => i.href.startsWith('mailto:') && !i.href.includes('bcc=')),
  'each is addressed to its own student — there is no shared body to blind-copy');
assert(plan.items[0].body.includes('Rose, William') && !plan.items[0].body.includes('Pérez'),
  "one student's message carries only their own name");
assert(plan.items[0].subject.includes('Symphony Playing Exam #2'), 'and names the exam');

const digest = gradeMailDigest(plan.items);
assert(digest.includes('mum@example.com') && digest.includes('ana@mdc.edu'), 'the copy-all fallback carries every recipient');
assert(digest.includes('Rose, William') && digest.includes('Pérez, Ana'), 'and every message');

const nobody = gradeMailPlan({
  students: [stu('z', 'Nobody Graded')],
  resultMap: {}, contacts: {}, ensembles: ENSEMBLES,
  assignment: { title: 'T', type: 'Playing Exam' },
});
assert(nobody.items.length === 0 && nobody.noAddress.length === 0 && nobody.ungraded === 1,
  'nobody graded is not the same as nobody reachable, and the bar says which');

console.log('grade email self-check: ok');
