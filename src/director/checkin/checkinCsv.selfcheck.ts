/**
 * Runnable: npx tsx --import ./scripts/vite-defines-shim.mjs src/director/checkin/checkinCsv.selfcheck.ts
 *
 * Pins the cumulative CSV (#concert-checkin). What matters here is not the
 * column order but three promises the director is relying on:
 *
 *   1. ONE row per student per concert, carrying both times — successive
 *      concerts append to the same file rather than becoming separate ones.
 *   2. A row is built from the RECORD, so renaming a concert in March does
 *      not rewrite what happened in September.
 *   3. A concert only counts once BOTH scans exist. Checking in and leaving
 *      is the case the check-out exists to catch.
 */
import { pairCheckins, checkinsToCsv, talliesByStudent, minutesPresent, photoLink } from './checkinCsv.ts';
import type { ConcertCheckin } from '../types.ts';
import type { Term } from '../../shared/concertCheckin.ts';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const TERMS: Term[] = [
  { id: '2026-fall', name: 'Fall 2026', start: '2026-08-17', end: '2026-12-19' },
  { id: '2027-spring', name: 'Spring 2027', start: '2027-01-06', end: '2027-06-03' },
];

const scan = (o: Partial<ConcertCheckin>): ConcertCheckin => ({
  id: `${o.eventId}_${o.studentId}_${o.kind}`,
  eventId: 'faculty', eventTitle: 'Faculty Concert', eventDate: '2026-08-31',
  eventAttendance: 'required', studentId: 'ana', studentName: 'Ana Ruiz',
  grade: '11', instrument: 'Violin', email: 'ana@students.dadeschools.net',
  kind: 'in', at: Date.UTC(2026, 7, 31, 23, 0), termId: '2026-fall',
  ...o,
} as ConcertCheckin);

/* ── 1. One row per student per concert ── */

const both = [
  scan({ kind: 'in', at: Date.UTC(2026, 7, 31, 23, 0), photoPath: 'checkins/faculty/ana-in-1.jpg' }),
  scan({ kind: 'out', at: Date.UTC(2026, 8, 1, 1, 5), photoPath: 'checkins/faculty/ana-out-1.jpg' }),
];
const paired = pairCheckins(both);
assert(paired.length === 1, 'two scans at one concert are ONE row, not two');
assert(paired[0].in && paired[0].out, 'and that row carries both times');
assert(minutesPresent(paired[0]) === '125', 'minutes present is the gap between the scans');

// A second concert appends rather than replacing.
const twoConcerts = [
  ...both,
  scan({ eventId: 'winter', eventTitle: 'Winter Concert', eventDate: '2026-12-05', kind: 'in' }),
  scan({ eventId: 'winter', eventTitle: 'Winter Concert', eventDate: '2026-12-05', kind: 'out', at: Date.UTC(2026, 11, 6, 1, 0) }),
];
assert(pairCheckins(twoConcerts).length === 2, 'each successive concert adds rows to the same file');
const OPTS = { terms: TERMS, timeZone: 'America/New_York', publicUrl: 'https://example.test/hub/' };
const csv = checkinsToCsv(twoConcerts, OPTS);
assert(csv.split('\r\n').length === 3, 'header plus one row per student per concert');
assert(csv.includes('Faculty Concert') && csv.includes('Winter Concert'), 'both concerts are in the one file');
assert(csv.split('\r\n')[1].startsWith('Winter Concert'), 'newest concert first');
assert(csv.includes('Fall 2026'), 'the semester is named, not just its id');

/* ── 2. The row is the record, not the current event ── */

const renamed = pairCheckins([
  scan({ kind: 'in' }),
  scan({ kind: 'out', at: Date.UTC(2026, 8, 1, 1, 0) }),
]);
assert(renamed[0].eventTitle === 'Faculty Concert',
  'the row keeps the concert title as it was on the night');

// A record whose student has since left still reads.
const gone = pairCheckins([scan({ kind: 'in', studentName: '' })]);
assert(gone[0].studentName === 'ana', 'a record with no name falls back to the id rather than going blank');

/* ── 3. A concert counts only when BOTH scans exist ── */

