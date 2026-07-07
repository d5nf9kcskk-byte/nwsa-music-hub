import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { offerUndo } from '../writeStatus';
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
      list.sort((a, b) =>
        (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.createdAt ?? 0) - (a.createdAt ?? 0)
      );
      setAnnouncements(list);
      setLoading(false);
    }, () => setLoading(false));
  }, []);

  async function addAnnouncement(data: Omit<Announcement, 'id'>) {
    if (!db) return;
    await addDoc(collection(db, 'announcements'), data);
  }

  async function updateAnnouncement(id: string, data: Partial<Omit<Announcement, 'id'>>) {
    if (!db) return;
    await updateDoc(doc(db, 'announcements', id), data);
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

/** Announcements that should display now (not expired) for a given audience. */
export function visibleAnnouncements(
  announcements: Announcement[],
  today: string,
  ensembleIds: string[] | 'all',
): Announcement[] {
  return announcements.filter(a => {
    // "Hide after" means the announcement still shows ON that date.
    if (a.expiresOn && a.expiresOn < today) return false;
    if (ensembleIds === 'all') return true;
    if (a.ensembleId === null) return true; // school-wide
    return ensembleIds.includes(a.ensembleId);
  });
}
