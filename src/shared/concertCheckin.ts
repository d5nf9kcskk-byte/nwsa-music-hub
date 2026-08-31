/**
 * Concert check-in / check-out (#concert-checkin) — the ONE definition.
 *
 * Explicit `.ts` extensions on the imports here and in anything this file
 * pulls in: Node's type-stripping loader runs it directly, both for the
 * self-check and inside the Cloud Function bundle, and it cannot resolve
 * extensionless relative imports (the note in instrumentFamily.ts).
 *
 * Deliberately PURE and config-injected — no ORG import, no Firestore, no
 * DOM. The public check-in page, the director's live board, the CSV export,
 * and the Cloud Function that actually writes the record all decide "is this
 * open?", "is this email acceptable?", and "which record id is this?" by
 * calling the same functions here. The function is the only one whose answer
 * is binding; the others are the UI telling the student the truth early.
 */

/** A scan is either arriving or leaving. There is no third kind. */
export const CHECKIN_KINDS = ['in', 'out'] as const;
export type CheckinKind = (typeof CHECKIN_KINDS)[number];

/** Whether a concert counts toward a student's obligation, and which pot.
 *  Absent on an event means "not tracked" — every concert that existed
 *  before this feature keeps its old meaning with no migration. */
export type ConcertAttendance = 'required' | 'optional';

export interface CheckinSettings {
  /** Domains a student email may end in, without the '@'. Lowercase. */
  emailDomains: string[];
  /**
   * Domains that may use the COLLEGE DOOR — the path for a student who is not
   * on the roster yet and types their own name (#concert-checkin).
   *
   * Deliberately its own list, and deliberately NOT `emailDomains`. The
   * roster search is the anchor that makes a check-in mean something: you
   * have to be a person the school already knows. If the college door
   * accepted every accepted domain, any high school student could take it
   * with their own school address, type any name they liked, and the anchor
   * would be gone for everybody.
   *
   * EMPTY MEANS THE DOOR IS SHUT. Unlike `emailDomains`, where an empty list
   * is the deliberate "accept any well-formed address" posture, an org that
   * has not named its college domains has no college door at all — the one
   * place in this file where empty fails closed rather than open, because
   * here the list is the whole of the check.
   */
  guestEmailDomains: string[];
  /** Minutes before the downbeat that the station opens. */
  opensMinutesBefore: number;
  /** Minutes after the END time that the station closes — both scans. */
  closesMinutesAfter: number;
  /**
   * Late-arrival cutoff for the CHECK-IN scan only, measured from the START
   * time. Null (the default) means no cutoff: you can check in any time the
   * station is open.
   *
   * Deliberately its own field rather than a smaller `closesMinutesAfter`.
   * Closing the whole station shortly after the downbeat would make CHECKING
   * OUT impossible, and a concert counts only when both scans exist — so
   * "arrive on time or it doesn't count" would silently become "nobody gets
   * credit for anything". Check-out stays open until the station closes.
   */
  inClosesMinutesAfterStart: number | null;
  /** Optional guard: check-out refuses until this many minutes after the
   *  start time. 0 (the default) means check out whenever. */
  minStayMinutes: number;
  /** When false the selfie is required; when true the station accepts a
   *  record without one. The venue fallback — a director flips this from
   *  their phone when the cameras or the network misbehave, and gets the
   *  attendance record rather than a student stuck at the door. */
  photoOptional: boolean;
}

/**
 * The station opens TEN minutes before the downbeat by default (director's
 * call, Aug 2026), not an hour: check-in is something you do as you walk in
 * and find your seat, and an hour-wide window invites a student to check in
 * from the parking lot and leave. A concert can widen it — see
 * `opensMinutesBefore` on the event — but this is the number every concert
 * gets unless someone says otherwise.
 *
 * The closing side stays generous on purpose: the cost of closing too early
 * is a student who was genuinely there getting no credit.
 */
export const DEFAULT_CHECKIN_SETTINGS: CheckinSettings = {
  emailDomains: [],
  guestEmailDomains: [],
  opensMinutesBefore: 10,
  closesMinutesAfter: 60,
  inClosesMinutesAfterStart: null,
  minStayMinutes: 0,
  photoOptional: false,
};

