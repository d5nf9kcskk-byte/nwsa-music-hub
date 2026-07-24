import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, deleteField, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { noteLoadError, noteLoadOk } from '../../shared/appStatus';
import { offerUndo } from '../writeStatus';
import { currentDirectorName } from '../currentDirector';
import type { Announcement } from '../types';

/**
 * Real-time listener for director-posted announcements. Sorted client-side
 * (pinned first, then newest) to avoid needing a composite Firestore index.
 */
export function useAnnouncements() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) { setLoading(false); return; }
    return onSnapshot(collection(db, 'announcements'), snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Announcement));
      // Effective timestamp: a scheduled post sorts by WHEN IT PUBLISHES, so
      // it surfaces as the newest item at its moment instead of burying
      // itself under posts written after it was drafted.
      const ts = (a: Announcement) => Math.max(a.publishAt ?? 0, a.createdAt ?? 0);
      list.sort((a, b) =>
        (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || ts(b) - ts(a)
      );
      setAnnouncements(list);
      noteLoadOk('announcements');
      setLoading(false);
    }, () => { noteLoadError('announcements'); setLoading(false); });
  }, []);

  async function addAnnouncement(data: Omit<Announcement, 'id'>): Promise<string | undefined> {
    if (!db) return;
    const ref = await addDoc(collection(db, 'announcements'), data);
    return ref.id;
  }

  async function updateAnnouncement(id: string, data: Partial<Omit<Announcement, 'id'>>) {
    if (!db) return;
    // Explicit undefined = DELETE the field. ignoreUndefinedProperties would
    // otherwise silently drop the key and the old value would survive every
    // "clear" (e.g. removing a publish schedule or an expiry date).
    const stamped: Record<string, unknown> = { ...data, updatedAt: Date.now(), updatedBy: currentDirectorName() };
    const payload = Object.fromEntries(
      Object.entries(stamped).map(([k, v]) => [k, v === undefined ? deleteField() : v]),
    );
    await updateDoc(doc(db, 'announcements', id), payload);
  }

  async function deleteAnnouncement(id: string) {
    if (!db) return;
    // Undo (#38): capture the doc, delete, offer 10s restore with the same id.
    const gone = announcements.find(x => x.id === id);
    await deleteDoc(doc(db, 'announcements', id));
    if (gone) {
      const { id: _id, ...data } = gone;
      offerUndo('announcements', id, data, `Deleted announcement — restore?`);
    }
  }

  return { announcements, loading, addAnnouncement, updateAnnouncement, deleteAnnouncement };
}

/** Announcements that should display now (published, not expired) for a
 *  given audience. `now` (epoch ms) gates scheduled posts — pass the value
 *  from useMinuteTick() so a post scheduled for 3:00 PM appears without a
 *  reload. */
export function visibleAnnouncements(
  announcements: Announcement[],
  today: string,
  ensembleIds: string[] | 'all',
  now: number = Date.now(),
): Announcement[] {
  return announcements.filter(a => {
    // Scheduled for later: hidden everywhere until the moment arrives.
    if (a.publishAt && a.publishAt > now) return false;
    // "Hide after" means the announcement still shows ON that date.
    if (a.expiresOn && a.expiresOn < today) return false;
    if (ensembleIds === 'all') return true;
    if (a.ensembleId === null) return true; // school-wide
    return ensembleIds.includes(a.ensembleId);
  });
}

/**
 * Re-renders the caller every ~30s and returns the current epoch ms — so a
 * scheduled announcement pops in (and its "Scheduled" chip flips) while the
 * page is open, not just on the next reload.
 */
export function useMinuteTick(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}
