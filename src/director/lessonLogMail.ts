import { addDoc, collection, doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import type { Lesson, Student, StudentContact } from './types';
import {
  buildMailFields,
  contactRecipients,
  isLogCompleteForMail,
  lessonLogMailto,
  type LessonLogMailFields,
} from './lessonLog';

/**
 * Queue a family summary email for one complete log line (Power Automate
 * drains `lessonLogMailQueue`) and return a mailto: fallback the teacher can
 * open if the flow is not wired yet.
 *
 * **Only ever called from a teacher's press** — saving a lesson does NOT send
 * (director's call, 2026-09-03; it may become automatic later). If you find
 * yourself calling this from a save path, that is the bug.
 */
export async function enqueueLessonLogMail(
  lesson: Lesson,
  student: Student | undefined,
): Promise<{ queued: boolean; mailto: string | null; fields: LessonLogMailFields | null }> {
  if (!isLogCompleteForMail(lesson)) {
    return { queued: false, mailto: null, fields: null };
  }

  let contact: StudentContact | null = null;
  if (db) {
    try {
      const snap = await getDoc(doc(db, 'contacts', lesson.studentId));
      if (snap.exists()) contact = { id: snap.id, ...snap.data() } as StudentContact;
    } catch {
      // Teacher may lack contacts access for this student; mailto still helps
      // if we somehow have nothing — leave recipients empty.
    }
  }

  const recipients = contactRecipients(contact);
  const fields = buildMailFields(lesson, student, recipients);
  const mailto = lessonLogMailto(fields);

  if (!db || recipients.length === 0) {
    return { queued: false, mailto, fields };
  }

  await addDoc(collection(db, 'lessonLogMailQueue'), {
    ...fields,
    subject: `Lesson log — ${fields.studentName} — ${fields.date}`,
    createdAt: Date.now(),
    processedAt: null,
  });

  return { queued: true, mailto, fields };
}
