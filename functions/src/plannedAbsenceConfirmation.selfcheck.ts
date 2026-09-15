/**
 * Runnable self-check: node --experimental-strip-types src/plannedAbsenceConfirmation.selfcheck.ts
 */
import { buildAbsenceReceipt } from './plannedAbsenceConfirmation.ts';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) { console.error('FAIL:', msg); process.exit(1); }
}

const branding = { orgName: 'NWSA Music Hub', contactEmail: 'nwsaorchestras@gmail.com' };

// The two pre-existing writers (PlannedAbsenceButton, apply-absence-email.mjs)
// never collect an email — this must be the normal "nothing to send" path,
// not an error.
assert(
  buildAbsenceReceipt({ studentName: 'Rivera, Ana', date: '2026-09-20' } as never, branding) === null,
  'no email on the report → nothing to send',
);
assert(
  buildAbsenceReceipt({ email: 'not-an-email', studentName: 'Rivera, Ana', date: '2026-09-20' } as never, branding) === null,
  'a malformed email → nothing to send',
);

const mail = buildAbsenceReceipt(
  { email: 'ana@example.com', studentName: 'Rivera, Ana', date: '2026-09-20', category: 'leaving-early' },
  branding,
);
assert(mail !== null, 'a valid email produces a mail doc');
assert(mail!.to[0] === 'ana@example.com', 'addressed to the report email');
assert(mail!.message.subject.includes('2026-09-20'), 'subject names the date');
assert(mail!.message.text.includes('Ana'), `greets by first name, got:\n${mail!.message.text}`);
assert(mail!.message.text.includes('Leaving early'), 'names the category in plain words');
assert(mail!.message.html.includes('Ana'), 'html greeting also uses first name');

// A category with no label falls back to the raw value rather than throwing.
const unlabeled = buildAbsenceReceipt(
  { email: 'x@example.com', studentName: 'Lee, Sam', date: '2026-09-21', category: 'mystery-category' as never },
  branding,
);
assert(unlabeled!.message.text.includes('mystery-category'), 'unknown category falls back to its raw value');

// A hostile studentName must never break the HTML — escaped, not executed.
const hostile = buildAbsenceReceipt(
  { email: 'x@example.com', studentName: '<script>alert(1)</script>', date: '2026-09-20' },
  branding,
);
assert(!hostile!.message.html.includes('<script>'), 'student name is HTML-escaped in the email body');

console.log('plannedAbsenceConfirmation self-check passed');
