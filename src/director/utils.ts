import type { Ensemble, EventType } from './types';

// ── Date helpers (work in local time, store as YYYY-MM-DD) ──────────────────

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

// ── Ensemble colors ─────────────────────────────────────────────────────────

const PALETTE = [
  '#2563eb', // blue
  '#16a34a', // green
  '#9333ea', // purple
  '#ea580c', // orange
  '#0891b2', // cyan
  '#db2777', // pink
  '#ca8a04', // gold
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

// ── Event type display ──────────────────────────────────────────────────────

export const EVENT_TYPES: EventType[] = ['Rehearsal', 'Concert', 'Sectional', 'Event'];

export const EVENT_TYPE_ICON: Record<EventType, string> = {
  Rehearsal: '🎵',
  Concert: '🎭',
  Sectional: '🎻',
  Event: '📌',
};
