/**
 * App-level status store: Firestore listener failures + connectivity.
 * Hooks call noteLoadError() from their onSnapshot error callbacks; the
 * <StatusStrips /> component (rendered in both app shells) shows one
 * dismissible strip instead of silently rendering empty lists.
 */
import { useSyncExternalStore } from 'react';

type Listener = () => void;
const listeners = new Set<Listener>();
let loadErrors = 0;
let dismissed = false;

function emit() { listeners.forEach(l => l()); }

export function noteLoadError() {
  loadErrors++;
  dismissed = false;
  emit();
}

export function dismissLoadErrors() {
  dismissed = true;
  emit();
}

export function useLoadErrorVisible(): boolean {
  return useSyncExternalStore(
    l => { listeners.add(l); return () => listeners.delete(l); },
    () => loadErrors > 0 && !dismissed,
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
