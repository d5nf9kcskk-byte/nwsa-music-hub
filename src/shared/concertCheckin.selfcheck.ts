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
  canCheckIn, checkinCutoff,
  resolveCheckinSettings, DEFAULT_CHECKIN_SETTINGS, termIdForDate, driveFolderIdFrom,
  type CheckinEventLike, type Term,
} from './concertCheckin.ts';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
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
assert(settings.opensMinutesBefore === 10, 'the station opens TEN minutes before the downbeat by default');
assert(settings.closesMinutesAfter === 60, 'and stays open an hour after the end');

const win = checkinWindow(concert, settings, TZ)!;
assert(win.opensAt === Date.UTC(2026, 7, 31, 22, 50), 'opens ten minutes before the downbeat');
assert(win.closesAt === Date.UTC(2026, 8, 1, 2, 0), 'closes an hour after the end');

const at = (h: number, m = 0) => Date.UTC(2026, 7, 31, h, m);
assert(checkinState(concert, settings, TZ, at(20)) === 'early', 'closed before the window (4pm local)');
assert(checkinState(concert, settings, TZ, at(22, 30)) === 'early',
  'still closed half an hour out — an hour-wide window invited a check-in from the parking lot');
assert(checkinState(concert, settings, TZ, at(22, 55)) === 'open', 'open five minutes before the downbeat');

// A concert can widen its own door without moving anyone else's.
const early = { ...concert, checkin: { enabled: true, opensMinutesBefore: 90 } };
const es = resolveCheckinSettings(early, { emailDomains: DOMAINS });
assert(checkinWindow(early, es, TZ)!.opensAt === Date.UTC(2026, 7, 31, 21, 30),
  'a concert that sets its own opensMinutesBefore overrides the default');
assert(checkinWindow(concert, settings, TZ)!.opensAt === Date.UTC(2026, 7, 31, 22, 50),
  'and does not move any other concert');
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

/* ── The late-arrival cutoff, and the trap it exists to avoid ── */

// "Open 30 before, stop accepting arrivals 10 after the downbeat."
const strict = {
  ...concert,
  checkin: { enabled: true, opensMinutesBefore: 30, inClosesMinutesAfterStart: 10 },
};
const ss = resolveCheckinSettings(strict, { emailDomains: DOMAINS });

assert(checkinWindow(strict, ss, TZ)!.opensAt === Date.UTC(2026, 7, 31, 22, 30),
  'the door opens half an hour before the downbeat');
assert(checkinCutoff(strict, ss, TZ) === Date.UTC(2026, 7, 31, 23, 10),
  'and stops accepting arrivals ten minutes after it');

assert(canCheckIn(strict, ss, TZ, at(22, 45)), 'a student arriving early can check in');
assert(canCheckIn(strict, ss, TZ, at(23, 5)), 'and one arriving five minutes late still can');
assert(!canCheckIn(strict, ss, TZ, at(23, 20)), 'twenty minutes late is too late to check IN');

// THE POINT. Closing the whole station ten minutes after the downbeat would
// have made checking OUT impossible — and a concert counts only when both
// scans exist, so "arrive on time" would have silently become "nobody gets
// credit for anything". Check-out stays open to the end of the night.
assert(checkinState(strict, ss, TZ, at(23, 20)) === 'open',
  'the STATION is still open after the check-in cutoff');
assert(canCheckOut(strict, ss, TZ, at(23, 20)), 'so a late arrival can still check out');
assert(canCheckOut(strict, ss, TZ, Date.UTC(2026, 8, 1, 1, 30)),
  'and everyone can still check out after the concert ends');
assert(!canCheckIn(strict, ss, TZ, Date.UTC(2026, 8, 1, 1, 30)),
  'while checking in that late is still refused');

// No cutoff configured = the old behaviour, unchanged.
assert(DEFAULT_CHECKIN_SETTINGS.inClosesMinutesAfterStart === null, 'no cutoff by default');
assert(canCheckIn(concert, settings, TZ, Date.UTC(2026, 8, 1, 1, 30)),
  'without a cutoff you can check in any time the station is open');
assert(checkinCutoff(concert, settings, TZ) === null, 'and there is no cutoff moment to show');

/* ── A cleared field is a written null, not undefined ── */

// Firestore ignores undefined on write, so "not tracked any more" has to be a
// value. Every read treats null as absent.
const cleared = resolveCheckinSettings(
  { checkin: { enabled: true, minStayMinutes: null, opensMinutesBefore: null } },
  { emailDomains: DOMAINS, minStayMinutes: 30, opensMinutesBefore: 90 },
);
assert(cleared.minStayMinutes === 30, 'a null on the event falls back to the site default, it does not crash');
assert(cleared.opensMinutesBefore === 90, 'same for the open window');
const untracked: CheckinEventLike = { ...concert, concertAttendance: null };
assert(!untracked.concertAttendance, 'a concert set back to "not tracked" reads as untracked');

/* ── The venue fallback ── */

assert(DEFAULT_CHECKIN_SETTINGS.photoOptional === false, 'the selfie is required by default');
assert(resolveCheckinSettings({ checkin: { enabled: true, photoOptional: true } }).photoOptional === true,
  'a director can drop the selfie requirement for one concert from their phone');

// 5. The Drive folder id survives however a director pasted it — the first
//    real sync run failed on this, and Drive's 404 for a bad id is the same
//    404 it gives for a folder that was never shared.
const DRIVE_ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz';
assert(driveFolderIdFrom(DRIVE_ID) === DRIVE_ID, 'bare id');
assert(driveFolderIdFrom(`  ${DRIVE_ID}  `) === DRIVE_ID, 'trims');
assert(driveFolderIdFrom(`https://drive.google.com/drive/folders/${DRIVE_ID}`) === DRIVE_ID,
  'folder URL');
assert(driveFolderIdFrom(`https://drive.google.com/drive/u/0/folders/${DRIVE_ID}?usp=sharing`) === DRIVE_ID,
  'folder URL with account prefix and share query');
assert(driveFolderIdFrom(`https://drive.google.com/open?id=${DRIVE_ID}`) === DRIVE_ID, 'open?id= URL');
assert(driveFolderIdFrom('') === '', 'blank stays blank');
assert(driveFolderIdFrom(undefined) === '', 'missing stays blank');
assert(driveFolderIdFrom('Concert Attendance') === '', 'a folder NAME is not an id');
assert(driveFolderIdFrom('paste here') === '', 'prose is not an id');

console.log('concertCheckin.selfcheck: all assertions passed');
