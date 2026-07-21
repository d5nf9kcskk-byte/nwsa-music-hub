import { useState, useEffect } from 'react';
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc,
  query, orderBy, deleteField,
} from 'firebase/firestore';
import { db } from '../firebase';
import { noteLoadError, noteLoadOk } from '../../shared/appStatus';
import { offerUndo, trackWrite } from '../writeStatus';
import { currentDirectorName } from '../currentDirector';
import type { CalendarEvent } from '../types';
import { FIXTURES_ON, FIXTURE_EVENTS } from './fixtures';

/**
 * Real-time listener for all calendar events (rehearsals, concerts, etc.),
 * ordered by date. Filtering by ensemble or month is done in-memory by the
 * views, since events can belong to multiple ensembles.
 */
export function useEvents() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) { if (FIXTURES_ON) setEvents(FIXTURE_EVENTS); setLoading(false); return; }
    const q = query(collection(db, 'events'), orderBy('date'));
    return onSnapshot(q, snap => {
      setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() } as CalendarEvent)));
      noteLoadOk('events');
      setLoading(false);
    }, () => { noteLoadError('events'); setLoading(false); });
  }, []);

  async function addEvent(data: Omit<CalendarEvent, 'id'>) {
    if (!db) return;
    const dbRef = db;
    await trackWrite('Event', () => addDoc(collection(dbRef, 'events'), data));
  }

  async function updateEvent(id: string, data: Partial<Omit<CalendarEvent, 'id'>>) {
    if (!db) return;
    // Change tracking (#17/#40): every SCHEDULE edit stamps who + when.
    // Roll receipts are bookkeeping, not schedule changes — stamping them would
    // falsely flag the rehearsal "Updated" on the public site after every roll.
    const keys = Object.keys(data);
    const bookkeepingOnly = keys.length > 0 && keys.every(k => k === 'rollTaken');
    if (!bookkeepingOnly) {
      data = { ...data, updatedAt: Date.now(), updatedBy: currentDirectorName() };
    }
    const dbRef = db;
    const payload = data;
    await trackWrite('Event update', () => updateDoc(doc(dbRef, 'events', id), payload));
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

  /**
   * Revert a changed rehearsal to its normal schedule: restore the pre-change
   * snapshot (`changeFrom`), then clear every "changed" marker — the change
   * note, the snapshot, the linked announcement id, and the update stamp (so
   * the public "UPDATED" tag doesn't linger). Returns the announcement id the
   * caller should delete, if one was posted. If no snapshot was captured (a
   * legacy/manual change), it still un-cancels and clears the note.
   */
  async function revertEvent(id: string): Promise<string | undefined> {
    if (!db) return;
    const e = events.find(x => x.id === id);
    const cf = e?.changeFrom;
    const payload: Record<string, unknown> = {
      status: cf?.status ?? 'Scheduled',
      startTime: cf?.startTime ?? deleteField(),
      endTime: cf?.endTime ?? deleteField(),
      location: cf?.location ?? deleteField(),
      changeNote: deleteField(),
      changeFrom: deleteField(),
      changeAnnouncementId: deleteField(),
      updatedAt: deleteField(),
      updatedBy: deleteField(),
    };
    const dbRef = db;
    await trackWrite('Revert', () => updateDoc(doc(dbRef, 'events', id), payload));
    return e?.changeAnnouncementId;
  }

  return { events, loading, addEvent, updateEvent, deleteEvent, revertEvent };
}