/** The check-in fields carried on a CalendarEvent. All optional: an event
 *  with no `checkin` block has no station, which is every existing event. */
/**
 * `null` rather than `undefined` for a cleared field, throughout. Firestore is
 * configured with ignoreUndefinedProperties, so writing `undefined` does not
 * clear a stored value — it silently leaves the old one in place. A director
 * setting a concert back to "not tracked" has to actually clear it, so the
 * cleared state is a written null and every read here treats null as absent.
 */
export interface EventCheckinConfig {
  enabled?: boolean;
  opensMinutesBefore?: number | null;
  closesMinutesAfter?: number | null;
  inClosesMinutesAfterStart?: number | null;
  minStayMinutes?: number | null;
  photoOptional?: boolean;
}

/** Minimal event shape — the app's CalendarEvent and the function's raw
 *  Firestore doc both satisfy it. */
export interface CheckinEventLike {
  id?: string;
  date?: string;          // YYYY-MM-DD
  startTime?: string;     // HH:MM, 24h, school-local
  endTime?: string;       // HH:MM, 24h, school-local
  status?: string;
  concertAttendance?: ConcertAttendance | null;
  checkin?: EventCheckinConfig;
}

/**
 * The patch that switches a concert's check-in station on. The ONE shape —
 * the event editor, the director's Concert Check-In setup list, and the
 * announcement link picker all write exactly this, merged over whatever
 * `checkin` already held (window overrides, photoOptional), so flipping the
 * switch from any of the three never clobbers settings set from another.
 */
export function enableCheckinPatch(event: Pick<CheckinEventLike, 'checkin'>): { checkin: EventCheckinConfig } {
  return { checkin: { ...(event.checkin ?? {}), enabled: true } };
}

/** Per-event settings resolved against the org/site defaults. The event wins
 *  field by field, so changing a site default moves every concert that never
 *  overrode it. */
export function resolveCheckinSettings(
  event: CheckinEventLike,
  site: Partial<CheckinSettings> = {},
): CheckinSettings {
  const base = { ...DEFAULT_CHECKIN_SETTINGS, ...site };
  const ev = event.checkin ?? {};
  return {
    emailDomains: base.emailDomains.map(d => d.trim().toLowerCase()).filter(Boolean),
    guestEmailDomains: (base.guestEmailDomains ?? []).map(d => d.trim().toLowerCase().replace(/^@/, '')).filter(Boolean),
    opensMinutesBefore: ev.opensMinutesBefore ?? base.opensMinutesBefore,
    closesMinutesAfter: ev.closesMinutesAfter ?? base.closesMinutesAfter,
    inClosesMinutesAfterStart:
      ev.inClosesMinutesAfterStart ?? base.inClosesMinutesAfterStart ?? null,
    minStayMinutes: ev.minStayMinutes ?? base.minStayMinutes,
    photoOptional: ev.photoOptional ?? base.photoOptional,
  };
}

/* ────────────────────────── record identity ────────────────────────── */

/**
 * The record id for one scan. Deterministic on purpose: a student who taps
 * Check in twice writes the SAME id the second time, and Firestore's create
 * rule refuses a create over an existing document. Duplicate rows are
 * therefore impossible at the database, not merely discouraged in the UI —
 * the same guard shape as calendarViews (doc id derived from contents).
 */
export function checkinDocId(eventId: string, studentId: string, kind: CheckinKind): string {
  return `${eventId}_${studentId}_${kind}`;
}

/** Reads a record id back apart. Returns null for anything malformed, so a
 *  stray document can never be mistaken for a scan. Student ids are random
 *  Firestore ids and event ids may contain '_', so the KIND is taken from the
 *  end and the event id from the front. */
export function parseCheckinDocId(
  id: string,
): { eventId: string; studentId: string; kind: CheckinKind } | null {
  const cut = id.lastIndexOf('_');
  if (cut <= 0) return null;
  const kind = id.slice(cut + 1);
  if (kind !== 'in' && kind !== 'out') return null;
  const rest = id.slice(0, cut);
  const split = rest.lastIndexOf('_');
  if (split <= 0 || split === rest.length - 1) return null;
  return { eventId: rest.slice(0, split), studentId: rest.slice(split + 1), kind };
}

