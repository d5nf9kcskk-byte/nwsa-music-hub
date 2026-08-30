/**
 * Runnable self-check: node --experimental-strip-types src/shared/concertCheckin.selfcheck.ts
 *
 * Pins the promises of the concert check-in station (#concert-checkin). Four
 * of them decide whether a real concert night works, so they get a test
 * rather than a comment:
 *
 *   1. A record id is deterministic and round-trips — duplicate scans are
 *      impossible at the database, not just in the UI.
 *   2. Domain matching is on the whole domain, never a substring, and an
 *      empty allowlist is an explicit choice rather than an accidental hole.
 *   3. The open window is computed in SCHOOL-LOCAL time. A UTC server must
 *      not decide a 7pm Miami concert opens at 2pm.
 *   4. A cancelled concert never collects attendance.
 */
import {
  checkinDocId, parseCheckinDocId, emailProblem, emailAccepted, domainsLabel,
  normalizeEmail, zonedEpoch, checkinWindow, checkinState, canCheckOut,
  resolveCheckinSettings, DEFAULT_CHECKIN_SETTINGS, termIdForDate,
  type CheckinEventLike, type Term,
} from './concertCheckin.ts';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) { console.error('FAIL:', msg); process.exit(1); }
}

const TZ = 'America/New_York';

/* ── 1. Record identity ── */

assert(checkinDocId('evt1', 'stu1', 'in') === 'evt1_stu1_in', 'id shape');
assert(checkinDocId('evt1', 'stu1', 'in') === checkinDocId('evt1', 'stu1', 'in'),
  'the same scan always writes the same id — this is the duplicate guard');
assert(checkinDocId('evt1', 'stu1', 'in') !== checkinDocId('evt1', 'stu1', 'out'),
  'in and out are different records');

const round = parseCheckinDocId(checkinDocId('faculty-concert', 'aB3xY', 'out'));
assert(round?.eventId === 'faculty-concert', 'round-trips event id');
assert(round?.studentId === 'aB3xY', 'round-trips student id');
assert(round?.kind === 'out', 'round-trips kind');
// Event ids with underscores are real (seeded ids like 'masterclass-1_fall').
const under = parseCheckinDocId(checkinDocId('mc_1_fall', 'stu9', 'in'));
assert(under?.eventId === 'mc_1_fall' && under?.studentId === 'stu9', 'event id may contain underscores');
assert(parseCheckinDocId('garbage') === null, 'rejects a non-id');
assert(parseCheckinDocId('evt_stu_sideways') === null, 'rejects an unknown kind');
assert(parseCheckinDocId('_in') === null, 'rejects an empty event id');

/* ── 2. School email ── */

const DOMAINS = ['students.dadeschools.net', 'mymdc.net', 'mdc.edu'];

assert(emailAccepted('Ana.Ruiz@Students.DadeSchools.NET', DOMAINS), 'case and spacing forgiven');
assert(normalizeEmail('  A@B.C  ') === 'a@b.c', 'normalizes');
assert(emailAccepted('someone@mymdc.net', DOMAINS), 'college domain accepted');
assert(emailAccepted('someone@mdc.edu', DOMAINS), 'faculty/college domain accepted');
assert(emailAccepted('someone@sub.mdc.edu', DOMAINS), 'a subdomain of an allowed domain is allowed');

assert(emailProblem('', DOMAINS) === 'empty', 'empty reported as empty');
assert(emailProblem('nope', DOMAINS) === 'malformed', 'no @ is malformed');
assert(emailProblem('a@b', DOMAINS) === 'malformed', 'no dot in domain is malformed');
assert(emailProblem('a b@mdc.edu', DOMAINS) === 'malformed', 'inner space is malformed');
assert(emailProblem('someone@gmail.com', DOMAINS) === 'domain', 'a personal address is a domain problem');

// The substring traps. Both of these END in an allowed string somewhere and
// must still be refused.
assert(!emailAccepted('someone@notstudents.dadeschools.net', DOMAINS),
  'a domain merely ENDING in the allowed one is refused');
assert(!emailAccepted('someone@students.dadeschools.net.evil.com', DOMAINS),
  'a domain with the allowed one as a PREFIX is refused');
assert(!emailAccepted('students.dadeschools.net@gmail.com', DOMAINS),
  'the allowed domain in the local part is refused');

// An empty allowlist is the deliberate "accept anything well-formed" posture.
assert(emailAccepted('someone@gmail.com', []), 'no allowlist accepts any well-formed address');
assert(!emailAccepted('nope', []), 'no allowlist still rejects malformed');

