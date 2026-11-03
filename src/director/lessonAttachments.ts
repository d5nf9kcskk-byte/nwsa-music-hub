/**
 * Files attached to a private lesson (#lesson-attachments, Hub 2.0 Phase 4).
 *
 * A teacher attaches a PDF, a photo or an audio clip to one log line — the
 * page they marked up, a recording of the scale they want next week. It is
 * part of the LESSON, so it has the lesson's audience and nobody else's:
 *
 * - The object lives at `lessonAttachments/{lessonId}/{file}` and
 *   storage.rules lets only the lesson's own teacher or a director read or
 *   upload it, anchored on the `lessons` doc existing. No public read, no
 *   download token: the app reads it with getBlob, same as a signed PDF.
 * - `Lesson.attachments` is NOT a public field. It is in none of the three
 *   lesson allowlists (`publicLessonFields()`, the `/lessonsPublic` rule,
 *   `PUBLIC_LESSON_KEYS` in the backfill script), and
 *   `lessonAttachments.selfcheck.ts` fails if it ever is.
 * - The family email links each file with an EXPIRING signed URL made by the
 *   Cloud Function (`signedUrlOptions` in functions/src/lessonLogMail.ts),
 *   never a permanent download link.
 *
 * Zero imports on purpose: the function bundle and the Node self-check load
 * this file bare.
 */

export interface LessonAttachment {
  /** The file's name as the teacher picked it, for display only. */
  name: string;
  /** Storage path, always `lessonAttachments/<this lesson's id>/<file>`. */
  path: string;
  contentType: string;
  /** Bytes. */
  size: number;
}

/** "A file or two" — three is the ceiling, and firestore.rules checks each
 *  of the three slots by index, so raising this means editing the rules. */
export const LESSON_ATTACHMENT_MAX_FILES = 3;

/** The staff upload ceiling storage.rules already applies elsewhere. */
export const LESSON_ATTACHMENT_MAX_BYTES = 50 * 1024 * 1024;

/** How long a link in the family email keeps working. */
export const LESSON_ATTACHMENT_LINK_DAYS = 30;

export const LESSON_ATTACHMENT_ROOT = 'lessonAttachments';

/** The `accept` list for the file picker. */
export const LESSON_ATTACHMENT_ACCEPT = 'application/pdf,image/*,audio/*';

/** PDF, image or audio. The same three storage.rules allows. */
export function attachmentTypeOk(contentType: unknown): boolean {
  return typeof contentType === 'string'
    && /^(application\/pdf|image\/[A-Za-z0-9.+-]+|audio\/[A-Za-z0-9.+-]+)$/.test(contentType);
}

/** A file name safe to sit in a Storage path: one segment, no control
 *  characters, bounded. Keeps the extension readable. */
export function safeFileName(name: string): string {
  const printable = [...name].map(c => (c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 ? '-' : c)).join('');
  const cleaned = printable
    .replace(/[/\\#?[\]*]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(-80);
  return cleaned.replace(/^\.+/, '') || 'file';
}

/** Where a new upload goes. The timestamp keeps two files of the same name
 *  apart, and a re-upload never overwrites (storage.rules is create-only). */
export function lessonAttachmentPath(lessonId: string, fileName: string, now: number): string {
  return `${LESSON_ATTACHMENT_ROOT}/${lessonId}/${now}-${safeFileName(fileName)}`;
}

/** Does this path belong to THIS lesson's folder, one level deep? The
 *  function checks it before signing anything: a lesson doc is written by
 *  its teacher, and a path pointing anywhere else (a check-in selfie, a
 *  signed medical form) must never be signed into an email. */
export function isLessonAttachmentPath(lessonId: string, path: unknown): path is string {
  if (typeof path !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(lessonId)) return false;
  const prefix = `${LESSON_ATTACHMENT_ROOT}/${lessonId}/`;
  if (!path.startsWith(prefix)) return false;
  const file = path.slice(prefix.length);
  return file.length > 0 && file.length <= 200 && !file.includes('/') && file !== '.' && file !== '..';
}

/** The attachments on a lesson that are well formed and in its own folder,
 *  at most the ceiling. Anything else on the doc is ignored, never trusted. */
export function lessonAttachmentsOf(
  lesson: { id: string; attachments?: unknown },
): LessonAttachment[] {
  const raw = Array.isArray(lesson.attachments) ? lesson.attachments : [];
  const out: LessonAttachment[] = [];
  for (const a of raw) {
    if (!a || typeof a !== 'object') continue;
    const x = a as Record<string, unknown>;
    if (!isLessonAttachmentPath(lesson.id, x.path)) continue;
    out.push({
      name: typeof x.name === 'string' && x.name.trim() ? x.name.trim().slice(0, 200) : 'Attachment',
      path: x.path,
      contentType: typeof x.contentType === 'string' ? x.contentType : '',
      size: typeof x.size === 'number' && Number.isFinite(x.size) ? x.size : 0,
    });
    if (out.length >= LESSON_ATTACHMENT_MAX_FILES) break;
  }
  return out;
}

/** Why a picked file can't be attached, or null when it can. */
export function attachmentProblem(
  file: { name: string; size: number; type: string },
  alreadyAttached: number,
): string | null {
  if (alreadyAttached >= LESSON_ATTACHMENT_MAX_FILES) {
    return `A lesson holds up to ${LESSON_ATTACHMENT_MAX_FILES} files. Remove one first.`;
  }
  if (!attachmentTypeOk(file.type)) return 'Attach a PDF, a picture or an audio clip.';
  if (file.size >= LESSON_ATTACHMENT_MAX_BYTES) return 'That file is over 50 MB.';
  if (file.size <= 0) return 'That file is empty.';
  return null;
}

/** "2.4 MB" — for the row. */
export function attachmentSizeLabel(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}
