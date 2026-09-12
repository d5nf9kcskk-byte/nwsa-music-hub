/**
 * Public "yes, it uploaded" receipts (#video-upload-reliability Phase 1).
 *
 * A student who closes the tab mid-upload, or whose connection drops right
 * after Submit, has no way to tell whether their video actually landed —
 * the confirmation screen is that browser tab, and it's gone. This is the
 * fix: a tiny, world-readable receipt naming only the assignment, the
 * student, and when — nothing that would turn a "did it upload" check into a
 * privacy leak.
 *
 * The receipt is written ONLY by the `submissionReceipt` Cloud Function's
 * onCreate trigger on `assignmentSubmissions` (functions/src/index.ts),
 * through the Admin SDK — see the `submissionReceiptsPublic` block in
 * firestore.rules, which denies every client write. That's deliberate: a
 * receipt a browser could write itself would not prove anything uploaded.
 * Structurally, a receipt cannot exist without a real `assignmentSubmissions`
 * doc having triggered it.
 *
 * This module is the ONE place the receipt's shape is defined — imported by
 * the trigger (to build it) and pinned by submissionReceipt.selfcheck.ts
 * (functions/src/), which also checks that firestore.rules' allowlist for
 * `submissionReceiptsPublic` names exactly these same three keys.
 */

/** Exhaustive — never add a field here without adding it to the
 *  `submissionReceiptsPublic` key allowlist in firestore.rules in the SAME
 *  change, or the trigger's write starts failing. No videoUrl, no thumbnail,
 *  no notes, no filename, no student name: ever. */
export const SUBMISSION_RECEIPT_KEYS = ['assignmentId', 'studentId', 'submittedAt'] as const;

export interface SubmissionReceipt {
  assignmentId: string;
  studentId: string;
  submittedAt: number; // epoch ms — the triggering submission's own submittedAt
}

/** One receipt per (assignment, student) pair — a later submission for the
 *  same pair overwrites it, so the doc always reflects the latest upload. */
export function submissionReceiptId(assignmentId: string, studentId: string): string {
  return `${assignmentId}_${studentId}`;
}

/** Build the receipt from a submission, keeping ONLY the three allowed
 *  fields regardless of what else the submission doc carries — this is what
 *  makes it structurally impossible for a video URL or a note to ride along.
 *  Takes a plain index-signature bag (a Firestore DocumentData is exactly
 *  that — no named property is ever guaranteed present on its TYPE) rather
 *  than a Pick<> of named-but-unknown fields, which a real snapshot's
 *  `.data()` does not structurally satisfy. */
export function buildSubmissionReceipt(sub: Record<string, unknown>): SubmissionReceipt | null {
  if (typeof sub.assignmentId !== 'string' || !sub.assignmentId) return null;
  if (typeof sub.studentId !== 'string' || !sub.studentId) return null;
  if (typeof sub.submittedAt !== 'number') return null;
  return { assignmentId: sub.assignmentId, studentId: sub.studentId, submittedAt: sub.submittedAt };
}
