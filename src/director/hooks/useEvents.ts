import { useState, useEffect } from 'react';
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc,
  query, orderBy,
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import type { CalendarEvent } from '../types';

/**
 * Real-time listener for all calendar events (rehearsals, concerts, etc.),
 * ordered by date. Filtering by ensemble or month is done in-memory by the
 * views, since events can belong to multiple ensembles.
 */
export function useEvents() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) { setLoading(false); return; }
    const q = query(collection(db, 'events'), orderBy('date'));
    return onSnapshot(q, snap => {
      setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() } as CalendarEvent)));
      setLoading(false);
    }, () => setLoading(false));
  }, []);

  async function addEvent(data: Omit<CalendarEvent, 'id'>) {
    if (!db) return;
    await addDoc(collection(db, 'events'), data);
  }

  async function updateEvent(id: string, data: Partial<Omit<CalendarEvent, 'id'>>) {
    if (!db) return;
    // Change tracking (#17/#40): every edit stamps who + when.
    data = { ...data, updatedAt: Date.now(), updatedBy: auth?.currentUser?.email ?? undefined };
    await updateDoc(doc(db, 'events', id), data);
  }

  async function deleteEvent(id: string) {
    if (!db) return;
    // Undo (#38): capture the doc, delete, offer 10s restore with the same id.
    const gone = events.find(x => x.id === id);
    await deleteDoc(doc(db, 'events', id));
    if (gone) {
      const { id: _id, ...data } = gone;
      offerUndo('events', id, data, `Deleted \"${gone.title || gone.type}\" — restore?`);
    }
  }

  return { events, loading, addEvent, updateEvent, deleteEvent };
}
