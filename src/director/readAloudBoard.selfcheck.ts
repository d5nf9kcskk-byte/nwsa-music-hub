/**
 * Pins the Read-Aloud board (#read-aloud):
 *  1. A group sees its own posts and the division's, never another group's.
 *  2. Archived, scheduled-for-later and expired posts stay off.
 *  3. Old posts drop off after the window; urgent ones do not.
 *  4. Talking points: empty audience = everyone; expiry honoured.
 *  5. Urgent first, then important, then newest.
 */
import { boardFor, ANNOUNCEMENT_WINDOW_DAYS, speakableLines, defaultPointExpiry, type ReadAloudItem } from './readAloudBoard';
import type { Announcement } from './types';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

const now = Date.UTC(2026, 9, 20, 15);
const today = '2026-10-20';
const DAY = 86_400_000;
const ann = (id: string, o: Partial<Announcement> = {}): Announcement =>
  ({ id, ensembleId: null, title: id, createdAt: now - DAY, ...o });

const posts: Announcement[] = [
  ann('everyone'),
  ann('mine', { ensembleId: 'sym' }),
  ann('theirs', { ensembleId: 'jazz' }),
  ann('archived', { archivedAt: now }),
  ann('later', { publishAt: now + DAY }),
  ann('expired', { expiresOn: '2026-10-19' }),
  ann('old', { createdAt: now - (ANNOUNCEMENT_WINDOW_DAYS + 1) * DAY }),
  ann('oldUrgent', { createdAt: now - 40 * DAY, priority: 'urgent' }),
  ann('important', { createdAt: now - 3 * DAY, priority: 'important' }),
];
const points: ReadAloudItem[] = [
  { id: 'p-all', ensembleIds: [], title: 'Bring pencils', createdAt: now },
  { id: 'p-sym', ensembleIds: ['sym'], title: 'Sectionals', createdAt: now - 2 * DAY },
  { id: 'p-jazz', ensembleIds: ['jazz'], title: 'Jazz only', createdAt: now },
  { id: 'p-gone', ensembleIds: [], title: 'Gone', createdAt: now, expiresOn: '2026-10-19' },
  { id: 'p-today', ensembleIds: [], title: 'Last day', createdAt: now - DAY, expiresOn: today },
];

const ids = boardFor('sym', posts, points, today, now).map(e => e.id);
for (const want of ['everyone', 'mine', 'oldUrgent', 'important', 'p-all', 'p-sym', 'p-today']) {
  assert(ids.includes(want), `${want} belongs on the Symphony board`);
}
for (const not of ['theirs', 'archived', 'later', 'expired', 'old', 'p-jazz', 'p-gone']) {
  assert(!ids.includes(not), `${not} must not be on the Symphony board`);
}
assert(ids[0] === 'oldUrgent' && ids[1] === 'important', 'urgent first, then important');
assert(ids[2] === 'p-all', 'then newest first');

assert(speakableLines('- one\n\n[the form](/forms) today').join('|') === 'one|the form today',
  'bullets and link syntax are reduced to words to say');
assert(defaultPointExpiry('2026-12-28') === '2027-01-04', 'default expiry rolls over a year');

console.log('readAloud.selfcheck: OK');
