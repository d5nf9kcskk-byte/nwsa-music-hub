import { useCallback, useMemo, useRef, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../director/firebase';
import { useEvents, normalizeEvent, type EventFilter } from '../../director/hooks/useEvents';
import { addDays, todayStr } from '../../director/utils';
import type { CalendarEvent } from '../../director/types';
import { missingSlices, monthRange, widen, type DateRange } from './eventWindow';

/**
 * Events for the public site, read in two bounded pieces instead of the whole
 * school year (#reads). A year is ~1,600 event docs and every public page used
 * to open a full-collection listener, so a first-time visitor cost thousands of
 * Firestore reads and ~20 of them exhausted the daily quota.
 *
 *   • the DENSE stream (rehearsals, classes: ~9 docs every school day) is
 *     limited to a window around today — what Home, ensemble pages, and a
 *     student's own schedule actually show;
 *   • the SPARSE stream (concerts and school-calendar events: ~75 docs a year)
 *     stays whole-year, because concerts are linked from repertoire, pieces,
 *     programs, and the season page regardless of date.
 *
 * Browsing outside the window (calendar month navigation) pulls the missing
 * slice with a one-shot read instead of re-subscribing a wider listener, so
 * swiping through months costs each month once rather than re-reading
 * everything already loaded.
 */

/** Days of dense schedule kept live behind / ahead of today. */
export const WINDOW_BACK_DAYS = 7;
export const WINDOW_AHEAD_DAYS = 45;

const SPARSE_FILTER: EventFilter = { types: ['Concert', 'Event'] };

export function usePublicEvents() {
  const [liveWindow] = useState<DateRange>(() => ({
    from: addDays(todayStr(), -WINDOW_BACK_DAYS),
    to: addDays(todayStr(), WINDOW_AHEAD_DAYS),
  }));
  const { events: windowed, loading } = useEvents(liveWindow);
  const { events: sparse } = useEvents(SPARSE_FILTER);

  // Date slices pulled on demand, plus the bounds they cover. The ref is the
  // watermark so a repeated request (re-render, swipe back and forth) is free.
  const [extra, setExtra] = useState<CalendarEvent[]>([]);
  const loaded = useRef<DateRange>({ ...liveWindow });

  const ensureRange = useCallback((want: DateRange) => {
    const slices = missingSlices(loaded.current, want);
    if (slices.length === 0 || !db) return;
    // Widen up front so a swipe back and forth doesn't re-issue the same read;
    // put it back on failure, or that month would never be retried.
    const before = loaded.current;
    loaded.current = widen(before, want);
    const dbRef = db;
    Promise.all(slices.map(s => getDocs(query(
      collection(dbRef, 'events'),
      where('date', '>=', s.from),
      where('date', '<=', s.to),
    ))))
      .then(snaps => setExtra(prev => [
        ...prev,
        ...snaps.flatMap(s => s.docs.map(d => normalizeEvent({ id: d.id, ...d.data() } as CalendarEvent))),
      ]))
      .catch(() => { loaded.current = before; });
  }, []);

  /** Load the month a calendar cursor is showing, if it isn't already. */
  const ensureMonth = useCallback(
    (cursor: Date) => ensureRange(monthRange(cursor.getFullYear(), cursor.getMonth())),
    [ensureRange],
  );

  // Live listeners are applied last so they win over a stale one-shot slice.
  const events = useMemo(() => {
    const byId = new Map<string, CalendarEvent>();
    for (const e of extra) byId.set(e.id, e);
    for (const e of sparse) byId.set(e.id, e);
    for (const e of windowed) byId.set(e.id, e);
    return [...byId.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [extra, sparse, windowed]);

  return { events, loading, ensureMonth };
}
