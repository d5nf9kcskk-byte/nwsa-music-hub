/**
 * Español toggle (#42): a tiny dependency-free i18n store.
 *
 * - The chosen language lives in localStorage (`nwsa.lang`) so it survives
 *   reloads on the same device, mirroring how identity.ts remembers students.
 * - `useLang()` subscribes a component via useSyncExternalStore; any component
 *   that calls `t()` during render must also call `useLang()` (even if it
 *   ignores the value) so it re-renders when the language flips.
 * - `t(key)` looks the key up in TRANSLATIONS and returns the string for the
 *   current language, falling back to English, then to the key itself — a
 *   missing translation can never blank out the UI.
 */
import { useSyncExternalStore } from 'react';
import { TRANSLATIONS } from './translations';

export type Lang = 'en' | 'es';

const KEY = 'nwsa.lang';

type Listener = () => void;
const listeners = new Set<Listener>();

export function getLang(): Lang {
  try {
    return localStorage.getItem(KEY) === 'es' ? 'es' : 'en';
  } catch {
    return 'en'; // private mode / storage blocked
  }
}

export function setLang(lang: Lang) {
  try { localStorage.setItem(KEY, lang); } catch { /* private mode */ }
  document.documentElement.lang = lang;
  listeners.forEach(l => l());
}

/** Subscribe to language changes (returns unsubscribe). */
export function onLangChange(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** React hook: current language, re-renders the component when it changes. */
export function useLang(): Lang {
  return useSyncExternalStore(onLangChange, getLang, () => 'en' as Lang);
}

/**
 * Translate a key. English is the source of truth; unknown keys are returned
 * verbatim so untranslated corners of the app degrade gracefully.
 */
export function t(key: string): string {
  const entry = TRANSLATIONS[key];
  if (!entry) return key;
  return getLang() === 'es' ? entry.es : entry.en;
}

// Stamp <html lang="…"> on first load so screen readers and hyphenation
// match the saved preference before any component mounts.
if (typeof document !== 'undefined') {
  document.documentElement.lang = getLang();
}
