/**
 * App-level status store: Firestore listener failures + connectivity.
 * Hooks call noteLoadError(source) from their onSnapshot error callbacks and
 * noteLoadOk(source) from their success callbacks; the <StatusStrips />
 * component (rendered in both app shells) shows one dismissible strip while
 * any source is still failing, instead of silently rendering empty lists.
 *
 * The banner tracks the SET of currently-failing sources (keyed by collection),
 * not a monotonic counter — so a transient error at sign-in (a listener attaches
 * a beat before the auth token propagates → permission-denied) clears itself the
 * instant that source's data loads, rather than latching on until dismissed.
 */
import { useSyncExternalStore } from 'react';

type Listener = () => void;
const listeners = new Set<Listener>();
const failing = new Set<string>();
let dismissed = false;

function emit() { listeners.forEach(l => l()); }

/** Record that a source's Firestore listener errored. */
export function noteLoadError(source = 'data') {
  failing.add(source);
  dismissed = false; // a fresh failure re-shows the strip even if once dismissed
  emit();
}

/** Record that a source loaded successfully — retracts the strip once nothing
 *  is failing. Safe to call on every snapshot (only emits on a real change). */
export function noteLoadOk(source = 'data') {
  if (failing.delete(source)) emit();
}

export function dismissLoadErrors() {
  dismissed = true;
  emit();
}

export function useLoadErrorVisible(): boolean {
  return useSyncExternalStore(
    l => { listeners.add(l); return () => listeners.delete(l); },
    () => failing.size > 0 && !dismissed,
    () => false,
  );
}

/** Live navigator.onLine as a hook (SSR-safe default: online). */
export function useOnline(): boolean {
  return useSyncExternalStore(
    l => {
      window.addEventListener('online', l);
      window.addEventListener('offline', l);
      return () => {
        window.removeEventListener('online', l);
        window.removeEventListener('offline', l);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}
