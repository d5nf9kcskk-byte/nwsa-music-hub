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

/**
 * The device's own dark preference as a React value — the ONE
 * `prefers-color-scheme` media query in the app, shared with the staff
 * shell's own Auto choice (DirectorApp.tsx) so there is never a second
 * spelling of it.
 *
 * `usePubTheme` cannot stand in for this. The public theme is stamped on
 * <html> by `apply()` above, so CSS does the work with no re-render; the staff
 * theme is an attribute React writes on `.dir-app`, so that shell HAS to
 * re-render when the OS flips. The stored choice is still 'auto' either way,
 * and useSyncExternalStore bails out on an identical snapshot.
 */
export function useSystemDark(): boolean {
  return useSyncExternalStore(
    l => {
      systemDark?.addEventListener?.('change', l);
      return () => systemDark?.removeEventListener?.('change', l);
    },
    () => !!systemDark?.matches,
    () => false,
  );
}

export function usePubTheme(): PubThemeChoice {
  return useSyncExternalStore(
    l => { listeners.add(l); return () => listeners.delete(l); },
    getPubTheme,
    () => 'auto' as const,
  );
}
