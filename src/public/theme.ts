/**
 * Public-side appearance choice (#dark-view): Auto (follow the device),
 * Light, or Dark. The resolved theme is stamped on <html> as
 * data-pub-theme="light"|"dark" — index.html sets it inline before first
 * paint so a stored choice never flashes the wrong scheme, and this module
 * keeps it current afterwards (choice changes + OS scheme changes on Auto).
 * The director side has its own separate toggle (data-dir-theme).
 */
import { useSyncExternalStore } from 'react';

export type PubThemeChoice = 'auto' | 'light' | 'dark';

const KEY = 'pub.theme';

const listeners = new Set<() => void>();
function emit() { listeners.forEach(l => l()); }

export function getPubTheme(): PubThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

const systemDark = typeof window !== 'undefined' && 'matchMedia' in window
  ? window.matchMedia('(prefers-color-scheme: dark)')
  : null;

/** The theme actually in effect right now ('auto' resolved via the OS). */
export function resolvedPubTheme(choice: PubThemeChoice = getPubTheme()): 'light' | 'dark' {
  if (choice === 'light' || choice === 'dark') return choice;
  return systemDark?.matches ? 'dark' : 'light';
}

function apply() {
  document.documentElement.dataset.pubTheme = resolvedPubTheme();
}

export function setPubTheme(choice: PubThemeChoice) {
  try {
    if (choice === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch { /* private mode — the choice still applies for this page */ }
  apply();
  emit();
}

// Keep Auto in step with the OS while the app is open.
systemDark?.addEventListener?.('change', () => { apply(); emit(); });
// Re-apply on load: index.html already stamped the attribute pre-paint, but a
// stale value can survive bfcache restores.
if (typeof document !== 'undefined') apply();

export function usePubTheme(): PubThemeChoice {
  return useSyncExternalStore(
    l => { listeners.add(l); return () => listeners.delete(l); },
    getPubTheme,
    () => 'auto' as const,
  );
}
