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
  /** Minutes before the downbeat that the station opens. */
  opensMinutesBefore: number;
  /** Minutes after the end time that the station closes. */
  closesMinutesAfter: number;
  /** Optional guard: check-out refuses until this many minutes after the
   *  start time. 0 (the default) means check out whenever. */
  minStayMinutes: number;
  /** When false the selfie is required; when true the station accepts a
   *  record without one. The venue fallback — a director flips this from
   *  their phone when the cameras or the network misbehave, and gets the
   *  attendance record rather than a student stuck at the door. */
  photoOptional: boolean;
}

export const DEFAULT_CHECKIN_SETTINGS: CheckinSettings = {
  emailDomains: [],
  opensMinutesBefore: 60,
  closesMinutesAfter: 60,
  minStayMinutes: 0,
  photoOptional: false,
};

/** The check-in fields carried on a CalendarEvent. All optional: an event
 *  with no `checkin` block has no station, which is every existing event. */
export interface EventCheckinConfig {
  enabled?: boolean;
  opensMinutesBefore?: number;
  closesMinutesAfter?: number;
  minStayMinutes?: number;
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
  concertAttendance?: ConcertAttendance;
  checkin?: EventCheckinConfig;
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
    opensMinutesBefore: ev.opensMinutesBefore ?? base.opensMinutesBefore,
    closesMinutesAfter: ev.closesMinutesAfter ?? base.closesMinutesAfter,
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
