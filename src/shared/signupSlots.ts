import type { SignupForm, SignupQuestion, SignupSlotBooking } from '../director/types';

/** One claimed time slot. World-readable in `signupSlotBookings` so the
 *  public sign-up page can grey out times another student already took — the
 *  main `signupResponses` collection stays staff-only. */
export type { SignupSlotBooking };

/** Grades a director can pin on a timeslot (HS roster labels). */
export const SIGNUP_SLOT_GRADES = ['9th', '10th', '11th', '12th'] as const;

/** Normalize "12th" / "12" / "12th Grade" → a comparable digit key. */
export function gradeKey(grade: string | undefined | null): string {
  const m = String(grade ?? '').trim().toLowerCase().match(/^(\d{1,2})/);
  return m ? m[1] : '';
}

/** Empty/omit allowed → anyone. Otherwise student grade must match one entry.
 *  Blank student grade fails closed when the slot is restricted. */
export function gradesMatchSlot(
  studentGrade: string | undefined | null,
  allowed: string[] | null | undefined,
): boolean {
  if (!allowed || allowed.length === 0) return true;
  const key = gradeKey(studentGrade);
  if (!key) return false;
  return allowed.some(a => gradeKey(a) === key);
}

/** Short badge copy, or null when the slot is open to any grade. */
export function slotBlockedReason(allowed: string[] | null | undefined): string | null {
  if (!allowed || allowed.length === 0) return null;
  if (allowed.length === 1) return `${allowed[0]} only`;
  return `${allowed.join(' / ')} only`;
}

export function slotGradeAllows(
  question: SignupQuestion,
  slotIndex: number,
  studentGrade: string | undefined | null,
): boolean {
  return gradesMatchSlot(studentGrade, question.optionGrades?.[slotIndex]);
}

/** Compact parallel array for Firestore — omit entirely when every slot is open. */
export function compactOptionGrades(
  grades: (string[] | null | undefined)[] | undefined,
  len: number,
): (string[] | null)[] | undefined {
  const out: (string[] | null)[] = [];
  let any = false;
  for (let i = 0; i < len; i++) {
    const g = grades?.[i];
    if (g && g.length) { out.push([...g]); any = true; }
    else out.push(null);
  }
  return any ? out : undefined;
}

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

/** Client-side grade gate for restricted timeslots. ponytail: Firestore rules
 *  still only enforce form-level audience + one-booking-per-slot — nested
 *  optionGrades checks in rules aren't worth it for this school tool. Honest
 *  clients (and the public UI) refuse the pick; staff see grade on the response. */
export class SignupSlotGradeError extends Error {
  slotLabel: string;
  reason: string;
  constructor(slotLabel: string, reason: string) {
    super(`Slot not for this grade: ${slotLabel}`);
    this.name = 'SignupSlotGradeError';
    this.slotLabel = slotLabel;
    this.reason = reason;
  }
}

/** Payload for atomic slot reservation on submit. */
export type SlotClaim = {
  questionId: string;
  slotIndex: number;
  slotLabel: string;
};

/** Throw if any claim targets a grade-restricted slot the student can't take. */
export function assertClaimsMatchGrade(
  form: SignupForm,
  claims: SlotClaim[],
  studentGrade: string,
): void {
  for (const claim of claims) {
    const q = (form.questions ?? []).find(x => x.id === claim.questionId);
    if (!q || !isTimeslotQuestion(q)) continue;
    if (slotGradeAllows(q, claim.slotIndex, studentGrade)) continue;
    const reason = slotBlockedReason(q.optionGrades?.[claim.slotIndex]) ?? 'Not available';
    throw new SignupSlotGradeError(claim.slotLabel, reason);
  }
}
