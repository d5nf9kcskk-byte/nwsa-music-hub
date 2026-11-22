/**
 * The pure parts of messages to players (#messages, personnel orgs): types,
 * unread marks, section-link ids, and a preview of who a broadcast reaches.
 * `officeCore.selfcheck.ts` pins them (and checks the preview against the
 * server's own planRecipients, so the screen cannot promise what the
 * function will not do).
 */
export interface ThreadSummary {
  personnelId: string; name: string; lastAt: number; lastFrom: 'member' | 'staff'; lastText: string;
  staffReadAt?: number; memberReadAt?: number;
}
export interface ThreadMessage { id: string; from: 'member' | 'staff'; text: string; at: number; byName?: string }
export type Audience = 'all' | 'section' | 'person';
export interface Broadcast {
  id: string; byEmail: string; subject: string; body: string; audience: Audience;
  section?: string; personnelId?: string; queuedAt: number;
  status?: 'queued' | 'refused'; reason?: string; counts?: { send: number; noAddress: number };
}
export type ToState = 'queued' | 'sent' | 'failed' | 'no-address';
export interface BroadcastTo { personnelId: string; name: string; state: ToState; error?: string }

/** Ceilings the rules hold (firestore.rules memberMailOk / threadMessageOk). */
export const SUBJECT_MAX = 150;
export const BODY_MAX = 5000;
export const MESSAGE_MAX = 2000;

/** The office has something unread from this player. */
export const staffUnread = (t: ThreadSummary) => t.lastFrom === 'member' && t.lastAt > (t.staffReadAt ?? 0);
/** The player has something unread from the office. */
export const memberUnread = (t: ThreadSummary | null | undefined) => !!t && t.lastFrom === 'staff' && t.lastAt > (t.memberReadAt ?? 0);
/** A stamp that cannot sit behind the message it marks, whichever clock is ahead. */
export const readStamp = (t: ThreadSummary, now = Date.now()) => Math.max(now, t.lastAt);

/** `sectionLinks/<this>`: the section name as a document id. */
export const sectionSlug = (section: string) =>
  section.trim().toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);

/** The rules' test for a chat link: https, no spaces, at most 300. */
export const linkOk = (url: string) => /^https:\/\/[^\s]+$/.test(url) && url.length <= 300;

const same = (a: unknown, b: unknown) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
const addressOk = (e: unknown) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e ?? '').trim());

/** The same answer the function will give (memberMail.ts planRecipients), before the press. */
export function previewReach(
  req: { audience: Audience; section?: string; personnelId?: string },
  people: { id: string; section?: string; status: string }[],
  emailOf: (id: string) => unknown,
): { send: number; noAddress: number } {
  const chosen = people.filter(p => {
    if (req.audience === 'person') return p.id === req.personnelId && (p.status === 'Contracted' || p.status === 'SubList');
    return p.status === 'Contracted' && (req.audience === 'all' || same(p.section, req.section));
  });
  const seen = new Set<string>();
  let send = 0, noAddress = 0;
  for (const p of chosen) {
    const e = String(emailOf(p.id) ?? '').trim().toLowerCase();
    if (!addressOk(e)) { noAddress++; continue; }
    if (!seen.has(e)) { seen.add(e); send++; }
  }
  return { send, noAddress };
}

export const STATE_LABEL: Record<ToState, string> = { queued: 'Waiting', sent: 'Sent', failed: 'Failed', 'no-address': 'No email' };

/** "Sent 12 · Failed 1 · Waiting 3 · No email 2" for a Sent row. */
export function tally(rows: BroadcastTo[]): string {
  const n = (s: ToState) => rows.filter(r => r.state === s).length;
  return (['sent', 'failed', 'queued', 'no-address'] as ToState[]).filter(s => n(s)).map(s => `${STATE_LABEL[s]} ${n(s)}`).join(' · ');
}
