/**
 * The public "yes, it uploaded" receipt (#video-upload-reliability Phase 1).
 *
 * The shape itself lives in src/shared/submissionReceipts.ts, shared with
 * the public-site hook that reads it (usePublicSubmissionReceipts) — this
 * file just re-exports what index.ts's trigger needs, matching the shape
 * every other trigger in this directory follows (concertCheckin.ts,
 * signupConfirmation.ts, lessonLogMail.ts): pure logic here, so
 * submissionReceipt.selfcheck.ts can pin it without a network, a project, or
 * a credential; index.ts holds only the trigger.
 */
export {
  buildSubmissionReceipt, submissionReceiptId, SUBMISSION_RECEIPT_KEYS,
  type SubmissionReceipt,
} from '../../src/shared/submissionReceipts.ts';
