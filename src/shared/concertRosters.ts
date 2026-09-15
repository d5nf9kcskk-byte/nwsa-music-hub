/**
 * Which seating chart a concert prints as an ensemble's roster page
 * (#concert-rosters).
 *
 * Before this, the printed program always took each ensemble's MOST RECENT
 * chart — fine until the director seats a spring chart while last night's
 * program is still being reprinted, or keeps two orders for the same group
 * (full orchestra vs. the reduced pit) and wants a specific one on the page.
 *
 * So a concert may now ATTACH charts (`seatingChartIds`) and DESIGNATE one of
 * them (`programChartId`). The designation is a single id on purpose: it
 * answers "which of these is the program's" for the one ensemble whose charts
 * collide, and every other attached chart still serves its OWN ensemble. A
 * chart never leaks onto another ensemble's roster page — the ensemble match
 * comes first, always.
 *
 * Resolution, per ensemble:
 *   1. the designated chart, if it belongs to this ensemble and is attached
 *   2. otherwise the newest attached chart for this ensemble
 *   3. otherwise the newest chart for this ensemble (the pre-existing rule,
 *      so every concert that attaches nothing prints exactly as it did)
 * ...and the caller falls back to the auto-grouped active roster when there
 * is no chart at all.
 *
 * Pinned by concertRosters.selfcheck.ts.
 */

/** The fields this decision reads — `SeatingChart` satisfies it. */
export interface ChartLike {
  id: string;
  ensembleId: string;
  date?: string;
  createdAt: number;
}

/** The fields this decision reads off the concert — `CalendarEvent` satisfies it. */
export interface ConcertLike {
  seatingChartIds?: string[];
  programChartId?: string;
}

/** The app's "current chart" convention: newest published date wins, then
 *  newest created. Used wherever one chart has to stand for an ensemble. */
export function newestChart<T extends ChartLike>(charts: T[]): T | undefined {
  return [...charts].sort(
    (a, b) => (b.date ?? '').localeCompare(a.date ?? '') || b.createdAt - a.createdAt,
  )[0];
}

export function concertChartFor<T extends ChartLike>(
  concert: ConcertLike | undefined,
  ensembleId: string,
  charts: T[],
): T | undefined {
  const forEnsemble = charts.filter(c => c.ensembleId === ensembleId);
  const attachedIds = concert?.seatingChartIds ?? [];
  const attached = forEnsemble.filter(c => attachedIds.includes(c.id));
  const designated = attached.find(c => c.id === concert?.programChartId);
  // A deleted or un-attached designation falls through rather than blanking
  // the roster page — the program still prints something sensible.
  return designated ?? newestChart(attached) ?? newestChart(forEnsemble);
}
