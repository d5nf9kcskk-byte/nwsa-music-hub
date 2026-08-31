/**
 * Runnable: node --experimental-strip-types src/concertTally.selfcheck.ts
 *
 * Pins the student-facing count (#concert-checkin). Two promises:
 *
 *   1. The student's number and the DIRECTOR's number agree — a concert
 *      counts only when both scans exist and the concert was marked. If these
 *      two ever disagree the feature is worse than not having it.
 *   2. The endpoint cannot be used to read someone else's attendance: a wrong
 *      email is refused, and a wrong email is indistinguishable from a student
 *      with nothing on file.
 */
import { tallyScans, emailMatchesScans, NO_MATCH, type ScanLike } from './concertTally.ts';
import type { Term } from '../../src/shared/concertCheckin.ts';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) { console.error('FAIL:', msg); process.exit(1); }
}

const TERMS: Term[] = [
  { id: '2026-fall', name: 'Fall 2026', start: '2026-08-17', end: '2026-12-19' },
  { id: '2027-spring', name: 'Spring 2027', start: '2027-01-06', end: '2027-06-03' },
];

const scan = (o: Partial<ScanLike>): ScanLike => ({
  eventId: 'faculty', eventTitle: 'Faculty Concert', eventDate: '2026-08-31',
  eventAttendance: 'required', email: 'ana@students.dadeschools.net',
  kind: 'in', termId: '2026-fall', ...o,
});

/* ── 1. Counting matches the director's CSV ── */

const complete = [scan({ kind: 'in' }), scan({ kind: 'out' })];
let t = tallyScans(complete, TERMS);
assert(t.terms.find(r => r.termId === '2026-fall')?.required === 1, 'a completed required concert counts');
assert(t.incomplete.length === 0, 'and is not listed as incomplete');

t = tallyScans([scan({ kind: 'in' })], TERMS);
assert(t.terms.every(r => r.required === 0), 'checking in and leaving counts for NOTHING');
assert(t.incomplete.length === 1 && t.incomplete[0].eventTitle === 'Faculty Concert',
  'but the student is TOLD it did not count, rather than just seeing a lower number');

t = tallyScans([
  scan({ kind: 'in' }), scan({ kind: 'out' }),
  scan({ eventId: 'jazz', eventDate: '2026-10-02', eventAttendance: 'optional', kind: 'in' }),
  scan({ eventId: 'jazz', eventDate: '2026-10-02', eventAttendance: 'optional', kind: 'out' }),
  scan({ eventId: 'spring', eventDate: '2027-03-04', termId: '2027-spring', kind: 'in' }),
  scan({ eventId: 'spring', eventDate: '2027-03-04', termId: '2027-spring', kind: 'out' }),
], TERMS, { '2026-fall': { required: 3, optional: 2 } });

const fall = t.terms.find(r => r.termId === '2026-fall')!;
const spring = t.terms.find(r => r.termId === '2027-spring')!;
assert(fall.required === 1 && fall.optional === 1, 'required and optional are separate pots');
assert(fall.requiredGoal === 3 && fall.optionalGoal === 2, 'the semester goal comes through for "1 of 3"');
assert(spring.required === 1, 'spring is a FRESH count');
assert(spring.requiredGoal === undefined, 'a term with no goal set simply has none');

// A term at zero is still reported — "0 of 3" in September is the number that
// matters most.
t = tallyScans([], TERMS, { '2026-fall': { required: 3 } });
assert(t.terms.length === 2 && t.terms[0].required === 0, 'every configured term reports, including at zero');

// An untracked concert counts toward neither pot and is not "incomplete".
t = tallyScans([
  scan({ eventId: 'x', eventAttendance: null, kind: 'in' }),
  scan({ eventId: 'x', eventAttendance: null, kind: 'out' }),
], TERMS);
assert(t.terms.every(r => r.required === 0 && r.optional === 0), 'an untracked concert counts for neither');
assert(t.incomplete.length === 0, 'and is not flagged as an unfinished pair');

// A concert outside every configured term still shows rather than vanishing.
t = tallyScans([
  scan({ eventId: 'summer', eventDate: '2026-07-04', termId: '', kind: 'in' }),
  scan({ eventId: 'summer', eventDate: '2026-07-04', termId: '', kind: 'out' }),
], TERMS);
assert(t.terms.every(r => r.required === 0), 'a concert in no term does not land in a real semester');

/* ── 2. It cannot be used to read someone else's attendance ── */

assert(emailMatchesScans('ana@students.dadeschools.net', complete), 'the student sees their own count');
assert(emailMatchesScans('  ANA@Students.DadeSchools.NET ', complete), 'case and spacing forgiven');
assert(!emailMatchesScans('someone.else@students.dadeschools.net', complete),
  'a classmate guessing the name but not the address gets nothing');
assert(!emailMatchesScans('', complete), 'an empty address never matches');
assert(!emailMatchesScans('ana@students.dadeschools.net', []),
  'a student with no records on file cannot be confirmed either');
assert(NO_MATCH === NO_MATCH && !/no records|not found|never/i.test(NO_MATCH),
  'the one refusal does not reveal WHICH check failed');

console.log('concertTally.selfcheck: all assertions passed');
