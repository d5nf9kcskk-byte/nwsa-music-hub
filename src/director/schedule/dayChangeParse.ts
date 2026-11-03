import * as chrono from 'chrono-node';
import type { CalendarEvent } from '../types';
import type { DayAction } from './changePlan';

/**
 * "Type what changed" on Change a Day (#day-change-parse).
 *
 * One sentence in, ONE DayAction out — the same objects the quick-option chips
 * hand to `planDayChange`, so a typed change lands in the SAME review sheet,
 * writes nothing until the director confirms, and "Back to normal" undoes it
 * exactly like a chip's. This module never writes, and never guesses: a
 * sentence it cannot pin to specific blocks on a specific day is refused with
 * a plain reason, and the screen points at the chips.
 *
 * Entirely local. chrono-node reads the dates and times (as Quick Add does);
 * groups are matched against their own names plus the org's vanity slugs
 * (`ORG.vanitySlugs`, handed in so this file stays free of the org config and
 * its self-check runs under plain tsx). Rooms are matched against the
 * Locations list when one is named there, else taken as typed.
 *
 * Deliberately NOT here: whole-day verbs ("cancel everything", "back to
 * normal"). Those have campus-scoped chips (#college-hs-calendar-deps) and an
 * unscoped sweep typed from a sentence is exactly the mistake those chips
 * exist to prevent.
 *
 * Pinned by `dayChangeParse.selfcheck.ts`.
 */

export interface ParseGroup { id: string; name: string; order?: number }
export interface ParseLocation { room: string; label: string }
export interface ParseContext {
  /** Real "now" — what "today" and "Thursday" are read against. */
  now: Date;
  /** The day on screen: used when the sentence names no date. */
  defaultDate: string;
  events: CalendarEvent[];
  groups: ParseGroup[];
  /** `ORG.vanitySlugs` — the org's own short names ("cam", "cco", "jazz"). */
  aliases?: { slug: string; match: string[] }[];
  locations?: ParseLocation[];
}

export type DayChangeParse =
  | { ok: true; date: string; action: DayAction; read: string }
  | { ok: false; reason: string };

/**
 * The seam for a model fallback, and nothing behind it. A model call needs a
 * provider key and the school's vendor approval, neither of which exists, so
 * a sentence this parser refuses is refused. If that changes, this is the one
 * place to plug it in — its result must still be a DayAction for the review
 * sheet, never a write.
 */
export type DayChangeModelFallback = (input: string, ctx: ParseContext) => Promise<DayChangeParse>;
export const DAY_CHANGE_MODEL_FALLBACK: DayChangeModelFallback | null = null;

const pad = (n: number) => String(n).padStart(2, '0');
const toDateStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const fromMin = (m: number) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hasWord = (text: string, w: string) => new RegExp(`\\b${esc(w)}\\b`, 'i').test(text);

/** Same school-day bias as Quick Add: nothing meets 1-7 AM, so an hour with
 *  no AM/PM in that range is the afternoon. */
function biasAfternoon(c: chrono.ParsedComponents, d: Date) {
  if (c.isCertain('meridiem')) return;
  if (d.getHours() >= 1 && d.getHours() <= 7) d.setHours(d.getHours() + 12);
}

/** Words that name no particular group — several share them, or they are the
 *  sentence's own grammar. */
const GENERIC = new Set([
  'orchestra', 'ensemble', 'ensembles', 'band', 'class', 'classes', 'group', 'music', 'the', 'and',
  'block', 'rehearsal', 'rehearsals', 'sectional', 'college', 'section', 'today', 'tomorrow',
]);

const VERB = {
  cancel: /\b(cancel(?:led|ed)?|call(?:ed)?\s+off|is\s+off|no\s+(?=\w))/i,
  combine: /\b(combine[ds]?|merge[ds]?|together|join(?:s|ed)?\s+with)\b/i,
  swap: /\b(swap(?:ped|s)?|switch(?:ed|es)?|trade[ds]?)\b/i,
  move: /\b(move[ds]?|moving|push(?:ed)?|shift(?:ed)?|start(?:s|ing)?|now|instead|is\s+in|are\s+in|meets?\s+in|change[ds]?)\b/i,
  wholeDay: /\b(cancel(?:led)?\s+(?:the\s+)?(?:whole\s+)?(?:day|everything|all)|back\s+to\s+normal|put\s+(?:it\s+|everything\s+|the\s+day\s+)?back|undo|no\s+school|school\s+(?:is\s+)?closed)\b/i,
};

