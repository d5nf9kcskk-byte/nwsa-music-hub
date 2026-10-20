/**
 * The Read-Aloud board (#read-aloud, Oct 2026): what a Student Assistant
 * stands up and says to their ensemble at the start of rehearsal.
 *
 * Director's ask, 2026-10-20: one place the assistant reads from, filled
 * automatically from what is already posted on the Hub for THAT ensemble or
 * for the whole music division, plus points a director adds by hand, plus
 * points the assistant adds — which wait for a director's approval like
 * every other assistant write (#approvals).
 *
 * This module is the ONE answer to "what goes on the board for this group".
 * No imports beyond types, so its self-check runs under plain Node.
 *
 * - **Announcements are not copied.** The board reads the live
 *   `announcements` docs every time, so an edit or a delete on the
 *   Announcements screen is what the assistant reads, with nothing to
 *   keep in step. Only RECENT posts ride along (`ANNOUNCEMENT_WINDOW_DAYS`):
 *   a pinned post from September is not news to read out in November.
 *   Urgent posts ride for as long as they are live, whatever their age.
 * - **Talking points are staff-and-assistant only** (`readAloudItems`). They
 *   are things to SAY, not things to publish, so they never reach the
 *   public site. Empty `ensembleIds` = the whole music division.
 * - **A point's audience is ensemble ids and nothing else** — never student
 *   ids, same reason as sign-ups.
 */
import type { Announcement, AnnouncementLink, AnnouncementPriority } from './types';

export const ANNOUNCEMENT_WINDOW_DAYS = 14;
/** How long a new talking point stays up when nobody picks a date. */
export const DEFAULT_POINT_DAYS = 7;
export const MAX_POINT_TITLE = 140;
export const MAX_POINT_BODY = 1200;
export const MAX_POINT_LINKS = 4;

export interface ReadAloudItem {
  id: string;
  /** Empty = everyone in the music division. */
  ensembleIds: string[];
  title: string;
  body?: string;
  links?: AnnouncementLink[];
  /** YYYY-MM-DD; still shown ON this date, gone after. */
  expiresOn?: string;
  createdAt: number;
  createdBy?: string;
  createdByEmail?: string;
}

export interface BoardEntry {
  key: string;
  source: 'announcement' | 'point';
  id: string;
  title: string;
  body?: string;
  links: AnnouncementLink[];
  priority: AnnouncementPriority;
  /** True when it is for the whole division rather than this group. */
  everyone: boolean;
  at: number;
}

const DAY = 86_400_000;

function announcementLive(a: Announcement, today: string, now: number): boolean {
  if (a.archivedAt) return false;
  if (a.publishAt && a.publishAt > now) return false;
  if (a.expiresOn && a.expiresOn < today) return false;
  return true;
}

/**
 * Everything to read to `ensembleId` today, most important first: urgent,
 * then important, then newest. Announcements and talking points interleave
 * by that one order, so the assistant reads top to bottom.
 */
export function boardFor(
  ensembleId: string,
  announcements: readonly Announcement[],
  points: readonly ReadAloudItem[],
  today: string,
  now: number,
): BoardEntry[] {
  const since = now - ANNOUNCEMENT_WINDOW_DAYS * DAY;
  const out: BoardEntry[] = [];

  for (const a of announcements) {
    if (!announcementLive(a, today, now)) continue;
    if (a.ensembleId !== null && a.ensembleId !== ensembleId) continue;
    const at = Math.max(a.publishAt ?? 0, a.createdAt ?? 0);
    if (a.priority !== 'urgent' && at < since) continue;
    out.push({
      key: `a:${a.id}`, source: 'announcement', id: a.id,
      title: a.title, body: a.body, links: a.links ?? [],
      priority: a.priority ?? 'info', everyone: a.ensembleId === null, at,
    });
  }

  for (const p of points) {
    if (p.expiresOn && p.expiresOn < today) continue;
    const ids = p.ensembleIds ?? [];
    if (ids.length > 0 && !ids.includes(ensembleId)) continue;
    out.push({
      key: `p:${p.id}`, source: 'point', id: p.id,
      title: p.title, body: p.body, links: p.links ?? [],
      priority: 'info', everyone: ids.length === 0, at: p.createdAt,
    });
  }

  const rank: Record<AnnouncementPriority, number> = { urgent: 0, important: 1, info: 2 };
  return out.sort((x, y) => rank[x.priority] - rank[y.priority] || y.at - x.at);
}

/** "Questions? Here's where to look." — the standing pages for one group,
 *  printed under every board. App-relative, same shape as announcement
 *  links, so one renderer serves both. */
export function questionLinks(ensembleId: string, ensembleName: string): AnnouncementLink[] {
  return [
    { label: `${ensembleName} page`, url: `/ensemble/${ensembleId}` },
    { label: 'Calendar', url: '/calendar' },
    { label: 'All announcements', url: '/announcements' },
    { label: 'Forms', url: '/forms' },
    { label: 'Documents', url: '/documents' },
  ];
}

/** Body text as short lines to say one at a time. Markdown-style link
 *  syntax is reduced to its label, since a link is read, not clicked. */
export function speakableLines(body: string | undefined): string[] {
  if (!body) return [];
  return body
    .replace(/\[([^\]\n]+)\]\([^)\s]+\)/g, '$1')
    .split(/\n+/)
    .map(l => l.replace(/^\s*[-*•]\s*/, '').trim())
    .filter(Boolean);
}

/** Plain text of a whole board, for pasting into a group chat. Absolute
 *  addresses, because a pasted `/calendar` goes nowhere. */
export function boardAsText(
  ensembleName: string,
  entries: readonly BoardEntry[],
  questions: readonly AnnouncementLink[],
  absolute: (url: string) => string,
): string {
  const lines: string[] = [`${ensembleName} announcements`, ''];
  entries.forEach((e, i) => {
    lines.push(`${i + 1}. ${e.title}`);
    for (const l of speakableLines(e.body)) lines.push(`   ${l}`);
    for (const l of e.links) lines.push(`   ${l.label}: ${absolute(l.url)}`);
    lines.push('');
  });
  lines.push('Questions?');
  for (const l of questions) lines.push(`${l.label}: ${absolute(l.url)}`);
  return lines.join('\n');
}

/** Default "take down after" date for a new point. */
export function defaultPointExpiry(today: string): string {
  const d = new Date(`${today}T12:00:00`);
  d.setDate(d.getDate() + DEFAULT_POINT_DAYS);
  return d.toISOString().slice(0, 10);
}
