/**
 * Self-check for interview time slots on sign-ups (#signups).
 * Run: npx tsx src/shared/signupSlots.selfcheck.ts
 */
import {
  slotBookingId, slotClaimFromAnswer, slotClaimsForAnswers,
  takenSlotIndices, slotHeldByStudent, parseSlotOptions,
} from './signupSlots.ts';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

const formId = 'formABC';
const q = { id: 'q1', label: 'Pick a time', type: 'timeslot' as const, options: ['Mon 3:00', 'Mon 3:15', 'Mon 3:30'] };

assert(slotBookingId('abc', 'q1', 0) === 'abc__q1__0', 'booking id format');
assert(slotBookingId('abc', 'q1', 12) === 'abc__q1__12', 'booking id with double-digit index');

assert(parseSlotOptions('  Mon 3:00 \n\n Mon 3:15 ').join('|') === 'Mon 3:00|Mon 3:15', 'parse lines');

const claim = slotClaimFromAnswer(formId, q, 'Mon 3:15');
assert(claim?.slotIndex === 1 && claim.slotLabel === 'Mon 3:15', 'claim from label');
assert(slotClaimFromAnswer(formId, q, 'nope') === null, 'unknown label → null');

const form = { id: formId, title: 'T', ensembleIds: [], families: [], questions: [q], createdAt: 0 };
const claims = slotClaimsForAnswers(form, { q1: 'Mon 3:00' });
assert(claims.length === 1 && claims[0].slotIndex === 0, 'claims from answers');

const bookings = [
  { id: 'x', formId, questionId: 'q1', slotIndex: 0, slotLabel: 'Mon 3:00', studentId: 's1', studentName: 'A', submittedAt: 1 },
  { id: 'y', formId, questionId: 'q1', slotIndex: 2, slotLabel: 'Mon 3:30', studentId: 's2', studentName: 'B', submittedAt: 2 },
];
const taken = takenSlotIndices(bookings);
assert(taken.get('q1')?.has(0) && taken.get('q1')?.has(2) && !taken.get('q1')?.has(1), 'taken map');

assert(slotHeldByStudent(bookings, 'q1', 0, 's1'), 'same student holds slot');
assert(!slotHeldByStudent(bookings, 'q1', 0, 's9'), 'other student does not hold slot');

console.log('signupSlots.selfcheck: ok');
