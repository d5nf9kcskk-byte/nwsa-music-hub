/**
 * Pins which seating chart a concert program prints (#concert-rosters) and
 * which chart stands for an individual work (#piece-rosters).
 *
 * Every promise here is silent to break and only discovered on paper, at the
 * concert, with the wrong names in the audience's hands: a concert that
 * attached nothing must print exactly what it printed before this feature
 * existed, an attached chart must beat a newer un-attached one, the
 * designated chart must beat a newer attached one, no chart may ever appear
 * on another ensemble's roster page, one chart shared by several works must
 * print under each of them, and the same work played in two different years
 * must never print both years' personnel on one program.
 */
import {
  concertChartFor, newestChart, pieceChartsFor, pieceChartFor, chartPieceIds, isPieceChart,
} from './concertRosters';
import type { ChartLike } from './concertRosters';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

const chart = (id: string, ensembleId: string, date: string, createdAt = 0): ChartLike =>
  ({ id, ensembleId, date, createdAt });

const oldOrch = chart('old', 'orch', '2026-01-10');
const newOrch = chart('new', 'orch', '2026-05-10');
const pitOrch = chart('pit', 'orch', '2026-03-10');
const band    = chart('band', 'band', '2026-02-10');
const ALL = [oldOrch, newOrch, pitOrch, band];

// The "current chart" convention, unchanged: newest date, then newest created.
assert(newestChart(ALL.filter(c => c.ensembleId === 'orch'))?.id === 'new', 'newest by date');
assert(newestChart([chart('a', 'x', '2026-01-01', 1), chart('b', 'x', '2026-01-01', 2)])?.id === 'b',
  'same date falls back to newest created');
assert(newestChart([]) === undefined, 'no charts, no answer');

// 1. A concert that attaches nothing prints what it always printed.
assert(concertChartFor(undefined, 'orch', ALL)?.id === 'new', 'legacy concert: newest wins');
assert(concertChartFor({}, 'orch', ALL)?.id === 'new', 'empty concert: newest wins');
assert(concertChartFor({ seatingChartIds: [] }, 'orch', ALL)?.id === 'new', 'empty attach list: newest wins');

// 2. An ATTACHED chart beats a newer un-attached one — the whole point.
assert(concertChartFor({ seatingChartIds: ['old'] }, 'orch', ALL)?.id === 'old',
  'an attached chart outranks a newer chart nobody attached');

// 3. The DESIGNATED chart beats a newer attached one.
assert(concertChartFor({ seatingChartIds: ['old', 'new'], programChartId: 'old' }, 'orch', ALL)?.id === 'old',
  'the designated chart is the program chart');
assert(concertChartFor({ seatingChartIds: ['old', 'new'] }, 'orch', ALL)?.id === 'new',
  'attached but undesignated: newest of the attached');

// 4. A chart NEVER leaks onto another ensemble's roster page — not even the
//    designated one, which is a single id shared by the whole concert.
assert(concertChartFor({ seatingChartIds: ['pit', 'band'], programChartId: 'pit' }, 'band', ALL)?.id === 'band',
  'the band page prints a band chart, whatever the orchestra designated');
assert(concertChartFor({ seatingChartIds: ['pit'], programChartId: 'pit' }, 'band', ALL)?.id === 'band',
  'an ensemble with nothing attached still falls back to its own newest chart');
assert(concertChartFor({ seatingChartIds: ['band'], programChartId: 'band' }, 'choir', ALL) === undefined,
  'an ensemble with no chart at all gets none (caller auto-groups the roster)');

// 5. A deleted or stale id falls back instead of blanking the page.
assert(concertChartFor({ seatingChartIds: ['gone'], programChartId: 'gone' }, 'orch', ALL)?.id === 'new',
  'a deleted attachment falls back to the newest chart');
assert(concertChartFor({ seatingChartIds: ['old'], programChartId: 'new' }, 'orch', ALL)?.id === 'old',
  'a designation that was never attached does not win');

// ── Which works a chart belongs to ────────────────────────────────────────
// Both spellings read the same, which is why no chart written before sharing
// existed had to be rewritten.
assert(chartPieceIds({ id: 'a', ensembleId: 'orch', pieceId: 'mozart', createdAt: 0 }).join() === 'mozart',
  'the legacy single link still reads');
assert(chartPieceIds({ id: 'a', ensembleId: 'orch', pieceIds: ['mozart', 'haydn'], createdAt: 0 }).join() === 'mozart,haydn',
  'the shared link reads in order');
assert(chartPieceIds({ id: 'a', ensembleId: 'orch', createdAt: 0 }).length === 0, 'no link, no works');
assert(chartPieceIds({ id: 'a', ensembleId: 'orch', pieceIds: [], pieceId: 'mozart', createdAt: 0 }).length === 0,
  'an emptied list means emptied — it is not a fall-through to the legacy field');
