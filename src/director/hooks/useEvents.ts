import { useState, useEffect } from 'react';
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc, setDoc, doc,
  query, orderBy, where, deleteField,
} from 'firebase/firestore';
import { db } from '../firebase';
import { noteLoadError, noteLoadOk } from '../../shared/appStatus';
import { offerUndo, trackWrite } from '../writeStatus';
import { currentDirectorName } from '../currentDirector';
import { revertPlan } from '../schedule/changePlan';
import type { CalendarEvent, EventType } from '../types';
import { FIXTURES_ON, FIXTURE_EVENTS } from './fixtures';

/**
 * Heal legacy events seeded before their category became its own event type —
 * written with `type: 'Event'`, which mislabels them everywhere (the roster
 * drawer, filters, attendance) even though the UI handles the real type
 * correctly. Every seeded doc carries the seeder's stable id prefix (manual
 * events get random Firestore ids; markers use `cal-`), so the id is a safe
 * signal to coerce the type at read time — no data migration needed, and
 * editing one heals the stored doc for good:
 *   • `class-…` → 'Class'      (academic classes: AP Theory, Vocal Lit, …)
 *   • `reh-…`   → 'Rehearsal'  (ensemble rehearsals)
 */
export function normalizeEvent(e: CalendarEvent): CalendarEvent {
  if (e.type !== 'Class' && e.id.startsWith('class-')) return { ...e, type: 'Class' };
  if (e.type === 'Event' && e.id.startsWith('reh-')) return { ...e, type: 'Rehearsal' };
  return e;
}

/**
 * Narrows what `useEvents` subscribes to. A whole school year is ~1,600 event
 * docs, and every listener pays for all of them on first load — enough to burn
 * the daily Firestore read quota after a couple of dozen fresh visitors. Staff
 * views legitimately need the full year (attendance history, season planning)
 * and pass nothing; the public site passes a filter (see
 * src/public/hooks/usePublicEvents.ts).
 *
 * Both shapes use only single-field indexes, so no composite index deploy.
 */
export type EventFilter =
  | { from: string; to: string }   // inclusive date window, ordered by date
  | { types: EventType[] };        // whole year, but only these types

/**
 * Real-time listener for calendar events (rehearsals, concerts, etc.),
 * ordered by date. Filtering by ensemble or month is done in-memory by the
 * views, since events can belong to multiple ensembles.
 */
export function useEvents(filter?: EventFilter) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  // Serialized so a caller can pass a fresh object literal every render
  // without re-subscribing (and re-billing) the same query.
  const filterKey = filter ? JSON.stringify(filter) : '';

  useEffect(() => {
    if (!db) { if (FIXTURES_ON) setEvents(FIXTURE_EVENTS.map(normalizeEvent)); setLoading(false); return; }
    const f: EventFilter | undefined = filterKey ? JSON.parse(filterKey) : undefined;
    const col = collection(db, 'events');
    const q =
      !f ? query(col, orderBy('date'))
      : 'types' in f ? query(col, where('type', 'in', f.types)) // no orderBy: sorted in memory, keeps this index-free
      : query(col, where('date', '>=', f.from), where('date', '<=', f.to), orderBy('date'));
    return onSnapshot(q, snap => {
      setEvents(snap.docs.map(d => normalizeEvent({ id: d.id, ...d.data() } as CalendarEvent)));
      noteLoadOk('events');
      setLoading(false);
    }, () => { noteLoadError('events'); setLoading(false); });
  }, [filterKey]);

  async function addEvent(data: Omit<CalendarEvent, 'id'>): Promise<string | undefined> {
    if (!db) return;
    const dbRef = db;
    const ref = await trackWrite('Event', () => addDoc(collection(dbRef, 'events'), data));
    return ref?.id;
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

  /** `undoable: false` skips the restore toast — a combine deletes the
   *  absorbed block on purpose and holds its own revert path (the host's
   *  `changeFrom.absorbed` snapshot), so offering a second, conflicting
   *  restore would recreate a duplicate. */
  async function deleteEvent(id: string, opts?: { undoable?: boolean }) {
    if (!db) return;
    // Undo (#38): capture the doc, delete, offer 10s restore with the same id.
    const gone = events.find(x => x.id === id);
    await deleteDoc(doc(db, 'events', id));
    if (gone && opts?.undoable !== false) {
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
   * legacy/manual change), it still un-cancels and clears the note — but it
   * must NOT touch the time/room: with no snapshot, the live startTime /
   * endTime / location ARE the only record of the schedule, and deleting
   * them blanked one-off events like a manually-noted rehearsal.
   *
   * A combine snapshot (#schedule-ux-redesign §4.1) additionally restores the
   * host's membership and re-creates the absorbed event(s) under their
   * ORIGINAL doc ids — ICS UIDs derive from doc ids (frozen contract), so
   * subscribers see the event come back rather than a stranger. The exact
   * writes come from `revertPlan` (changePlan.ts), which the selfcheck pins.
   */
  async function revertEvent(id: string): Promise<string | undefined> {
    if (!db) return;
    const dbRef = db;
    const e = events.find(x => x.id === id);
    const { fields, recreate } = revertPlan(e);
    // Absorbed events first: if this fails, the host still holds the
    // snapshot and the revert can simply be run again.
    for (const r of recreate) {
      await trackWrite('Restore event', () => setDoc(doc(dbRef, 'events', r.id), r.data));
    }
    const payload = Object.fromEntries(
      Object.entries(fields).map(([k, v]) => [k, v === undefined ? deleteField() : v]),
    );
    await trackWrite('Revert', () => updateDoc(doc(dbRef, 'events', id), payload));
    return e?.changeAnnouncementId;
  }

  return { events, loading, addEvent, updateEvent, deleteEvent, revertEvent };
}

/**
 * One event by id. The public event page used to scan the whole collection to
 * find a single doc; this is one read, and it still resolves events outside
 * whatever date window the rest of the page is showing (shared links).
 */
export function useEvent(id: string) {
  const [live, setLive] = useState<CalendarEvent | null>(null);
  const [loading, setLoading] = useState(!!db && !!id);

  useEffect(() => {
    if (!db || !id) return;
    return onSnapshot(doc(db, 'events', id), snap => {
      setLive(snap.exists() ? normalizeEvent({ id: snap.id, ...snap.data() } as CalendarEvent) : null);
      noteLoadOk('events');
      setLoading(false);
    }, () => { noteLoadError('events'); setLoading(false); });
  }, [id]);

  // No Firebase configured: resolve against the local demo data instead.
  const fixture = !db && FIXTURES_ON
    ? FIXTURE_EVENTS.map(normalizeEvent).find(e => e.id === id) ?? null
    : null;

  return { event: db ? live : fixture, loading };
}
