import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, deleteField, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { noteLoadError, noteLoadOk } from '../../shared/appStatus';
import { offerUndo } from '../writeStatus';
import { currentDirectorEmail, currentDirectorName } from '../currentDirector';
import { deleteStoredFile } from '../storageCleanup';
import type { Announcement, Attachment } from '../types';
import { proposeWrite } from './usePendingActions';

/** Every uploaded file a post points at (pictures + attachments). */
function uploadedUrls(a: Partial<Announcement> | undefined): string[] {
  const list: Attachment[] = [...(a?.images ?? []), ...(a?.files ?? [])];
  return list.map(f => f.url).filter(Boolean);
}

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
    // A Student Assistant's post waits for a director (#approvals). Returns
    // no id on purpose — there is no doc yet, and a caller that needs one
    // (nothing does today) must not be handed a made-up one.
    if (await proposeWrite({
      collection: 'announcements', op: 'create', data,
      label: `Post announcement: “${data.title}”`,
    })) return;
    const ref = await addDoc(collection(db, 'announcements'), {
      ...data,
      createdByEmail: data.createdByEmail ?? currentDirectorEmail(),
      createdBy: data.createdBy ?? currentDirectorName(),
    });
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
    // A picture or file the director removed in this edit is now referenced by
    // nothing, so delete the object rather than leaving it readable forever at
    // its old Storage URL (the same rule the document repository follows).
    // Only for the keys this save actually sent, and only AFTER it succeeds —
    // cancelling an edit must never delete a live file.
    const before = announcements.find(x => x.id === id);
    if (await proposeWrite({
      collection: 'announcements', op: 'update', docId: id, data,
      label: `Edit announcement: “${before?.title ?? id}”`,
    })) return;
    const touchesFiles = 'images' in data || 'files' in data;
    const dropped = touchesFiles
      ? uploadedUrls(before).filter(url => !uploadedUrls(data).includes(url))
      : [];
    await updateDoc(doc(db, 'announcements', id), payload);
    for (const url of dropped) void deleteStoredFile(url);
  }

  async function deleteAnnouncement(id: string) {
    if (!db) return;
    // Undo (#38): capture the doc, delete, offer 10s restore with the same id.
    const gone = announcements.find(x => x.id === id);
    if (await proposeWrite({
      collection: 'announcements', op: 'delete', docId: id,
      label: `Delete announcement: “${gone?.title ?? id}”`,
    })) return;
    await deleteDoc(doc(db, 'announcements', id));
    if (gone) {
      const { id: _id, ...data } = gone;
      // Once the undo window lapses the delete is final, so the uploaded
      // pictures and files go with it.
      offerUndo('announcements', id, data, `Deleted announcement — restore?`, undefined,
        () => { for (const url of uploadedUrls(gone)) void deleteStoredFile(url); });
    }
  }

  async function archiveAnnouncement(id: string) {
    await updateAnnouncement(id, { archivedAt: Date.now() });
  }

  async function restoreAnnouncement(id: string) {
    await updateAnnouncement(id, { archivedAt: undefined });
  }

  return {
    announcements, loading,
    addAnnouncement, updateAnnouncement, deleteAnnouncement,
    archiveAnnouncement, restoreAnnouncement,
  };
}

export function isArchived(a: Announcement): boolean {
  return !!a.archivedAt;
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
    if (a.archivedAt) return false;
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
