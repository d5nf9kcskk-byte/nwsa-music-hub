/**
 * Runnable self-check: node --experimental-strip-types src/concertCheckin.selfcheck.ts
 *
 * Runs in deploy-functions.yml BEFORE any credential is written, the same
 * placement as lessonsFeed.selfcheck.ts, because the guards it pins are the
 * ones that decide whether an attendance record means anything:
 *
 *   • the station's window and the school-email rule are enforced HERE, not
 *     only in the page a student could skip;
 *   • a duplicate scan is refused;
 *   • checking out requires having checked in;
 *   • the selfie is required unless a director deliberately turned it off;
 *   • only a real image, of bounded size, ever reaches the bucket;
 *   • a photo object never gets a public link.
 */
import {
  validate, decodePhoto, photoPath, buildRecord, fail, MAX_PHOTO_BYTES,
  resolveCheckinSettings, checkinDocId, PHOTO_BUCKET,
} from './concertCheckin.ts';
import type { CheckinEventLike } from '../../src/shared/concertCheckin.ts';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) { console.error('FAIL:', msg); process.exit(1); }
}

const TZ = 'America/New_York';
const DOMAINS = ['students.dadeschools.net', 'mymdc.net', 'mdc.edu'];

const concert: CheckinEventLike & { title?: string } = {
  id: 'faculty', title: 'Faculty Concert', date: '2026-08-31',
  startTime: '19:00', endTime: '21:00', status: 'Scheduled',
  concertAttendance: 'required', checkin: { enabled: true },
};
const settings = resolveCheckinSettings(concert, { emailDomains: DOMAINS });
const student = { name: 'Ana Ruiz', grade: '11', instrument: 'Violin', status: 'Active' };
const OPEN = Date.UTC(2026, 7, 31, 23, 30);   // 7:30pm Miami, mid-concert
const none = { in: false, out: false };

const req = (over: Record<string, unknown> = {}) => ({
  eventId: 'faculty', studentId: 'stu1', email: 'ana@students.dadeschools.net',
  kind: 'in', photo: 'data:image/jpeg;base64,/9j/4AAQ', ...over,
});

/* ── The happy path ── */
const ok = validate(req(), concert, student, settings, TZ, none, OPEN);
assert(ok.ok && ok.kind === 'in' && ok.at === OPEN, 'a normal check-in passes and is stamped with the SERVER clock');

/* ── Shape ── */
assert(validate(req({ eventId: '' }), concert, student, settings, TZ, none, OPEN).failure === 'bad-request', 'no event id');
assert(validate(req({ studentId: 42 }), concert, student, settings, TZ, none, OPEN).failure === 'bad-request', 'non-string student id');
assert(validate(req({ kind: 'sideways' }), concert, student, settings, TZ, none, OPEN).failure === 'bad-request', 'unknown kind');
assert(validate(req(), null, student, settings, TZ, none, OPEN).failure === 'unknown-event', 'event must exist');

/* ── The window is enforced on the SERVER, not just in the page ── */
const early = Date.UTC(2026, 7, 31, 20, 0);   // 4pm local
const late = Date.UTC(2026, 8, 1, 4, 0);      // 12am local, past the close
assert(validate(req(), concert, student, settings, TZ, none, early).failure === 'too-early', 'too early is refused server-side');
assert(validate(req(), concert, student, settings, TZ, none, late).failure === 'too-late', 'too late is refused server-side');
assert(validate(req(), { ...concert, checkin: { enabled: false } }, student, settings, TZ, none, OPEN).failure === 'station-off',
  'a concert with no station takes no records, even by direct POST');
assert(validate(req(), { ...concert, status: 'Cancelled' }, student, settings, TZ, none, OPEN).failure === 'station-off',
  'a cancelled concert takes no records');

/* ── The roster ── */
assert(validate(req(), concert, null, settings, TZ, none, OPEN).failure === 'unknown-student', 'an invented student id is refused');
assert(validate(req(), concert, { ...student, status: 'Inactive' }, settings, TZ, none, OPEN).failure === 'unknown-student',
  'a student off the active roster is refused');

/* ── The school email, enforced server-side ── */
assert(validate(req({ email: 'ana@gmail.com' }), concert, student, settings, TZ, none, OPEN).failure === 'wrong-domain',
  'a personal address is refused by the server, not only by the form');
assert(validate(req({ email: 'nope' }), concert, student, settings, TZ, none, OPEN).failure === 'bad-email', 'malformed address');
assert(validate(req({ email: 'ana@mymdc.net' }), concert, student, settings, TZ, none, OPEN).ok,
  'a college student checks in at the same door');

/* ── Duplicates and ordering ── */
assert(validate(req(), concert, student, settings, TZ, { in: true, out: false }, OPEN).failure === 'already',
  'a second check-in is refused');
assert(validate(req({ kind: 'out' }), concert, student, settings, TZ, { in: true, out: true }, OPEN).failure === 'already',
  'a second check-out is refused');
