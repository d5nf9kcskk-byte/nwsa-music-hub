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
import { getLang, type Lang } from './i18n';
import { onStaffShell } from './staffShell';

/**
 * The language dates and times are formatted in. The staff shells have no
 * EN|ES toggle, so they are always English whatever this device last chose
 * on the public site (#staff-english); the public site follows the toggle.
 */
export function formatLang(): Lang {
  return onStaffShell() ? 'en' : getLang();
}

export function dateLocale(): string {
  return formatLang() === 'es' ? 'es-US' : 'en-US';
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

/** The same date INSIDE a sentence: "by Monday, September 28" ·
 *  "hasta el lunes, 28 de septiembre". Spanish does not capitalize a weekday
 *  or a month mid-sentence; `fmtLongDate` puts the capital on because it is
 *  a heading, so a date dropped into a `t()` string after other words uses
 *  this one instead. English reads the same either way. */
export const fmtLongDateInline = (d: Date | string) =>
  fmtDate(d, { weekday: 'long', month: 'long', day: 'numeric' });

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
