import { timingSafeEqual } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { icsAppointment, icsCalendar } from '../../src/shared/ics.ts';
import { appointmentsForForms, formatClock24 } from '../../src/shared/signupAppointments.ts';
import ORG from '../../config/orgs/nwsa.json' with { type: 'json' };
import type { SignupForm, SignupResponse, SignupSlotBooking } from '../../src/director/types.ts';

/** 128 bits of hex, exactly as useAppointmentsFeed.newToken() issues it. */
export const TOKEN_RE = /^[0-9a-f]{32}$/;

/** The doc holding one director's feed token. Also the shape firestore.rules
 *  pins, so a director can read only their own. */
export function tokenDocId(email: string): string {
  return `appointments__${email}`;
}

/**
 * A director's sign-in email, as it may appear in this feed's URL path.
 *
 * Lowercased because `directors/{email}` doc ids are lowercased, and a
 * calendar app will happily echo back whatever case the director pasted.
 * Anything that is not plausibly an email is refused before it can become a
 * Firestore document path — a path segment containing `/` would otherwise
 * address a different collection entirely.
 */
export const EMAIL_RE = /^[^\s/@]+@[^\s/@]+\.[^\s/@]+$/;

export function normalizeEmail(raw: string): string | null {
  const email = decodeURIComponent(raw || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) return null;
  return email;
}

/** Constant-time compare, so a wrong token cannot be narrowed by timing. */
export function tokenMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  // timingSafeEqual throws on a length mismatch, which would itself leak the
  // expected length — compare lengths first and still run the comparison.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Split `/<email>/<token>.ics` (either part percent-encoded) into its pieces.
 *
 * The email rides in the PATH rather than being looked up from the token so
 * that the token check stays a direct document `get()` plus a constant-time
 * compare — identical to the lessons feed. Resolving a director by querying
 * `where('token', '==', …)` would make the secret itself the lookup key, and
 * a query is not a comparison anyone can reason about the timing of.
 *
 * Nothing is leaked by the email being in the URL: it is the subscriber's own
 * address, and the whole URL is already the secret.
 */
export function parseFeedPath(path: string): { email: string; token: string } | null {
  const parts = (path || '').split('/').filter(Boolean);
  if (parts.length !== 2) return null;
  const email = normalizeEmail(parts[0]);
  const token = decodeURIComponent(parts[1]).replace(/\.ics$/i, '');
  if (!email || !TOKEN_RE.test(token)) return null;
  return { email, token };
}

export const ALLOWED_ORIGIN = new URL(ORG.publicUrl).origin;

const BRANDING = {
  prodId: ORG.ics.prodId,
  uidDomain: ORG.ics.uidDomain,
  timezone: ORG.timezone,
  namePrefix: ORG.ics.namePrefix,
};

/** How much of the schedule a calendar carries. Bounded on both sides so one
 *  request can never walk the whole collection as it grows year on year. */
const DAYS_BACK = 60;
const DAYS_AHEAD = 400;

/** Firestore refuses an `in` filter with more than 30 values, and a director
 *  accumulates more than 30 sign-ups across a few seasons. Silently dropping
 *  the 31st would be the worst kind of bug in a calendar nobody is watching. */
const IN_CHUNK = 30;

export function chunk<T>(list: T[], size = IN_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export function isoOffset(days: number, now: Date = new Date()): string {
  const d = new Date(now.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Inside the window this feed carries. */
export function withinWindow(date: string, from: string, to: string): boolean {
  return date >= from && date <= to;
}

/**
 * The calendar body, read at request time.
 *
 * Reads the staff-only `signupResponses` — that is the point of the endpoint,
 * and the reason it cannot be a file in the Pages artifact. Everything shown
 * is derived through `appointmentsForForms()`, the same function the director's
 * own Schedule screen uses, so the subscribed calendar and the screen that
 * offered it can never disagree.
 */
export async function buildAppointmentsIcs(db: Firestore, email: string): Promise<string> {
  const ownerSnap = await db.collection('signupOwners').where('email', '==', email).get();
  const formIds = ownerSnap.docs.map(d => d.id);

  if (formIds.length === 0) {
    return icsCalendar(
      `${ORG.ics.namePrefix} · My appointments`,
      'Time slots students booked on your sign-ups.',
      [],
      BRANDING,
    );
  }

  const idChunks = chunk(formIds);
  const [formGroups, bookingGroups, responseGroups] = await Promise.all([
    Promise.all(idChunks.map(ids =>
      db.collection('signupForms').where('__name__', 'in', ids).get())),
    Promise.all(idChunks.map(ids =>
      db.collection('signupSlotBookings').where('formId', 'in', ids).get())),
    Promise.all(idChunks.map(ids =>
      db.collection('signupResponses').where('formId', 'in', ids).get())),
  ]);

  const forms = formGroups.flatMap(snap =>
    snap.docs.map(d => ({ id: d.id, ...(d.data() as object) } as SignupForm)));
  const bookings = bookingGroups.flatMap(snap =>
    snap.docs.map(d => ({ id: d.id, ...(d.data() as object) } as SignupSlotBooking)));
  const responses = responseGroups.flatMap(snap =>
    snap.docs.map(d => ({ id: d.id, ...(d.data() as object) } as SignupResponse)));

  const from = isoOffset(-DAYS_BACK);
  const to = isoOffset(DAYS_AHEAD);

  const vevents = appointmentsForForms(forms, bookings, responses)
    .filter(a => withinWindow(a.date, from, to))
    .map(a => icsAppointment({
      id: a.id,
      formTitle: a.formTitle,
      date: a.date,
      startTime: formatClock24(a.startMin),
      endTime: formatClock24(a.endMin),
      studentName: a.studentName,
      grade: a.grade,
      instrument: a.instrument,
      email: a.email,
      phone: a.phone,
      answers: a.answers,
      complete: a.complete,
    }, BRANDING));

  return icsCalendar(
    `${ORG.ics.namePrefix} · My appointments`,
    'Time slots students booked on your sign-ups. Staff only.',
    vevents,
    BRANDING,
  );
}
