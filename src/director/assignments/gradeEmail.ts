/**
 * What a grade email SAYS and who it reaches (#grade-email).
 *
 * The words are built here once and used twice: by the `mailto:` link that
 * fills in the director's own mail app (`gradeMailLinks.ts`), and by the
 * `gradeMailSend` Cloud Function that really sends through the Trigger Email
 * extension. Two builders would eventually tell one family two different
 * things about the same exam, so there is one.
 *
 * **A grade is never mailed as a side effect of saving it** — the director's
 * rule for the lesson log (2026-09-03), and it holds either way round: Confirm
 * files a grade and offers nothing. Both paths run off a press.
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
import { tallyScores } from '../examRubric.ts';
import type { AssignmentResult, StudentContact } from '../types.ts';

/**
 * This module is BUNDLED INTO A CLOUD FUNCTION (`gradeMailSend`), so its
 * imports are load-bearing: `examRubric.ts` has none of its own, and nothing
 * else is reached. In particular it must never import `../../shared/dates`,
 * which reaches `i18n.ts` and through it React and `localStorage` — neither
 * exists in a function, and the failure would be at import time, taking every
 * grade email with it. Same discipline `lessonLog.ts` keeps for the same
 * reason. Hence the date formatter below rather than `fmtShortDate`.
 *
 * Fixed en-US, deliberately: the body's own words ("Points by section",
 * "Final score") are English, and a function has no viewer whose language it
 * could follow. A Spanish date inside an English email was the odd one out.
 */
function shortDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

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
  const sub = [assignmentType, groupName, dueDate ? `due ${shortDate(dueDate)}` : ''].filter(Boolean);
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

/** Deliberately loose — a mail server is the real validator — but it refuses
 *  blanks, spaces, and the half-typed entries a spreadsheet import leaves.
 *  Same shape `rosterEmail.isEmailish` uses; duplicated rather than imported
 *  because that module cannot be bundled into a function (it reaches
 *  `utils.ts` → `dates.ts` → React). */
const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

/** A family, not a mailing list — the same ceiling the lesson-log mail holds.
 *  More than this is a sign something is wrong, and the school's mail account
 *  should not be the thing that finds out. */
export const MAX_GRADE_RECIPIENTS = 10;

/**
 * Who one student's grade reaches — **the ONE answer, shared by the app and by
 * the Cloud Function that actually sends it.**
 *
 * The two must not each decide this. An ADULT student is their own contact, so
 * their grade goes to them and NOT to a guardian an old import left on their
 * record (#roster-contact); a second copy of that rule server-side is exactly
 * how a college student's marks end up in a stranger's inbox. `adult` is
 * passed in rather than derived here so this module stays free of
 * `isAdultStudent`'s imports — both callers get it from `groupKind.ts`.
 */
export function gradeRecipients(
  contact: Pick<StudentContact, 'email' | 'parentEmail' | 'guardians'> | null | undefined,
  adult: boolean,
): string[] {
  if (!contact) return [];
  const out: string[] = [];
  const add = (v: string | undefined) => {
    const t = (v ?? '').trim();
    if (!t || t.length > 254 || !EMAIL_RE.test(t)) return;
    if (out.some(e => e.toLowerCase() === t.toLowerCase())) return;
    out.push(t);
  };
  add(contact.email);
  if (!adult) {
    // `parentEmail` is the back-compat mirror of guardians[0]; listing both is
    // harmless because this dedupes, and it is the only address a record made
    // before the guardians array carries.
    add(contact.parentEmail);
    for (const g of contact.guardians ?? []) add(g.email);
  }
  return out.slice(0, MAX_GRADE_RECIPIENTS);
}

