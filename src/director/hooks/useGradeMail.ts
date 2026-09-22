import { addDoc, collection } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Asking the Hub to really send a grade (#grade-email).
 *
 * This writes a REQUEST, not an email. `gradeMailSend` reads it, throws away
 * everything but the three ids, rebuilds the message from the stored result,
 * the stored assignment and the student's own contacts doc, and writes the
 * `mail` doc the Trigger Email extension picks up. Nothing here reaches a
 * family directly — `mail` is denied to every client in firestore.rules.
 *
 * **Called from a PRESS and nowhere else.** The director's rule for the lesson
 * log (2026-09-03) is that a family email is never a side effect of saving,
 * and it holds here: Confirm files a grade and offers nothing. If this is ever
 * wired to a save path, that is the regression.
 */
export async function enqueueGradeMail(args: {
  assignmentId: string;
  studentId: string;
  /** The `assignmentResults` doc — random id, so the function has to be told
   *  which row and then check that it is the one it claims to be. */
  resultId: string;
  /** The caller's own address. firestore.rules requires it to match the
   *  signed-in token, and the function reads the signature off THIS person's
   *  directors doc rather than off anything the client typed. */
  byEmail: string;
}): Promise<void> {
  if (!db) throw new Error('Firestore not initialized');
  await addDoc(collection(db, 'gradeMailQueue'), {
    assignmentId: args.assignmentId,
    studentId: args.studentId,
    resultId: args.resultId,
    byEmail: args.byEmail,
    queuedAt: Date.now(),
  });
}
