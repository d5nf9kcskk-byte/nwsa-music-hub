/**
 * Locale-aware date formatting (#42 follow-up).
 *
 * Every public surface renders dates through here. Before this module the
 * whole app called `toLocaleDateString('en-US', …)`, so a page switched to
 * Español still printed "Monday, September 28" — the labels translated but
 * the calendar itself stayed in English.
 *
 * The locale follows the i18n store, so any component that already calls
 * `useLang()` re-renders its dates when the toggle flips.
 *
 * Region is US on purpose: "es-US" keeps Miami conventions (month/day order
 * in numeric contexts, 12-hour clocks) while giving Spanish month and weekday
 * names.
 */
import { getLang } from './i18n';

export function dateLocale(): string {
  return getLang() === 'es' ? 'es-US' : 'en-US';
}

/** Accepts a Date or a "YYYY-MM-DD" string (parsed at local noon, which
 *  avoids the DST edge that makes a date land on the previous day). */
function asDate(d: Date | string): Date {
  return typeof d === 'string' ? new Date(`${d}T12:00:00`) : d;
}

export function fmtDate(d: Date | string, opts: Intl.DateTimeFormatOptions): string {
  return asDate(d).toLocaleDateString(dateLocale(), opts);
}

/** Spanish lowercases month and weekday names ("lunes", "septiembre"); a
 *  heading or a standalone label wants the capital back. */
export function capFirst(s: string): string {
  return s ? s.charAt(0).toLocaleUpperCase(dateLocale()) + s.slice(1) : s;
}

/* ── The shapes the app actually uses ────────────────────────────────────── */

/** "Mon, Sep 28" · "lun, 28 sept" — list rows and meta lines. */
export const fmtShortDate = (d: Date | string) =>
  fmtDate(d, { weekday: 'short', month: 'short', day: 'numeric' });

/** "Monday, Sep 28" · "Lunes, 28 sept" — day headers in lists. */
export const fmtDayHeader = (d: Date | string) =>
  capFirst(fmtDate(d, { weekday: 'long', month: 'short', day: 'numeric' }));

/** "Monday, September 28" · "Lunes, 28 de septiembre" — hero + day detail. */
export const fmtLongDate = (d: Date | string) =>
  capFirst(fmtDate(d, { weekday: 'long', month: 'long', day: 'numeric' }));

/** "Monday, September 28, 2026" · "Lunes, 28 de septiembre de 2026". */
export const fmtFullDate = (d: Date | string) =>
  capFirst(fmtDate(d, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }));

/** "Sep 28" · "28 sept" — compact chips. */
export const fmtMonthDay = (d: Date | string) =>
  fmtDate(d, { month: 'short', day: 'numeric' });

/** "Sep 28, 2026" · "28 sept 2026". */
export const fmtMonthDayYear = (d: Date | string) =>
  fmtDate(d, { month: 'short', day: 'numeric', year: 'numeric' });

/** "September 2026" · "Septiembre de 2026" — month calendar headers. */
export const fmtMonthYear = (d: Date | string) =>
  capFirst(fmtDate(d, { month: 'long', year: 'numeric' }));

/**
 * Single-letter column headers for a Sunday-first month grid.
 * en-US → S M T W T F S; es-US → D L M X J V S.
 * (Jan 7 2024 was a Sunday — any known Sunday works as the anchor.)
 */
export function weekdayInitials(): string[] {
  return Array.from({ length: 7 }, (_, i) =>
    capFirst(fmtDate(new Date(2024, 0, 7 + i), { weekday: 'narrow' })));
}
