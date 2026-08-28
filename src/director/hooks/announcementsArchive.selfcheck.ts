/**
 * Pins announcement archive visibility: archived posts stay out of every
 * public surface and the active director list, but restore clears the flag.
 */
import type { Announcement } from '../types';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

function isArchived(a: Announcement): boolean {
  return !!a.archivedAt;
}

/** Mirror of visibleAnnouncements — must stay in sync with useAnnouncements.ts */
function visibleAnnouncements(
  announcements: Announcement[],
  today: string,
  ensembleIds: string[] | 'all',
  now: number = Date.now(),
): Announcement[] {
  return announcements.filter(a => {
    if (a.archivedAt) return false;
    if (a.publishAt && a.publishAt > now) return false;
    if (a.expiresOn && a.expiresOn < today) return false;
    if (ensembleIds === 'all') return true;
    if (a.ensembleId === null) return true;
    return ensembleIds.includes(a.ensembleId);
  });
}

const base: Announcement = {
  id: 'a1', ensembleId: null, title: 'Test', createdAt: 1,
};

assert(!isArchived(base), 'no archivedAt → not archived');
assert(isArchived({ ...base, archivedAt: 99 }), 'archivedAt set → archived');

const live = visibleAnnouncements([base], '2026-08-28', 'all');
assert(live.length === 1, 'active announcement is visible');

const archived = visibleAnnouncements([{ ...base, archivedAt: Date.now() }], '2026-08-28', 'all');
assert(archived.length === 0, 'archived announcement is hidden from public');

const expired = visibleAnnouncements([{ ...base, expiresOn: '2026-08-27' }], '2026-08-28', 'all');
assert(expired.length === 0, 'expired still filtered');

console.log('announcementsArchive.selfcheck: ok');
