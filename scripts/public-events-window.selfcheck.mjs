#!/usr/bin/env node
/**
 * Self-check for the public events date-window math (src/public/hooks/eventWindow.ts).
 * If this breaks, the public calendar silently stops showing months outside the
 * live window, or re-reads slices it already paid for.
 * Run: node scripts/public-events-window.selfcheck.mjs
 */
import { missingSlices, monthRange, widen } from '../src/public/hooks/eventWindow.ts';

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exit(1); }
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Month bounds, including a leap February and a 31-day month.
assert(same(monthRange(2026, 7), { from: '2026-08-01', to: '2026-08-31' }), 'Aug 2026');
assert(same(monthRange(2027, 1), { from: '2027-02-01', to: '2027-02-28' }), 'Feb 2027');
assert(same(monthRange(2028, 1), { from: '2028-02-01', to: '2028-02-29' }), 'Feb 2028 (leap)');

const live = { from: '2026-08-07', to: '2026-09-28' };

// Fully inside the live window: nothing to fetch.
assert(missingSlices(live, live).length === 0, 'exact window is already live');
assert(missingSlices(live, { from: '2026-08-20', to: '2026-09-01' }).length === 0, 'inner range is already live');

// Partly outside: only the uncovered end is fetched.
assert(same(missingSlices(live, monthRange(2026, 7)), [{ from: '2026-08-01', to: '2026-08-07' }]),
  'August needs only the days before the window starts');
assert(same(missingSlices(live, monthRange(2026, 8)), [{ from: '2026-09-28', to: '2026-09-30' }]),
  'September needs only the days past the window end');

// Ahead of it: one slice, seamed onto what is loaded.
assert(same(missingSlices(live, monthRange(2026, 9)), [{ from: '2026-09-28', to: '2026-10-31' }]),
  'October needs the slice past the window end');

// Behind it: one slice the other way.
assert(same(missingSlices(live, monthRange(2026, 5)), [{ from: '2026-06-01', to: '2026-08-07' }]),
  'June needs the slice before the window start');

// Straddling both ends: two slices.
assert(missingSlices(live, { from: '2026-01-01', to: '2027-06-01' }).length === 2, 'both ends');

// Widening is monotonic, so paging back to a month already fetched is free.
let loaded = { ...live };
loaded = widen(loaded, monthRange(2026, 9));
assert(same(loaded, { from: '2026-08-07', to: '2026-10-31' }), 'widened forward only');
assert(missingSlices(loaded, monthRange(2026, 9)).length === 0, 'October re-visit is free');
loaded = widen(loaded, monthRange(2026, 7));
assert(same(loaded, { from: '2026-08-01', to: '2026-10-31' }), 'paging back grows the near end, not the far one');
assert(missingSlices(loaded, monthRange(2026, 7)).length === 0, 'August re-visit is free');

console.log('public-events-window.selfcheck: ok');
