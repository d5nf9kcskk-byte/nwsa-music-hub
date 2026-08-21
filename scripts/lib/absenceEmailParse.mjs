/**
 * Parse parent/student "not going to be there" emails into planned absences.
 * Companion to attendanceBulletinParse.mjs: same idea (free text → a music
 * roster match), but the source is unstructured email instead of a fixed-
 * column district report, so confidence is lower and matching is stricter —
 * exactly one roster name found, exactly one date found, or it goes to a
 * human queue instead of writing anything.
 */
import { normName } from './attendanceBulletinParse.mjs';

/** Loose net on purpose — "whole inbox, filtered by keywords" per design. */
const ABSENCE_PHRASES = [
  /not\s+(?:be\s+|be\s+able\s+to\s+)?(?:in|at)\s+school/i,
  /won'?t\s+be\s+(?:in|at)\s+school/i,
  /will\s+not\s+be\s+(?:in|at)\s+school/i,
  /not\s+going\s+to\s+be\s+(?:there|in|at)/i,
  /won'?t\s+be\s+(?:there|in|at)/i,
  /will\s+(?:not|not\s+be\s+able\s+to)\s+(?:attend|make\s+it)/i,
  /(?:will\s+)?be\s+absent/i,
  /out\s+sick/i,
  /home\s+sick/i,
  /missing\s+(?:rehearsal|class|school|practice)/i,
  /excus(?:e|ing)?\s+.*\s+(?:absence|absent)/i,
  /calling\s+in\s+(?:absent|sick)/i,
];

const MONTH_ABBR = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** @param {string} text */
export function looksLikeAbsenceEmail(text) {
  return ABSENCE_PHRASES.some(re => re.test(text));
}

/**
 * Resolve every date phrase found in text to YYYY-MM-DD, relative to
 * `referenceDate` (the day the email was RECEIVED — not "today" when this
 * runs, since catch-up can process a message hours or days late).
 * @param {string} text
 * @param {string} referenceDate YYYY-MM-DD
 * @returns {string[]} deduped, sorted
 */
