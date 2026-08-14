/**
 * Pure date-window math for the public events reader (usePublicEvents).
 * Deliberately import-free so `scripts/public-events-window.selfcheck.mjs`
 * can run it under plain node.
 */

export interface DateRange {
  /** Inclusive YYYY-MM-DD. */
  from: string;
  /** Inclusive YYYY-MM-DD. */
  to: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** First and last day of the month a calendar cursor is sitting on. */
export function monthRange(year: number, monthIndex: number): DateRange {
  const last = new Date(year, monthIndex + 1, 0).getDate();
  const m = pad(monthIndex + 1);
  return { from: `${year}-${m}-01`, to: `${year}-${m}-${pad(last)}` };
}

/**
 * The slices to fetch so `loaded` also covers `want`. Slices touch `loaded`
 * at the seam instead of stopping a day short: re-reading one boundary day is
 * cheaper than carrying calendar math here, and the caller dedupes by id.
 */
export function missingSlices(loaded: DateRange, want: DateRange): DateRange[] {
  const out: DateRange[] = [];
  if (want.from < loaded.from) out.push({ from: want.from, to: loaded.from });
  if (want.to > loaded.to) out.push({ from: loaded.to, to: want.to });
  return out;
}

/** `loaded` grown to also cover `want`. Only ever widens. */
export function widen(loaded: DateRange, want: DateRange): DateRange {
  return {
    from: want.from < loaded.from ? want.from : loaded.from,
    to: want.to > loaded.to ? want.to : loaded.to,
  };
}
