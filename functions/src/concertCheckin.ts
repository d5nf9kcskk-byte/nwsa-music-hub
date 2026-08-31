import type { Firestore } from 'firebase-admin/firestore';
import {
  checkinDocId, checkinState, canCheckOut, canCheckIn, emailProblem, normalizeEmail,
  resolveCheckinSettings, termIdForDate, DEFAULT_CHECKIN_SETTINGS,
  type CheckinKind, type CheckinEventLike, type CheckinSettings, type Term,
} from '../../src/shared/concertCheckin.ts';
import ORG from '../../config/orgs/nwsa.json' with { type: 'json' };

/**
 * Concert check-in / check-out, server side (#concert-checkin).
 *
 * Why a function and not a shape-checked public Firestore write, which is how
 * the Hub's other five student-facing writes work: the TIMESTAMP is the whole
 * value of an attendance record. A client-supplied `at` is a number chosen by
 * the phone of the person being marked present. Everything else here — the
 * window, the domain check, the duplicate refusal — the page also enforces so
 * the student hears it early, but only this file's answer is binding.
 *
 * It also keeps the photograph out of the client's hands: the selfie arrives
 * in the request body and is written to Storage by the Admin SDK, so no
 * public write rule on /checkins exists and no bearer link to a student's
 * photo is ever minted.
 */

export const ALLOWED_ORIGIN = new URL(ORG.publicUrl).origin;

/** The photo a phone sends after downscaling: a JPEG data URL. Bounded well
 *  under the function's request ceiling — a 1280px JPEG is ~200 KB, and
 *  anything above 2 MB is a client that ignored the resize. */
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const DATA_URL_RE = /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/;

export interface CheckinRequest {
  eventId?: unknown;
  studentId?: unknown;
  email?: unknown;
  kind?: unknown;
  photo?: unknown;
}

export type CheckinFailure =
  | 'bad-request' | 'unknown-event' | 'station-off' | 'too-early' | 'too-late'
  | 'unknown-student' | 'bad-email' | 'wrong-domain' | 'already' | 'no-photo'
  | 'bad-photo' | 'too-soon' | 'not-checked-in' | 'arrived-late';

export interface CheckinResult {
  ok: boolean;
  failure?: CheckinFailure;
  /** Plain sentence for the student, chosen server-side so the page cannot
   *  soften a refusal into something that looks like success. */
  message?: string;
  at?: number;
  kind?: CheckinKind;
}

const MESSAGES: Record<CheckinFailure, string> = {
  'bad-request': 'Something was missing. Go back and start again.',
  'unknown-event': 'That concert is not on the calendar.',
  'station-off': 'Check-in is not switched on for this concert.',
  'too-early': 'Check-in is not open yet. Come back closer to the concert.',
  'too-late': 'Check-in for this concert has closed. Find a director.',
  'unknown-student': 'We could not find you on the roster. Find a director.',
  'bad-email': 'That does not look like an email address.',
  'wrong-domain': 'Use your school email address.',
  already: 'You are already recorded for this concert.',
  'no-photo': 'A photo is required. Allow camera access and try again.',
  'bad-photo': 'That photo did not come through. Take it again.',
  'too-soon': 'It is too early to check out. Enjoy the concert.',
  'not-checked-in': 'Check in first — we have no record of you arriving.',
  'arrived-late': 'Check-in for this concert has closed. Find a director so they can record you.',
};

export function fail(failure: CheckinFailure): CheckinResult {
  return { ok: false, failure, message: MESSAGES[failure] };
}

/** Photo payload → bytes. Returns null for anything that is not a plausible
 *  image data URL, so a caller cannot park arbitrary content in the bucket. */
export function decodePhoto(photo: unknown): { bytes: Buffer; contentType: string } | null {
  if (typeof photo !== 'string' || !photo) return null;
  const m = DATA_URL_RE.exec(photo.trim());
  if (!m) return null;
  const bytes = Buffer.from(m[2], 'base64');
  if (bytes.length === 0 || bytes.length > MAX_PHOTO_BYTES) return null;
  const kind = m[1] === 'jpg' ? 'jpeg' : m[1];
  return { bytes, contentType: `image/${kind}` };
}

/** Where a scan's photo lives. Never a public URL — /checkins has no public
 *  read, and a link is resolved for a signed-in director at download time. */
export function photoPath(eventId: string, studentId: string, kind: CheckinKind, at: number): string {
  return `checkins/${eventId}/${studentId}-${kind}-${at}.jpg`;
}

/** Site settings merged over the org defaults. A missing settings doc is the
 *  normal state before anyone opens the settings screen — the org config
 *  alone is a complete answer. */