export function extractDates(text, referenceDate) {
  const ref = parseYmd(referenceDate);
  if (!ref) return [];
  const found = new Set();

  const backTomorrow = /(back|return|returning|be there|be in|see you|rejoin)[^.!?]{0,40}\btomorrow\b/i.test(text);
  if (/\btomorrow\b/i.test(text) && !backTomorrow) found.add(toYmd(addDays(ref, 1)));
  if (/\btoday\b/i.test(text)) found.add(toYmd(ref));

  // Explicit M/D or M/D/YY(YY)
  for (const m of text.matchAll(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g)) {
    const mo = Number(m[1]), da = Number(m[2]);
    if (mo < 1 || mo > 12 || da < 1 || da > 31) continue;
    let yr = m[3] ? Number(m[3]) : ref.getFullYear();
    if (m[3] && m[3].length === 2) yr += yr >= 70 ? 1900 : 2000;
    found.add(toYmd(new Date(yr, mo - 1, da)));
  }

  // "this/next <weekday>" and a bare weekday name (assumed the nearest
  // upcoming one, since parents write about absences ahead of time).
  const monthRe = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?/gi;
  for (const m of text.matchAll(monthRe)) {
    const mo = MONTH_ABBR.indexOf(m[1].toLowerCase());
    const da = Number(m[2]);
    if (mo < 0 || da < 1 || da > 31) continue;
    const yr = m[3] ? Number(m[3]) : ref.getFullYear();
    found.add(toYmd(new Date(yr, mo, da)));
  }
  const weekdayRe = /\b(next\s+|this\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi;
  for (const m of text.matchAll(weekdayRe)) {
    const target = WEEKDAYS.indexOf(m[2].toLowerCase());
    const isNext = /next/i.test(m[1] || '');
    let delta = (target - ref.getDay() + 7) % 7;
    if (delta === 0) delta = isNext ? 7 : 0;
    else if (isNext) delta += 7;
    found.add(toYmd(addDays(ref, delta)));
  }

  return [...found].sort();
}

/**
 * Find music-roster students named in an email.
 * @param {string} text
 * @param {{ id: string, name: string, preferredName?: string, status?: string }[]} students
 */
export function matchAbsenceEmailStudents(text, students) {
  const active = students.filter(s => (s.status ?? 'Active') === 'Active');
  const haystack = normName(text.replace(/[.,!?;:()[\]"']/g, ' '));
  const words = new Set(haystack.split(' '));

  return active.filter(s => {
    const legalParts = normName(s.name).split(' ').filter(p => p.length > 1);
    if (legalParts.length >= 2 && legalParts.every(p => words.has(p))) return true;

    if (!s.preferredName) return false;
    const last = normName(s.name).split(' ').pop();
    const pref = normName(s.preferredName).split(' ')[0];
    return Boolean(pref && last && pref.length > 1 && words.has(pref) && words.has(last));
  });
}

/**
 * @typedef {{ status: 'matched', studentId: string, studentName: string, date: string, snippet: string }} MatchedAbsence
 * @typedef {{ status: 'ambiguous', candidateIds: string[], candidateNames: string[], dates: string[], snippet: string, reason: string }} AmbiguousAbsence
 * @typedef {{ status: 'ignored' }} IgnoredAbsence
 */

/**
 * @param {{ subject: string, body: string, from: string, receivedDate: string }} email
 * @param {{ id: string, name: string, preferredName?: string, status?: string }[]} students
 * @returns {MatchedAbsence | AmbiguousAbsence | IgnoredAbsence}
 */
function stripQuotedHeaders(text) {
  const nl = String.fromCharCode(10);
  const keys = ['from', 'sent', 'to', 'cc', 'bcc', 'subject', 'date', 'reply-to'];
  return String(text).split(nl).filter(function (line) {
    const t = line.trim().toLowerCase();
    const i = t.indexOf(':');
    if (i < 1) return true;
    return keys.indexOf(t.slice(0, i).trim()) === -1;
  }).join(nl);
}

export function parseAbsenceEmail(email, students) {
  const text = `${email.subject}\n${email.body}`;
  if (!looksLikeAbsenceEmail(text)) return { status: 'ignored' };

  const snippet = text.trim().replace(/\s+/g, ' ').slice(0, 280);
  const candidates = matchAbsenceEmailStudents(email.from + ' ' + text, students);
  const dates = extractDates(stripQuotedHeaders(text), easternDateStr(email.receivedDate));

  if (candidates.length === 1 && dates.length === 1) {
    return {
      status: 'matched',
      studentId: candidates[0].id,
      studentName: candidates[0].name,
      date: dates[0],
      snippet,
    };
  }

  if (candidates.length === 0) {
    return {
      status: 'ambiguous',
      candidateIds: [],
      candidateNames: [],
      dates,
      snippet,
      reason: 'no roster name recognized in the email',
    };
  }

  return {
    status: 'ambiguous',
    candidateIds: candidates.map(c => c.id),
    candidateNames: candidates.map(c => c.name),
    dates,
    snippet,
    reason: candidates.length > 1
      ? 'more than one roster name found'
      : dates.length === 0
        ? 'no date found — could not tell which day'
        : 'more than one possible date found',
  };
}

/**
 * A UTC ISO timestamp ("date received" from Mail.app) as a calendar date in
 * the school's own timezone — a message received at 11pm Eastern is already
 * past midnight UTC, and "tomorrow" has to mean the sender's tomorrow.
 * @param {string} isoOrYmd
 * @returns {string} YYYY-MM-DD
 */
export function easternDateStr(isoOrYmd) {
  const d = new Date(isoOrYmd);
  if (Number.isNaN(d.getTime())) return String(isoOrYmd).slice(0, 10);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(d);
}

/** @param {string} s YYYY-MM-DD */
function parseYmd(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** @param {Date} d */
function toYmd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** @param {Date} d @param {number} n */
function addDays(d, n) {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}
