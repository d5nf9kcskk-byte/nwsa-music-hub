/**
 * Pins which seating chart a concert program prints (#concert-rosters).
 *
 * Every promise here is silent to break and only discovered on paper, at the
 * concert, with the wrong names in the audience's hands: a concert that
 * attached nothing must print exactly what it printed before this feature
 * existed, an attached chart must beat a newer un-attached one, the
 * designated chart must beat a newer attached one, and no chart may ever
 * appear on another ensemble's roster page.
 */
import { concertChartFor, newestChart } from './concertRosters';
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

console.log('concertRosters.selfcheck: ok');
