/**
 * Pins the grading calendar (#gradebook). Run:
 *   npx tsx src/shared/gradingPeriods.selfcheck.ts
 *
 * Four promises, each of which produces numbers that look plausible and are
 * wrong when broken: a report covers the QUARTER to date rather than the span
 * since the last one, a cutoff outside the period is clamped rather than
 * silently emptying or overrunning the report, an interim date is never
 * invented (the district publishes none), and the configured NWSA quarters
 * reproduce the district's own printed school-day counts exactly.
 */
import {
  currentGradingPeriod, defaultCutoff, inWindow, periodForDate, sortPeriods, windowFor,
  type GradingPeriod,
} from './gradingPeriods.ts';
import { MDCPS_NO_SCHOOL } from './academicCalendars.ts';
// The org's real config, read as JSON rather than through `ORG`, so this runs
// under plain Node with no Vite defines shim (the pattern in
// functions/src/concertTally.ts).
import NWSA from '../../config/orgs/nwsa.json' with { type: 'json' };

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

const PERIODS: GradingPeriod[] = [
  { id: 'q1', name: 'Quarter 1', ordinal: '1st Quarter', short: 'Q1',
    start: '2026-08-13', end: '2026-10-16' },
  { id: 'q2', name: 'Quarter 2', ordinal: '2nd Quarter', short: 'Q2',
    start: '2026-10-19', end: '2027-01-14' },
  { id: 'q3', name: 'Quarter 3', ordinal: '3rd Quarter', short: 'Q3',
    start: '2027-01-19', end: '2027-03-19' },
  { id: 'q4', name: 'Quarter 4', ordinal: '4th Quarter', short: 'Q4',
    start: '2027-03-30', end: '2027-06-03' },
];

/* ── periodForDate ─────────────────────────────────────────────────────── */

assert(periodForDate(PERIODS, '2026-08-13')?.id === 'q1', 'the first day of a quarter is in it');
assert(periodForDate(PERIODS, '2026-10-16')?.id === 'q1', 'the last day of a quarter is in it');
assert(periodForDate(PERIODS, '2026-10-17') === null, 'the weekend between quarters is in neither');
assert(periodForDate(PERIODS, '2027-03-24') === null, 'spring recess is in no quarter');
assert(periodForDate([], '2026-09-15') === null, 'no periods configured answers null');

/* ── currentGradingPeriod ──────────────────────────────────────────────── */

assert(currentGradingPeriod(PERIODS, '2026-09-14')?.id === 'q1', 'inside a quarter, that quarter');
assert(
  currentGradingPeriod(PERIODS, '2027-03-24')?.id === 'q3',
  'in the spring-recess gap, the quarter that just closed — its grades are what is still open',
);
assert(currentGradingPeriod(PERIODS, '2027-07-04')?.id === 'q4', 'in July, the most recent quarter');
assert(currentGradingPeriod(PERIODS, '2026-07-01')?.id === 'q1', 'before the year starts, the first');
assert(currentGradingPeriod([], '2026-09-15') === null, 'nothing configured answers null, never throws');

/* ── the window covers the QUARTER to date ─────────────────────────────── */

const q1 = PERIODS[0];
const interim = windowFor(q1, 'interim', '2026-09-15');
assert(interim.from === '2026-08-13', 'an interim starts at the QUARTER start, not at a midpoint');
assert(interim.through === '2026-09-15', 'and runs to the cutoff');
assert(interim.prefix === 'Q1i', 'an interim carries the i suffix on its column headings');
assert(interim.label === 'Q1 Interim', 'and reads as an interim on screen');

const quarter = windowFor(q1, 'quarter', '2026-10-16');
assert(quarter.from === q1.start && quarter.through === q1.end, 'the quarter report covers all of it');
assert(quarter.prefix === 'Q1', 'the quarter report drops the i');

/* ── the cutoff is clamped, never allowed to overrun ───────────────────── */

