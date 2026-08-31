#!/usr/bin/env node
/**
 * Runnable: node scripts/drive-photo-names.selfcheck.mjs
 *
 * Pins the concert-photo Drive sync's naming and escaping (#concert-checkin).
 * Small surface, but two of these are the kind of bug that only appears at a
 * real concert: an apostrophe in a title, and a re-run re-uploading everything.
 */
import {
  escapeDriveQuery, concertFolderName, photoFileName, needsFiling,
} from './lib/drivePhotoNames.mjs';
// Imported the way the CRON does — plain node, no tsx. This import is itself
// the assertion: node's type-stripping loader cannot resolve an extensionless
// relative import, so a bare '../../shared/concertCheckin' inside checkinCsv.ts
// passes tsc, passes vite, passes the tsx self-check, and then fails this
// workflow on its first real run. That is exactly what happened while this
// was being written.
import { checkinsToCsv } from '../src/director/checkin/checkinCsv.ts';

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exit(1); }
}

/* ── Drive query escaping ── */

assert(escapeDriveQuery('Fall Concert') === 'Fall Concert', 'ordinary names pass through');
assert(escapeDriveQuery("Director's Showcase") === "Director\\'s Showcase",
  "an apostrophe is escaped — it would otherwise END the quoted query string and change the query");
assert(escapeDriveQuery('back\\slash') === 'back\\\\slash', 'a backslash is escaped');
assert(escapeDriveQuery("a\\'b") === "a\\\\\\'b",
  'backslash is escaped FIRST, so the quote escape cannot itself be escaped away');
assert(escapeDriveQuery(123) === '123', 'a non-string does not throw');

/* ── Folder names ── */

const rec = { eventDate: '2026-08-31', eventTitle: 'Faculty Recital', studentName: 'Ana Ruiz', kind: 'in' };
assert(concertFolderName(rec) === '2026-08-31 Faculty Recital', 'date first, then the concert');
assert(concertFolderName({ eventDate: '2026-09-01', eventTitle: 'Jazz/Combo Night' })
  === '2026-09-01 Jazz-Combo Night', 'a slash cannot create a nested folder');
assert(concertFolderName({ eventTitle: 'Untitled' }).startsWith('undated '),
  'a record with no date still files somewhere findable');
assert(concertFolderName({ eventDate: '2026-08-31' }) === '2026-08-31 Concert',
  'a concert with no title still gets a folder');
assert(concertFolderName({ eventDate: '2026-08-31', eventTitle: 'x'.repeat(300) }).length <= 120,
  'a runaway title is bounded');

// Chronological sort falls out of the name, which is the point of date-first.
const names = [
  concertFolderName({ eventDate: '2027-01-15', eventTitle: 'Winter' }),
  concertFolderName({ eventDate: '2026-08-31', eventTitle: 'Faculty' }),
  concertFolderName({ eventDate: '2026-12-05', eventTitle: 'Holiday' }),
].sort();
assert(names[0].startsWith('2026-08-31') && names[2].startsWith('2027-01-15'),
  'sorting by name sorts by date');

/* ── Photo file names ── */

assert(photoFileName(rec) === 'Ana Ruiz — check-in.jpg', 'who, and which scan');
assert(photoFileName({ ...rec, kind: 'out' }) === 'Ana Ruiz — check-out.jpg', 'check-out is distinguishable');
assert(photoFileName({ studentId: 'abc123', kind: 'in' }) === 'abc123 — check-in.jpg',
  'a record with no name falls back to the id rather than an empty file name');
assert(photoFileName({ studentName: 'A/B', kind: 'in' }) === 'A-B — check-in.jpg', 'no slashes in a file name');

/* ── What gets filed ── */

assert(needsFiling({ photoPath: 'checkins/a/b.jpg' }), 'an unfiled photo is filed');
assert(!needsFiling({ photoPath: 'checkins/a/b.jpg', photoDriveId: 'xyz' }),
  'an already-filed photo is NOT re-uploaded — this is what makes a re-run free');
assert(!needsFiling({ photoSkipped: true }), 'a record taken under the venue fallback has nothing to file');
assert(!needsFiling({}), 'a record with no photo is skipped');

/* ── The CSV builder is reachable from plain node ── */

const OPTS = {
  terms: [{ id: '2026-fall', name: 'Fall 2026', start: '2026-08-17', end: '2026-12-19' }],
  timeZone: 'America/New_York',
  publicUrl: 'https://example.test/hub/',
};
const pair = [
  { id: 'e_s_in', eventId: 'e', eventTitle: "Director's Showcase", eventDate: '2026-08-31',
    eventAttendance: 'required', studentId: 's', studentName: 'Ana Ruiz',
    email: 'a@students.dadeschools.net', kind: 'in', at: Date.UTC(2026, 7, 31, 23, 0),
    termId: '2026-fall', photoPath: 'checkins/e/s-in-1.jpg' },
  { id: 'e_s_out', eventId: 'e', eventTitle: "Director's Showcase", eventDate: '2026-08-31',
    eventAttendance: 'required', studentId: 's', studentName: 'Ana Ruiz',
    email: 'a@students.dadeschools.net', kind: 'out', at: Date.UTC(2026, 8, 1, 1, 0),
    termId: '2026-fall', photoDriveLink: 'https://drive.google.com/file/d/xyz/view' },
];
const csv = checkinsToCsv(pair, OPTS);
const lines = csv.split('\r\n');
assert(lines.length === 2, 'the file the cron writes is a header plus one row per student per concert');
// An apostrophe needs no CSV quoting (RFC 4180 quotes on comma, quote,
// newline) — it is the DRIVE QUERY that an apostrophe breaks, which is what
// escapeDriveQuery above is for. The title must survive intact either way.
assert(lines[1].startsWith("Director's Showcase,"), 'the concert title survives into the row unchanged');
assert(checkinsToCsv([{ ...pair[0], eventTitle: 'Winter, Part 2' }], OPTS).includes('"Winter, Part 2"'),
  'a title containing a comma IS quoted, or the columns would shift');
assert(csv.includes('19:00') && csv.includes('21:00'),
  'times print in the SCHOOL timezone, not the runner\'s UTC');
assert(csv.includes('https://drive.google.com/file/d/xyz/view'), 'the Drive column carries the filed link');
assert(csv.includes(',120,'), 'minutes present is computed');

console.log('drive-photo-names.selfcheck: all assertions passed');
