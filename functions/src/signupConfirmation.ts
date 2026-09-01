/**
 * The sign-up confirmation email (#signups).
 *
 * "Tell me the time I signed up for" — the third door, after the confirmation
 * screen and the schedule page. Sent once, when a response is created.
 *
 * WHY THIS IS A CLOUD FUNCTION AND NOT A CLIENT WRITE. The Trigger Email
 * extension sends whatever lands in the `mail` collection. Public sign-ups
 * are UNAUTHENTICATED writes, so a client-side "just write a mail doc" would
 * hand anyone on the internet the school's SMTP account: arbitrary recipient,
 * arbitrary body, sent as the school. `mail` is therefore denied to every
 * client in firestore.rules (explicitly, not just by the catch-all) and is
 * written ONLY here, through the Admin SDK, from data that already passed the
 * rules' shape checks. Do not open that collection to the client for any
 * reason.
 *
 * The recipient is never taken from a parameter: it is read off the response
 * doc the student themselves just submitted, and the rules already bound it
 * to one address-shaped string of at most 254 characters. Nothing here can be
 * pointed at a third party.
 *
 * Everything in this file is pure so signupConfirmation.selfcheck.ts can pin
 * it without a network, a project, or a mailbox; index.ts holds only the
 * trigger and the two Firestore reads.
 */
import { icsCalendar, icsEvent } from '../../src/shared/ics.ts';
import { slotCalendarEvent } from '../../src/shared/signupBooking.ts';
import { isTimeslotQuestion } from '../../src/shared/signupSlots.ts';
import type { SignupForm, SignupResponse } from '../../src/director/types.ts';

/** The document shape the Trigger Email extension consumes. `from` is NOT set
 *  here — it comes from the extension's own DEFAULT_FROM, so the sending
 *  identity is configuration, never something this code can choose. */
export interface MailDoc {
  to: string[];
  message: {
    subject: string;
    text: string;
    html: string;
    attachments?: { filename: string; content: string; encoding: string; contentType: string }[];
  };
}

/** Same bar the rules hold `email` to, applied again on the way out — the
 *  rules are the gate, this is the belt. */
const EMAIL_RE = /^.+@.+\..+$/;

function validEmail(value: unknown): value is string {
  return typeof value === 'string'
    && value.length <= 254
    && EMAIL_RE.test(value.trim());
}

/**
 * Who this confirmation goes to: the student, and the guardian who signed.
 *
 * Both addresses were typed on THIS form by the person submitting it, for
 * exactly this purpose. Deduped case-insensitively so a guardian who used the
 * same address as the student is not mailed twice.
 */