const inOnly = talliesByStudent([scan({ kind: 'in' })]);
assert(Object.keys(inOnly).length === 0, 'checking in and leaving counts for NOTHING — that is why check-out exists');

const complete = talliesByStudent(both);
assert(complete.ana['2026-fall'].required === 1, 'a completed required concert counts once');
assert(complete.ana['2026-fall'].optional === 0, 'and not in the other pot');

const mixed = talliesByStudent([
  ...both,
  scan({ eventId: 'jazz', eventDate: '2026-10-02', eventAttendance: 'optional', kind: 'in' }),
  scan({ eventId: 'jazz', eventDate: '2026-10-02', eventAttendance: 'optional', kind: 'out', at: Date.UTC(2026, 9, 3, 1, 0) }),
  scan({ eventId: 'spring', eventDate: '2027-03-04', termId: '2027-spring', kind: 'in' }),
  scan({ eventId: 'spring', eventDate: '2027-03-04', termId: '2027-spring', kind: 'out', at: Date.UTC(2027, 2, 5, 1, 0) }),
]);
assert(mixed.ana['2026-fall'].required === 1 && mixed.ana['2026-fall'].optional === 1,
  'required and optional are counted separately');
assert(mixed.ana['2027-spring'].required === 1, 'the spring semester starts a fresh count');
assert(mixed.ana['2026-fall'].required === 1, 'and does not add to the fall one');

// An untracked concert counts toward neither pot.
const untracked = talliesByStudent([
  scan({ eventId: 'x', eventAttendance: null, kind: 'in' }),
  scan({ eventId: 'x', eventAttendance: null, kind: 'out', at: Date.UTC(2026, 8, 1, 1, 0) }),
]);
assert(Object.keys(untracked).length === 0, 'a concert marked neither required nor optional counts for neither');

/* ── The photo cell is never a bearer link ── */

const link = photoLink(both[0], OPTS.publicUrl);
assert(link.includes('/director/checkin?photo='), 'the photo cell links INTO the Hub, where staff sign in');
assert(!link.includes('firebasestorage') && !link.includes('token='),
  'never a storage download token — that would make a photo of a student readable by anyone the spreadsheet reached');
assert(photoLink(scan({ kind: 'in', photoPath: undefined, photoSkipped: true }), OPTS.publicUrl) === 'no photo (fallback)',
  'a record taken under the venue fallback says so rather than looking like a missing file');
assert(photoLink(undefined, OPTS.publicUrl) === '', 'a missing scan has an empty cell');

/* ── A typed name is not a formula ──
 *
 * The college door (#concert-checkin) lets a student type the name that lands
 * in this file's studentName column, and a director opens the result in
 * Excel. Every mainstream spreadsheet evaluates a cell whose text starts with
 * = + - @, and quoting does not stop it — the quotes come off before the
 * formula is read. csvEscape's leading apostrophe does.
 */

const evil = checkinsToCsv([
  scan({ kind: 'in', studentName: '=HYPERLINK("http://x.test","Click")' }),
], OPTS);
assert(!/(^|,)"?=HYPERLINK/.test(evil),
  'a typed name that looks like a formula never reaches a cell as one');
assert(evil.includes("'=HYPERLINK"), 'it is marked as text with the spreadsheet\'s own escape');

for (const lead of ['=', '+', '-', '@']) {
  const row = checkinsToCsv([scan({ kind: 'in', studentName: `${lead}cmd` })], OPTS);
  assert(row.includes(`'${lead}cmd`), `a name starting with ${lead} is neutralised too`);
}

// And the ordinary case is untouched — no stray apostrophes on real names.
const plain = checkinsToCsv([scan({ kind: 'in', studentName: 'Ana Ruiz' })], OPTS);
assert(plain.includes('Ana Ruiz') && !plain.includes("'Ana"), 'an ordinary name is written as it was');
const comma = checkinsToCsv([scan({ kind: 'in', studentName: 'Ruiz, Ana' })], OPTS);
assert(comma.includes('"Ruiz, Ana"'), 'and RFC 4180 quoting still happens');

console.log('checkinCsv.selfcheck: all assertions passed');
