/**
 * Mail the Hub sends to players (#messages, personnel orgs, W3b): a tracked
 * broadcast, and the nudge that says "the office wrote to you".
 *
 * Pure, so `memberMail.selfcheck.ts` pins it with no network or mailbox;
 * memberMessages.ts holds the triggers and the reads.
 *
 * WHY THIS IS THE FIRST FREE-TEXT SEND. Every other Hub email is built from
 * stored records. A broadcast's subject and body ARE typed by staff, so the
 * request is held to: Owner or Director only (rules AND re-checked here),
 * recipients read from the stored roster and never from the request, size
 * ceilings (rules: 150 / 5000), a daily cap, reply-to the real sender, and a
 * time-to-live on the `mail` doc (bodies may mention pay).
 */
import { escapeHtml } from './gradeMail.ts';
import type { MailDoc } from './signupConfirmation.ts';

export const SUBJECT_MAX = 150;
export const BODY_MAX = 5000;
/** Mails the Hub may send in one UTC day, broadcasts and nudges together.
 *  Gmail's documented ceiling for the sender account is about 500 a day, and
 *  invitations (passwordSetup, 120 an hour) share that account. */
export const DAILY_CAP = 300;
/** One request may not reach more people than this (a roster is ~85). */
export const MAX_RECIPIENTS = 200;
/** `mail` docs bodies may mention pay: gone after 30 days. Needs the Firestore
 *  TTL policy on `mail.expireAt` (go-live step in the W3b note). */
export const MAIL_TTL_MS = 30 * 86_400_000;
/** The Sent list and its per-player docs: a season's history, then gone. */
export const RECORD_TTL_MS = 90 * 86_400_000;
/** A player is nudged at most this often per thread. */
export const NUDGE_EVERY_MS = 2 * 3_600_000;

const DOC_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
export const isDocId = (v: unknown): v is string => typeof v === 'string' && DOC_ID_RE.test(v);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type Audience = 'all' | 'section' | 'person';
export interface BroadcastRequest {
  byEmail: string;
  subject: string;
  body: string;
  audience: Audience;
  section?: string;
  personnelId?: string;
}

/** The request as the rules shaped it, checked again: null when anything is off. */
export function parseRequest(raw: unknown): BroadcastRequest | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const { byEmail, subject, body, audience, section, personnelId } = r;
  if (typeof byEmail !== 'string' || !byEmail.includes('@')) return null;
  if (typeof subject !== 'string' || !subject.trim() || subject.length > SUBJECT_MAX) return null;
  if (typeof body !== 'string' || !body.trim() || body.length > BODY_MAX) return null;
  if (audience === 'section' && (typeof section !== 'string' || !section.trim())) return null;
  if (audience === 'person' && !isDocId(personnelId)) return null;
  if (audience !== 'all' && audience !== 'section' && audience !== 'person') return null;
  return {
    byEmail, subject: subject.trim(), body, audience,
    ...(audience === 'section' ? { section: String(section).trim() } : {}),
    ...(audience === 'person' ? { personnelId: String(personnelId) } : {}),
  };
}

/** An Owner or Director entry (either spelling of the role, as the rules read it). */
export function isStaffEntry(d: Record<string, unknown> | undefined): boolean {
  if (!d) return false;
  const roles = Array.isArray(d.roles) ? d.roles : [d.role ?? 'director'];
  return roles.some(r => r === 'owner' || r === 'director');
}

export interface Person { id: string; data: Record<string, unknown> }
export type ToState = 'queued' | 'no-address' | 'failed' | 'sent';
export interface Plan {
  /** One `mail` doc each. */
  send: { personnelId: string; name: string; to: string }[];
  /** Counted, named, and never silently dropped. */
  skipped: { personnelId: string; name: string; state: 'no-address' }[];
}

const same = (a: unknown, b: unknown) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();

/**
 * Who a request reaches: ROSTER people only (a `personnel` row), the stored
 * address, one mail per person. `all` and `section` mean Contracted players;
 * `person` may name a SubList player too. Inactive people are never mailed.
 * A shared address is mailed once (two players on one family email).
 */
