/**
 * Turning graded students into `mailto:` links (#grade-email) — the "open it
 * in my own mail app" half.
 *
 * It lives apart from `gradeEmail.ts` because that module is BUNDLED INTO THE
 * CLOUD FUNCTION that really sends these, and this one reaches `rosterEmail.ts`
 * → `utils.ts` → `dates.ts` → React and `localStorage`. Splitting them is what
 * keeps the function's import graph honest; the split is not cosmetic and
 * merging them back would break `gradeMailSend` at import time.
 */
import {
  gradeEmailBody, gradeEmailSubject, gradeRecipients, hasGradeToSend,
  type GradeEmailInput,
} from './gradeEmail';
import { personalMailto } from '../rosterEmail';
import { isAdultStudent } from '../groupKind';
import type { AssignmentResult, Ensemble, Student, StudentContact } from '../types';

export interface GradeMailItem {
  studentId: string;
  studentName: string;
  to: string[];
  subject: string;
  body: string;
  href: string;
  overLong: boolean;
  /** Already sent by the Hub, and when. The row says so rather than leaving a
   *  director to guess and send a family the same marks twice. */
  sentAt?: number;
  /** Why the last Hub send did not arrive (#mail-status). Set means the
   *  function withdrew `gradeMailedAt`, so this item is unsent again. */
  error?: string;
}

export interface GradeMailPlan {
  /** One message per student, in the order the roster was handed over. */
  items: GradeMailItem[];
  /** Graded, but with nobody to send to. REPORTED, never silently dropped —
   *  believing you told 40 families when you told 31 is the failure the roster
   *  bar exists to avoid, and a grade is worse to get wrong than a notice. */
  noAddress: { id: string; name: string }[];
  /** On the sheet with no grade filed. Not a problem — it is most of the
   *  roster on the day an exam is set — but the count is what tells a director
   *  they are about to write to nine of twenty-three. */
  ungraded: number;
}

/**
 * Every graded student's message, built in one pass.
 *
 * **One mail per student, never one mail to everybody.** A grade email's whole
 * content is that student's own marks, so there is no shared body to BCC — the
 * roster bar's `mailtoBatches` is for a message that is the same for everyone,
 * and this is the opposite case.
 */
export function gradeMailPlan(args: {
  /** The roster as the sheet shows it — order is preserved into `items`. */
  students: Student[];
  resultMap: Record<string, AssignmentResult | undefined>;
  contacts: Record<string, StudentContact>;
  ensembles: Pick<Ensemble, 'id' | 'collegeLevel'>[];
  assignment: { title: string; type: string; dueDate?: string };
  groupName?: string;
  fromName?: string;
}): GradeMailPlan {
  const { students, resultMap, contacts, ensembles, assignment, groupName, fromName } = args;
  const items: GradeMailItem[] = [];
  const noAddress: { id: string; name: string }[] = [];
  let ungraded = 0;

  for (const student of students) {
    const result = resultMap[student.id];
    if (!hasGradeToSend(result)) { ungraded++; continue; }
    // The SAME answer the Cloud Function will reach for the same student.
    const addresses = gradeRecipients(contacts[student.id], isAdultStudent(student, ensembles));
    const input: GradeEmailInput = {
      studentName: student.name,
      assignmentTitle: assignment.title,
      assignmentType: assignment.type,
      dueDate: assignment.dueDate,
      groupName,
      result: result!,
      fromName,
    };
    const subject = gradeEmailSubject(input);
    const body = gradeEmailBody(input);
    const link = personalMailto(addresses, subject, body);
    if (!link) { noAddress.push({ id: student.id, name: student.name }); continue; }
    items.push({
      studentId: student.id,
      studentName: student.name,
      to: addresses,
      subject,
      body,
      ...link,
      sentAt: result!.gradeMailedAt,
      error: result!.gradeMailError,
    });
  }
  return { items, noAddress, ungraded };
}

/** Every message as one block of text — the escape hatch for a device whose
 *  mail app is a browser tab the OS will not route to, and the only way to get
 *  a record of what was sent. Same role `copyList` plays on the roster bar. */
export function gradeMailDigest(items: GradeMailItem[]): string {
  return items
    .map(i => `To: ${i.to.join(', ')}\nSubject: ${i.subject}\n\n${i.body}`)
    .join('\n\n' + '─'.repeat(60) + '\n\n');
}
