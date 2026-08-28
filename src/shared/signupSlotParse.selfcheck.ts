/**
 * Self-check for natural-language / bulk sign-up slot parsing.
 * Run: npx tsx --import ./scripts/vite-defines-shim.mjs src/shared/signupSlotParse.selfcheck.ts
 */
import {
  dedupeSlotDefs, expandBlockToSlots, mergeSlotDefs, parseSignupSlotText,
  parseSlotIntervalMin, slotsForDates,
} from './signupSlotParse.ts';
import { partsToMinutes } from './signupSlotTimes.ts';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

const now = new Date('2026-03-01T12:00:00');

assert(parseSlotIntervalMin('every 15 minutes') === 15, 'interval every');
assert(parseSlotIntervalMin('30 min slots') === 30, 'interval slots');

const block = expandBlockToSlots('2026-03-03', 900, 960, 15);
assert(block.length === 4, 'split 1hr into 15min');
assert(block[0].startMin === 900 && block[0].endMin === 915, 'first slice');

const bulk = slotsForDates(['2026-03-03', '2026-03-04'], 900, 930, null);
assert(bulk.length === 2, 'two days one slot each');

const merged = mergeSlotDefs(
  [{ date: '2026-03-03', startMin: 900, endMin: 930 }],
  [{ date: '2026-03-03', startMin: 900, endMin: 930 }, { date: '2026-03-04', startMin: 900, endMin: 930 }],
);
assert(merged.length === 2, 'merge dedupes');

const one = parseSignupSlotText('March 3 2026 3pm-3:30pm', now);
assert(one.slots.length === 1, 'single slot line');
assert(one.slots[0].date === '2026-03-03', 'march 3 date');
assert(one.slots[0].startMin === partsToMinutes(3, 0, 'PM'), '3pm start');

const many = parseSignupSlotText('March 3 2026 3-4pm every 15 minutes', now);
assert(many.slots.length === 4, 'four 15min slots');
assert(many.unparsed.length === 0, 'parsed ok');

const multiDay = parseSignupSlotText('March 3 and March 4 2026, 3-3:30pm', now);
assert(multiDay.slots.length === 2, 'two days same window');

const multiLine = parseSignupSlotText('March 3 2026 3-3:30pm\nMarch 5 2026 4-4:30pm', now);
assert(multiLine.slots.length === 2, 'two lines');

assert(dedupeSlotDefs(many.slots).length === many.slots.length, 'dedupe stable');

console.log('signupSlotParse.selfcheck: ok');