export function planRecipients(
  req: Pick<BroadcastRequest, 'audience' | 'section' | 'personnelId'>,
  people: Person[],
  emailOf: (personnelId: string) => unknown,
): Plan {
  const chosen = people.filter(p => {
    const status = p.data.status;
    if (!isDocId(p.id)) return false;
    if (req.audience === 'person') return p.id === req.personnelId && (status === 'Contracted' || status === 'SubList');
    if (status !== 'Contracted') return false;
    return req.audience === 'all' || same(p.data.section, req.section);
  }).slice(0, MAX_RECIPIENTS);
  const plan: Plan = { send: [], skipped: [] };
  const seen = new Set<string>();
  for (const p of chosen) {
    const name = String(p.data.name ?? '').slice(0, 120);
    const raw = String(emailOf(p.id) ?? '').trim();
    if (!EMAIL_RE.test(raw)) { plan.skipped.push({ personnelId: p.id, name, state: 'no-address' }); continue; }
    if (seen.has(raw.toLowerCase())) continue;
    seen.add(raw.toLowerCase());
    plan.send.push({ personnelId: p.id, name, to: raw });
  }
  return plan;
}

/** What the player is called in a greeting: "Goes by", else the first word of the name. */
export function greetingName(data: Record<string, unknown>): string {
  const pref = String(data.preferredName ?? '').trim();
  if (pref) return pref;
  const name = String(data.name ?? '').trim();
  // "Ruiz, Ana" is how some rows are typed.
  return (name.includes(',') ? name.split(',')[1] : name.split(/\s+/)[0] ?? '').trim();
}

/** `{name}` in the typed text becomes the player's name; nothing else is a template. */
export function mergeName(text: string, name: string): string {
  return text.replace(/\{name\}/gi, name);
}

export interface MemberMail extends MailDoc {
  replyTo: string;
  expireAt: Date;
  /** What the status writeback reads to find the player's row. */
  memberMail: { queueId: string; personnelId: string };
}

/** The mail doc for one player. Subject, body, sender: typed by staff, escaped here. */
export function buildBroadcastMail(args: {
  req: BroadcastRequest; queueId: string; personnelId: string; to: string; recipientName: string;
  senderName: string; orgName: string; now: number;
}): MemberMail {
  const { req, queueId, personnelId, to, recipientName, senderName, orgName, now } = args;
  const sender = senderName.trim().slice(0, 80) || req.byEmail;
  const text = `${mergeName(req.body, recipientName).trim()}\n\n— ${sender}\n${orgName}\nReply to this email to reach ${sender}.`;
  return {
    to: [to],
    replyTo: req.byEmail,
    message: { subject: mergeName(req.subject, recipientName), text, html: `<p>${escapeHtml(text).replace(/\r?\n/g, '<br>')}</p>` },
    expireAt: new Date(now + MAIL_TTL_MS),
    memberMail: { queueId, personnelId },
  };
}

/** "The office wrote to you": no message text, because it may mention pay. */
export function buildNudgeMail(args: { to: string; recipientName: string; orgName: string; url: string; now: number }): MailDoc & { expireAt: Date } {
  const { to, recipientName, orgName, url, now } = args;
  const text = `Hi ${recipientName},\n\nThe ${orgName} office sent you a message. Open the Hub and tap Messages to read it:\n${url}\n\nYou can answer there.`;
  return {
    to: [to],
    message: { subject: `A message from the ${orgName} office`, text, html: `<p>${escapeHtml(text).replace(/\r?\n/g, '<br>')}</p>` },
    expireAt: new Date(now + MAIL_TTL_MS),
  };
}

/** The UTC day a cap counter belongs to: `memberMailCaps/<this>`. */
export const capDay = (now: number) => new Date(now).toISOString().slice(0, 10);

/** The count after `n` more mails, or null when that would pass the cap. */
export function withinCap(used: number, n: number, cap = DAILY_CAP): number | null {
  return used + n <= cap ? used + n : null;
}

/** Has a nudge gone out too recently for another? */
export const nudgeDue = (lastNudgedAt: unknown, now: number) =>
  typeof lastNudgedAt !== 'number' || now - lastNudgedAt >= NUDGE_EVERY_MS;

/** A thread's one-line preview: what the inbox shows, never the whole message. */
export const preview = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, 140);