/* ──────────────────────────── school email ─────────────────────────── */

export type EmailProblem = 'empty' | 'malformed' | 'domain';

/** Trimmed and lowercased. Students type with the shift key stuck on and
 *  phones add a trailing space; neither should cost them a check-in. */
export function normalizeEmail(raw: string): string {
  return (raw ?? '').trim().toLowerCase();
}

/**
 * Why this address is not acceptable, or null when it is.
 *
 * Domain matching is on the FULL domain or a dot-suffix of it, never a
 * substring: 'students.dadeschools.net' accepts
 * `someone@students.dadeschools.net` and rejects
 * `someone@notstudents.dadeschools.net` and
 * `someone@students.dadeschools.net.evil.com`. An empty domain list accepts
 * any well-formed address — that is the "accept anything" posture, chosen
 * deliberately in settings, never a config hole silently opening the door.
 */
export function emailProblem(raw: string, domains: string[]): EmailProblem | null {
  const email = normalizeEmail(raw);
  if (!email) return 'empty';
  if (email.length > 254) return 'malformed';
  const at = email.lastIndexOf('@');
  if (at <= 0 || at === email.length - 1) return 'malformed';
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (/\s/.test(email) || !local || !domain.includes('.') || domain.startsWith('.') || domain.endsWith('.')) {
    return 'malformed';
  }
  const allowed = domains.map(d => d.trim().toLowerCase().replace(/^@/, '')).filter(Boolean);
  if (allowed.length === 0) return null;
  return allowed.some(d => domain === d || domain.endsWith(`.${d}`)) ? null : 'domain';
}

export function emailAccepted(raw: string, domains: string[]): boolean {
  return emailProblem(raw, domains) === null;
}

/** "@students.dadeschools.net or @mymdc.net" — the hint under the field, and
 *  the same words in the error, so the student is never guessing. */
export function domainsLabel(domains: string[]): string {
  const list = domains.map(d => `@${d.replace(/^@/, '')}`);
  if (list.length === 0) return '';
  if (list.length === 1) return list[0];
  return `${list.slice(0, -1).join(', ')} or ${list[list.length - 1]}`;
}

/* ───────────────────────────── the college door ────────────────────────── */

/**
 * The second door (#concert-checkin): a student who is not on the roster yet
 * types their own name and their college address.
 *
 * This exists because the dual-enrollment college students are real students
 * playing real concerts who simply have not been entered into the Hub yet.
 * It is a BRIDGE, not a pattern — the moment they are on the roster they
 * should use the name search like everyone else, and the door quietly stops
 * mattering. Compare `guestPerformers` on a master class, which is the
 * opposite call on purpose: visiting players get a free-text name and no
 * attendance record at all, because they are not ours to track.
 *
 * The whole of its access control is `guestEmailDomains`. There is no roster
 * to check against — that is the entire point — so the domain list is not one
 * guard among several the way it is on the roster path. It is the guard.
 */

/** Longest name the door accepts. Long enough for a full name with a couple
 *  of surnames, short enough that the field is not a place to park text. */
export const MAX_GUEST_NAME = 80;

export type GuestNameProblem = 'empty' | 'too-long';

/** Collapses the runs of whitespace a phone keyboard produces between a first
 *  and last name typed in two fields. */
export function normalizeGuestName(raw: string): string {
  return (raw ?? '').replace(/\s+/g, ' ').trim();
}

export function guestNameProblem(raw: string): GuestNameProblem | null {
  const name = normalizeGuestName(raw);
  if (name.length < 2) return 'empty';
  if (name.length > MAX_GUEST_NAME) return 'too-long';
  return null;
}

/**
 * Is the college door open at all, and is this the kind of address it takes?
 *
 * Both halves matter. An org with no `guestEmailDomains` has no college door,
 * and an address outside that list is refused even when `emailDomains` would
 * have accepted it happily — a high school address must go through the roster.
 */
export function guestDoorOpen(settings: Pick<CheckinSettings, 'guestEmailDomains'>): boolean {
  return settings.guestEmailDomains.length > 0;
}