assert(domainsLabel(['students.dadeschools.net']) === '@students.dadeschools.net', 'one domain reads plainly');
assert(domainsLabel(DOMAINS) === '@students.dadeschools.net, @mymdc.net or @mdc.edu', 'list reads as a sentence');

/* ── 3. The window, in school-local time ── */

// 2026-08-31 19:00 in Miami is 23:00 UTC (EDT, UTC-4).
assert(zonedEpoch('2026-08-31', '19:00', TZ) === Date.UTC(2026, 7, 31, 23, 0),
  'a 7pm Miami downbeat is 23:00 UTC in summer');
// January is EST (UTC-5).
assert(zonedEpoch('2027-01-15', '19:00', TZ) === Date.UTC(2027, 0, 16, 0, 0),
  'the same wall clock in winter is an hour later in UTC — DST is handled');

const concert: CheckinEventLike = {
  id: 'faculty', date: '2026-08-31', startTime: '19:00', endTime: '21:00',
  status: 'Scheduled', concertAttendance: 'required', checkin: { enabled: true },
};
const settings = resolveCheckinSettings(concert, { emailDomains: DOMAINS });
assert(settings.opensMinutesBefore === 60 && settings.closesMinutesAfter === 60, 'site defaults apply');

const win = checkinWindow(concert, settings, TZ)!;
assert(win.opensAt === Date.UTC(2026, 7, 31, 22, 0), 'opens an hour before the downbeat');
assert(win.closesAt === Date.UTC(2026, 8, 1, 2, 0), 'closes an hour after the end');

const at = (h: number, m = 0) => Date.UTC(2026, 7, 31, h, m);
assert(checkinState(concert, settings, TZ, at(20)) === 'early', 'closed before the window (4pm local)');
assert(checkinState(concert, settings, TZ, at(22, 30)) === 'open', 'open at 6:30pm local');
assert(checkinState(concert, settings, TZ, at(23, 5)) === 'open', 'open just after the downbeat');
assert(checkinState(concert, settings, TZ, Date.UTC(2026, 8, 1, 3)) === 'closed', 'closed an hour after the end');

// An event with no station is off no matter the clock.
assert(checkinState({ ...concert, checkin: { enabled: false } }, settings, TZ, at(22, 30)) === 'off',
  'no station, no check-in');
assert(checkinState({ ...concert, checkin: undefined }, settings, TZ, at(22, 30)) === 'off',
  'an event predating this feature has no station');

/* ── 4. A cancelled concert collects nothing ── */

assert(checkinState({ ...concert, status: 'Cancelled' }, settings, TZ, at(22, 30)) === 'off',
  'a cancelled concert never collects attendance, whatever its switches say');

/* ── The minimum-stay guard ── */

const guarded = { ...concert, checkin: { enabled: true, minStayMinutes: 45 } };
const gs = resolveCheckinSettings(guarded, { emailDomains: DOMAINS });
assert(checkinState(guarded, gs, TZ, at(23, 10)) === 'open', 'check-IN is unaffected by the stay guard');
assert(!canCheckOut(guarded, gs, TZ, at(23, 10)), 'cannot check out ten minutes in');
assert(canCheckOut(guarded, gs, TZ, at(23, 50)), 'can check out after the stay guard');
assert(canCheckOut(concert, settings, TZ, at(23, 10)), 'no guard set means check out whenever');

/* ── Semesters ── */

const TERMS: Term[] = [
  { id: '2026-fall', name: 'Fall 2026', start: '2026-08-17', end: '2026-12-19' },
  { id: '2027-spring', name: 'Spring 2027', start: '2027-01-06', end: '2027-06-03' },
];
assert(termIdForDate('2026-08-31', TERMS) === '2026-fall', 'the faculty concert lands in Fall 2026');
assert(termIdForDate('2026-12-19', TERMS) === '2026-fall', 'the last day of a term is in it');
assert(termIdForDate('2027-02-01', TERMS) === '2027-spring', 'spring is its own count');
assert(termIdForDate('2026-07-04', TERMS) === '', 'summer belongs to no term');

/* ── The venue fallback ── */

assert(DEFAULT_CHECKIN_SETTINGS.photoOptional === false, 'the selfie is required by default');
assert(resolveCheckinSettings({ checkin: { enabled: true, photoOptional: true } }).photoOptional === true,
  'a director can drop the selfie requirement for one concert from their phone');

console.log('concertCheckin.selfcheck: all assertions passed');
