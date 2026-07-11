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
 *
 * Parameterized strings use {name} placeholders so word order can differ
 * between languages ("Show all {count}" / "Ver los {count}"): pass values as
 * the second argument. Unmatched placeholders are left visible on purpose —
 * a stray "{count}" in the UI is a louder bug report than a silent blank.
 */
export function t(key: string, params?: Record<string, string | number>): string {
  const entry = TRANSLATIONS[key];
  let s = !entry ? key : getLang() === 'es' ? entry.es : entry.en;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      s = s.replaceAll(`{${name}}`, String(value));
    }
  }
  return s;
}

/**
 * Count-aware translate: looks up `key.one` when count is 1, else `key.other`,
 * and substitutes {count} (plus any extra params). Spanish and English share
 * the one/other rule, so two keys per string are sufficient for this app.
 */
export function tn(key: string, count: number, params?: Record<string, string | number>): string {
  return t(`${key}.${count === 1 ? 'one' : 'other'}`, { count, ...params });
}

// Stamp <html lang="…"> on first load so screen readers and hyphenation
// match the saved preference before any component mounts.
if (typeof document !== 'undefined') {
  document.documentElement.lang = getLang();
}
