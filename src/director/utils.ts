import type { Ensemble, EventType, RepertoirePiece, PiecePartLink, PieceMovement, CalendarEvent, SeatingChart, Student } from './types';
import { dateLocale, fmtDate } from '../shared/dates';
import { scoreOrderRank, lastName } from './scoreOrder';

// ── Date helpers (work in local time, store as YYYY-MM-DD) ──────────────────────

export function todayStr(): string {
  const d = new Date();
  return toDateStr(d);
}

export function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parse a YYYY-MM-DD string into a local Date (noon avoids DST edge cases). */
export function parseDate(s: string): Date {
  return new Date(s + 'T12:00:00');
}

export function addDays(s: string, n: number): string {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

export function formatDate(s: string, opts?: Intl.DateTimeFormatOptions): string {
  return fmtDate(parseDate(s), opts ?? {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

/** "15:30" → "3:30 PM" ("3:30 p.m." in Spanish). Empty input returns "". */
export function formatTime(t?: string): string {
  if (!t) return '';
  const [hStr, mStr] = t.split(':');
  let h = Number(hStr);
  const m = mStr ?? '00';
  const es = dateLocale().startsWith('es');
  const ampm = h >= 12 ? (es ? 'p.m.' : 'PM') : (es ? 'a.m.' : 'AM');
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

export function formatTimeRange(start?: string, end?: string): string {
  if (!start && !end) return '';
  if (start && end) return `${formatTime(start)} – ${formatTime(end)}`;
  return formatTime(start || end);
}

// Standard NWSA ensemble blocks — one-tap presets for schedule-time entry.
// Values are 24h "HH:MM" strings (the value format of <input type="time">);
// labels are hardcoded to the exact requested copy (12h, en-dash, no AM/PM).
// Choir blocks end/start earlier so bathroom breaks do not overlap instrumental.
export const TIME_BLOCKS = [
  { label: 'Block 1 · 1:10–2:25', start: '13:10', end: '14:25' },
  { label: 'Block 2 · 2:30–3:45', start: '14:30', end: '15:45' },
  { label: 'Choir 1 · 1:10–2:15', start: '13:10', end: '14:15' },
  { label: 'Choir 2 · 2:25–3:45', start: '14:25', end: '15:45' },
] as const;

// ── Music ensembles vs divisions ────────────────────────────────────────────
// Dance / Theater / Visual Arts are school "divisions" — calendar labels only,
// never selectable ensembles. Guard by name so a stray division can't surface
// in an ensemble picker or filter (mirrors the recovered app's migration guard).
const DIVISION_NAMES = new Set(['dance', 'theater', 'theatre', 'visual arts', 'visual']);

export function isDivision(e: Pick<Ensemble, 'name'>): boolean {
  return DIVISION_NAMES.has(e.name.trim().toLowerCase());
}

/** Filter an ensemble-like list down to music groups only (drops divisions).
 *  Includes CLASSES — anywhere that needs performing ensembles alone should
 *  use performingEnsembles() instead. */
export function musicEnsembles<T extends Pick<Ensemble, 'name'>>(list: T[]): T[] {
  return list.filter(e => !isDivision(e));
}

/** Weekday labels, Sun..Sat — indexed by Date.getDay(), the same convention
 *  as Ensemble.meetingDays and RosterOverride weekday filters. */
export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ── Ensembles vs. classes (#classes) ────────────────────────────────────
// One place decides what `kind` means, so the "absent = ensemble" default for
// every group created before the field existed is applied exactly once.

/** A class (theory, music appreciation, master class, college course) — has a
 *  roster and takes roll, but rehearses no repertoire and plays no concerts.
 *  Covers BOTH class kinds: everywhere a list is shown they belong together. */
export function isClassGroup(e: Pick<Ensemble, 'kind'>): boolean {
  return e.kind === 'class' || e.kind === 'masterclass';
}

/** A master class specifically — a class whose students PLAY in it, so a
 *  meeting picks performers and their pieces instead of a unit/chapter. */
export function isMasterClass(e: Pick<Ensemble, 'kind'>): boolean {
  return e.kind === 'masterclass';
}

/** Music groups that actually rehearse and perform — the list that belongs in
 *  repertoire pickers, concert programs, and the public "our ensembles" grid. */
export function performingEnsembles<T extends Pick<Ensemble, 'name' | 'kind'>>(list: T[]): T[] {
  return list.filter(e => !isDivision(e) && !isClassGroup(e));
}

/** The classes, in the same order ensembles come in. */
export function classGroups<T extends Pick<Ensemble, 'name' | 'kind'>>(list: T[]): T[] {
  return list.filter(e => !isDivision(e) && isClassGroup(e));
}

/**
 * Every event a check-in station could belong to (#concert-checkin): concert
 * and Event-type items, but never something tied ONLY to a class — a theory
 * presentation is not a concert, and offering it a station would sweep a
 * class onto one. School-wide items (no ensembleIds) still qualify.
 * performingEnsembles(), not musicEnsembles() (#division-shortcut) — the ONE
 * definition, shared by the director's Concert Check-In list and the
 * announcement link picker's check-in step.
 */
export function checkinCandidateEvents<T extends Pick<CalendarEvent, 'type' | 'ensembleIds'>>(
  events: T[],
  ensembles: Ensemble[],
): T[] {
  const ids = new Set(performingEnsembles(ensembles).map(e => e.id));
  return events.filter(e =>
    (e.type === 'Concert' || e.type === 'Event')
    && (e.ensembleIds.length === 0 || e.ensembleIds.some(id => ids.has(id))));
}

/** College / dual-enrollment flag — ensembles and classes both use it to list
 *  under the College section rather than All Ensembles / All Classes. */
export function isCollegeGroup(e: Pick<Ensemble, 'collegeLevel'>): boolean {
  return !!e.collegeLevel;
}

/** High-school performing ensembles (excludes College Chamber, College Vocal, …). */
export function highSchoolEnsembles<T extends Pick<Ensemble, 'name' | 'kind' | 'collegeLevel'>>(list: T[]): T[] {
  return performingEnsembles(list).filter(e => !isCollegeGroup(e));
}

/** College performing ensembles only. */
export function collegeEnsembles<T extends Pick<Ensemble, 'name' | 'kind' | 'collegeLevel'>>(list: T[]): T[] {
  return performingEnsembles(list).filter(isCollegeGroup);
}

/** High-school classes (excludes dual-enrollment college courses). */
export function highSchoolClasses<T extends Pick<Ensemble, 'name' | 'kind' | 'collegeLevel'>>(list: T[]): T[] {
  return classGroups(list).filter(e => !isCollegeGroup(e));
}

/** College / dual-enrollment classes only. */
export function collegeClasses<T extends Pick<Ensemble, 'name' | 'kind' | 'collegeLevel'>>(list: T[]): T[] {
  return classGroups(list).filter(isCollegeGroup);
}

/** Every college-flagged group (ensembles + classes), for calendar presets. */
export function collegeGroups<T extends Pick<Ensemble, 'name' | 'kind' | 'collegeLevel'>>(list: T[]): T[] {
  return musicEnsembles(list).filter(isCollegeGroup);
}

/** What a class is, in words: "class", "master class", and the college
 *  (dual-enrollment) variants. Empty string for a high-school performing
 *  ensemble; "college ensemble" when the college flag is on a performer.
 *  `collegeLevel` is display + filtering only — it never changes who may read
 *  anything. One spelling here so the director list and the public class list
 *  can never drift apart. */
export function groupKindLabel(e: Pick<Ensemble, 'kind' | 'collegeLevel'>): string {
  if (!isClassGroup(e)) return e.collegeLevel ? 'college ensemble' : '';
  const base = isMasterClass(e) ? 'master class' : 'class';
  return e.collegeLevel ? `college ${base}` : base;
}

/** A piece's ensembles as an array — reads the new `ensembleIds` or falls back
 *  to the legacy single `ensembleId`. Empty array if neither is set. */
export function pieceEnsembleIds(p: Pick<RepertoirePiece, 'ensembleIds' | 'ensembleId'>): string[] {
  if (p.ensembleIds && p.ensembleIds.length) return p.ensembleIds;
  return p.ensembleId ? [p.ensembleId] : [];
}

// ── Ensemble colors ─────────────────────────────────────────────────────

/** Concert gold + assignment violet — the two reserved semantic colors. */
export const CONCERT_COLOR = '#ca8a04';
export const ASSIGN_COLOR = '#7c3aed';

// Gold (#ca8a04) is reserved for concerts and violet (#7c3aed) for assignment
// dots on the calendars — the auto palette avoids both so an ensemble's dots
// can never be mistaken for either.
const PALETTE = [
  '#2563eb', // blue
  '#16a34a', // green
  '#0f766e', // teal
  '#ea580c', // orange
  '#0891b2', // cyan
  '#db2777', // pink
  '#65a30d', // olive
  '#dc2626', // red
];

/** A stable color for an ensemble: its own color, or a palette pick by order. */
export function ensembleColor(e?: Pick<Ensemble, 'color' | 'order'>): string {
  if (!e) return '#64748b';
  if (e.color) return e.color;
  const idx = ((e.order ?? 1) - 1) % PALETTE.length;
  return PALETTE[(idx + PALETTE.length) % PALETTE.length];
}

export const ENSEMBLE_PALETTE = PALETTE;

/** True if a scheduled item (Assignment/LibraryDocument) should show now —
 *  no publishAt set, or its publish moment has already passed. Mirrors the
 *  announcement scheduling gate (visibleAnnouncements in useAnnouncements.ts). */
export function isPublished(item: { publishAt?: number }, now: number = Date.now()): boolean {
  return !item.publishAt || item.publishAt <= now;
}

/**
 * An ensemble's display name, null-safe.
 *
 * Kept as a function after the per-record Spanish names were removed: every
 * caller already routes through it, so if a name ever needs decorating again
 * there is one place to do it rather than forty call sites to find.
 */
export function ensembleDisplayName(e?: Pick<Ensemble, 'name'> | null): string {
  return e?.name ?? '';
}

// ── Event type display ──────────────────────────────────────────────

// 'Class' sits next to Rehearsal — both are roll-taking meetings of an
// ensemble/section — with Concert/Event (no roll) after.
export const EVENT_TYPES: EventType[] = ['Rehearsal', 'Class', 'Sectional', 'Concert', 'Event'];

export const EVENT_TYPE_ICON: Record<EventType, string> = {
  Rehearsal: '🎵',
  Class: '📚',
  Concert: '🎭',
  Sectional: '🎻',
  Event: '📌',
};

/**
 * Event types the director takes roll for. A class meets on a schedule and its
 * attendance matters exactly like a rehearsal or sectional, so it counts here;
 * concerts and one-off events do not. Centralized so every attendance surface
 * agrees on what "a rehearsal day" means.
 */
export function takesAttendance(type: EventType): boolean {
  return type === 'Rehearsal' || type === 'Sectional' || type === 'Class';
}

// ── Repertoire helpers ─────────────────────────────────────────────────

/**
 * Find the part link matching a student's instrument. An exact name match wins;
 * otherwise names may contain each other ("Trumpet in B♭" ↔ "Trumpet") — but
 * never across DIFFERENT part numbers, so a Violin II student is never handed
 * the Violin I part just because the names overlap.
 */
export function findPartForInstrument(
  piece: Pick<RepertoirePiece, 'partsLinks'>,
  instrument?: string,
): PiecePartLink | undefined {
  if (!instrument) return undefined;
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const NUM: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, '1': 1, '2': 2, '3': 3, '4': 4 };
  /** "violin ii" → 2, "2nd violin" → 2, "viola" → null. */
  const partNo = (s: string): number | null => {
    const suffix = s.match(/\b(i{1,3}|iv|[1-4])(?:st|nd|rd|th)?$/);
    if (suffix) return NUM[suffix[1]] ?? null;
    const prefix = s.match(/^([1-4])(?:st|nd|rd|th)?\b/);
    return prefix ? NUM[prefix[1]] ?? null : null;
  };
  const baseOf = (s: string) =>
    s.replace(/\s*\b(i{1,3}|iv|[1-4])(?:st|nd|rd|th)?$/, '').replace(/^([1-4])(?:st|nd|rd|th)?\s+/, '').trim() || s;

  const instr = norm(instrument);
  const links = piece.partsLinks ?? [];
  const exact = links.find(l => norm(l.instrument) === instr);
  if (exact) return exact;

  const iNo = partNo(instr);
  const iBase = baseOf(instr);
  return links.find(l => {
    const li = norm(l.instrument);
    const lBase = baseOf(li);
    if (!(lBase.includes(iBase) || iBase.includes(lBase))) return false;
    const lNo = partNo(li);
    return lNo === null || iNo === null || lNo === iNo;
  });
}

/** One emoji per assignment type — shared so every list renders them alike. */
export function assignmentEmoji(type: string): string {
  return type === 'Playing Exam' ? '🎯'
    : type === 'Written Test' ? '📝'
    : type === 'Performance' ? '🎭'
    : '📌';
}

/** Sum movement durations, falling back to the piece's overall duration. */
export function pieceDuration(piece: Pick<RepertoirePiece, 'duration' | 'movements'>): number {
  const fromMovements = (piece.movements ?? []).reduce((s, m) => s + (m.duration ?? 0), 0);
  return piece.duration ?? fromMovements;
}

/**
 * The movements of `piece` actually performed on `event`, in the piece's own
 * order. Absent `pieceMovements[piece.id]` = the whole work; an explicit `[]`
 * = none (director cleared "All movements"); otherwise the named indices.
 * A stored index that no longer exists (a movement was deleted) is skipped.
 */
export function eventPieceMovements(
  event: Pick<CalendarEvent, 'pieceMovements'>,
  piece: Pick<RepertoirePiece, 'id' | 'movements'>,
): PieceMovement[] {
  const all = piece.movements ?? [];
  if (!Object.prototype.hasOwnProperty.call(event.pieceMovements ?? {}, piece.id)) return all;
  const sel = event.pieceMovements![piece.id] ?? [];
  return [...sel]
    .filter(i => i >= 0 && i < all.length)
    .sort((a, b) => a - b)
    .map(i => all[i]);
}

/** True when `event` does not perform every movement of `piece` (subset or none). */
export function eventRestrictsMovements(
  event: Pick<CalendarEvent, 'pieceMovements'>,
  piece: Pick<RepertoirePiece, 'id' | 'movements'>,
): boolean {
  const all = piece.movements ?? [];
  if (all.length === 0) return false;
  if (!Object.prototype.hasOwnProperty.call(event.pieceMovements ?? {}, piece.id)) return false;
  const sel = event.pieceMovements![piece.id] ?? [];
  const valid = sel.filter(i => i >= 0 && i < all.length);
  return valid.length < all.length;
}

/**
 * Duration of `piece` as programmed on `event`: the sum of the selected
 * movements' durations when the event performs a subset (and those movements
 * carry durations), otherwise the piece's normal full-work duration.
 */
export function eventPieceDuration(
  event: Pick<CalendarEvent, 'pieceMovements'>,
  piece: Pick<RepertoirePiece, 'id' | 'duration' | 'movements'>,
): number {
  if (eventRestrictsMovements(event, piece)) {
    const sum = eventPieceMovements(event, piece).reduce((s, m) => s + (m.duration ?? 0), 0);
    if (sum > 0) return sum;
  }
  return pieceDuration(piece);
}

/** "15:00" + 50 → "15:50" (clamped to the same day). */
export function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return time;
  const total = Math.min(h * 60 + m + minutes, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Reliable "find it" links built from composer + title. AI models hallucinate
 * exact IMSLP/YouTube URLs, so instead of storing a guessed deep link we store
 * a SEARCH url that always resolves to real results the user can pick from.
 */
export function imslpSearchUrl(composer: string | undefined, title: string): string {
  const q = [composer, title].filter(Boolean).join(' ');
  return `https://imslp.org/index.php?title=Special:Search&search=${encodeURIComponent(q)}&fulltext=Search`;
}
export function youtubeSearchUrl(composer: string | undefined, title: string): string {
  const q = [composer, title].filter(Boolean).join(' ');
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
}

/** Does this assignment target the given student (via ensemble or individually)? */
export function studentHasAssignment(
  a: { ensembleIds: string[]; studentIds?: string[] },
  studentId: string,
  studentEnsembleIds: string[] | undefined,
): boolean {
  if ((a.studentIds ?? []).includes(studentId)) return true;
  return a.ensembleIds.some(id => (studentEnsembleIds ?? []).includes(id));
}

// ── Seating sections (shared by the seating editor and the printed program's
//    roster pages — kept here, not in a component file, so public/shared code
//    can import it without dragging director UI into that bundle) ──────────

/** Section key for seating. Keeps Violin 1 vs Violin 2 distinct: the roster
 *  stores instrument as plain "Violin", so honor a part recorded in the
 *  student's `section` ("Violin 1" / "1" / "II"). Instruments already stored as
 *  "Violin I" / "Violin II" split on their own via scoreOrderRank (400 vs 402).
 *  Non-numeric section roles (e.g. "First Chair") never trigger a split. */
export function seatingSectionKey(s: Student): string {
  const instr = (s.instrument || 'Other').trim();
  if (/^violins?$/i.test(instr) && s.section) {
    if (/\b(2|ii)\b/i.test(s.section)) return 'Violin 2';
    if (/\b(1|i)\b/i.test(s.section)) return 'Violin 1';
  }
  return instr;
}

export function buildSections(roster: Student[]): SeatingChart['sections'] {
  const byInstr = new Map<string, Student[]>();
  for (const s of roster) {
    const key = seatingSectionKey(s);
    if (!byInstr.has(key)) byInstr.set(key, []);
    byInstr.get(key)!.push(s);
  }
  return [...byInstr.entries()]
    .sort((a, b) => scoreOrderRank(a[0]) - scoreOrderRank(b[0]) || a[0].localeCompare(b[0]))
    .map(([section, list]) => ({
      section,
      seats: list.sort((a, b) => lastName(a.name).localeCompare(lastName(b.name))).map(s => ({ studentId: s.id })),
    }));
}
