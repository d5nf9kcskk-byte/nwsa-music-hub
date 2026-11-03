/**
 * Web push for same-day schedule changes (#push). The ONE definition of:
 *
 *   • what a subscription document holds (the key allowlists below are pinned
 *     against firestore.rules by pushAlerts.selfcheck.ts);
 *   • which change to an event is worth a push (`pushWorthy`);
 *   • who it reaches (`subscriptionReaches`);
 *   • what the notification says (`buildPushPayload`).
 *
 * Imported by the `pushOnEventChange` Cloud Function and by the page that
 * subscribes, so the two can never disagree about a field name. Zero imports
 * on purpose: the function bundle and the Node self-check both load it
 * without the org config or the Vite defines.
 *
 * Privacy (#privacy): a payload is built from an event's TITLE, its TYPE, the
 * NAMES of its ensembles and the director's change note. Every one of those is
 * already world-readable on the public calendar. `buildPushPayload` reads no
 * other field of the event, so a student id, performer, audience list or
 * roster move on the event cannot ride along — the self-check hands it an
 * event full of them and searches the output.
 */

/** Doc id = this many hex chars of SHA-256(token). firestore.rules recomputes
 *  the hash from the token it is handed, so a doc can only ever live at the
 *  address its own token implies (the calendarViews trick). */
export const SUB_ID_HEX = 64;

/** A family device saves a handful of students (parent mode); 8 is generous. */
export const MAX_SUB_STUDENTS = 8;
/** Ensemble ids on one subscription — same ceiling calendarViews uses. */
export const MAX_SUB_ENSEMBLES = 40;
/** FCM web tokens run ~160-200 chars; bound it so a doc cannot be padded. */
export const MAX_TOKEN_LEN = 4096;

export type PushLang = 'en' | 'es';
/** 'all' = every same-day change in the school (staff trial only);
 *  'groups' = school-wide changes plus the listed ensembles. */
export type PushScope = 'all' | 'groups';

/** Every key a STAFF subscription may carry. Mirrors the staff clause of
 *  /pushSubscriptions in firestore.rules exactly. */
export const STAFF_SUB_KEYS = [
  'token', 'studentIds', 'ensembleIds', 'lang', 'scope', 'createdAt', 'updatedAt', 'staffEmail',
] as const;

/** Every key a FAMILY subscription may carry — the exact-key-set honeypot.
 *  No `staffEmail`, and scope is pinned to 'groups' by the rules. */
export const FAMILY_SUB_KEYS = [
  'token', 'studentIds', 'ensembleIds', 'lang', 'scope', 'createdAt', 'updatedAt',
] as const;

export interface PushSubscriptionDoc {
  token: string;
  studentIds: string[];
  ensembleIds: string[];
  lang: PushLang;
  scope: PushScope;
  createdAt: number;
  updatedAt: number;
  /** Present only on a staff device — whose phone this is, for the test alert. */
  staffEmail?: string;
}

/** The switch doc: `pushSettings/global`. World-readable (the family button
 *  needs to know whether to render), director-writable. */
export interface PushSettings {
  familiesOpen?: boolean;
  updatedAt?: number;
  updatedBy?: string;
}

/** Only the event fields this module is allowed to look at. */
export interface PushEventLike {
  id?: string;
  date?: string;
  type?: string;
  title?: string;
  status?: string;
  ensembleIds?: string[];
  changeNote?: string;
  startTime?: string;
  endTime?: string;
  location?: string;
}

/** Today's date, YYYY-MM-DD, in the org's own timezone. A function runs in
 *  UTC, where 9pm in Miami is already tomorrow. */
