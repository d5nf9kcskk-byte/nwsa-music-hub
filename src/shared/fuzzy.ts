/**
 * The ONE fuzzy matcher for type-to-find lists — the director's global
 * search, the public search overlay, and the link picker.
 *
 * Lifted out of DirectorSearch.tsx when the link picker needed the same
 * ranking: two scorers drifting apart means the same query finds an event in
 * one box and not the other, which reads as a bug in the data.
 *
 * Diacritic-stripped, case-insensitive: every whitespace-separated query
 * token must appear in the text. Word-start hits score higher than mid-word
 * substring hits; a hit at the very start scores highest.
 */

export function normalizeText(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function scoreMatch(query: string, text?: string): number {
  if (!text) return 0;
  const t = normalizeText(text);
  const tokens = normalizeText(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 0;
  let total = 0;
  for (const tok of tokens) {
    const idx = t.indexOf(tok);
    if (idx === -1) return 0;
    const wordStart = idx === 0 || /[^a-z0-9]/.test(t[idx - 1]);
    total += (wordStart ? 3 : 1) + (idx === 0 ? 1 : 0);
  }
  return total;
}

/** True when two words are the same or one slip apart: one letter wrong,
 *  missing, extra, or two neighbours swapped ("nutcraker", "camertaa"). Ask
 *  uses it to forgive a typo in a name; it is deliberately no looser, because
 *  two slips is where "concerto" starts matching every concert. */
export function withinOneTypo(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  return short.slice(i) === long.slice(i + 1);
}

/** Rank `list` against `query`. The FIRST field a row exposes counts double —
 *  a name match should beat a note that happens to mention the same word. */
export function rankMatches<T>(
  list: T[],
  query: string,
  fields: (item: T) => (string | undefined)[],
  max = 8,
  tieBreak?: (a: T, b: T) => number,
): T[] {
  const scored: { item: T; score: number }[] = [];
  for (const item of list) {
    let best = 0;
    fields(item).forEach((f, i) => {
      const s = scoreMatch(query, f) * (i === 0 ? 2 : 1);
      if (s > best) best = s;
    });
    if (best > 0) scored.push({ item, score: best });
  }
  scored.sort((a, b) => b.score - a.score || (tieBreak ? tieBreak(a.item, b.item) : 0));
  return scored.slice(0, max).map(s => s.item);
}
