/**
 * Self-check for sign-up time slot formatting (#signups).
 * Run: npx tsx src/shared/signupSlotTimes.selfcheck.ts
 */
import {
  formatClockMin, formatSignupSlotLabel, formatSlotDuration,
  isValidSlotDef, minutesToParts, partsToMinutes, slotDefsToOptions,
  normalizeTimeslotQuestion, sortSlotDefs, moveItem, signupQuestionHasContent,
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
assert(normalized.optionGrades === undefined, 'no grades → omit optionGrades');

const seniorDef = { ...def, grades: ['12th'] };
const withGrades = normalizeTimeslotQuestion({
  id: 'q1b', label: 'Pick', type: 'timeslot',
  slotDefs: [seniorDef, def],
});
assert(withGrades.optionGrades?.[0]?.[0] === '12th', 'derives optionGrades from defs');
assert(withGrades.optionGrades?.[1] === undefined, 'open slot is simply absent from the map');

const manual = normalizeTimeslotQuestion({
  id: 'q2', label: 'Pick', type: 'timeslot',
  slotManualDraft: 'Line one\n\nLine two\n',
  optionGrades: { 0: ['12th'] },
});
assert(manual.options?.join('|') === 'Line one|Line two', 'manual preserves lines on save');
assert(manual.optionGrades?.[0]?.[0] === '12th', 'manual keeps optionGrades');

// The shape that goes to Firestore: nested arrays are rejected outright, so a
// grade-restricted slot must never produce an array of arrays. That bug made
// every save of such a sign-up throw, with the slots lost.
function noNestedArrays(value: unknown, path = 'question'): void {
  if (Array.isArray(value)) {
    value.forEach((v, i) => {
      assert(!Array.isArray(v), `nested array at ${path}[${i}] — Firestore rejects this`);
      noNestedArrays(v, `${path}[${i}]`);
    });
    return;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) noNestedArrays(v, `${path}.${k}`);
  }
}
noNestedArrays(withGrades);
noNestedArrays(manual);
assert(withGrades.optionGrades?.[0]?.[0] === '12th', 'grade map survives the shape check');

const { hour12, ampm } = minutesToParts(partsToMinutes(12, 0, 'PM'));
assert(hour12 === 12 && ampm === 'PM', 'noon');

// Order: added slots land chronologically; a manual move keeps every slot.
const jumbled = [
  { date: '2026-03-04', startMin: 540, endMin: 570 },
  { date: '2026-03-03', startMin: 900, endMin: 930 },
  { date: '2026-03-03', startMin: 840, endMin: 870 },
];
const sorted = sortSlotDefs(jumbled);
assert(sorted.map(d => `${d.date}:${d.startMin}`).join('|')
  === '2026-03-03:840|2026-03-03:900|2026-03-04:540', 'chronological sort');
assert(jumbled[0].date === '2026-03-04', 'sort does not mutate');

assert(moveItem([1, 2, 3], 2, 0).join('') === '312', 'move last to front');
assert(moveItem([1, 2, 3], 0, 1).join('') === '213', 'move down one');
assert(moveItem([1, 2, 3], 0, 9).join('') === '123', 'out of range = unchanged');
assert(moveItem(sorted, 0, 2).length === sorted.length, 'move loses nobody');

// A built-out question is never "empty" just because its label is blank —
// the editor filters on label, so a false here silently deletes real work.
assert(signupQuestionHasContent({ id: 'q', label: '', type: 'timeslot', slotDefs: [def] }),
  'slot defs count as content');
assert(signupQuestionHasContent({ id: 'q', label: '', type: 'timeslot', slotManualDraft: '3:00 PM' }),
  'manual slot draft counts as content');
assert(signupQuestionHasContent({ id: 'q', label: '', type: 'choice', options: ['Yes'] }),
  'options count as content');
assert(!signupQuestionHasContent({ id: 'q', label: '', type: 'short' }),
  'an untouched new question is still droppable');
assert(!signupQuestionHasContent({ id: 'q', label: '', type: 'choice', options: ['', ' '] }),
  'blank options are not content');

console.log('signupSlotTimes.selfcheck: ok');
