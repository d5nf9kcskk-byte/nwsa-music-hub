/**
 * Pins the delivery writeback (#mail-status). Run:
 *   node --experimental-strip-types functions/src/mailStatus.selfcheck.ts
 *
 * This is the guard against the failure that went unnoticed for three weeks:
 * 36 messages rejected by the mail server while every screen in the Hub said
 * they had been sent. A wrong answer here restores that silence.
 */
import {
  DELETE, WRITEBACK_TARGETS, isDocId, mailVerdict, plainMailError, writebackFields,
} from './mailStatus.ts';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

/* ── in flight is NOT failure ──────────────────────────────────────────── */

assert(mailVerdict(undefined) === null, 'a doc the extension has not touched has no verdict');
assert(mailVerdict({}) === null, 'nor one with an empty delivery');
assert(mailVerdict({ state: 'PENDING' }) === null,
  'PENDING is what every message looks like for its first seconds — withdrawing "Emailed" for it would flicker a warning at a teacher who did nothing wrong');
assert(mailVerdict({ state: 'PROCESSING' }) === null, 'same for PROCESSING');
assert(mailVerdict({ state: 'RETRY' }) === null, 'a queued retry has not failed yet either');

/* ── a settled verdict ─────────────────────────────────────────────────── */

assert(mailVerdict({ state: 'SUCCESS' })?.sent === true, 'SUCCESS is sent');
assert(mailVerdict({ state: 'success' })?.sent === true, 'and state is read case-insensitively');
const err = mailVerdict({ state: 'ERROR', error: 'Error: Missing credentials for "PLAIN"' })!;
assert(err.sent === false, 'ERROR is not sent');
assert(err.error.length > 0, 'and carries a reason');

/* ── the reason is in words a teacher can act on ───────────────────────── */

assert(plainMailError('Error: Missing credentials for "PLAIN"').includes('not signed in'),
  'the error that actually happened reads as something to do, not as SMTP jargon');
assert(!plainMailError('Error: Missing credentials for "PLAIN"').includes('PLAIN'),
  'and does not show the raw mechanism');
assert(plainMailError('535 5.7.8 Authentication failed').includes('not signed in'), 'a 535 is the same problem');
assert(plainMailError('ETIMEDOUT').includes('temporary'), 'a network failure says try again');
assert(plainMailError('550 no such recipient').includes('contact record'), 'a bad address points at the record to fix');
assert(plainMailError('Sending rate exceeded').includes('limit'), 'a throttle says wait');
assert(plainMailError('').length > 0, 'a blank error still says something');
assert(plainMailError('Error: weird thing') === 'weird thing', 'an unrecognised error is passed through, stripped of its prefix');
assert(plainMailError('x'.repeat(500)).length <= 200, 'and bounded');

/* ── a failure WITHDRAWS the claim ─────────────────────────────────────── */

const lessonTarget = WRITEBACK_TARGETS.find(t => t.queue === 'lessonLogMailQueue')!;
const failPatch = writebackFields(lessonTarget, { sent: false, error: 'nope' }, 1000);
assert(failPatch.logMailedAt === DELETE,
  'a failure DELETES logMailedAt — the row must go back to "Not emailed", which is true, rather than keeping a claim with a warning beside it');
assert(failPatch.logMailError === 'nope', 'and records why');

const okPatch = writebackFields(lessonTarget, { sent: true, error: '' }, 1000);
assert(okPatch.logMailedAt === 1000, 'a success stamps the time');
assert(okPatch.logMailError === DELETE,
  'and CLEARS a previous error — a retry that works must not leave the warning up');

/* ── the two things that claim to have sent, and only those ────────────── */

const gradeTarget = WRITEBACK_TARGETS.find(t => t.queue === 'gradeMailQueue')!;
assert(gradeTarget.collection === 'assignmentResults' && gradeTarget.idField === 'resultId',
  'a grade email corrects the result row it was built from');
assert(lessonTarget.collection === 'lessons' && lessonTarget.idField === 'lessonId',
  'a lesson log corrects its lesson');
assert(WRITEBACK_TARGETS.length === 2,
  'only the screens that CLAIM to have sent are corrected — a sign-up confirmation has no such claim, so there is nothing to withdraw and nobody to tell');
assert(!WRITEBACK_TARGETS.some(t => t.collection === 'mail'),
  'nothing writes back to mail — that would be a trigger loop');

/* ── ids are ids ───────────────────────────────────────────────────────── */

assert(!isDocId('../mail/x') && !isDocId('a/b') && !isDocId(''), 'an id carrying a path separator is not an id');
assert(isDocId('abc-123_XYZ'), 'an ordinary Firestore id is');

console.log('mail status self-check: ok');