export function guestEmailProblem(
  raw: string,
  settings: Pick<CheckinSettings, 'guestEmailDomains'>,
): EmailProblem | null {
  if (!guestDoorOpen(settings)) return 'domain';
  return emailProblem(raw, settings.guestEmailDomains);
}

/**
 * The stable student id for someone who has no student record: derived from
 * their email and nothing else.
 *
 * Derived rather than random because every promise the station makes is keyed
 * on this string. The doc id `event_student_kind` is what makes a duplicate
 * scan impossible; the check-out has to find the check-in written twenty
 * minutes earlier from a page that has been reloaded since; the CSV pairs the
 * two scans into one row; the tally counts a semester with
 * `where('studentId', '==', ...)`. A fresh id per scan would break all four.
 *
 * The EMAIL is therefore the identity and the typed name is only a label — a
 * student who writes "Ana Ruiz" on the way in and "ana ruiz" on the way out
 * still pairs, and a student who mistypes their address is a second person for
 * the evening. That is the trade, and it is the right way round: an address is
 * something a phone autofills, a name is something you retype.
 *
 * Hex with a single leading letter, so it can never contain an underscore.
 * `parseCheckinDocId` takes the kind and the student id off the LAST two
 * underscores in a doc id; a synthetic id built from the raw email
 * (`guest_j_smith@mymdc.net`) would split in the wrong place.
 */
export function guestStudentId(email: string): string {
  const e = normalizeEmail(email);
  return `g${fnv1a(e)}${fnv1a(`${e}#2`)}`;
}

/** FNV-1a, 32 bits, as eight hex digits. Not a security function — nothing is
 *  hidden by it and the address is stored beside it in plain text. It is here
 *  to turn an address into a short id with no separator characters in it. */
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Whether a stored record came through the college door. Reads the id rather
 *  than a flag so an old record and a new one answer the same way. */
export function isGuestStudentId(studentId: string): boolean {
  return /^g[0-9a-f]{16}$/.test(studentId ?? '');
}

/* ─────────────────────────── the open window ───────────────────────── */

/**
 * Wall-clock (date, HH:MM) in a named timezone → epoch ms.
 *
 * The server runs in UTC and the school runs in America/New_York, so a
 * window computed from raw Date parsing would be four or five hours wrong —
 * and on concert night that is the difference between the station being open
 * and a line of students staring at "check-in is not open yet". Resolved
 * against the zone twice so a DST boundary lands on the right side.
 */
export function zonedEpoch(date: string, time: string, timeZone: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = (time || '00:00').split(':').map(Number);
  if (!y || !m || !d || Number.isNaN(hh) || Number.isNaN(mm)) return NaN;
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const once = guess - zoneOffsetMs(guess, timeZone);
  return guess - zoneOffsetMs(once, timeZone);
}

function zoneOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const at = (type: string) => Number(parts.find(p => p.type === type)?.value ?? '0');
  // hourCycle h23 still reports midnight as '24' in some engines.
  return Date.UTC(at('year'), at('month') - 1, at('day'), at('hour') % 24, at('minute'), at('second')) - utcMs;
}

export interface CheckinWindow {
  opensAt: number;
  closesAt: number;
  startsAt: number;
}

/**
 * When the station is open. An event with no times at all falls back to the
 * whole calendar day, so a concert entered in a hurry without a start time
 * still works rather than silently never opening.
 */
export function checkinWindow(
  event: CheckinEventLike,
  settings: CheckinSettings,
  timeZone: string,
): CheckinWindow | null {
  if (!event.date) return null;
  const MIN = 60_000;
  const startsAt = zonedEpoch(event.date, event.startTime ?? '00:00', timeZone);
  if (Number.isNaN(startsAt)) return null;
  const endsAt = event.endTime
    ? zonedEpoch(event.date, event.endTime, timeZone)
    : startsAt + 3 * 60 * MIN;
  // An end time before the start time means the concert runs past midnight.
  const realEnd = endsAt < startsAt ? endsAt + 24 * 60 * MIN : endsAt;
  return {
    startsAt,
    opensAt: startsAt - settings.opensMinutesBefore * MIN,
    closesAt: realEnd + settings.closesMinutesAfter * MIN,
  };
}

