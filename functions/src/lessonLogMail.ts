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
import {
  LESSON_ATTACHMENT_LINK_DAYS,
  lessonAttachmentsOf,
  type LessonAttachment,
} from '../../src/director/lessonAttachments.ts';
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
 * Files on the lesson (#lesson-attachments) — what the function may sign.
 *
 * Only paths inside THIS lesson's own Storage folder: the lesson doc is
 * written by its teacher, and a path pointing anywhere else in the bucket (a
 * check-in selfie, a family's signed medical form) must never be signed into
 * an email. firestore.rules enforces the same folder on every write; this is
 * the second lock, on the side that holds the Admin SDK.
 */
export function attachmentsToSign(lesson: Pick<Lesson, 'id' | 'attachments'>): LessonAttachment[] {
  return lessonAttachmentsOf(lesson);
}

/**
 * How a family link is signed. EXPIRING, always: a permanent Firebase download
 * token would be a bearer link to a minor's lesson material that outlives
 * every reason to have it, which is exactly why signed forms and check-in
 * photos are read with getBlob in the app.
 *
 * Version 'v2' because v4 signed URLs cannot live past seven days and the
 * family gets thirty. In Cloud Functions there is no private key on disk, so
 * signing goes through IAM signBlob — the runtime service account needs
 * "Service Account Token Creator" on itself. Without it signing throws, and
 * the email goes out with no link (see `unlinked` below), never a fallback.
 */
export function signedUrlOptions(now: number): { version: 'v2'; action: 'read'; expires: number } {
  return { version: 'v2', action: 'read', expires: now + LESSON_ATTACHMENT_LINK_DAYS * 86_400_000 };
}

export interface AttachmentLink {
  name: string;
  url: string;
}

/** Only an https link to Google's own Storage hosts makes it into an email. */
export function linkOk(url: unknown): url is string {
  return typeof url === 'string'
    && /^https:\/\/(storage\.googleapis\.com|[a-z0-9.-]+\.storage\.googleapis\.com)\//.test(url);
}

function attachmentText(links: AttachmentLink[], unlinked: number): string {
  const lines: string[] = [];
  if (links.length) {
    lines.push(`Files from this lesson (each link works for ${LESSON_ATTACHMENT_LINK_DAYS} days):`);
    for (const l of links) lines.push(`- ${l.name}: ${l.url}`);
  }
  if (unlinked > 0) {
    lines.push(unlinked === 1
      ? 'The teacher attached a file that could not be linked here. Ask the teacher for a copy.'
      : `The teacher attached ${unlinked} files that could not be linked here. Ask the teacher for a copy.`);
  }
  return lines.join('\n');
}

function attachmentHtml(links: AttachmentLink[], unlinked: number): string {
  const parts: string[] = [];
  if (links.length) {
    parts.push(`<p>Files from this lesson (each link works for ${LESSON_ATTACHMENT_LINK_DAYS} days):</p>`);
    parts.push('<ul>' + links.map(l =>
      `<li><a href="${escapeHtml(l.url)}">${escapeHtml(l.name)}</a></li>`).join('') + '</ul>');
  }
  if (unlinked > 0) {
    parts.push(`<p>${escapeHtml(attachmentText([], unlinked))}</p>`);
  }
  return parts.join('');
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
  /** Signed links to the lesson's files, made by the trigger. */
  links: AttachmentLink[] = [],
  /** Files that are on the lesson but could not be signed. */
  unlinked = 0,
): MailDoc | null {
  // Re-checked here against the STORED lesson, not against whatever the
  // client believed when it pressed send: an incomplete or cancelled line
  // must never reach a family.
  if (!isLogCompleteForMail(lesson)) return null;

  const to = contactRecipients(contact).filter(validEmail).slice(0, MAX_RECIPIENTS);
  if (to.length === 0) return null;

  const fields = buildMailFields(lesson, student, to);
  const body = lessonLogMailBody(fields);
  const good = links.filter(l => linkOk(l.url));
  const missing = unlinked + (links.length - good.length);
  const extra = attachmentText(good, missing);
  const text = extra ? `${body}\n\n${extra}` : body;
  return {
    to,
    message: {
      subject: lessonLogMailSubject(fields),
      text,
      html: `<p>${escapeHtml(body).replace(/\r?\n/g, '<br>')}</p>${attachmentHtml(good, missing)}`,
    },
  };
}
