/**
 * Self-check for interview time slots on sign-ups (#signups).
 * Run: npx tsx src/shared/signupSlots.selfcheck.ts
 */
import {
  slotBookingId, slotClaimFromAnswer, slotClaimsForAnswers,
  takenSlotIndices, slotHeldByStudent, parseSlotOptions,
  gradesMatchSlot, slotBlockedReason, assertClaimsMatchGrade,
  SignupSlotGradeError, gradeKey, canRemoveSlot,
} from './signupSlots.ts';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

const formId = 'formABC';
const q = {
  id: 'q1', label: 'Pick a time', type: 'timeslot' as const,
  options: ['Mon 3:00', 'Mon 3:15', 'Mon 3:30'],
  optionGrades: { 1: ['12th'] } as Record<string, string[]>,
};

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

assert(gradeKey('12th') === '12' && gradeKey('12') === '12', 'grade key');
assert(gradesMatchSlot('10th', null), 'empty allowed → open');
assert(gradesMatchSlot('10th', []), 'empty array → open');
assert(gradesMatchSlot('12th', ['12th']), 'senior matches seniors-only');
assert(gradesMatchSlot('12', ['12th']), 'digit matches 12th');
assert(!gradesMatchSlot('10th', ['12th']), 'underclassman blocked from seniors-only');
assert(!gradesMatchSlot('', ['12th']), 'blank grade fails closed');
assert(slotBlockedReason(['12th']) === '12th only', 'badge copy');
assert(slotBlockedReason(['11th', '12th']) === '11th / 12th only', 'multi badge');

assertClaimsMatchGrade(form, [{ questionId: 'q1', slotIndex: 0, slotLabel: 'Mon 3:00' }], '10th');
try {
  assertClaimsMatchGrade(form, [{ questionId: 'q1', slotIndex: 1, slotLabel: 'Mon 3:15' }], '10th');
  throw new Error('expected grade error');
} catch (e) {
  assert(e instanceof SignupSlotGradeError && e.reason === '12th only', 'grade error for underclassman');
}
assertClaimsMatchGrade(form, [{ questionId: 'q1', slotIndex: 1, slotLabel: 'Mon 3:15' }], '12th');

// ── Deleting a slot renumbers the ones after it ───────────────────────
// A booking points at a POSITION, so the frozen region runs up to and
// including the LAST booked index — not just the booked rows. This is the
// bug: slot 2 booked, director deletes the empty slot 0, and that student
// silently inherits whatever used to be slot 3.
assert(canRemoveSlot(0, []), 'nothing booked → any slot may go');
assert(canRemoveSlot(5, []), 'nothing booked → the last slot may go');
assert(!canRemoveSlot(2, [2]), 'a booked slot may not be removed');
assert(!canRemoveSlot(0, [2]), 'an EMPTY slot before a booked one may not be removed');
assert(!canRemoveSlot(1, [2]), 'nor the one immediately before it');
assert(canRemoveSlot(3, [2]), 'the tail past the last booking is free to delete');
assert(!canRemoveSlot(3, [0, 4]), 'the gap between two bookings stays frozen');
assert(canRemoveSlot(5, [0, 4]), 'past the LAST booking, not merely past the first');
assert(canRemoveSlot(1, new Set<number>()), 'an empty Set behaves like nothing booked');
assert(!canRemoveSlot(1, new Set([3])), 'a Set works the same as an array');

console.log('signupSlots.selfcheck: ok');
