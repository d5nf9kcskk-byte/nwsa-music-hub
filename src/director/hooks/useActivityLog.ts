import { useState, useEffect } from 'react';
import { addDoc, collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';
import { currentDirectorEmail, currentDirectorName, currentDirectorRole } from '../currentDirector';
import type { DirectorRole } from './useDirectors';

/**
 * Activity log (#activity-log): one entry per notable action a signed-in
 * director/teacher/assistant takes — not just sign-in (see useLoginEvents),
 * but "opened Schedule", "opened Roster", "saved a rehearsal note", etc.
 * Kept in its OWN collection rather than folded into loginEvents so that
 * collection's narrow, already-audited shape (and firestore.rules) stays
 * untouched — this is deliberately a parallel, equally append-only log.
 *
 * firestore.rules: any listed staff account may CREATE its own entry; only
 * the Owner may read the log; nobody can edit or delete entries.
 */
export interface ActivityEvent {
  id: string;
  email: string;
  name?: string;
  role: DirectorRole;
  /** Short stable slug, e.g. "schedule.view", "roster.view", "notes.save". */
  action: string;
  /** Optional human-readable detail, e.g. a student or ensemble name. */
  detail?: string;
  at: number; // epoch ms
}

/** How many recent entries the Owner's activity panel loads. */
export const ACTIVITY_LOG_LIMIT = 300;

// In-memory throttle so rapid tab-switching / re-renders don't flood the log
// with duplicate entries — one entry per (email, action[, detail]) at most
// every few minutes. Session-only (a reload resets it), which is fine: the
// log's purpose is a usage TREND, not a click-by-click trace.
const THROTTLE_MS = 2 * 60 * 1000;
const lastLogged = new Map<string, number>();

/**
 * Append an activity entry. Fire-and-forget — logging must never block or
 * break the action it's recording.
 */
export function recordActivity(action: string, detail?: string) {
  if (!db) return;
  const email = currentDirectorEmail();
  if (!email) return; // not signed in yet (shouldn't happen, but be safe)
  const throttleKey = `${email}:${action}:${detail ?? ''}`;
  const now = Date.now();
  const last = lastLogged.get(throttleKey);
  if (last && now - last < THROTTLE_MS) return;
  lastLogged.set(throttleKey, now);
  const name = currentDirectorName();
  addDoc(collection(db, 'activityLog'), {
    email,
    ...(name ? { name } : {}),
    role: currentDirectorRole(),
    action,
    ...(detail ? { detail } : {}),
    at: now,
  }).catch(() => { /* audit trail is best-effort */ });
}

/** Live recent activity, newest first. Owner-only per firestore.rules —
 *  subscribe only while the activity panel is actually open. */
export function useActivityLog(active: boolean) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>(db ? 'loading' : 'ready');

  useEffect(() => {
    if (!db || !active) return;
    const q = query(collection(db, 'activityLog'), orderBy('at', 'desc'), limit(ACTIVITY_LOG_LIMIT));
    return onSnapshot(q, snap => {
      setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() } as ActivityEvent)));
      setState('ready');
    }, () => setState('error'));
  }, [active]);

  return { events, state };
}
