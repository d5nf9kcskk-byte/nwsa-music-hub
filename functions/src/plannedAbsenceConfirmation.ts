/**
 * The absence-report confirmation email (#absence-report).
 *
 * A receipt for the student: proof they sent it, and what they sent — the
 * direct payoff of shifting the whole reporting burden onto them. Fires once,
 * when a report is created. The two pre-existing writers into `plannedAbsences`
 * (PlannedAbsenceButton.tsx, scripts/apply-absence-email.mjs) never collect an
 * email at all, so for their docs this is a silent no-op, not a special case.
 *
 * Same reason this is a Cloud Function and not a client write as
 * signupConfirmation.ts: `mail` is denied to every client in firestore.rules,
 * because a client-side "just write a mail doc" would hand anyone on the
 * internet the school's SMTP account. Written here, through the Admin SDK,
 * from data that already passed the rules' shape checks; index.ts holds only
 * the trigger and the one Firestore read (the org's own contact email is a
 * static import, not a lookup).
 */
import { ABSENCE_CATEGORY_LABEL, type PlannedAbsence } from '../../src/director/types.ts';
import type { MailDoc } from './signupConfirmation.ts';

/** Same bar the rules hold `email` to, applied again on the way out — the
 *  rules are the gate, this is the belt. */
const EMAIL_RE = /^.+@.+\..+$/;

function validEmail(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 254 && EMAIL_RE.test(value.trim());
}

/** Minimal HTML escaping — every value below is student-supplied free text. */
export function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function firstName(fullName: string): string {
  const name = (fullName ?? '').trim();
  // The roster stores "Last, First" — the greeting wants the First.
  if (name.includes(',')) return name.split(',')[1]?.trim().split(/\s+/)[0] ?? name;
  return name.split(/\s+/)[0] ?? name;
}

export interface Branding {
  orgName: string;
  contactEmail: string;
}

/**
 * Build the whole mail doc, or null when there is nothing to send.
 *
 * Null (not a throw) for the ordinary case — no email on the report, or a
 * malformed one — because that is the majority of docs in this collection,
 * not a failure.
 */
export function buildAbsenceReceipt(
  report: Pick<PlannedAbsence, 'email' | 'studentName' | 'date' | 'category'>,
  branding: Branding,
): MailDoc | null {
  if (!validEmail(report.email)) return null;
  const to = [report.email.trim()];
  const who = firstName(report.studentName);
  // The rules already close `category` to a known set, but this data still
  // comes from Firestore at runtime, not the type checker — fall back to the
  // raw value rather than printing "undefined" for anything unrecognized.
  const catLabel = report.category ? (ABSENCE_CATEGORY_LABEL[report.category] ?? report.category) : 'Reported absence';

  const subject = `Absence report received — ${report.date}`;
  const textParts = [
    `Hi ${who},`,
    '',
    `Your director received your absence report for ${report.date}.`,
    `Reason: ${catLabel}`,
    '',
    'Keep this email as your record of sending it.',
    `If you need to change anything, email ${branding.contactEmail}.`,
    '',
    `— ${branding.orgName}`,
  ];

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.55;color:#18181b">
<p>Hi ${escapeHtml(who)},</p>
<p>Your director received your absence report for <strong>${escapeHtml(report.date)}</strong>.</p>
<p><strong>Reason:</strong> ${escapeHtml(catLabel)}</p>
<p style="color:#52525b">Keep this email as your record of sending it. If you need to change anything, email <a href="mailto:${escapeHtml(branding.contactEmail)}">${escapeHtml(branding.contactEmail)}</a>.</p>
<p style="color:#52525b">— ${escapeHtml(branding.orgName)}</p>
</div>`;

  return { to, message: { subject, text: textParts.join('\n'), html } };
}
