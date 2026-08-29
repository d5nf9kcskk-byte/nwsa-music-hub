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
 * After a complete log line is saved, queue a family summary email
 * (Power Automate drains `lessonLogMailQueue`) and return a mailto: fallback
 * the teacher can open if the flow is not wired yet.
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