export type CheckinState = 'off' | 'early' | 'open' | 'closed';

/** What the station is doing right now. 'off' covers both "no station on
 *  this event" and a cancelled concert — a cancelled event never collects
 *  attendance, whatever its switches say. */
export function checkinState(
  event: CheckinEventLike,
  settings: CheckinSettings,
  timeZone: string,
  now: number = Date.now(),
): CheckinState {
  if (!event.checkin?.enabled) return 'off';
  if (event.status === 'Cancelled') return 'off';
  const win = checkinWindow(event, settings, timeZone);
  if (!win) return 'off';
  if (now < win.opensAt) return 'early';
  if (now > win.closesAt) return 'closed';
  return 'open';
}

/**
 * When checking IN stops being accepted, or null when it never does.
 *
 * This is the "arrive on time" line. It is separate from the station closing
 * because a student who came late should still be able to check OUT — their
 * arrival is the thing in question, not their leaving.
 */
export function checkinCutoff(
  event: CheckinEventLike,
  settings: CheckinSettings,
  timeZone: string,
): number | null {
  if (settings.inClosesMinutesAfterStart == null) return null;
  const win = checkinWindow(event, settings, timeZone);
  if (!win) return null;
  return win.startsAt + settings.inClosesMinutesAfterStart * 60_000;
}

/** Can a student still check IN? Open, and not past the late cutoff. */
export function canCheckIn(
  event: CheckinEventLike,
  settings: CheckinSettings,
  timeZone: string,
  now: number = Date.now(),
): boolean {
  if (checkinState(event, settings, timeZone, now) !== 'open') return false;
  const cutoff = checkinCutoff(event, settings, timeZone);
  return cutoff === null || now <= cutoff;
}

/** Check-out specifically: open, and past any minimum stay. Separated from
 *  checkinState because "you can check in but not out yet" is a real state
 *  and the page has to say so in words. */
export function checkoutBlockedUntil(
  event: CheckinEventLike,
  settings: CheckinSettings,
  timeZone: string,
): number | null {
  if (!settings.minStayMinutes) return null;
  const win = checkinWindow(event, settings, timeZone);
  if (!win) return null;
  return win.startsAt + settings.minStayMinutes * 60_000;
}

export function canCheckOut(
  event: CheckinEventLike,
  settings: CheckinSettings,
  timeZone: string,
  now: number = Date.now(),
): boolean {
  if (checkinState(event, settings, timeZone, now) !== 'open') return false;
  const until = checkoutBlockedUntil(event, settings, timeZone);
  return until === null || now >= until;
}

/* ──────────────────────────── semesters ────────────────────────────── */

export interface Term {
  id: string;
  name: string;
  start: string; // YYYY-MM-DD, inclusive
  end: string;   // YYYY-MM-DD, inclusive
}

/** Which semester a date falls in, or null outside every term (summer, or a
 *  year nobody has configured yet). Compared as strings — YYYY-MM-DD sorts
 *  correctly and never drags a timezone into it. */
export function termForDate(date: string, terms: Term[]): Term | null {
  return terms.find(t => date >= t.start && date <= t.end) ?? null;
}

export function termIdForDate(date: string, terms: Term[]): string {
  return termForDate(date, terms)?.id ?? '';
}

/**
 * The Drive folder id, however a director pasted it (#concert-checkin).
 *
 * The Settings hint shows the id inside a URL, so pasting the whole URL is
 * the natural mistake — and Drive answers a wrong id with the same 404 it
 * gives for a folder that was never shared, which is an afternoon of looking
 * in the wrong place. Accepts the bare id and every URL Drive's address bar
 * and Share dialog hand out; anything that can't be a folder id comes back
 * '' so the caller can say so instead of asking Drive about nonsense.
 */
export function driveFolderIdFrom(raw: string | undefined | null): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  const inPath = s.match(/\/folders\/([A-Za-z0-9_-]+)/);
  if (inPath) return inPath[1];
  const inQuery = s.match(/[?&]id=([A-Za-z0-9_-]+)/);
  if (inQuery) return inQuery[1];
  return /^[A-Za-z0-9_-]{10,}$/.test(s) ? s : '';
}
