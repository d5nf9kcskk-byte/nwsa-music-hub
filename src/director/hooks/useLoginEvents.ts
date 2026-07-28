import { useState, useEffect } from 'react';
import { addDoc, collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';
import type { DirectorRole } from './useDirectors';

/**
 * Sign-in log (#login-history): one receipt per staff sign-in, so the Owner
 * can see who has been using the Hub and when (Directors screen → Sign-in
 * history). Written by AuthGate the moment access is confirmed — for every
 * role: owner, director, teacher, and personnel assistant.
 *
 * firestore.rules: any listed staff account may CREATE its own receipt; only
 * the Owner may read the log; nobody can edit or delete entries.
 */
export interface LoginEvent {
  id: string;
  email: string;
  name?: string;
  role: DirectorRole;
  at: number; // epoch ms
}

/** How many recent sign-ins the Owner's history panel loads. */
export const LOGIN_LOG_LIMIT = 200;

/**
 * Append a sign-in receipt. Once per browser session (not per reload):
 * a tab refresh re-runs the membership check but isn't a new sign-in.
 * Fire-and-forget — logging must never block or break getting into the app.
 */
export function recordLogin(entry: { email: string; name?: string; role: DirectorRole }) {
  if (!db) return;
  const onceKey = `nwsa.loginLogged.${entry.email}`;
  try {
    if (sessionStorage.getItem(onceKey)) return;
    sessionStorage.setItem(onceKey, '1');
  } catch { /* private mode — log every load rather than never */ }
  addDoc(collection(db, 'loginEvents'), {
    email: entry.email,
    ...(entry.name ? { name: entry.name } : {}),
    role: entry.role,
    at: Date.now(),
  }).catch(() => { /* audit trail is best-effort */ });
}

/** Live recent sign-ins, newest first. Owner-only per firestore.rules —
 *  subscribe only while the history panel is actually open. */
export function useLoginEvents(active: boolean) {
  const [events, setEvents] = useState<LoginEvent[]>([]);
  // No Firestore (local fixture build) → settle straight to an empty log.
  const [state, setState] = useState<'loading' | 'ready' | 'error'>(db ? 'loading' : 'ready');

  // No loading reset here: the history panel mounts fresh each time it's
  // expanded, so the initial 'loading' state is always current.
  useEffect(() => {
    if (!db || !active) return;
    const q = query(collection(db, 'loginEvents'), orderBy('at', 'desc'), limit(LOGIN_LOG_LIMIT));
    return onSnapshot(q, snap => {
      setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() } as LoginEvent)));
      setState('ready');
    }, () => setState('error'));
  }, [active]);

  return { events, state };
}
