/**
 * Runnable self-check: node --experimental-strip-types src/requestDecision.selfcheck.ts
 */
import { buildAbsenceDecision, buildCopyDecline } from './requestDecision.ts';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) { console.error('FAIL:', msg); process.exit(1); }
}

const branding = { orgName: 'NWSA Music Hub', contactEmail: 'nwsaorchestras@gmail.com' };
const pending = { email: 'ana@example.com', studentName: 'Rivera, Ana', date: '2026-11-02', category: 'full-day-absence' as const, status: 'pending' as const };

// Absence: a decision made on the Requests screen mails the student.
const yes = buildAbsenceDecision(pending, { ...pending, status: 'approved', decidedAt: 1 }, branding);
assert(yes && yes.to[0] === 'ana@example.com', 'an approval is mailed to the report address');
assert(yes!.message.subject.includes('approved') && yes!.message.text.includes('Ana'), 'says approved, greets by first name');

const no = buildAbsenceDecision(pending, { ...pending, status: 'declined', decidedAt: 1, decisionNote: 'Dress rehearsal — <b>required</b>' }, branding);
assert(no && no.message.subject.includes('not approved'), 'a decline says not approved');
assert(no!.message.text.includes('Dress rehearsal'), 'the director\'s note rides along');
assert(!no!.message.html.includes('<b>required'), 'the note is HTML-escaped');

// Nothing to send: no decision, no change, no address, or a staff-filed heads-up.
assert(buildAbsenceDecision(pending, { ...pending, status: 'approved' }, branding) === null, 'no decidedAt (staff heads-up) → no mail');
assert(buildAbsenceDecision({ ...pending, status: 'approved' }, { ...pending, status: 'approved', decidedAt: 1, decisionNote: 'edit' }, branding) === null, 'an edit that does not change status → no second mail');
assert(buildAbsenceDecision(pending, { ...pending, email: undefined, status: 'declined', decidedAt: 1 }, branding) === null, 'no address → no mail');
assert(buildAbsenceDecision(pending, { ...pending, status: 'dismissed', decidedAt: 1 }, branding) === null, 'the old dismissed status is never mailed');

// Copy: only a "can't do" is mailed.
const copy = { email: 'sam@example.com', studentName: 'Sam Lee', pieceTitle: 'Finlandia', part: 'Violin 2', status: 'new' as const };
const cant = buildCopyDecline(copy, { ...copy, status: 'declined', decisionNote: 'Use the posted PDF' }, branding);
assert(cant && cant.to[0] === 'sam@example.com' && cant.message.text.includes('Use the posted PDF'), 'a decline is mailed with its note');
assert(buildCopyDecline(copy, { ...copy, status: 'done' }, branding) === null, '"copied" is not mailed');
assert(buildCopyDecline(copy, { ...copy, email: undefined, status: 'declined' }, branding) === null, 'no address → no mail');

console.log('requestDecision self-check passed');