export function parseDayChange(input: string, ctx: ParseContext): DayChangeParse {
  const raw = input.trim();
  if (!raw) return { ok: false, reason: 'Type a change, like “Cancel Camerata today”.' };
  if (VERB.wholeDay.test(raw)) {
    return { ok: false, reason: 'Whole-day changes stay on the day’s buttons, so the right campus’s day is the one that changes.' };
  }

  // Moving a block to ANOTHER DAY is not a day change: every DayAction works
  // inside one date. Reading "push Symphony to Thursday" as "Thursday's
  // Symphony" would quietly change the wrong block.
  if (/\b(?:to|until|till)\s+(?:next\s+|this\s+)?(?:mon|tues?|wed(?:nes)?|thu(?:rs?)?|fri|sat(?:ur)?|sun)(?:day)?\b|\b(?:to|until|till)\s+(?:tomorrow|today)\b/i.test(raw)) {
    return { ok: false, reason: 'Moving a block to another day is done in its Event form (Schedule → the event → date). This box changes one day at a time.' };
  }

  // ── Date and time ────────────────────────────────────────────────────
  // "Thursday's" → "Thursday": chrono does not read the possessive.
  const text = raw.replace(/(\w)['’]s\b/g, '$1');
  let date: string | undefined;
  let start: string | undefined;
  let end: string | undefined;
  let rest = text;
  for (const r of chrono.parse(text, ctx.now, { forwardDate: true })) {
    // "Symphony now at 4" — chrono reads "now" as this very minute.
    if (/^(?:right\s+)?now$/i.test(r.text.trim())) continue;
    const s = r.start;
    const isDay = s.isCertain('day') || s.isCertain('weekday');
    if (isDay && !date) date = toDateStr(s.date());
    // chrono reads "now" as a time; a time has to be WRITTEN ("3:30", "4pm", "noon").
    if (s.isCertain('hour') && !start && /\d|noon/i.test(r.text)) {
      const d = s.date(); biasAfternoon(s, d); start = hm(d);
      if (r.end?.isCertain('hour')) { const e = r.end.date(); biasAfternoon(r.end, e); end = hm(e); }
    }
    rest = rest.replace(r.text, ' ');
  }
  date ??= ctx.defaultDate;

  // ── Room ─────────────────────────────────────────────────────────────
  // A Locations entry named anywhere wins (its room string is what events
  // store); otherwise whatever follows "in"/"into"/"to the", as typed.
  let location: string | undefined;
  const known = (ctx.locations ?? [])
    .flatMap(l => [l.label, l.room].filter(Boolean).map(f => ({ f, l })))
    .filter(x => hasWord(rest, x.f))
    .sort((a, b) => b.f.length - a.f.length)[0];
  if (known) {
    location = known.l.room || known.l.label;
    rest = rest.replace(new RegExp(`\\b(?:(?:is|are|meets?)\\s+)?(?:in|into|to)?\\s*(?:the\\s+)?${esc(known.f)}\\b`, 'i'), ' ');
  } else {
    const m = rest.match(/\b(?:in|into|to)\s+(?:the\s+)?([A-Za-z0-9][\w .'’-]*?)\s*[.!]?\s*$/i);
    const phrase = m?.[1]?.trim().replace(/\s+(?:to|at|on|by|from)$/i, '');
    if (phrase && !/^(at|on|by|from)$/i.test(phrase)) {
      location = phrase;
      rest = rest.slice(0, m!.index) + ' ';
    }
  }

  // ── Groups → blocks on that date ─────────────────────────────────────
  const dayBlocks = ctx.events
    .filter(e => e.date === date && e.ensembleIds.length > 0 && e.status !== 'Cancelled')
    .sort((a, b) => (a.startTime ?? '99').localeCompare(b.startTime ?? '99'));
  const nameOf = (id: string) => ctx.groups.find(g => g.id === id)?.name ?? id;
  const blockLabel = (e: CalendarEvent) => e.title || e.ensembleIds.map(nameOf).join(' + ');

  // Each hit word → the groups it can mean. Name words first, then the org's
  // vanity slugs (three letters or more: "so" and "we" are English).
  const hits: { word: string; groupIds: string[] }[] = [];
  const words = new Set(ctx.groups.flatMap(g => g.name.toLowerCase().split(/[^a-z0-9#]+/)).filter(w => w.length > 2 && !GENERIC.has(w)));
  for (const w of words) {
    if (!hasWord(rest, w)) continue;
    hits.push({ word: w, groupIds: ctx.groups.filter(g => g.name.toLowerCase().split(/[^a-z0-9#]+/).includes(w)).map(g => g.id) });
  }
  for (const a of ctx.aliases ?? []) {
    if (a.slug.length < 3 || words.has(a.slug) || !hasWord(rest, a.slug)) continue;
    const g = [...ctx.groups]
      .sort((x, y) => (x.order ?? 0) - (y.order ?? 0))
      .find(x => a.match.some(m => x.name.toLowerCase().includes(m)));
    if (g) hits.push({ word: a.slug, groupIds: [g.id] });
  }
  // Words naming the same group(s) are one mention ("Symphony Orchestra").
  const mentions: { word: string; groupIds: string[] }[] = [];
  for (const h of hits) {
    const same = mentions.find(m => m.groupIds.length === h.groupIds.length && m.groupIds.every(id => h.groupIds.includes(id)));
    if (!same) mentions.push(h);
  }
  // A mention narrower than another ("camerata" vs a word hitting Camerata
  // and Philharmonic) is the more specific reading; drop the wider one.
  const specific = mentions.filter(m => !mentions.some(o => o !== m
    && o.groupIds.length < m.groupIds.length && o.groupIds.every(id => m.groupIds.includes(id))));

  const when = new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  if (specific.length === 0) {
    return { ok: false, reason: 'I couldn’t tell which ensemble you mean. Name it the way it reads on the board.' };
  }
  const blocks: CalendarEvent[] = [];
  for (const m of specific) {
    const found = dayBlocks.filter(e => e.ensembleIds.some(id => m.groupIds.includes(id)));
    if (found.length === 0) {
      return { ok: false, reason: `Nothing for “${m.word}” is on the calendar ${when}. Check the day.` };
    }
    if (found.length > 1) {
      return { ok: false, reason: `“${m.word}” matches ${found.length} blocks ${when} (${found.map(blockLabel).join(', ')}). Use Change on the one you mean.` };
    }
    if (!blocks.includes(found[0])) blocks.push(found[0]);
  }

  // ── The verb ─────────────────────────────────────────────────────────
  const one = blocks.length === 1 ? blocks[0] : undefined;
  if (VERB.cancel.test(raw) && !VERB.combine.test(raw)) {
    return { ok: true, date, action: { kind: 'cancel', ids: blocks.map(e => e.id) }, read: `Cancel ${blocks.map(blockLabel).join(', ')} on ${when}` };
  }
  if (VERB.combine.test(raw)) {
    if (blocks.length < 2) return { ok: false, reason: 'Combining needs two groups that meet that day. Name both.' };
    const [host, ...absorbed] = blocks;
    const action: DayAction = { kind: 'combine', hostId: host.id, absorbedIds: absorbed.map(e => e.id) };
    if (start) {
      action.startTime = start;
      action.endTime = end ?? (host.startTime && host.endTime ? fromMin(toMin(start) + toMin(host.endTime) - toMin(host.startTime)) : undefined);
    }
    if (location) action.location = location;
    return { ok: true, date, action, read: `Combine ${blocks.map(blockLabel).join(' + ')} on ${when}` };
  }
  if (VERB.swap.test(raw)) {
    if (blocks.length !== 2) return { ok: false, reason: 'A swap needs exactly two groups that meet that day.' };
    return { ok: true, date, action: { kind: 'swap', aId: blocks[0].id, bId: blocks[1].id }, read: `Swap ${blockLabel(blocks[0])} ↔ ${blockLabel(blocks[1])} on ${when}` };
  }
  if (VERB.move.test(raw) || start || location) {
    if (!one) return { ok: false, reason: 'A move is one group at a time. Name one.' };
    if (!start && !location) return { ok: false, reason: 'I couldn’t find a new time or room in that. Try “to 3:30” or “in the Recital Hall”.' };
    let startTime = one.startTime, endTime = one.endTime;
    if (start) {
      startTime = start;
      endTime = end ?? (one.startTime && one.endTime ? fromMin(toMin(start) + toMin(one.endTime) - toMin(one.startTime)) : one.endTime);
    }
    if (startTime && endTime && endTime <= startTime) return { ok: false, reason: 'That end time is before the start time.' };
    return {
      ok: true, date,
      action: { kind: 'move', id: one.id, startTime, endTime, location: location ?? one.location },
      read: `Move ${blockLabel(one)} on ${when}`,
    };
  }
  return { ok: false, reason: 'I couldn’t tell what should change. Try “cancel”, “move … to 3:30” or “combine … and …”.' };
}
