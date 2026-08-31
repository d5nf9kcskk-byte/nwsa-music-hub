import { useEffect } from 'react';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { todayStr } from '../utils';
import { richTextToPlain } from '../../shared/richTextParse';
import { ORG } from '../../org';
import { useAnnouncements, useMinuteTick } from '../hooks/useAnnouncements';
import type { Announcement } from '../types';

/**
 * Urgent-announcement relay plumbing (#21 + scheduled posts): the app writes a
 * notifyQueue entry, an external Power Automate flow posts it to Teams /
 * parent email. This module owns queueing so both paths — immediate posts and
 * scheduled posts whose moment arrives — behave identically and can never
 * double-send:
 *   • the queue doc id is derived from the announcement id (stable), and
 *   • queueUrgentRelay refuses to overwrite an existing entry, so a retry can
 *     never reset a processed entry back to unprocessed (which would re-blast
 *     every family).
 */

/**
 * Queue the relay entry for an urgent announcement, exactly once.
 *
 * The body is flattened to plain text with ABSOLUTE addresses: Teams and
 * email render neither the formatting markers nor an in-app chip, and a
 * relative "/event/x" arriving in a parent's inbox is a dead link. Related
 * links ride along as lines under the message for the same reason.
 */
export async function queueUrgentRelay(
  a: Pick<Announcement, 'id' | 'title' | 'body' | 'ensembleId' | 'links'>,
) {
  if (!db) return;
  const ref = doc(db, 'notifyQueue', `ann-${a.id}`);
  // Never overwrite: if the entry exists (processed or not), the relay for
  // this announcement is already in flight — re-writing would reset
  // processedAt and send the blast again.
  const existing = await getDoc(ref);
  if (existing.exists()) return;
  await setDoc(ref, {
    kind: 'urgent-announcement',
    title: a.title,
    ...(relayBody(a) ? { body: relayBody(a) } : {}),
    ensembleIds: a.ensembleId ? [a.ensembleId] : [],
    createdAt: Date.now(),
    processedAt: null,
  });
}

/** The message as a family will actually receive it: no markers, no chips,
 *  every address absolute. */
function relayBody(a: Pick<Announcement, 'body' | 'links'>): string {
  const site = ORG.publicUrl.replace(/\/$/, '');
  const body = a.body ? richTextToPlain(a.body, site) : '';
  const links = (a.links ?? []).map(l => `${l.label}: ${l.url.startsWith('/') ? site + l.url : l.url}`);
  return [body, ...links].filter(Boolean).join('\n');
}

/** Stamp relayQueuedAt WITHOUT the updatedBy/updatedAt attribution — the
 *  sweep runs in whichever director's browser is open, and their name must
 *  not appear as "edited by" on a post they never touched. */
export async function markRelayHandled(announcementId: string) {
  if (!db) return;
  await updateDoc(doc(db, 'announcements', announcementId), { relayQueuedAt: Date.now() });
}

/** A scheduled post found long after its moment (or already expired) gets its
 *  relay SKIPPED — blasting families with a stale urgent notification is
 *  worse than the missed one. One hour of grace. */
const RELAY_GRACE_MS = 60 * 60_000;

/**
 * Publish-time relay sweep for SCHEDULED urgent posts. Mounted at the
 * DirectorApp shell level so it runs whenever any full director has the Hub
 * open anywhere — not just on the Announcements screen. (This app has no
 * server, so a scheduled urgent post that publishes while no director has the
 * Hub open sends its relay the next time one does — within the grace window.)
 * Pass enabled=false for roles that may not write announcements/notifyQueue
 * (teacher, personnel assistant).
 */
export function useUrgentRelaySweep(enabled: boolean) {
  const { announcements } = useAnnouncements();
  const now = useMinuteTick();

  useEffect(() => {
    if (!enabled || !db) return;
    for (const a of announcements) {
      if (a.priority !== 'urgent' || !a.publishAt || a.publishAt > now || a.relayQueuedAt) continue;
      const stale = (a.expiresOn && a.expiresOn < todayStr()) || now - a.publishAt > RELAY_GRACE_MS;
      if (stale) {
        // Too late to be useful — mark handled so it never fires, without queueing.
        markRelayHandled(a.id).catch(() => { /* retried on the next tick */ });
        continue;
      }
      queueUrgentRelay(a)
        .then(() => markRelayHandled(a.id))
        .catch(() => { /* best-effort; retried on the next tick */ });
    }
  }, [enabled, announcements, now]);
}