export async function loadSiteSettings(db: Firestore): Promise<Partial<CheckinSettings>> {
  // Falls back to the ONE default in concertCheckin.ts rather than repeating
  // the number here — the window default has already moved once (an hour to
  // ten minutes) and a second copy is how the server and the page start
  // disagreeing about when the door opens.
  const orgDefaults: Partial<CheckinSettings> = {
    emailDomains: ORG.checkin?.emailDomains ?? [],
    opensMinutesBefore: ORG.checkin?.opensMinutesBefore ?? DEFAULT_CHECKIN_SETTINGS.opensMinutesBefore,
    closesMinutesAfter: ORG.checkin?.closesMinutesAfter ?? DEFAULT_CHECKIN_SETTINGS.closesMinutesAfter,
  };
  try {
    const snap = await db.doc('settings/concertAttendance').get();
    if (!snap.exists) return orgDefaults;
    const d = snap.data() ?? {};
    return {
      ...orgDefaults,
      ...(Array.isArray(d.emailDomains) && d.emailDomains.length ? { emailDomains: d.emailDomains } : {}),
      ...(typeof d.opensMinutesBefore === 'number' ? { opensMinutesBefore: d.opensMinutesBefore } : {}),
      ...(typeof d.closesMinutesAfter === 'number' ? { closesMinutesAfter: d.closesMinutesAfter } : {}),
    };
  } catch {
    return orgDefaults;
  }
}

export const TERMS: Term[] = (ORG.terms ?? []) as Term[];

/**
 * The bucket photos go to, named in the org config rather than left to the
 * Admin SDK's default. FIREBASE_CONFIG still reports `<project>.appspot.com`
 * for projects created before the `.firebasestorage.app` naming, and this
 * project's bucket is the latter — a function writing to a bucket that does
 * not exist would fail mid-concert with a line at the door. Undefined falls
 * back to the default, which is correct for any project where they agree.
 */
export const PHOTO_BUCKET: string | undefined = ORG.checkin?.storageBucket;

/**
 * Validate everything that does not need to touch Storage, in the order a
 * student would hit it. Split out of the handler so the self-check can run
 * the whole decision table without a bucket.
 */
export function validate(
  body: CheckinRequest,
  event: CheckinEventLike | null,
  student: { name?: string; status?: string } | null,
  settings: CheckinSettings,
  timeZone: string,
  existing: { in: boolean; out: boolean },
  now: number,
): CheckinResult {
  const kind = body.kind;
  if (typeof body.eventId !== 'string' || !body.eventId) return fail('bad-request');
  if (typeof body.studentId !== 'string' || !body.studentId) return fail('bad-request');
  if (kind !== 'in' && kind !== 'out') return fail('bad-request');

  if (!event) return fail('unknown-event');

  const state = checkinState(event, settings, timeZone, now);
  if (state === 'off') return fail('station-off');
  if (state === 'early') return fail('too-early');
  if (state === 'closed') return fail('too-late');

  if (!student || (student.status && student.status !== 'Active')) return fail('unknown-student');

  const problem = emailProblem(String(body.email ?? ''), settings.emailDomains);
  if (problem === 'domain') return fail('wrong-domain');
  if (problem) return fail('bad-email');

  // A second tap is a no-op, not an error the student has to solve, but it
  // must never write a second row. The doc id makes it impossible anyway;
  // this is so the page can say something true instead of "permission denied".
  if (existing[kind]) return fail('already');

  if (kind === 'in' && !canCheckIn(event, settings, timeZone, now)) {
    // The late-arrival cutoff. Refused HERE and not only in the page, or
    // arriving on time is a suggestion.
    return fail('arrived-late');
  }

  if (kind === 'out') {
    // Deliberately NOT gated on the arrival cutoff: a student who came late
    // must still be able to check out, or their evening ends with one
    // dangling scan and no credit either way.
    if (!existing.in) return fail('not-checked-in');
    if (!canCheckOut(event, settings, timeZone, now)) return fail('too-soon');
  }

  if (!settings.photoOptional && !body.photo) return fail('no-photo');
  if (body.photo && !decodePhoto(body.photo)) return fail('bad-photo');

  return { ok: true, kind, at: now };
}

/** The record as it is stored. Denormalized on purpose: the cumulative CSV is
 *  a historical document and must keep reading correctly after a concert is
 *  renamed or a student leaves the program. */
export function buildRecord(args: {
  event: CheckinEventLike & { title?: string; date?: string };
  student: { name?: string; grade?: string; instrument?: string };
  body: CheckinRequest;
  kind: CheckinKind;
  at: number;
  photoPath?: string;
  photoSkipped: boolean;
}): Record<string, unknown> {
  const { event, student, body, kind, at } = args;
  const rec: Record<string, unknown> = {
    eventId: String(body.eventId),
    eventTitle: event.title ?? '',
    eventDate: event.date ?? '',
    studentId: String(body.studentId),
    studentName: student.name ?? '',
    email: normalizeEmail(String(body.email ?? '')),
    kind,
    at,
    termId: termIdForDate(event.date ?? '', TERMS),
  };
  if (event.concertAttendance) rec.eventAttendance = event.concertAttendance;
  if (student.grade) rec.grade = student.grade;
  if (student.instrument) rec.instrument = student.instrument;
  if (args.photoPath) rec.photoPath = args.photoPath;
  if (args.photoSkipped) rec.photoSkipped = true;
  return rec;
}

export { checkinDocId, resolveCheckinSettings };
