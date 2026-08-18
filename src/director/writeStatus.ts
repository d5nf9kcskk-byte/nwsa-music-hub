/**
 * Shared write-safety store (#36 retry tray + #38 undo):
 *  - deletes register an UNDO entry (10s window) that can restore the doc
 *    with its original id via setDoc;
 *  - failed writes register a persistent FAILURE entry with a retry thunk.
 * The DirectorApp shell renders <WriteTray /> from this store.
 */
import { useSyncExternalStore } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

export interface TrayItem {
  id: string;
  kind: 'undo' | 'error';
  label: string;
  /** undo: restores the doc · error: retries the failed write */
  action?: () => Promise<void>;
  expiresAt?: number; // undo entries auto-dismiss
}

let items: TrayItem[] = [];
const listeners = new Set<() => void>();
let seq = 0;

function emit() { listeners.forEach(l => l()); }

export function dismissTray(id: string) {
  items = items.filter(i => i.id !== id);
  emit();
}

/** Register a just-deleted doc so the user can undo (restore same id).
 *  `extras` restores companion docs in the same tap — e.g. the public-mirror
 *  projection deleted alongside a student (#privacy). */
export function offerUndo(
  collection: string,
  docId: string,
  data: Record<string, unknown>,
  label: string,
  extras?: { collection: string; docId: string; data: Record<string, unknown> }[],
  /**
   * Runs once the undo window closes WITHOUT the user taking it — the point
   * at which the delete is really final. Used to clean up uploaded files in
   * Storage (audit rec #6): deleting them immediately would leave a restored
   * document pointing at a file that no longer exists.
   */
  onExpire?: () => void,
) {
  const id = `u${++seq}`;
  let undone = false;
  items = [...items.filter(i => i.kind !== 'undo'), {
    id,
    kind: 'undo',
    label,
    expiresAt: Date.now() + 10_000,
    action: async () => {
      undone = true;
      if (!db) return;
      await setDoc(doc(db, collection, docId), data);
      for (const x of extras ?? []) {
        await setDoc(doc(db, x.collection, x.docId), x.data);
      }
    },
  }];
  emit();
  setTimeout(() => {
    dismissTray(id);
    // Dismissing the toast by hand is not undoing — only the undo action is.
    if (!undone) onExpire?.();
  }, 10_500);
}

/**
 * Resolve as soon as a write is durably QUEUED, rather than acknowledged by
 * the server (audit rec #4).
 *
 * Firestore's write promises only settle on a server round-trip, so a form
 * that awaits one sits on "Saving…" forever in a dead zone — even though the
 * write is already safe in the local cache and will sync on reconnect. The
 * app already tells the user they're offline (StatusStrips) and already
 * surfaces late failures in the tray (trackWrite → reportWriteError), so the
 * honest behaviour is to let the form close.
 *
 * Rejections still win the race when they arrive first, so a validation or
 * permission error on a healthy connection is still shown in the form.
 */
export function whenQueued<T>(write: Promise<T>, timeoutMs = 2500): Promise<'saved' | 'queued'> {
  // Never mask the failure: whatever happens later still reaches the tray.
  const settled = write.then(() => 'saved' as const);
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    void settled.catch(() => { /* reported by trackWrite */ });
    return Promise.resolve('queued');
  }
  return Promise.race([
    settled,
    new Promise<'queued'>(resolve => setTimeout(() => resolve('queued'), timeoutMs)),
  ]);
}

/** Report a failed write with a retry thunk — stays until acted on. */
export function reportWriteError(label: string, retry?: () => Promise<void>) {
  const id = `e${++seq}`;
  items = [...items, { id, kind: 'error', label, action: retry }];
  emit();
}

/* ── In-flight write counter: drives the header "Saving… / ✓ Saved" cue ── */
let inFlight = 0;
let savedFlashUntil = 0;
const busyListeners = new Set<() => void>();
function emitBusy() { busyListeners.forEach(l => l()); }

/**
 * Track a mutation promise: shows "Saving…" while pending, flashes "Saved",
 * and reports a retryable failure to the tray if it rejects.
 */
export function trackWrite<T>(label: string, run: () => Promise<T>): Promise<T | undefined> {
  inFlight++;
  emitBusy();
  return run().then(v => {
    savedFlashUntil = Date.now() + 1500;
    return v;
  }).catch(() => {
    reportWriteError(`${label} failed to save`, async () => { await trackWrite(label, run); });
    return undefined;
  }).finally(() => {
    inFlight--;
    emitBusy();
    setTimeout(emitBusy, 1600); // let the "Saved" flash expire
  });
}

export type WriteBusyState = 'saving' | 'saved' | 'idle';
export function useWriteBusy(): WriteBusyState {
  return useSyncExternalStore(
    l => { busyListeners.add(l); return () => busyListeners.delete(l); },
    () => (inFlight > 0 ? 'saving' : Date.now() < savedFlashUntil ? 'saved' : 'idle'),
    () => 'idle' as const,
  );
}

export function useTray(): TrayItem[] {
  return useSyncExternalStore(
    l => { listeners.add(l); return () => listeners.delete(l); },
    () => items,
  );
}
