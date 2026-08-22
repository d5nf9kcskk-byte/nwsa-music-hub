/**
 * Shared schedule-change machinery (#schedule-ux-redesign Phase 1).
 *
 * Banner + revert used to be properties of the SCREEN you used: a cancel via
 * the Schedule Changes day view posted the red banner and captured a revert
 * snapshot, while the same cancel via the calendar's event form did neither.
 * These helpers are the one path both screens call, so the guarantees follow
 * the change, not the door.
 */
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { addDays } from '../utils';
import type { CalendarEvent, Announcement } from '../types';

export interface AnnouncementApi {
  announcements: Announcement[];
  addAnnouncement: (data: Omit<Announcement, 'id'>) => Promise<string | undefined>;
  updateAnnouncement: (id: string, data: Partial<Omit<Announcement, 'id'>>) => Promise<void>;
  deleteAnnouncement: (id: string) => Promise<void>;
}

/** Enqueue the Teams/email relay entry (best-effort — never blocks a save). */
async function queueRelay(title: string, ensembleIds: string[]) {
  if (!db) return;
  try {
    await addDoc(collection(db, 'notifyQueue'), {
      kind: 'urgent-announcement', title, ensembleIds, createdAt: Date.now(), processedAt: null,
    });
  } catch { /* relay is best-effort */ }
}

/**
 * Every live red banner that belongs to these events, oldest first. Matched
 * three ways so a repeat change never stacks a second banner:
 *   1. the event's own `changeAnnouncementId` link,
 *   2. a banner stamped with this `eventId`,
 *   3. legacy banners posted before either existed — same expiry as this
 *      day's change, urgent, and titled after the event.
 * Anything beyond the first is a duplicate the caller folds away.
 */
export function bannersForEvents(
  announcements: Announcement[],
  evts: CalendarEvent[],
  labels: string[],
  date: string,
): Announcement[] {
  const linked = new Set(evts.map(e => e.changeAnnouncementId).filter(Boolean) as string[]);
  const eventIds = new Set(evts.map(e => e.id));
  const expiry = addDays(date, 1);
  return announcements
    .filter(a =>
      a.priority === 'urgent' && (
        linked.has(a.id) ||
        (!!a.eventId && eventIds.has(a.eventId)) ||
        (!a.eventId && a.expiresOn === expiry && labels.some(l => l && a.title.includes(l)))
      ))
    .sort((x, y) => (x.createdAt ?? 0) - (y.createdAt ?? 0));
}

/**
 * One event = one red banner. Posts the urgent announcement for a change —
 * or, when one of these events already has a banner (a repeat change, or a
 * change made from another screen), rewrites that banner and folds away any
 * duplicates, so families see a single banner describing the current state.
 * Also enqueues the notify relay. Returns the announcement id so the caller
 * can link it from the event (`changeAnnouncementId`) and a revert can pull
 * it back down.
 */
export async function announceChange(
  api: AnnouncementApi,
  date: string,
  title: string,
  evts: CalendarEvent[],
  labels: string[],
): Promise<string | undefined> {
  const ensembleIds = [...new Set(evts.flatMap(e => e.ensembleIds))];
  const existing = bannersForEvents(api.announcements, evts, labels, date);
  const [keep, ...dupes] = existing;
  let annId: string | undefined;
  if (keep) {
    await api.updateAnnouncement(keep.id, {
      title,
      ensembleId: ensembleIds.length === 1 ? ensembleIds[0] : null,
      createdAt: Date.now(), // resurface as the newest post
      expiresOn: addDays(date, 1),
      eventId: evts[0].id, // stamp legacy banners so the next change finds this one
    });
    annId = keep.id;
  } else {
    annId = await api.addAnnouncement({
      title,
      ensembleId: ensembleIds.length === 1 ? ensembleIds[0] : null,
      priority: 'urgent',
      createdAt: Date.now(),
      expiresOn: addDays(date, 1),
      eventId: evts[0].id,
    });
  }
  await queueRelay(title, ensembleIds);
  for (const d of dupes) await api.deleteAnnouncement(d.id);
  return annId;
}

// Snapshot capture and revert planning moved to changePlan.ts (pure, no
// firebase imports, loadable by the Phase-2 selfcheck); re-exported here so
// "the shared change machinery" keeps one import site.
export { snapshot, captureOriginal, combineSnapshot } from './changePlan';
