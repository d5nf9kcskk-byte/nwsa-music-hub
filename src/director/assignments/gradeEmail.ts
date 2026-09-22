/**
 * "Email this student their grade" from the grade sheet (#grade-email).
 *
 * The Hub does not send this. It hands the director's OWN mail app a filled-in
 * message, the same posture as the roster's Email button (`rosterEmail.ts`,
 * which stays the ONE answer to who a message reaches and how the link is
 * built) and the same posture as the lesson log: **a grade is never mailed as
 * a side effect of saving it.** This builds text off a press and nothing else.
 *
 * Two things in here are not formatting preferences:
 *
 * - **`notes` never leaves the Hub.** The comment box on a grade row says
 *   "Comment for your records (staff only)" and that is a promise. A grade
 *   mail carries the marks and nothing written beside them; the director types
 *   whatever they want to say in their own mail window, where they can see it.
 * - **The breakdown comes from the SNAPSHOT on the result, never from the
 *   assignment's current rubric** (#exam-rubric). Re-weighting an exam after
 *   grading must not change what a family was told; the mail says what was
 *   actually given.
 *
 * Plain text, because a `mailto:` body is plain text. No column padding: mail
 * clients render in a proportional font and a carefully aligned table arrives
 * as a ragged one. Bullets and an em dash survive every client.
 */
import { tallyScores } from '../examRubric';
import { personalMailto, rosterRecipients } from '../rosterEmail';
import { fmtShortDate } from '../../shared/dates';
import type { AssignmentResult, Ensemble, Student, StudentContact } from '../types';

/**
 * A rubric line's name is printed WHOLE.
 *
 * It was elided at 72 characters, on the theory that a mail client would wrap
 * a long one into mush. Seen in a real mail window (director's call,
 * 2026-09-22) that was the wrong trade: a line's name on a written test is the
 * exam question, and "Compare troubadours and trouvères: region and language.
 * Who were they s…" tells a student which question they lost marks on only if
 * they can already remember it. Wrapping is what mail clients are for.
 *
 * Whitespace is still flattened — a prompt typed with a line break in it would
 * otherwise split one bullet across two lines and read as two questions.
 */
function oneLine(label: string): string {
  return label.trim().replace(/\s+/g, ' ');
}

export interface GradeEmailInput {
  studentName: string;
  assignmentTitle: string;
  assignmentType: string;
  /** YYYY-MM-DD. Omitted when the exam has no due date. */
  dueDate?: string;
  /** The class or ensemble it was set for, when there is one to name. */
  groupName?: string;
  result: Pick<AssignmentResult, 'status' | 'score' | 'rubric'>;
  /** Signed off with the director's own name when the Hub knows it. */
  fromName?: string;
}

export function gradeEmailSubject(input: GradeEmailInput): string {
  return `${input.assignmentTitle} — grade for ${input.studentName}`;
}

/**
 * The message body. One section per rubric line with the points it earned,
 * then the final score — which is the whole ask: "what points they got on each
 * section, and a final score".
 */
export function gradeEmailBody(input: GradeEmailInput): string {
  const { studentName, assignmentTitle, assignmentType, dueDate, groupName, result, fromName } = input;
  const lines: string[] = [];

  lines.push(assignmentTitle);
  const sub = [assignmentType, groupName, dueDate ? `due ${fmtShortDate(dueDate)}` : ''].filter(Boolean);
  if (sub.length) lines.push(sub.join(' · '));
  lines.push('');
  lines.push(studentName);
  lines.push('');

  const tally = tallyScores(result.rubric);
  let scored = false;
  if (tally && result.rubric?.length) {
    lines.push('Points by section');
    for (const s of result.rubric) {
      lines.push(`  • ${oneLine(s.label)} — ${s.points} of ${s.max}`);
    }
    lines.push('');
    // The percent is only worth printing when it is not already on the page:
    // a rubric out of 100 says the same number twice.
    const pct = tally.max === 100 ? '' : ` (${tally.percent}%)`;
    lines.push(`Final score — ${tally.points} of ${tally.max}${pct}`);
    scored = true;
  } else if (result.score) {
    lines.push(`Final score — ${result.score}`);
    scored = true;
  }

  // The score is the message, so Pass/Fail/Exempt is NOT printed beside one
  // (director's call, 2026-09-22): "74 of 100" followed by "Pass" says the
  // same thing twice, and the second saying is the one that sounds like a
  // verdict. It survives for an exam carrying NO number — an Exempt, or a
  // Fail nobody scored — where it is the only grade there is and dropping it
  // would send a family a message with their child's name and nothing else.
  // 'Pending' is not a grade and is never mailed.
  if (!scored && result.status && result.status !== 'Pending') {
    lines.push(`Result — ${result.status}`);
  }

  if (fromName) {
    lines.push('');
    lines.push(`— ${fromName}`);
  }

  return lines.join('\n');
}

/** Nothing to tell anybody yet. The button is hidden rather than sending an
 *  email that says a student's grade is blank. */
export function hasGradeToSend(result: Pick<AssignmentResult, 'status' | 'score' | 'rubric'> | undefined): boolean {
  if (!result) return false;
  return !!result.score || !!result.rubric?.length || (!!result.status && result.status !== 'Pending');
}

/* ───────────────────────── emailing the whole sheet ──────────────────────── */

export interface GradeMailItem {
  studentId: string;
  studentName: string;
  to: string[];
  subject: string;
  body: string;
  href: string;
  overLong: boolean;
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
 * Every graded student's message, built in one pass (#grade-email).
 *
 * **One mail per student, never one mail to everybody.** A grade email's whole
 * content is that student's own marks, so there is no shared body to BCC — the
 * roster bar's `mailtoBatches` is for a message that is the same for everyone,
 * and this is the opposite case. The caller steps through these one at a time.
 *
 * Addresses come from `rosterRecipients` with the 'both' audience, which is
 * what makes an ADULT student their own recipient rather than a guardian an old
 * import left on their record (#roster-contact). Nothing about who a message
 * reaches is re-decided here.
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
    const { addresses } = rosterRecipients([student], contacts, 'both', ensembles);
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
    items.push({ studentId: student.id, studentName: student.name, to: addresses, subject, body, ...link });
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
