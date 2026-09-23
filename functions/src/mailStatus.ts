/**
 * Telling the Hub whether its email actually left (#mail-status).
 *
 * WHY THIS EXISTS. Every screen that sends mail reported success the moment
 * the `mail` doc was written: the lesson log row said "Emailed Sep 22", the
 * grade row counted the student as done. The Trigger Email extension's own
 * verdict lands AFTERWARDS, in a `delivery` field on that same doc, and
 * `mail` is denied to every client — so nothing in the app could read it and
 * nobody did. Between 2026-09-02 and 2026-09-23, 36 messages failed with
 * `Missing credentials for "PLAIN"`, every one of them reported as sent:
 * sign-up confirmations, and lesson-log summaries three families never got.
 *
 * So the verdict is carried BACK to the record that caused it. A failure does
 * not add a warning beside the claim — it WITHDRAWS the claim: `logMailedAt`
 * is deleted, so the row says "Not emailed" again, which is the truth, and
 * the error says why. A teacher who looks sees what a teacher needs to see.
 *
 * Pure, so `mailStatus.selfcheck.ts` pins it without a network or a mailbox.
 */

/** What the extension has decided about one message, or nothing yet. */
export type MailVerdict = { sent: boolean; error: string } | null;

/** Plain sentences for the errors that actually occur. A teacher reading
 *  `Missing credentials for "PLAIN"` learns nothing they can act on; the whole
 *  point of surfacing this is that somebody does something about it. */
export function plainMailError(raw: string): string {
  const t = raw.trim();
  if (!t) return 'The mail server rejected it, with no reason given.';
  if (/credential|invalid login|535|authenticat/i.test(t)) {
    return 'The Hub’s email account is not signed in — ask the director to check the mail settings.';
  }
  if (/enotfound|econnrefused|etimedout|timed? ?out|connection/i.test(t)) {
    return 'Could not reach the mail server. It may be a temporary outage — try again later.';
  }
  if (/rate|too many|quota|limit/i.test(t)) {
    return 'The mail account hit its sending limit. Wait a while and try again.';
  }
  if (/recipient|no such user|mailbox|address/i.test(t)) {
    return 'The address was rejected — check the email on the student’s contact record.';
  }
  return t.replace(/^Error:\s*/i, '').slice(0, 200);
}

/**
 * Read the extension's `delivery` field.
 *
 * `null` means IN FLIGHT, and in-flight is not failure: PENDING and PROCESSING
 * are what a message looks like for the first seconds of its life, and
 * withdrawing "Emailed" for those would flicker a warning at a teacher who did
 * nothing wrong. Only a settled verdict is written back.
 */
export function mailVerdict(delivery: unknown): MailVerdict {
  if (!delivery || typeof delivery !== 'object') return null;
  const d = delivery as { state?: unknown; error?: unknown };
  const state = typeof d.state === 'string' ? d.state.toUpperCase() : '';
  if (state === 'SUCCESS') return { sent: true, error: '' };
  if (state === 'ERROR') {
    return { sent: false, error: plainMailError(typeof d.error === 'string' ? d.error : String(d.error ?? '')) };
  }
  return null;
}

/** The two things that CLAIM to have sent, and the fields each claims with.
 *  A queue collection not listed here writes nothing back — a sign-up
 *  confirmation has no screen that says it was emailed, so there is no claim
 *  to withdraw and nothing for a reader to act on. */
export const WRITEBACK_TARGETS = [
  {
    queue: 'lessonLogMailQueue',
    /** The field on the queue doc naming the record the mail was about. */
    idField: 'lessonId',
    collection: 'lessons',
    sentAtField: 'logMailedAt',
    errorField: 'logMailError',
  },
  {
    queue: 'gradeMailQueue',
    idField: 'resultId',
    collection: 'assignmentResults',
    sentAtField: 'gradeMailedAt',
    errorField: 'gradeMailError',
  },
] as const;

export type WritebackTarget = (typeof WRITEBACK_TARGETS)[number];

/**
 * The field changes to apply to the source record.
 *
 * `DELETE` is a sentinel rather than a `FieldValue`, so this module stays pure
 * and the caller does the one Admin-SDK-shaped thing. It matters that a
 * failure DELETES rather than writes a falsy value: the row's test is
 * `lesson.logMailedAt ? "Emailed" : "Not emailed"`, and a 0 or an empty string
 * would read as not-emailed by luck rather than by contract.
 */
export const DELETE = Symbol('delete-field');

export function writebackFields(
  target: Pick<WritebackTarget, 'sentAtField' | 'errorField'>,
  verdict: NonNullable<MailVerdict>,
  now: number,
): Record<string, unknown> {
  return verdict.sent
    ? { [target.sentAtField]: now, [target.errorField]: DELETE }
    : { [target.sentAtField]: DELETE, [target.errorField]: verdict.error };
}

/** A Firestore document id, and never a path. */
const DOC_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
export function isDocId(value: unknown): value is string {
  return typeof value === 'string' && DOC_ID_RE.test(value);
}
