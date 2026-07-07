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

/** Register a just-deleted doc so the user can undo (restore same id). */
export function offerUndo(collection: string, docId: string, data: Record<string, unknown>, label: string) {
  const id = `u${++seq}`;
  items = [...items.filter(i => i.kind !== 'undo'), {
    id,
    kind: 'undo',
    label,
    expiresAt: Date.now() + 10_000,
    action: async () => {
      if (!db) return;
      await setDoc(doc(db, collection, docId), data);
    },
  }];
  emit();
  setTimeout(() => { dismissTray(id); }, 10_500);
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
