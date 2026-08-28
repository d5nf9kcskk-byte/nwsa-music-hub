import type { SignupForm, SignupQuestion, SignupSlotBooking } from '../director/types';

/** One claimed time slot. World-readable in `signupSlotBookings` so the
 *  public sign-up page can grey out times another student already took — the
 *  main `signupResponses` collection stays staff-only. */
export type { SignupSlotBooking };

/** Deterministic doc id — the rules pin this format so two clients cannot
 *  race two different shapes into the same slot. */
export function slotBookingId(formId: string, questionId: string, slotIndex: number): string {
  return `${formId}__${questionId}__${slotIndex}`;
}

export function isTimeslotQuestion(q: SignupQuestion): boolean {
  return q.type === 'timeslot';
}

/** Slot labels directors enter one-per-line in the editor. */
export function parseSlotOptions(raw: string): string[] {
  return raw.split('\n').map(s => s.trim()).filter(Boolean);
}

export function formatSlotOptions(options: string[] | undefined): string {
  return (options ?? []).join('\n');
}

/** What the student picked → index + label for the booking write. */
export function slotClaimFromAnswer(
  formId: string,
  question: SignupQuestion,
  answer: string,
): { formId: string; questionId: string; slotIndex: number; slotLabel: string } | null {
  const label = answer.trim();
  if (!label || !isTimeslotQuestion(question)) return null;
  const options = question.options ?? [];
  const slotIndex = options.findIndex(o => o === label);
  if (slotIndex < 0) return null;
  return { formId, questionId: question.id, slotIndex, slotLabel: label };
}

/** Build slot claims for every timeslot answer on a form. */
export function slotClaimsForAnswers(
  form: SignupForm,
  answers: Record<string, string>,
): SlotClaim[] {
  const claims: SlotClaim[] = [];
  for (const q of form.questions ?? []) {
    if (!isTimeslotQuestion(q)) continue;
    const claim = slotClaimFromAnswer(form.id, q, answers[q.id] ?? '');
    if (claim) {
      claims.push({
        questionId: claim.questionId,
        slotIndex: claim.slotIndex,
        slotLabel: claim.slotLabel,
      });
    }
  }
  return claims;
}

/** Map questionId → set of taken slot indices (any student). */
export function takenSlotIndices(bookings: SignupSlotBooking[]): Map<string, Set<number>> {
  const out = new Map<string, Set<number>>();
  for (const b of bookings) {
    let set = out.get(b.questionId);
    if (!set) { set = new Set(); out.set(b.questionId, set); }
    set.add(b.slotIndex);
  }
  return out;
}

/** True when this student already holds the slot (re-submit same time). */
export function slotHeldByStudent(
  bookings: SignupSlotBooking[],
  questionId: string,
  slotIndex: number,
  studentId: string,
): boolean {
  return bookings.some(b =>
    b.questionId === questionId && b.slotIndex === slotIndex && b.studentId === studentId);
}

export class SignupSlotTakenError extends Error {
  slotLabel: string;
  constructor(slotLabel: string) {
    super(`Slot taken: ${slotLabel}`);
    this.name = 'SignupSlotTakenError';
    this.slotLabel = slotLabel;
  }
}

/** Payload for atomic slot reservation on submit. */
export type SlotClaim = {
  questionId: string;
  slotIndex: number;
  slotLabel: string;
};
