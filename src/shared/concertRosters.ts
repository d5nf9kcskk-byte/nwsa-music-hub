/**
 * Which seating chart a concert prints as an ensemble's roster page
 * (#concert-rosters), and which chart stands for an individual work
 * (#piece-rosters).
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
 * Resolution of the CONCERT'S roster, per ensemble:
 *   1. the designated chart, if it belongs to this ensemble and is attached
 *   2. otherwise the newest attached chart that is not a single work's
 *      personnel — attaching "winds, for the Mozart" must not become the
 *      whole orchestra's page
 *   3. otherwise the newest attached chart at all (a group whose only
 *      attached chart is a piece chart still gets a page)
 *   4. otherwise the newest chart for this ensemble, preferring a general one
 *      (the pre-existing rule, so every concert that attaches nothing prints
 *      exactly as it did)
 * ...and the caller falls back to the auto-grouped active roster when there
 * is no chart at all.
 *
 * That resolution IS "one roster for the whole concert": it is chosen once, on
 * the concert, and every work prints under it unless the work has personnel of
 * its own. Nothing is stamped onto the individual pieces, so a per-work
 * exception stays one tick and un-picking it stays one tick.
 *
 * Pinned by concertRosters.selfcheck.ts.
 */

/** The fields this decision reads — `SeatingChart` satisfies it. */
export interface ChartLike {
  id: string;
  ensembleId: string;
  /** Legacy single link, still live on charts written before sharing existed.
   *  Read it through `chartPieceIds` and never directly. */
  pieceId?: string;
  /** The works this chart is the personnel for ("winds only, for the
   *  Mozart"). A chart may serve SEVERAL works — a concert whose whole first
   *  half is one reduced orchestra is one chart, ticked on each of those
   *  works — and a work may have several charts, one per concert it is played
   *  at, because the players change between years. The link lives here, on
   *  the chart, and the piece editor writes this same field from the other
   *  side — one spelling, so the two screens cannot drift. */
  pieceIds?: string[];
  date?: string;
  createdAt: number;
}

/** The fields this decision reads off the concert — `CalendarEvent` satisfies it. */
export interface ConcertLike {
  seatingChartIds?: string[];
  programChartId?: string;
}

/** The works a chart is the personnel for, whichever way the link was
 *  written. `pieceIds` is the current spelling; `pieceId` is what charts made
 *  before sharing existed still carry, and reading both here is why none of
 *  them needed rewriting. */
export function chartPieceIds(chart: ChartLike): string[] {
  if (chart.pieceIds) return chart.pieceIds.filter(Boolean);
  return chart.pieceId ? [chart.pieceId] : [];
}

/** True when this chart is ONE OR MORE works' personnel rather than the
 *  ensemble's own roster. */
export function isPieceChart(chart: ChartLike): boolean {
  return chartPieceIds(chart).length > 0;
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
  // A PIECE roster is not the ensemble's roster: seating the winds for one
  // work must not hijack the whole orchestra's page, whether by being the
  // newest chart or by being attached so it can print as that work's own
  // page. Designating one deliberately still works — that is the director
  // saying so. If a group only ever has piece charts, the newest still beats
  // printing nothing.
  const general = forEnsemble.filter(c => !isPieceChart(c));
  const attachedGeneral = attached.filter(c => !isPieceChart(c));
  // A deleted or un-attached designation falls through rather than blanking
  // the roster page — the program still prints something sensible.
  return designated
    ?? newestChart(attachedGeneral)
    ?? newestChart(attached)
    ?? newestChart(general)
    ?? newestChart(forEnsemble);
}

/**
 * The charts that are THIS WORK's personnel at THIS concert (#piece-rosters).
 *
 * A concert program prints one of these per programmed piece, in addition to
 * the ensemble roster pages — the "winds only for the Mozart" case, where the
 * people who played a work are a subset of the group that filled the stage.
 *
 * The same work played in two different years has a chart per year, so the
 * concert decides which one is its own: a chart the concert ATTACHED wins. A
 * concert that attaches none of them falls back to the newest chart per
 * ensemble, so a work two ensembles both play still gets a page each, and a
 * second year's chart never prints beside the first year's on one program.
 */
export function pieceChartsFor<T extends ChartLike>(
  pieceId: string,
  charts: T[],
  concert?: ConcertLike,
): T[] {
  if (!pieceId) return [];
  const forPiece = [...charts.filter(c => chartPieceIds(c).includes(pieceId))].sort(
    (a, b) => (b.date ?? '').localeCompare(a.date ?? '') || b.createdAt - a.createdAt,
  );
  const attachedIds = concert?.seatingChartIds ?? [];
  const attached = forPiece.filter(c => attachedIds.includes(c.id));
  if (attached.length) return attached;
  const seen = new Set<string>();
  return forPiece.filter(c => {
    if (seen.has(c.ensembleId)) return false;
    seen.add(c.ensembleId);
    return true;
  });
}

/** The one chart to show where there is room for only one (a piece page). */
export function pieceChartFor<T extends ChartLike>(
  pieceId: string,
  charts: T[],
  concert?: ConcertLike,
): T | undefined {
  return pieceChartsFor(pieceId, charts, concert)[0];
}

/**
 * A chart's seats minus the players who are NOT on this concert — excused,
 * or pulled for a trip (#concert-excusals). The chart itself is never edited:
 * it is the ensemble's audition order and serves every concert it is attached
 * to, so a student off Oct 3 must stay seated for Oct 17. Chair order is kept;
 * a section left with nobody in it is dropped rather than printed empty.
 */
export function seatsPlaying<S extends { seats: { studentId: string }[] }>(
  sections: S[],
  notPlaying: ReadonlySet<string>,
): S[] {
  if (notPlaying.size === 0) return sections;
  return sections
    .map(sec => ({ ...sec, seats: sec.seats.filter(seat => !notPlaying.has(seat.studentId)) }))
    .filter(sec => sec.seats.length > 0);
}
