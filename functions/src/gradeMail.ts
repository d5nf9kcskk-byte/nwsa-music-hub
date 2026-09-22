/**
 * The grade email the Hub really sends (#grade-email).
 *
 * WHY A CLOUD FUNCTION. Until now a grade left through the director's own mail
 * app, one `mailto:` at a time — which is fine for a student and unusable for a
 * class of thirty. This is the same pipeline the lesson log and the sign-up
 * confirmation already use: the Trigger Email extension, driven by a `mail`
 * doc this function writes. Same SMTP account, no key to mint, no polling.
 *
 * WHY IT IS NOT A CLIENT WRITE. The extension sends whatever lands in `mail`,
 * as the school, to whatever address the doc names. `mail` is denied to every
 * client in firestore.rules and must stay that way.
 *
 * WHY THE QUEUE DOC IS NOT TRUSTED. It is written by a signed-in staff member
 * who controls every field on it, addresses included. So it is a REQUEST and
 * nothing more: the only things read out of it are WHICH assignment and WHICH
 * student. The marks come from the stored `assignmentResults` doc, the name
 * from `studentsPublic`, and the addresses from that student's own `contacts`
 * doc. `queueRequestOk()` makes the stored result agree with the student the
 * rules bound the request to, so naming somebody else's row reaches nobody.
 *
 * WHY IT IS STILL A PRESS. The director's call on the lesson log (2026-09-03)
 * was that a family email is never a side effect of saving, and that holds
 * here: nothing enqueues on Confirm. Sending is a button, and this function
 * runs only because somebody pushed it.
 *
 * Everything here is pure so `gradeMail.selfcheck.ts` can pin it without a
 * network, a project, or a mailbox; index.ts holds the trigger and the reads.
 */
import {
  gradeEmailBody,
  gradeEmailSubject,
  gradeRecipients,
  hasGradeToSend,
} from '../../src/director/assignments/gradeEmail.ts';
import { isAdultStudent } from '../../src/director/groupKind.ts';
import type { Assignment, AssignmentResult, Ensemble, Student, StudentContact } from '../../src/director/types.ts';
import type { MailDoc } from './signupConfirmation.ts';

/** A Firestore document id, and never a path. An id carrying a slash would
 *  address a different collection entirely once it is interpolated. */
const DOC_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

export function isDocId(value: unknown): value is string {
  return typeof value === 'string' && DOC_ID_RE.test(value);
}

/**
 * Does this request match the result it names?
 *
 * `assignmentResults` docs carry RANDOM ids (`addDoc`), not a composed
 * `assignmentId_studentId` — so the queue doc has to name the result directly
 * and the function has to check that it is the one it claims to be. The
 * queue's `assignmentId` is the field firestore.rules gated a classroom
 * teacher's scope on, so forcing the STORED result to agree with it is what
 * stops a request reaching a row outside that scope; the `studentId` check is
 * what stops a mismatched pair sending one student's marks under another's
 * name.
 */
export function queueRequestOk(
  queued: { assignmentId?: unknown; studentId?: unknown; resultId?: unknown },
  result: Pick<AssignmentResult, 'assignmentId' | 'studentId'>,
): boolean {
  return isDocId(queued.assignmentId)
    && isDocId(queued.studentId)
    && isDocId(queued.resultId)
    && queued.assignmentId === result.assignmentId
    && queued.studentId === result.studentId;
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
 * The email for one graded student, or null when there is nothing to send.
 *
 * Subject and body come from the SAME helpers as the in-app "Open in my mail"
 * fallback, so the two can never tell a family different things about the same
 * exam. So do the recipients: `gradeRecipients` with `isAdultStudent` is the
 * one answer to who this reaches, and a college student's marks go to them
 * rather than to a guardian an old import left on their record.
 */
export function buildGradeMail(args: {
  assignment: Pick<Assignment, 'title' | 'type' | 'dueDate'>;
  result: Pick<AssignmentResult, 'status' | 'score' | 'rubric'>;
  student: Pick<Student, 'name' | 'adult' | 'ensembleIds'> | undefined;
  contact: StudentContact | null;
  ensembles: Pick<Ensemble, 'id' | 'collegeLevel'>[];
  groupName?: string;
  fromName?: string;
}): MailDoc | null {
  const { assignment, result, student, contact, ensembles, groupName, fromName } = args;
  // Re-checked against the STORED result, not against whatever the client
  // believed when it pressed send: a Pending row must never reach a family.
  if (!hasGradeToSend(result)) return null;
  if (!student?.name) return null;

  const to = gradeRecipients(contact, isAdultStudent(student, ensembles));
  if (to.length === 0) return null;

  const input = {
    studentName: student.name,
    assignmentTitle: assignment.title,
    assignmentType: assignment.type,
    dueDate: assignment.dueDate,
    groupName,
    result,
    fromName,
  };
  const text = gradeEmailBody(input);
  return {
    to,
    message: {
      subject: gradeEmailSubject(input),
      text,
      html: `<p>${escapeHtml(text).replace(/\r?\n/g, '<br>')}</p>`,
    },
  };
}

