/**
 * A person's name, parsed once for the whole app (#roster-names).
 *
 * This module used to live inside `ensembleGrades.ts`, where it was written
 * for the district's report tables, while the roster sorted on a second,
 * naive definition in `scoreOrder.ts` (the last whitespace-separated word).
 * Two definitions meant "Beyra, Benjamin A." filed under B in one screen and
 * under A in the other. There is now exactly ONE, here, and both callers use
 * it.
 *
 * The roster stores names BOTH WAYS, and pretending otherwise is how a report
 * goes out wrong. Checked against the live roster on 2026-09-14: 120 of 142
 * active students are stored "Rose, William F." and 22 are stored
 * "Vincent T. Blades". Every student on the Camerata and Symphony tables is in
 * the first form, so a parser that assumed the second printed the middle
 * initial in the Last Name column ("Beyra, Benjamin A." → "A.") and sorted the
 * whole table by it.
 *
 * A COMMA is the reliable signal, and it is the only one: it is unambiguous
 * about where the surname ends, which the space-separated form is not.
 * "Nelisa Ochoa Rojas" is parsed as Ochoa/first, Rojas/last, and that is a
 * guess — a two-word surname is indistinguishable from a middle name without
 * being told. Storing every name "Last, First" removes the guess entirely, and
 * is worth doing for that reason alone.
 *
 * Never split a name on whitespace and take the first letters of the pieces
 * for anything: "Dr. Grant Gilman" is GG, not DGG. Use `parseName` and take
 * the halves it gives you.
 */
export interface ParsedName {
  first: string;
  last: string;
}

export function parseName(raw: string): ParsedName {
  const s = (raw ?? '').trim().replace(/\s+/g, ' ');
  if (!s) return { first: '', last: '' };

  const comma = s.indexOf(',');
  if (comma > 0) {
    return { last: s.slice(0, comma).trim(), first: s.slice(comma + 1).trim() };
  }

  const parts = s.split(' ');
  // A single word is a surname, not a first name: it is what an alphabetical
  // list has to sort on, and printing nothing in the Last Name column would be
  // worse than printing the only word there is.
  if (parts.length < 2) return { first: '', last: s };
  return { last: parts[parts.length - 1], first: parts.slice(0, -1).join(' ') };
}

/** "William F. Rose" — the Full Name column, however the roster stores it. */
export function displayName(name: string): string {
  const { first, last } = parseName(name);
  return first ? `${first} ${last}` : last;
}

/** "Rose, William F." — how a NAME IN A LIST reads, everywhere in the app: the
 *  roster card, Take Roll, Who's Out, the class rosters, the district's own
 *  tables. Alphabetical scanning is the only thing anyone does with a roster
 *  list, and it needs the surname first. Already-"Last, First" stays put, so
 *  this is safe to apply to a name however it was stored. */
export function lastFirst(name: string): string {
  const { first, last } = parseName(name);
  return first ? `${last}, ${first}` : last;
}

/** Just the surname, for Camerata's own Last Name column. */
export function lastName(name: string): string {
  return parseName(name).last;
}

/** Alphabetical by surname, then by the rest — requirement number one. */
export function byLastName(a: string, b: string): number {
  return lastFirst(a).localeCompare(lastFirst(b), undefined, { sensitivity: 'base' });
}