assert(
  windowFor(q1, 'interim', '2026-07-01').through === '2026-08-13',
  'a cutoff before the quarter started clamps to the start, rather than producing an empty roster of blanks',
);
assert(
  windowFor(q1, 'interim', '2027-05-01').through === '2026-10-16',
  'a cutoff after the quarter ended clamps to the end, rather than sweeping in the next quarter',
);

assert(inWindow(interim, '2026-08-13'), 'the first day is in the window');
assert(inWindow(interim, '2026-09-15'), 'the cutoff day is in the window');
assert(!inWindow(interim, '2026-09-16'), 'the day after the cutoff is not');

/* ── an interim date is never invented ─────────────────────────────────── */

assert(
  defaultCutoff(q1, 'interim', '2026-09-14') === '2026-09-14',
  'an interim opens on TODAY. The district publishes no interim date for any quarter, and the '
  + 'teacher of record asking for the numbers by a given morning is a request, not a deadline '
  + 'this file gets to store',
);
assert(
  defaultCutoff(q1, 'interim', '2026-07-01') === '2026-08-13'
  && defaultCutoff(q1, 'interim', '2027-01-01') === '2026-10-16',
  'a today outside the quarter still clamps into it',
);
assert(defaultCutoff(q1, 'quarter', '2027-05-01') === '2026-10-16', 'a quarter report defaults to its end');
assert(defaultCutoff(q1, 'quarter', '2026-09-14') === '2026-09-14', 'unless the quarter is still running');

/* ── the configured quarters reproduce the district's printed calendar ─── */

// The M-DCPS 2026-2027 calendar (Elementary and Secondary) prints a day count
// beside each grading period: 45, 46, 42, 47, totalling 180. Counting weekdays
// between the configured boundaries, minus MDCPS_NO_SCHOOL, has to land on the
// same four numbers. If it does not, either a boundary or a no-school day is
// wrong — and both of those quietly change how many rehearsals a student is
// measured against.
function schoolDaysBetween(from: string, to: string): number {
  let n = 0;
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (d <= end) {
    const iso = d.toISOString().slice(0, 10);
    const dow = d.getUTCDay();
    if (dow >= 1 && dow <= 5 && !MDCPS_NO_SCHOOL.has(iso)) n += 1;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return n;
}

const configured = (NWSA.grading?.periods ?? []) as GradingPeriod[];
assert(configured.length === 4, 'NWSA configures four grading periods');

let districtTotal = 0;
for (const p of configured) {
  assert(p.schoolDays !== undefined, `${p.name} carries the district's printed day count`);
  const counted = schoolDaysBetween(p.start, p.end);
  assert(
    counted === p.schoolDays,
    `${p.name} (${p.start} to ${p.end}) counts ${counted} school days, but the district prints ${p.schoolDays}`,
  );
  districtTotal += p.schoolDays ?? 0;
  assert(!('interim' in p), `${p.name} stores no interim date — the district publishes none`);
}
assert(districtTotal === 180, `the four quarters total 180 school days, not ${districtTotal}`);

// The quarters must also tile the year without overlapping.
const inOrder = sortPeriods(configured);
for (let i = 1; i < inOrder.length; i++) {
  assert(
    inOrder[i].start > inOrder[i - 1].end,
    `${inOrder[i].name} starts after ${inOrder[i - 1].name} ends`,
  );
}
assert(inOrder[0].start === '2026-08-13', 'the year opens on the district first day of school');
assert(inOrder[3].end === '2027-06-03', 'and closes on the district last day');

/* ── ordering is by date and never mutates the caller ──────────────────── */

const shuffled = [PERIODS[2], PERIODS[0], PERIODS[3], PERIODS[1]];
assert(sortPeriods(shuffled).map(p => p.id).join(',') === 'q1,q2,q3,q4', 'sorted by start date');
assert(shuffled[0].id === 'q3', 'sortPeriods does not mutate its argument');

console.log('gradingPeriods.selfcheck: all assertions passed');
