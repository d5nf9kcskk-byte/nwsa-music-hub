import type { Ensemble, EventType, RepertoirePiece, PiecePartLink } from './types';

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

// ── Ensemble colors ─────────────────────────────────────────────────────

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

export const EVENT_TYPES: EventType[] = ['Rehearsal', 'Concert', 'Sectional', 'Event'];

export const EVENT_TYPE_ICON: Record<EventType, string> = {
  Rehearsal: '🎵',
  Concert: '🎭',
  Sectional: '🎻',
  Event: '📌',
};

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