assert(validate(req({ kind: 'out' }), concert, student, settings, TZ, none, OPEN).failure === 'not-checked-in',
  'checking out without checking in is refused — the pair is the record');
assert(validate(req({ kind: 'out' }), concert, student, settings, TZ, { in: true, out: false }, OPEN).ok,
  'checking out after checking in works');

/* ── The minimum-stay guard ── */
const guarded = { ...concert, checkin: { enabled: true, minStayMinutes: 45 } };
const gs = resolveCheckinSettings(guarded, { emailDomains: DOMAINS });
assert(validate(req({ kind: 'out' }), guarded, student, gs, TZ, { in: true, out: false }, Date.UTC(2026, 7, 31, 23, 10)).failure === 'too-soon',
  'cannot check out ten minutes into a concert with a stay guard');

/* ── The selfie ── */
assert(validate(req({ photo: undefined }), concert, student, settings, TZ, none, OPEN).failure === 'no-photo',
  'the selfie is REQUIRED by default');
const fallback = { ...concert, checkin: { enabled: true, photoOptional: true } };
const fs = resolveCheckinSettings(fallback, { emailDomains: DOMAINS });
assert(validate(req({ photo: undefined }), fallback, student, fs, TZ, none, OPEN).ok,
  'the venue fallback lets a record through without a photo rather than stranding a student');
assert(validate(req({ photo: 'not a data url' }), concert, student, settings, TZ, none, OPEN).failure === 'bad-photo',
  'junk in the photo field is refused');

/* ── What may reach the bucket ── */
assert(decodePhoto('data:image/jpeg;base64,/9j/4AAQ')?.contentType === 'image/jpeg', 'accepts a JPEG data URL');
assert(decodePhoto('data:image/png;base64,iVBORw0KGgo=')?.contentType === 'image/png', 'accepts a PNG data URL');
assert(decodePhoto('data:image/jpg;base64,/9j/4AAQ')?.contentType === 'image/jpeg', 'jpg is normalized to jpeg');
assert(decodePhoto('data:text/html;base64,PHNjcmlwdD4=') === null, 'refuses a non-image content type');
assert(decodePhoto('data:application/pdf;base64,JVBERi0=') === null, 'refuses a PDF');
assert(decodePhoto('https://example.com/a.jpg') === null, 'refuses a URL — nothing is fetched on the caller behalf');
assert(decodePhoto('') === null, 'refuses empty');
assert(decodePhoto(12345) === null, 'refuses a non-string');
assert(decodePhoto('data:image/jpeg;base64,') === null, 'refuses an empty body');
const huge = 'data:image/jpeg;base64,' + 'A'.repeat(Math.ceil(MAX_PHOTO_BYTES / 3) * 4 + 8);
assert(decodePhoto(huge) === null, 'refuses a photo over the ceiling');

/* ── The stored object is never a public link ── */
const path = photoPath('faculty', 'stu1', 'in', 1756678200000);
assert(path === 'checkins/faculty/stu1-in-1756678200000.jpg', 'photo path shape');
assert(path.startsWith('checkins/'), 'photos live under the one Storage path with no public read');
assert(!path.includes('http') && !path.includes('token'), 'a path is not a URL and carries no download token');

/* ── The record ── */
const rec = buildRecord({
  event: concert, student, body: req() as never, kind: 'in', at: OPEN,
  photoPath: path, photoSkipped: false,
}) as Record<string, unknown>;
assert(rec.at === OPEN, 'the stored time is the server time');
assert(rec.eventTitle === 'Faculty Concert' && rec.eventDate === '2026-08-31',
  'the concert is denormalized so the CSV survives a rename');
assert(rec.termId === '2026-fall', 'the record carries its semester');
assert(rec.eventAttendance === 'required', 'the record carries whether the concert was required');
assert(rec.email === 'ana@students.dadeschools.net', 'the email is normalized');
assert(rec.photoPath === path && rec.photoSkipped === undefined, 'a photographed scan records its path');
const skipped = buildRecord({
  event: concert, student, body: req() as never, kind: 'in', at: OPEN, photoSkipped: true,
}) as Record<string, unknown>;
assert(skipped.photoSkipped === true, 'a scan taken without a photo says so, rather than looking identical');
assert(skipped.photoPath === undefined, 'and claims no photo path');

/* ── The bucket is named, not guessed ── */

assert(PHOTO_BUCKET === 'nwsa-hub.firebasestorage.app',
  'photos go to the bucket the project actually has, not the appspot.com name FIREBASE_CONFIG reports');

/* ── Ids line up with the shared definition ── */
assert(checkinDocId('faculty', 'stu1', 'in') === 'faculty_stu1_in', 're-exported id matches');

/* ── Every refusal says something a student can act on ── */
for (const f of ['too-early', 'wrong-domain', 'already', 'no-photo', 'not-checked-in'] as const) {
  const m = fail(f).message ?? '';
  assert(m !== f && m.includes(' ') && m.trim().endsWith('.'),
    `refusal "${f}" reads as a sentence a student can act on, not a code`);
}

console.log('concertCheckin.selfcheck (functions): all assertions passed');
