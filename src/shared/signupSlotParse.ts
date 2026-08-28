import * as chrono from 'chrono-node';
import type { SignupSlotDef } from '../director/types.ts';
import { snapMinute } from './signupSlotTimes.ts';

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dateToMin(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/** School-day bias — copied from src/director/quickAdd.ts (no director import here). */
function biasAfternoon(component: chrono.ParsedComponents, date: Date): void {
  if (component.isCertain('meridiem')) return;
  const h = date.getHours();
  if (h >= 1 && h <= 7) date.setHours(h + 12);
}

export function parseSlotIntervalMin(text: string): number | null {
  const patterns = [
    /every\s+(\d{1,3})\s*-?\s*min(?:ute)?s?/i,
    /(\d{1,3})\s*-?\s*min(?:ute)?\s+slots?/i,
    /(\d{1,3})\s*-?\s*min(?:ute)?\s+each/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n >= 5 && n <= 240) return snapMinute(n) || n;
    }
  }
  return null;
}

/** One bookable window → many equal slots, or a single slot when no interval. */
export function expandBlockToSlots(
  date: string,
  startMin: number,
  endMin: number,
  intervalMin: number | null,
): SignupSlotDef[] {
  if (endMin <= startMin) return [];
  if (!intervalMin) return [{ date, startMin, endMin }];
  const out: SignupSlotDef[] = [];
  for (let s = startMin; s + intervalMin <= endMin; s += intervalMin) {
    out.push({ date, startMin: s, endMin: s + intervalMin });
  }
  return out;
}

export function slotDefKey(d: SignupSlotDef): string {
  return `${d.date}:${d.startMin}:${d.endMin}`;
}

export function dedupeSlotDefs(defs: SignupSlotDef[]): SignupSlotDef[] {
  const seen = new Set<string>();
  const out: SignupSlotDef[] = [];
  for (const d of defs) {
    const k = slotDefKey(d);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(d);
  }
  return out;
}

export function mergeSlotDefs(existing: SignupSlotDef[], incoming: SignupSlotDef[]): SignupSlotDef[] {
  return dedupeSlotDefs([...existing, ...incoming]);
}

export interface ParseSignupSlotsResult {
  slots: SignupSlotDef[];
  /** Lines the parser couldn't turn into slots — shown in the UI, never thrown. */
  unparsed: string[];
}

/**
 * Natural-language / bulk slot text (#signups). One line can describe many
 * slots: dates × a time range × an optional "every 15 minutes" split.
 * Runs client-side via chrono-node (same posture as Quick Add).
 */
export function parseSignupSlotText(input: string, now: Date = new Date()): ParseSignupSlotsResult {
  const slots: SignupSlotDef[] = [];
  const unparsed: string[] = [];
  const lines = input.split(/[\n;]+/).map(s => s.trim()).filter(Boolean);

  for (const line of lines) {
    const parsed = parseOneLine(line, now);
    if (parsed.length === 0) unparsed.push(line);
    else slots.push(...parsed);
  }

  return { slots: dedupeSlotDefs(slots), unparsed };
}

function parseOneLine(line: string, now: Date): SignupSlotDef[] {
  const interval = parseSlotIntervalMin(line);
  const stripped = line
    .replace(/every\s+\d{1,3}\s*-?\s*min(?:ute)?s?/gi, '')
    .replace(/\d{1,3}\s*-?\s*min(?:ute)?\s+slots?/gi, '')
    .replace(/\d{1,3}\s*-?\s*min(?:ute)?\s+each/gi, '')
    .trim();

  const timeResults = chrono.parse(stripped, now, { forwardDate: true });
  if (timeResults.length === 0) return [];

  const r = timeResults[0];
  const startDate = r.start.date();
  biasAfternoon(r.start, startDate);

  let startMin = dateToMin(startDate);
  let endMin = startMin + 30;
  if (r.end) {
    const endDate = r.end.date();
    biasAfternoon(r.end, endDate);
    endMin = dateToMin(endDate);
  } else if (interval) {
    endMin = startMin + interval;
  }

  const dates = collectDates(stripped, now, toDateStr(startDate));
  const out: SignupSlotDef[] = [];
  for (const date of dates) {
    out.push(...expandBlockToSlots(date, startMin, endMin, interval));
  }
  return out;
}

/** Pull every calendar day mentioned — "March 3 and 4", ranges, or a single date. */
function collectDates(text: string, now: Date, fallback: string): string[] {
  const found = new Set<string>();

  const rangeRe = /\b([A-Za-z]+\s+\d{1,2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s*[-–]\s*(\d{1,2})\b/g;
  let rm: RegExpExecArray | null;
  while ((rm = rangeRe.exec(text)) !== null) {
    const head = chrono.parse(rm[1], now, { forwardDate: true })[0];
    if (!head?.start.isCertain('day')) continue;
    const base = head.start.date();
    const endDay = parseInt(rm[2], 10);
    const startDay = base.getDate();
    const y = base.getFullYear();
    const mo = base.getMonth();
    for (let d = Math.min(startDay, endDay); d <= Math.max(startDay, endDay); d++) {
      found.add(toDateStr(new Date(y, mo, d)));
    }
  }

  const fragments = text.split(/\s+and\s+|\s*,\s*/i).map(s => s.trim()).filter(Boolean);
  for (const frag of fragments) {
    if (!frag || /^\d{1,2}$/.test(frag)) continue;
    const dr = chrono.parse(frag, now, { forwardDate: true });
    if (dr.length && dr[0].start.isCertain('day')) {
      found.add(toDateStr(dr[0].start.date()));
    }
  }

  if (found.size === 0) found.add(fallback);
  return [...found].sort();
}

/** Build slots for many calendar days + optional interval split (UI bulk add). */
export function slotsForDates(
  dates: string[],
  startMin: number,
  endMin: number,
  intervalMin: number | null,
): SignupSlotDef[] {
  const out: SignupSlotDef[] = [];
  for (const date of dates) {
    out.push(...expandBlockToSlots(date, startMin, endMin, intervalMin));
  }
  return dedupeSlotDefs(out);
}