assert(chartPieceIds({ id: 'a', ensembleId: 'orch', pieceIds: ['mozart', ''], createdAt: 0 }).join() === 'mozart',
  'a blank id in the list is dropped, never matched');
assert(isPieceChart({ id: 'a', ensembleId: 'orch', createdAt: 0 }) === false, 'an unlinked chart is the ensemble roster');

// ── Piece rosters (#piece-rosters) ────────────────────────────────────────
const windsForMozart: ChartLike = { id: 'winds', ensembleId: 'orch', pieceId: 'mozart', date: '2026-06-01', createdAt: 0 };
const bandMozart: ChartLike = { id: 'bandmoz', ensembleId: 'band', pieceIds: ['mozart'], date: '2026-04-01', createdAt: 0 };
const WITH_PIECES = [...ALL, windsForMozart, bandMozart];

assert(pieceChartsFor('mozart', WITH_PIECES).map(c => c.id).join() === 'winds,bandmoz',
  'every chart tied to the piece, newest first — a work two groups play gets a page each');
assert(pieceChartFor('mozart', WITH_PIECES)?.id === 'winds', 'the one to show where only one fits');
assert(pieceChartsFor('nothing', WITH_PIECES).length === 0, 'a piece with no chart has no roster page');
assert(pieceChartsFor('', WITH_PIECES).length === 0, 'a blank id matches nothing — never every unlinked chart');

// A piece roster must NOT hijack the ensemble's own page just by being the
// newest chart: 'winds' is newer than every general orchestra chart here.
assert(concertChartFor(undefined, 'orch', WITH_PIECES)?.id === 'new',
  'the ensemble page prints the ensemble roster, not the newest piece roster');
// ...nor by being attached, which is how it earns its OWN page. The concert's
// roster is the general chart it attached; the piece chart prints under the
// work instead. This is the "one roster for the concert, except these two
// works" case, and it is the whole reason attaching a piece chart is allowed.
assert(concertChartFor({ seatingChartIds: ['new', 'winds'] }, 'orch', WITH_PIECES)?.id === 'new',
  'a piece chart attached for its own page does not become the ensemble page');
assert(pieceChartsFor('mozart', WITH_PIECES, { seatingChartIds: ['new', 'winds'] }).map(c => c.id).join() === 'winds',
  '...and it does print under its work');
// ...but attaching ONLY a piece chart is still the director saying so, and a
// group with nothing BUT piece charts still gets a page rather than none.
assert(concertChartFor({ seatingChartIds: ['winds'] }, 'orch', WITH_PIECES)?.id === 'winds',
  'an attached piece chart still wins when nothing general is attached');
assert(concertChartFor(undefined, 'band', [bandMozart])?.id === 'bandmoz',
  'only piece charts exist: print one rather than nothing');

// ── One chart, several works ──────────────────────────────────────────────
// The reduced orchestra that plays the whole first half is ONE chart, ticked
// on each of those works. Before this it could belong to only one of them.
const firstHalf: ChartLike = { id: 'half1', ensembleId: 'orch', pieceIds: ['mozart', 'haydn'], date: '2027-01-10', createdAt: 0 };
assert(pieceChartsFor('mozart', [firstHalf]).map(c => c.id).join() === 'half1', 'a shared chart prints under the first work');
assert(pieceChartsFor('haydn', [firstHalf]).map(c => c.id).join() === 'half1', '...and under the second');

// ── One work, several years ───────────────────────────────────────────────
// The players change between seasons, so the same work has a chart per
// concert. The concert decides which one is its own.
const winds26: ChartLike = { id: 'w26', ensembleId: 'orch', pieceId: 'mozart', date: '2026-06-01', createdAt: 0 };
const winds28: ChartLike = { id: 'w28', ensembleId: 'orch', pieceIds: ['mozart'], date: '2028-06-01', createdAt: 0 };
const YEARS = [winds26, winds28];

assert(pieceChartsFor('mozart', YEARS, { seatingChartIds: ['w26'] }).map(c => c.id).join() === 'w26',
  "the 2026 program prints 2026's players");
assert(pieceChartsFor('mozart', YEARS, { seatingChartIds: ['w28'] }).map(c => c.id).join() === 'w28',
  "the 2028 program prints 2028's");
assert(pieceChartsFor('mozart', YEARS).map(c => c.id).join() === 'w28',
  'a concert that attaches neither prints one page, the newest — never both years at once');
assert(pieceChartsFor('mozart', [...YEARS, bandMozart]).map(c => c.id).join() === 'w28,bandmoz',
  'one page per ensemble, still — two years collapse, two groups do not');

console.log('concertRosters.selfcheck: ok');
