/**
 * The lesson-log family email (#applied).
 *
 * WHY THIS IS A CLOUD FUNCTION AND NOT A POWER AUTOMATE FLOW. The original
 * design had an external flow poll `lessonLogMailQueue` over the Firestore
 * REST API with a service-account key and send through Outlook. That flow was
 * never built, so every summary a teacher "sent" sat in the queue and no
 * family received one. The Hub already had the answer in the building: the
 * Trigger Email extension plus a trigger function, exactly as
 * `signupConfirmation` does it. Same SMTP account, no key to mint, no polling
 * loop, no second system to keep alive.
 *
 * WHY IT IS NOT A CLIENT WRITE. The extension sends whatever lands in `mail`,
 * as the school, to whatever address the doc names — `mail` is denied to
 * every client in firestore.rules and must stay that way.
 *
 * WHY THE QUEUE DOC IS NOT TRUSTED. Unlike a sign-up response, this request
 * is written by a signed-in teacher who controls every field on it, including
 * `recipients`. So the queue doc is treated as a REQUEST and nothing more:
 * the only thing read out of it is which lesson to send, the content comes
 * from the stored `lessons` doc, and the addresses come from the student's
 * own `contacts` doc. `queueRequestOk()` is what stops a teacher naming a
 * lesson that is not their assigned student's — the rules bind the queue
 * doc's `studentId` to a student they teach, and the lesson has to agree.
 *
 * Everything here is pure so lessonLogMail.selfcheck.ts can pin it without a
 * network, a project, or a mailbox; index.ts holds only the trigger and the
 * Firestore reads.
 */
import {
  buildMailFields,
  contactRecipients,
  isLogCompleteForMail,
  lessonLogMailBody,
  lessonLogMailSubject,
} from '../../src/director/lessonLog.ts';
import type { Lesson, Student, StudentContact } from '../../src/director/types.ts';
import type { MailDoc } from './signupConfirmation.ts';

/** A family, not a mailing list. A lesson summary goes to the student and
 *  their guardians; anything past this is a sign something is wrong, and the
 *  school's SMTP account should not be the thing that finds out. */
export const MAX_RECIPIENTS = 10;

/** Same bar the sign-up confirmation holds addresses to. */
const EMAIL_RE = /^.+@.+\..+$/;

export function validEmail(value: unknown): value is string {
  return typeof value === 'string'
    && value.length <= 254
    && EMAIL_RE.test(value.trim());
}

/** A Firestore document id, and never a path. An id carrying a slash would
 *  address a different collection entirely once it is interpolated. */
const DOC_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

export function isDocId(value: unknown): value is string {
  return typeof value === 'string' && DOC_ID_RE.test(value);
}

/**
 * Does this request match the lesson it names? The queue doc's `studentId`
 * is the field firestore.rules bound to a student the teacher is assigned to,
 * so requiring the stored lesson to agree with it is what keeps a teacher
 * from mailing another teacher's student's family.
 */
export function queueRequestOk(
  queued: { studentId?: unknown },
  lesson: Pick<Lesson, 'studentId'>,
): boolean {
  return isDocId(queued.studentId) && queued.studentId === lesson.studentId;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * The email for one finished log line, or null when there is nothing to send.
 *
 * Subject and body come from the SAME helpers as the in-app "Open in Mail"
 * fallback, so the two can never drift into telling a family different
 * things about the same lesson.
 */
export function buildLessonLogMail(
  lesson: Lesson,
  student: Student | undefined,
  contact: StudentContact | null,
): MailDoc | null {
  // Re-checked here against the STORED lesson, not against whatever the
  // client believed when it pressed send: an incomplete or cancelled line
  // must never reach a family.
  if (!isLogCompleteForMail(lesson)) return null;

  const to = contactRecipients(contact).filter(validEmail).slice(0, MAX_RECIPIENTS);
  if (to.length === 0) return null;

  const fields = buildMailFields(lesson, student, to);
  const text = lessonLogMailBody(fields);
  return {
    to,
    message: {
      subject: lessonLogMailSubject(fields),
      text,
      html: `<p>${escapeHtml(text).replace(/\r?\n/g, '<br>')}</p>`,
    },
  };
}
