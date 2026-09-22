/**
 * Pins the grade email (#grade-email). Run:
 *   npx tsx --import ./scripts/vite-defines-shim.mjs src/director/assignments/gradeEmail.selfcheck.ts
 *
 * A wrong answer here is something a FAMILY reads: a staff-only comment posted
 * out of the building, a mark that isn't the one that was given, or a message
 * that silently never opens.
 */
import { gradeEmailBody, gradeEmailSubject, hasGradeToSend, GRADE_EMAIL_LABEL_MAX } from './gradeEmail.ts';
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

/* ── a long question is cut, not wrapped into mush ─────────────────────── */

const longLine = body.split('\n').find(l => l.includes('Gregorian'))!;
assert(longLine.includes('…'), 'an exam question too long for a line is elided');
assert(longLine.length < GRADE_EMAIL_LABEL_MAX + 20, 'and the elision actually bounds it');

/* ── grades that are not numbers ───────────────────────────────────────── */

const plain = gradeEmailBody({
  studentName: 'Chris Lee', assignmentTitle: 'Jury', assignmentType: 'Performance',
  result: { status: 'Pass', score: '92' },
});
assert(plain.includes('Final score — 92'), 'an exam with no rubric still sends its score');
assert(plain.includes('Result — Pass'), 'and its mark');

const exempt = gradeEmailBody({
  studentName: 'Chris Lee', assignmentTitle: 'Jury', assignmentType: 'Performance',
  result: { status: 'Exempt' },
});
assert(exempt.includes('Result — Exempt') && !exempt.includes('Final score'), 'Exempt is a result with no score, and says so');

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

console.log('grade email self-check: ok');
