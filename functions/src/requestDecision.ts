/**
 * The answer to a student's request, by email (#requests).
 *
 * A director says yes or no on the Requests screen; the trigger in index.ts
 * sees the status change and this builds the email. Two kinds:
 *   • an absence request — approved or declined, with the director's note;
 *   • a copy request — only a "can't do" is emailed. "Copied" means it is in
 *     the folder, which the student finds out at rehearsal.
 *
 * The decision is mailed only when it was made on the Requests screen
 * (`decidedAt` set on the change). A staff-filed heads-up is marked approved
 * without one, and so is never mailed. `mail` is denied to every client, so
 * this is a function for the same reason signupConfirmation.ts is.
 */
import { ABSENCE_CATEGORY_LABEL, type PlannedAbsence } from '../../src/director/types.ts';
import type { CopyRequest } from '../../src/shared/copyRequest.ts';
import { escapeHtml, type Branding } from './plannedAbsenceConfirmation.ts';
import type { MailDoc } from './signupConfirmation.ts';

const EMAIL_RE = /^.+@.+\..+$/;
function validEmail(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 254 && EMAIL_RE.test(value.trim());
}

function firstName(fullName: string): string {
  const name = (fullName ?? '').trim();
  if (name.includes(',')) return name.split(',')[1]?.trim().split(/\s+/)[0] ?? name;
  return name.split(/\s+/)[0] ?? name;
}

function render(to: string, subject: string, who: string, lines: string[], note: string | undefined, branding: Branding): MailDoc {
  const text = [
    `Hi ${who},`, '', ...lines,
    ...(note ? ['', `From your director: ${note}`] : []),
    '', `Questions? Email ${branding.contactEmail}.`, '', `— ${branding.orgName}`,
  ].join('\n');
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.55;color:#18181b">
<p>Hi ${escapeHtml(who)},</p>
${lines.map(l => `<p>${escapeHtml(l)}</p>`).join('\n')}
${note ? `<p><strong>From your director:</strong> ${escapeHtml(note).replace(/\n/g, '<br>')}</p>` : ''}
<p style="color:#52525b">Questions? Email <a href="mailto:${escapeHtml(branding.contactEmail)}">${escapeHtml(branding.contactEmail)}</a>.</p>
<p style="color:#52525b">— ${escapeHtml(branding.orgName)}</p>
</div>`;
  return { to: [to.trim()], message: { subject, text, html } };
}

type Absence = Pick<PlannedAbsence, 'email' | 'studentName' | 'date' | 'category' | 'status' | 'decidedAt' | 'decisionNote'>;

/** The email for an absence request that was just answered, or null when
 *  there is nothing to send (not a decision, or no address). */
export function buildAbsenceDecision(before: Absence, after: Absence, branding: Branding): MailDoc | null {
  if (before.status === after.status || !after.decidedAt) return null;
  if (after.status !== 'approved' && after.status !== 'declined') return null;
  if (!validEmail(after.email)) return null;
  const what = after.category ? (ABSENCE_CATEGORY_LABEL[after.category] ?? after.category) : 'Absence';
  const yes = after.status === 'approved';
  return render(
    after.email,
    `Absence request ${yes ? 'approved' : 'not approved'} — ${after.date}`,
    firstName(after.studentName),
    [yes
      ? `Your absence request for ${after.date} (${what}) was approved. It is marked excused.`
      : `Your absence request for ${after.date} (${what}) was not approved. Plan to be there.`],
    after.decisionNote?.trim() || undefined,
    branding,
  );
}

type Copy = Pick<CopyRequest, 'email' | 'studentName' | 'pieceTitle' | 'part' | 'status' | 'decisionNote'>;

/** Only "can't do" is mailed, and only to a student who left an address. */
export function buildCopyDecline(before: Copy, after: Copy, branding: Branding): MailDoc | null {
  if (before.status === after.status || after.status !== 'declined') return null;
  if (!validEmail(after.email)) return null;
  return render(
    after.email,
    `About your copy request — ${after.pieceTitle}`,
    firstName(after.studentName),
    [`Your director can’t make the copy you asked for: ${after.pieceTitle}, ${after.part}.`],
    after.decisionNote?.trim() || undefined,
    branding,
  );
}
