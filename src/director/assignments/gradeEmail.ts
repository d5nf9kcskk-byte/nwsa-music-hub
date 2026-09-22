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
import { fmtShortDate } from '../../shared/dates';
import type { AssignmentResult } from '../types';

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