export function recipients(response: Pick<SignupResponse, 'email' | 'guardianEmail'>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of [response.email, response.guardianEmail]) {
    if (!validEmail(raw)) continue;
    const clean = raw.trim();
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

/** Answers ride as one bounded JSON string; never throw on a malformed one. */
export function parseAnswers(answersJson: string | undefined): Record<string, string> {
  if (!answersJson) return {};
  try {
    const parsed: unknown = JSON.parse(answersJson);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'string') out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/** One picked time: the label the student saw, plus the slot's coordinates so
 *  a dated slot can also become a calendar attachment. */
export interface PickedTime {
  questionId: string;
  slotIndex: number;
  label: string;
}

/**
 * The time slot(s) this response picked, resolved against the form.
 *
 * Reads the ANSWERS rather than the booking docs on purpose: the answer is
 * part of the same document that triggered this function, so there is no
 * second read to race against a booking that has not landed yet.
 */
export function pickedTimes(form: SignupForm, response: Pick<SignupResponse, 'answersJson'>): PickedTime[] {
  const answers = parseAnswers(response.answersJson);
  const out: PickedTime[] = [];
  for (const q of form.questions ?? []) {
    if (!isTimeslotQuestion(q)) continue;
    const label = (answers[q.id] ?? '').trim();
    if (!label) continue;
    const slotIndex = (q.options ?? []).indexOf(label);
    if (slotIndex < 0) continue;
    out.push({ questionId: q.id, slotIndex, label });
  }
  return out;
}

function firstName(fullName: string): string {
  const name = (fullName ?? '').trim();
  // The roster stores "Last, First" — the greeting wants the First.
  if (name.includes(',')) return name.split(',')[1]?.trim().split(/\s+/)[0] ?? name;
  return name.split(/\s+/)[0] ?? name;
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

export interface Branding {
  orgName: string;
  contactEmail: string;
  ics: { prodId: string; uidDomain: string; timezone: string; namePrefix: string };
}

/**
 * The .ics attachment: the picked time as a calendar file, so the confirmation
 * doesn't just SAY the time, it hands over the appointment.
 *
 * Only dated slots (built with the slot picker) produce one — a hand-typed
 * label has no date in it, and a calendar entry guessed from free text would
 * land on the wrong day. Returns null when there is nothing datable.
 */
export function calendarAttachment(
  form: SignupForm,
  times: PickedTime[],
  branding: Branding,
): MailDoc['message']['attachments'] {
  const lookups = { ensembleName: () => undefined };
  const vevents = times
    .map(t => slotCalendarEvent(form, t.questionId, t.slotIndex))
    .filter((e): e is NonNullable<typeof e> => e !== null)
    .map(e => icsEvent(e, lookups, branding.ics));
  if (vevents.length === 0) return undefined;
  const body = icsCalendar(form.title || 'Sign-up', form.title || 'Sign-up', vevents, branding.ics);
  return [{
    filename: 'signup-time.ics',
    content: Buffer.from(body, 'utf8').toString('base64'),
    encoding: 'base64',
    // text/calendar with METHOD=PUBLISH is what makes Gmail and Apple Mail
    // offer "Add to calendar" inline instead of a bare file download.
    contentType: 'text/calendar; charset=utf-8; method=PUBLISH',
  }];
}

/**
 * Build the whole mail doc, or null when there is nothing to send.
 *
 * Null (not a throw) for the ordinary cases — no address on the response, or
 * a form that collected no email — because those are normal, not failures.
 */
export function buildConfirmation(
  form: SignupForm,
  response: Pick<SignupResponse, 'email' | 'guardianEmail' | 'studentName' | 'answersJson'>,
  branding: Branding,
): MailDoc | null {
  const to = recipients(response);
  if (to.length === 0) return null;

  const times = pickedTimes(form, response);
  const title = form.title || 'your sign-up';
  const who = firstName(response.studentName);

  const subject = times.length === 1
    ? `Your time for ${title}: ${times[0].label}`
    : `You're signed up: ${title}`;

  const timeLinesText = times.map(t => `  ${t.label}`);
  const textParts = [
    `Hi ${who},`,
    '',
    `You're signed up for ${title}.`,
  ];
  if (times.length > 0) {
    textParts.push('', times.length === 1 ? 'Your time:' : 'Your times:', ...timeLinesText);
  }
  textParts.push(
    '',
    'Keep this email — it is your record of what you signed up for.',
    `If you need to change anything, email ${branding.contactEmail}.`,
    '',
    `— ${branding.orgName}`,
  );

  const timeHtml = times.length > 0
    ? `<p style="margin:16px 0"><strong>${times.length === 1 ? 'Your time' : 'Your times'}:</strong></p>
<ul style="margin:0 0 16px;padding-left:20px">${times
  .map(t => `<li style="margin-bottom:4px"><strong>${escapeHtml(t.label)}</strong></li>`)
  .join('')}</ul>`
    : '';

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.55;color:#18181b">
<p>Hi ${escapeHtml(who)},</p>
<p>You're signed up for <strong>${escapeHtml(title)}</strong>.</p>
${timeHtml}<p style="color:#52525b">Keep this email — it is your record of what you signed up for. If you need to change anything, email <a href="mailto:${escapeHtml(branding.contactEmail)}">${escapeHtml(branding.contactEmail)}</a>.</p>
<p style="color:#52525b">— ${escapeHtml(branding.orgName)}</p>
</div>`;

  const attachments = calendarAttachment(form, times, branding);

  return {
    to,
    message: { subject, text: textParts.join('\n'), html, ...(attachments ? { attachments } : {}) },
  };
}