export function todayInZone(timeZone: string, now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

function clean(s: unknown): string {
  return typeof s === 'string' ? s.trim() : '';
}

/**
 * Is this update a same-day change families should hear about NOW?
 *
 * Yes when the event is today (org timezone), carries a change note after the
 * write, and either the note or the status moved. That covers every writer
 * of a change: the Schedule screen's Change a Day plan (`changePlan.ts`:
 * move, swap, combine, cancel), the quick Cancel / Back on buttons, and the
 * Today screen's "School closed". A note cleared by "Back to normal" is not
 * sent: the director un-did a change, and a second buzz saying "never mind"
 * with no text would be noise.
 */
export function pushWorthy(before: PushEventLike | undefined, after: PushEventLike, today: string): boolean {
  if (clean(after.date) !== today) return false;
  const note = clean(after.changeNote);
  if (!note) return false;
  const prevNote = clean(before?.changeNote);
  const prevStatus = clean(before?.status);
  return note !== prevNote || clean(after.status) !== prevStatus;
}

/** What one change IS, for the send-once marker: the same note on the same
 *  event at the same time and place is the same change, however many times
 *  the trigger is delivered. FNV-1a, hex — pure, no crypto import. */
export function changeFingerprint(e: PushEventLike): string {
  const s = [e.date, e.status, e.changeNote, e.startTime, e.endTime, e.location]
    .map(v => clean(v)).join('\u0001');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** The marker doc id: `pushSent/<eventId>_<fingerprint>`. */
export function sentMarkerId(eventId: string, e: PushEventLike): string {
  return `${eventId}_${changeFingerprint(e)}`;
}

/**
 * Does a change to an event with these ensembles reach this subscription?
 *   • a school-wide event (no ensembles) reaches EVERY subscription;
 *   • a staff 'all' subscription reaches everything;
 *   • otherwise the two ensemble lists must share an id.
 */
export function subscriptionReaches(
  sub: Pick<PushSubscriptionDoc, 'scope' | 'ensembleIds'>,
  eventEnsembleIds: readonly string[] | undefined,
): boolean {
  const ev = eventEnsembleIds ?? [];
  if (ev.length === 0) return true;
  if (sub.scope === 'all') return true;
  const mine = new Set(sub.ensembleIds ?? []);
  return ev.some(id => mine.has(id));
}

/* ── Words. App words only; the change note is the director's own text. ── */

const WORDS: Record<PushLang, Record<string, string>> = {
  en: {
    today: 'Today',
    change: 'Schedule change',
    Rehearsal: 'Rehearsal', Class: 'Class', Sectional: 'Sectional', Concert: 'Concert', Event: 'Event',
    testTitle: 'Test alert',
    testBody: 'Alerts are on for this phone. Same-day schedule changes will arrive like this.',
  },
  es: {
    today: 'Hoy',
    change: 'Cambio de horario',
    Rehearsal: 'Ensayo', Class: 'Clase', Sectional: 'Seccional', Concert: 'Concierto', Event: 'Evento',
    testTitle: 'Alerta de prueba',
    testBody: 'Las alertas están activadas en este teléfono. Los cambios de horario del día llegarán así.',
  },
};

export function pushWord(lang: PushLang, key: string): string {
  return WORDS[lang]?.[key] ?? WORDS.en[key] ?? key;
}

export interface PushPayload {
  title: string;
  body: string;
  /** Where a tap lands: the event's own public page. */
  url: string;
  /** Notification tag: a second change to the same event REPLACES the first
   *  on the lock screen instead of stacking. */
  tag: string;
}

/** Bounded so one long note cannot blow the 4 KB push payload. */
const MAX_BODY = 300;

/**
 * The notification for one change, in one language. Reads ONLY title, type,
 * ensembleIds (to name them), changeNote and id.
 */
export function buildPushPayload(
  event: PushEventLike,
  ensembleNames: Readonly<Record<string, string>>,
  lang: PushLang,
  publicUrl: string,
): PushPayload {
  const typeWord = pushWord(lang, clean(event.type) || 'Event');
  const names = (event.ensembleIds ?? []).map(id => ensembleNames[id]).filter(Boolean);
  const what = clean(event.title)
    || (names.length > 0 ? `${names.join(', ')} ${typeWord.toLowerCase()}` : typeWord);
  let body = `${pushWord(lang, 'today')}: ${clean(event.changeNote)}`;
  if (body.length > MAX_BODY) body = `${body.slice(0, MAX_BODY - 1)}…`;
  const base = publicUrl.endsWith('/') ? publicUrl : `${publicUrl}/`;
  const id = clean(event.id);
  return {
    title: what,
    body,
    url: id ? `${base}event/${encodeURIComponent(id)}` : base,
    tag: id ? `change-${id}` : 'change',
  };
}

export function buildTestPayload(lang: PushLang, publicUrl: string): PushPayload {
  const base = publicUrl.endsWith('/') ? publicUrl : `${publicUrl}/`;
  return { title: pushWord(lang, 'testTitle'), body: pushWord(lang, 'testBody'), url: base, tag: 'test' };
}

/** FCM error codes that mean the token is dead and its doc should go. */
export const DEAD_TOKEN_CODES = [
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
] as const;

export function isDeadTokenError(code: string | undefined): boolean {
  return !!code && (DEAD_TOKEN_CODES as readonly string[]).includes(code);
}

/** Lowercase hex SHA-256 of the token — the subscription's doc id. Works in a
 *  browser (crypto.subtle) and in Node 22 (globalThis.crypto). */
export async function subscriptionDocId(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function isSubscriptionDocId(id: string): boolean {
  return new RegExp(`^[0-9a-f]{${SUB_ID_HEX}}$`).test(id);
}
