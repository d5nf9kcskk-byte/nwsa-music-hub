import * as chrono from 'chrono-node';
import { toDateStr } from './utils';
import type { Ensemble, EventType, CampusLocation } from './types';

/**
 * Natural-language "Quick Add" parsing (#quick-add) — the Fantastical-style
 * "type a sentence, get a structured draft" pattern, but entirely client-side:
 * chrono-node (https://github.com/wanasit/chrono, MIT licensed, no network
 * calls) does the date/time understanding, and a small local matcher lines
 * the leftover words up against this school's own ensembles and locations.
 * No LLM call, no per-request cost — the tradeoff is that it's good at
 * dates/times and okay-but-imperfect at names, which is why the result is a
 * DRAFT: it prefills the real event form for the director to confirm or
 * correct, never saves anything on its own.
 */

export interface QuickAddDraft {
  type: EventType;
  ensembleIds: string[];
  date: string;         // YYYY-MM-DD
  startTime?: string;    // HH:MM (24h)
  endTime?: string;
  location?: string;
  title?: string;
  /** For the preview UI: what actually got matched, so a director can see
   *  (and fix) a wrong guess before it's ever saved. */
  matchedEnsembles: Ensemble[];
  matchedLocation?: CampusLocation;
  dateFound: boolean;
}

const TYPE_KEYWORDS: [EventType, RegExp][] = [
  ['Concert', /\b(concert|performance|recital|gala)\b/i],
  ['Sectional', /\bsectional\b/i],
  ['Class', /\b(class|theory|lecture|seminar)\b/i],
  ['Rehearsal', /\b(rehearsal|rehearse|practice)\b/i],
];

function detectType(text: string): EventType | null {
  for (const [type, re] of TYPE_KEYWORDS) if (re.test(text)) return type;
  return null;
}

function fmtHM(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** chrono defaults an AM/PM-less hour to AM ("2:30-3:45" → 02:30-03:45). For
 *  this app almost nothing happens between 1-7 AM — rehearsals, classes, and
 *  concerts run afternoon/evening — so an uncertain meridiem in that range is
 *  read as PM instead. Mutates the local Date copy chrono handed back. */
function biasAfternoon(component: chrono.ParsedComponents, date: Date): void {
  if (component.isCertain('meridiem')) return;
  const h = date.getHours();
  if (h >= 1 && h <= 7) date.setHours(h + 12);
}

/** How well an ensemble's name is represented in the free-text input. Each
 *  word of the name (skipping short filler like "of"/"the") that appears as
 *  a whole word in the input adds its own length to the score, so a longer
 *  (more distinctive) word like "Camerata" counts for more than a generic
 *  suffix like "Orchestra" that several ensembles share. Returns 0 for no
 *  overlap at all. */
function ensembleMatchScore(name: string, inputLower: string): number {
  const words = name.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  let score = 0;
  for (const w of words) {
    if (new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(inputLower)) score += w.length;
  }
  return score;
}

/**
 * Parse one line of free text into a draft CalendarEvent. `now` is injectable
 * for tests; defaults to the real current time.
 */
export function parseQuickAdd(
  input: string,
  ensembles: Ensemble[],
  locations: CampusLocation[],
  now: Date = new Date(),
): QuickAddDraft {
  const results = chrono.parse(input, now, { forwardDate: true });

  let date = toDateStr(now);
  let startTime: string | undefined;
  let endTime: string | undefined;
  let dateFound = false;
  let remaining = input;

  if (results.length > 0) {
    const r = results[0];
    dateFound = true;
    const startDate = r.start.date();
    biasAfternoon(r.start, startDate);
    date = toDateStr(startDate);
    if (r.start.isCertain('hour')) startTime = fmtHM(startDate);
    if (r.end) {
      const endDate = r.end.date();
      biasAfternoon(r.end, endDate);
      if (r.end.isCertain('hour')) endTime = fmtHM(endDate);
    }
    // Strip the matched date/time span so ensemble/location matching isn't
    // confused by stray digits ("3-5pm") left in the sentence.
    remaining = (input.slice(0, r.index) + ' ' + input.slice(r.index + r.text.length)).trim();
  }

  const remainingLower = remaining.toLowerCase();

  const scoredEnsembles = ensembles
    .map(e => ({ e, score: ensembleMatchScore(e.name, remainingLower) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);
  const topEnsembleScore = scoredEnsembles[0]?.score ?? 0;
  const matchedEnsembles = topEnsembleScore > 0
    ? scoredEnsembles.filter(x => x.score === topEnsembleScore).map(x => x.e)
    : [];

  const scoredLocations = locations
    .map(l => {
      const fields = [l.label, l.room].filter(Boolean) as string[];
      const matchedField = fields.find(f => remainingLower.includes(f.toLowerCase()));
      return { l, matchedField, score: matchedField?.length ?? 0 };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);
  const matchedLocationEntry = scoredLocations[0];
  const matchedLocation = matchedLocationEntry?.l;

  const type = detectType(remaining) ?? (matchedEnsembles.length > 0 ? 'Rehearsal' : 'Event');

  // A concert/one-off event usually wants a real title; pull it from
  // whatever text is left once the matched ensemble name(s), the matched
  // location, and the type keyword itself are stripped out ("Fall Gala
  // Concert tomorrow 7pm Chapman Conference Center" -> "Fall Gala").
  let title: string | undefined;
  if (type === 'Concert' || type === 'Event') {
    let leftover = remaining;
    const strip = (s: string) => leftover.replace(new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), '');
    for (const m of matchedEnsembles) leftover = strip(m.name);
    if (matchedLocationEntry?.matchedField) leftover = strip(matchedLocationEntry.matchedField);
    leftover = leftover.replace(/\b(concert|performance|recital|gala|event)\b/ig, '').replace(/\s+/g, ' ').trim();
    leftover = leftover.replace(/^[-,.\s]+|[-,.\s]+$/g, '');
    if (leftover) title = leftover;
  }

  // Only one clear ensemble match and nothing more specific was said —
  // borrow its usual time/room, same as picking that ensemble in the event
  // form itself does.
  const single = matchedEnsembles.length === 1 ? matchedEnsembles[0] : undefined;
  const location = matchedLocation ? (matchedLocation.room || matchedLocation.label) : (!startTime && single?.defaultLocation);
  if (single) {
    if (!startTime && single.defaultStartTime) startTime = single.defaultStartTime;
    if (!endTime && single.defaultEndTime) endTime = single.defaultEndTime;
  }

  return {
    type,
    ensembleIds: matchedEnsembles.map(e => e.id),
    date,
    startTime,
    endTime,
    location: location || undefined,
    title,
    matchedEnsembles,
    matchedLocation,
    dateFound,
  };
}
