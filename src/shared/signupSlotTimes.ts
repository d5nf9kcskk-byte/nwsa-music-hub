import { fmtLongDate } from './dates.ts';
import { compactOptionGrades, parseSlotOptions } from './signupSlots.ts';
import type { SignupQuestion, SignupSlotDef } from '../director/types.ts';

/** Minutes since midnight → 12-hour clock parts. */
export function minutesToParts(min: number): { hour12: number; minute: number; ampm: 'AM' | 'PM' } {
  const clamped = Math.max(0, Math.min(1439, min));
  const h24 = Math.floor(clamped / 60);
  const minute = clamped % 60;
  const ampm: 'AM' | 'PM' = h24 >= 12 ? 'PM' : 'AM';
  const hour12 = h24 % 12 || 12;
  return { hour12, minute, ampm };
}

export function partsToMinutes(hour12: number, minute: number, ampm: 'AM' | 'PM'): number {
  let h = hour12 % 12;
  if (ampm === 'PM') h += 12;
  return h * 60 + minute;
}

export function formatClockMin(min: number): string {
  const { hour12, minute, ampm } = minutesToParts(min);
  return `${hour12}:${String(minute).padStart(2, '0')} ${ampm}`;
}

export function formatSlotDuration(startMin: number, endMin: number): string {
  const mins = Math.max(0, endMin - startMin);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

/** Student-facing label: date + start–end + duration hint in parens. */
export function formatSignupSlotLabel(def: SignupSlotDef): string {
  const start = formatClockMin(def.startMin);
  const end = formatClockMin(def.endMin);
  const dur = formatSlotDuration(def.startMin, def.endMin);
  return `${fmtLongDate(def.date)} · ${start} – ${end} (${dur})`;
}

export function slotDefsToOptions(defs: SignupSlotDef[]): string[] {
  return defs.map(formatSignupSlotLabel);
}

export function sortSlotDefs(defs: SignupSlotDef[]): SignupSlotDef[] {
  return [...defs].sort((a, b) =>
    a.date.localeCompare(b.date) || a.startMin - b.startMin || a.endMin - b.endMin);
}

/** Move one item to another position (drag / arrow-key reorder).
 *  Out-of-range leaves the list untouched. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export const SLOT_MINUTE_STEPS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55] as const;
export const SLOT_HOURS_12 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
export const SLOT_AMPM = ['AM', 'PM'] as const;

/** Snap a minute value to the nearest 5-minute step. */
export function snapMinute(min: number): number {
  return SLOT_MINUTE_STEPS.reduce((best, step) =>
    Math.abs(step - min) < Math.abs(best - min) ? step : best, 0);
}

export function defaultSlotTimes(): { startMin: number; endMin: number } {
  return { startMin: partsToMinutes(3, 0, 'PM'), endMin: partsToMinutes(3, 30, 'PM') };
}

export function isValidSlotDef(def: SignupSlotDef): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(def.date)
    && def.startMin >= 0 && def.endMin <= 1440
    && def.endMin > def.startMin;
}

/** Strip empty grade arrays so Firestore never stores `grades: []`. */
export function cleanSlotDefGrades(def: SignupSlotDef): SignupSlotDef {
  const grades = def.grades?.filter(Boolean);
  if (!grades?.length) {
    const { grades: _drop, ...rest } = def;
    void _drop;
    return rest;
  }
  return { ...def, grades };
}

/**
 * Does this question hold work a director would be upset to lose? The editor
 * drops questions with a blank label — that is right for an "Add question"
 * someone clicked and abandoned, and WRONG for a timeslot question carrying a
 * morning of built lesson slots. Save blocks on that case instead of
 * discarding it silently (that is how a whole slot grid went missing once).
 */
export function signupQuestionHasContent(q: SignupQuestion): boolean {
  return Boolean(
    (q.slotDefs?.length)
    || (q.options ?? []).some(o => o.trim())
    || q.slotManualDraft?.trim()
    || q.help?.trim(),
  );
}

/** Strip editor-only fields and derive student-facing `options` from slot defs. */
export function normalizeTimeslotQuestion(q: SignupQuestion): SignupQuestion {
  const { slotManualDraft, ...rest } = q;
  void slotManualDraft;
  if (q.type !== 'timeslot') return q;
  const defs = (q.slotDefs ?? []).map(cleanSlotDefGrades);
  if (defs.length > 0) {
    const options = slotDefsToOptions(defs);
    return {
      ...rest,
      slotDefs: defs,
      options,
      optionGrades: compactOptionGrades(defs.map(d => d.grades ?? null), options.length),
      help: q.help?.trim() || undefined,
      reference: q.reference,
    };
  }
  const manual = q.slotManualDraft?.trim();
  const options = manual
    ? parseSlotOptions(manual)
    : (q.options ?? []).map(o => o.trim()).filter(Boolean);
  return {
    ...rest,
    options,
    slotDefs: undefined,
    optionGrades: compactOptionGrades(q.optionGrades, options.length),
    help: q.help?.trim() || undefined,
    reference: q.reference,
  };
}
