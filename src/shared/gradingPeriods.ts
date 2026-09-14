/**
 * MDCPS grading periods, and the reporting window a grade report covers
 * (#gradebook). The ONE answer to "which quarter is this, and what span does
 * the report I am about to send cover".
 *
 * Deliberately PURE and config-injected, like `concertCheckin.ts`: no ORG
 * import, no Firestore, no DOM, explicit `.ts` on relative imports, so the
 * screen, the report builder and the self-check all read the same arithmetic
 * under plain Node.
 *
 * Two rules that are easy to get wrong and expensive to get wrong:
 *
 *   1. **A report covers the QUARTER to date, not the span since the last
 *      report.** An interim says how a student is doing in this quarter so
 *      far. Computing it over the six weeks since the last submission would
 *      produce numbers that are individually plausible and collectively
 *      wrong, which is the worst failure mode available here. `windowFor()`
 *      therefore always starts at the period's own `start`.
 *   2. **A report date is typed, never computed.** Halving a quarter lands
 *      the interim on whatever day the arithmetic picks, which is sooner or
 *      later a teacher planning day or the week after a hurricane closure.
 *      The district publishes the deadline in an email each period; the dates
 *      here are what that email said, or a clearly-labelled estimate until it
 *      arrives. Same reasoning that put term boundaries in config rather than
 *      a `month >= 8` guess (#current-term).
 */

/** One MDCPS grading period. Dates are verbatim from the district calendar. */
export interface GradingPeriod {
  id: string;
  /** The `ORG.terms` semester this quarter sits inside, when there is one. */
  termId?: string;
  /** "Quarter 1" — what a person calls it. */
  name: string;
  /** "1st Quarter" — how the district's own email subject line spells it. */
  ordinal?: string;
  /** "Q1" — the prefix on the district's column headings. */
  short: string;
  start: string;  // YYYY-MM-DD, inclusive
  end: string;    // YYYY-MM-DD, inclusive
  /**
   * Submission deadline for the mid-quarter interim, when it is known.
   * OPTIONAL on purpose: the district publishes no interim dates and the
   * authority is the teacher-of-record's email each period. A period with
   * none simply offers no interim default, which is honest.
   */
  interim?: string;
  /** True when `interim` is an estimate rather than a date somebody sent. */
  interimEstimated?: boolean;
}

/** Which report is being produced: the mid-quarter interim, or the quarter. */
export type ReportKind = 'interim' | 'quarter';

export interface ReportingWindow {
  period: GradingPeriod;
  kind: ReportKind;
  /** Always the period's own start. See rule 1 in the file header. */
  from: string;
  /** The cutoff. Evidence after this date is not in the report. */
  through: string;
  /** "Q1i" for an interim, "Q1" for the quarter — Brent's column prefix. */
  prefix: string;
  /** "Q1 Interim" / "Quarter 1" — what the screen and the email say. */
  label: string;
}

/** Periods sorted by start date. Never mutates the caller's array. */
export function sortPeriods(periods: GradingPeriod[]): GradingPeriod[] {
  return [...periods].sort((a, b) => a.start.localeCompare(b.start));
}

/** The period a date falls inside, or null. Boundaries are inclusive, and a
 *  date in the gap between two quarters (spring recess) is in neither. */
export function periodForDate(
  periods: GradingPeriod[],
  date: string,
): GradingPeriod | null {
  return periods.find(p => date >= p.start && date <= p.end) ?? null;
}

/**
 * Which period a screen should open on.
 *
 * Inside a period, that period. Outside every period, the most recent one
 * that has STARTED — in the spring-recess gap that is Q3, whose grades are
 * still being closed out, and in July it is Q4. Before the first period, the
 * first one. No periods configured returns null, and a screen with no period
 * must show everything rather than nothing. Mirrors `currentTerm()` exactly
 * (#current-term), one level down.
 */
export function currentGradingPeriod(
  periods: GradingPeriod[],
  today: string,
): GradingPeriod | null {
  const sorted = sortPeriods(periods);
  if (sorted.length === 0) return null;
  const inside = periodForDate(sorted, today);
  if (inside) return inside;
  let latest: GradingPeriod | null = null;
  for (const p of sorted) {
    if (p.start <= today) latest = p;
  }
  return latest ?? sorted[0];
}

/**
 * The window a report covers. `cutoff` is clamped into the period: a cutoff
 * before the period started would produce an empty report that looks like a
 * roster of zeros, and one after it ended would sweep in the next quarter's
 * rehearsals.
 */
export function windowFor(
  period: GradingPeriod,
  kind: ReportKind,
  cutoff: string,
): ReportingWindow {
  const through = cutoff < period.start ? period.start : cutoff > period.end ? period.end : cutoff;
  return {
    period,
    kind,
    from: period.start,
    through,
    prefix: kind === 'interim' ? `${period.short}i` : period.short,
    label: kind === 'interim' ? `${period.short} Interim` : period.name,
  };
}

/**
 * The cutoff a screen should open on for this period and kind: the published
 * deadline when there is one, otherwise today clamped into the period. Never
 * invents an interim date — a period with no `interim` opens on today.
 */
export function defaultCutoff(
  period: GradingPeriod,
  kind: ReportKind,
  today: string,
): string {
  if (kind === 'quarter') return today > period.end ? period.end : today;
  if (period.interim) return period.interim;
  return today < period.start ? period.start : today > period.end ? period.end : today;
}

/** True when `date` falls in the window, inclusive at both ends. */
export function inWindow(w: { from: string; through: string }, date: string): boolean {
  return date >= w.from && date <= w.through;
}
