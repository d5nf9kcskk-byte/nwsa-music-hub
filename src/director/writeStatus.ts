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

export function useTray(): TrayItem[] {
  return useSyncExternalStore(
    l => { listeners.add(l); return () => listeners.delete(l); },
    () => items,
  );
}
