/**
 * Which local cache a page load gives Firestore — and why it is no longer
 * simply "always IndexedDB" (Sept 2026, the b815 incident).
 *
 * A student's iPhone failed one IndexedDB delete ("Failed to delete record
 * from object store" is WebKit's own message). The SDK cannot recover from a
 * request-level IndexedDB error: SimpleDbTransaction.abort() rejects with the
 * raw browser error, which is not an IndexedDbTransactionError, so the
 * retry-with-backoff path never sees it; after three transaction attempts the
 * async queue latches (AsyncQueueImpl.enqueueInternal records the failure) and
 * EVERY later Firestore call throws "INTERNAL ASSERTION FAILED: Unexpected
 * state (ID: b815)" until the page reloads. The Submit tap's addDoc was one of
 * those calls — after the 100 MB video had already landed in Storage, which is
 * where the Storage-orphan submissions came from.
 *
 * Three rules, pinned by firestoreCache.selfcheck.ts in the deploy workflow:
 *
 * 1. A public device gets the memory cache. Students and families need nothing
 *    offline, and a database the page never opens cannot fail.
 * 2. A staff device — this browser has completed an allowlisted sign-in, which
 *    AuthGate records in localStorage and sign-out forgets — keeps IndexedDB
 *    persistence, so a roll taken in a dead zone survives (#37).
 * 3. If the queue latches anyway, the page reloads ONCE into the memory cache
 *    for the rest of that tab's life (sessionStorage), so a broken IndexedDB
 *    costs a staff member one reload rather than the session. Never twice:
 *    a second latch in memory mode is not an IndexedDB problem, and a reload
 *    loop is worse than an error.
 */

/** localStorage: set on an allowlisted sign-in, removed on sign-out. */
export const STAFF_DEVICE_KEY = 'hub.staffDevice';
/** sessionStorage: this tab already latched once and fell back to memory. */
export const NO_PERSIST_KEY = 'hub.firestoreNoPersist';

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** A Web Storage area, or null where the accessor itself throws (some private
 *  modes) — which must count as "not a staff device". */
export function storageArea(kind: 'localStorage' | 'sessionStorage'): Store | null {
  try { return globalThis[kind] ?? null; } catch { return null; }
}

/** IndexedDB persistence only on a staff device, and only in a tab that can
 *  remember a fallback and has not already had to use it. Any storage error
 *  means memory. */
export function wantsPersistence(local: Store | null, session: Store | null): boolean {
  try {
    return local?.getItem(STAFF_DEVICE_KEY) === '1'
      && session !== null
      && session.getItem(NO_PERSIST_KEY) !== '1';
  } catch {
    return false;
  }
}

/** Firestore logs exactly one line at the moment its queue latches. */
export function isQueueLatch(message: string): boolean {
  return message.includes('INTERNAL UNHANDLED ERROR');
}

/** Arm the memory-cache fallback for this tab; true means "reload now".
 *  False when already armed (never reload twice) or when sessionStorage is
 *  unusable — a reload that cannot remember itself could loop. */
export function armNoPersistFallback(session: Store | null): boolean {
  try {
    if (!session || session.getItem(NO_PERSIST_KEY) === '1') return false;
    session.setItem(NO_PERSIST_KEY, '1');
    return true;
  } catch {
    return false;
  }
}

export function markStaffDevice(): void {
  try { storageArea('localStorage')?.setItem(STAFF_DEVICE_KEY, '1'); } catch { /* private mode */ }
}

export function forgetStaffDevice(): void {
  try { storageArea('localStorage')?.removeItem(STAFF_DEVICE_KEY); } catch { /* private mode */ }
}
