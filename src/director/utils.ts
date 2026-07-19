import type { Ensemble, EventType, RepertoirePiece, PiecePartLink, PieceMovement, CalendarEvent } from './types';

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
  return parseDate(s).toLocaleDateString('en-US', opts ?? {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

/** "15:30" → "3:30 PM". Empty input returns "". */
export function formatTime(t?: string): string {
  if (!t) return '';
  const [hStr, mStr] = t.split(':');
  let h = Number(hStr);
  const m = mStr ?? '00';
  const ampm = h >= 12 ? 'PM' : 'AM';
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
export const TIME_BLOCKS = [
  { label: 'Block 1 · 1:10–2:25', start: '13:10', end: '14:25' },
  { label: 'Block 2 · 2:30–3:45', start: '14:30', end: '15:45' },
] as const;

// ── Music ensembles vs divisions ────────────────────────────────────────────
// Dance / Theater / Visual Arts are school "divisions" — calendar labels only,
// never selectable ensembles. Guard by name so a stray division can't surface
// in an ensemble picker or filter (mirrors the recovered app's migration guard).
const DIVISION_NAMES = new Set(['dance', 'theater', 'theatre', 'visual arts', 'visual']);

export function isDivision(e: Pick<Ensemble, 'name'>): boolean {
  return DIVISION_NAMES.has(e.name.trim().toLowerCase());
}

/** Filter an ensemble-like list down to music ensembles only. */
export function musicEnsembles<T extends Pick<Ensemble, 'name'>>(list: T[]): T[] {
  return list.filter(e => !isDivision(e));
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
 * order. If the event restricts the selection (`event.pieceMovements[piece.id]`
 * names a subset), only those movements are returned; otherwise the whole work.
 * A stored index that no longer exists (a movement was deleted) is skipped.
 */
export function eventPieceMovements(
  event: Pick<CalendarEvent, 'pieceMovements'>,
  piece: Pick<RepertoirePiece, 'id' | 'movements'>,
): PieceMovement[] {
  const all = piece.movements ?? [];
  const sel = event.pieceMovements?.[piece.id];
  if (!sel || sel.length === 0) return all;
  return [...sel]
    .filter(i => i >= 0 && i < all.length)
    .sort((a, b) => a - b)
    .map(i => all[i]);
}

/** True when `event` performs only a strict subset of `piece`'s movements. */
export function eventRestrictsMovements(
  event: Pick<CalendarEvent, 'pieceMovements'>,
  piece: Pick<RepertoirePiece, 'id' | 'movements'>,
): boolean {
  const all = piece.movements ?? [];
  const sel = event.pieceMovements?.[piece.id];
  if (!sel || sel.length === 0 || all.length === 0) return false;
  const valid = sel.filter(i => i >= 0 && i < all.length);
  return valid.length > 0 && valid.length < all.length;
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
