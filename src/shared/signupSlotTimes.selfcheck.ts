/**
 * Self-check for sign-up time slot formatting (#signups).
 * Run: npx tsx src/shared/signupSlotTimes.selfcheck.ts
 */
import {
  formatClockMin, formatSignupSlotLabel, formatSlotDuration,
  isValidSlotDef, minutesToParts, partsToMinutes, slotDefsToOptions,
  normalizeTimeslotQuestion,
} from './signupSlotTimes.ts';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

assert(formatClockMin(partsToMinutes(3, 0, 'PM')) === '3:00 PM', 'clock format');
assert(formatSlotDuration(900, 930) === '30 min', '30 min duration');
assert(formatSlotDuration(900, 990) === '1 hr 30 min', '90 min duration');

const def = { date: '2026-03-03', startMin: partsToMinutes(3, 0, 'PM'), endMin: partsToMinutes(3, 30, 'PM') };
assert(isValidSlotDef(def), 'valid def');
assert(formatSignupSlotLabel(def).includes('3:00 PM'), 'label has start');
assert(formatSignupSlotLabel(def).includes('3:30 PM'), 'label has end');
assert(formatSignupSlotLabel(def).includes('30 min'), 'label has duration');

const opts = slotDefsToOptions([def]);
assert(opts.length === 1 && opts[0] === formatSignupSlotLabel(def), 'defs to options');

const normalized = normalizeTimeslotQuestion({
  id: 'q1', label: 'Pick a time', type: 'timeslot',
  slotDefs: [def],
  slotManualDraft: 'ignored',
});
assert(normalized.options?.[0] === opts[0], 'normalize from defs');
assert(normalized.slotDefs?.length === 1, 'keeps defs');

const manual = normalizeTimeslotQuestion({
  id: 'q2', label: 'Pick', type: 'timeslot',
  slotManualDraft: 'Line one\n\nLine two\n',
});
assert(manual.options?.join('|') === 'Line one|Line two', 'manual preserves lines on save');

const { hour12, ampm } = minutesToParts(partsToMinutes(12, 0, 'PM'));
assert(hour12 === 12 && ampm === 'PM', 'noon');

console.log('signupSlotTimes.selfcheck: ok');
