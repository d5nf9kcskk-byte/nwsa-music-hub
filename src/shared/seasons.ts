/**
 * Seasonal looks (#seasons): a complete, matched look — top bar, menu, page
 * tint and a music-themed pattern — that dresses the site for a stretch of
 * the year and then retires on its own. Configured per org in
 * `personalize.seasons` (config/orgs/*.json); absent = no seasons.
 *
 * Director's calls (2026-10-01): seasons and secular celebrations only, never
 * a religious holiday; ON by default for everyone; one tap turns it off and
 * puts the person's own setup back; when the season ends their own setup
 * comes back by itself. Applies to the public site AND every staff shell.
 *
 * How "back the way it was" is guaranteed: a season NEVER writes over anybody's
 * saved colors. It paints on top while it is on; turning it off, or the season
 * ending, simply stops painting. The only thing stored is which season
 * INSTANCE a person turned off (`<id>:<start date>`), per side — so next
 * year's Autumn comes back on, and a new season arriving comes back on.
 *
 * The list order in the config IS the priority: the first season whose window
 * holds today wins, so a short one (Danse Macabre) listed above a long one
 * (Autumn Leaves) takes over for its two weeks and then hands back.
 *
 * Dates are 'MM-DD', or 'easter' / 'thanksgiving' (they move every year). A
 * window whose end comes before its start runs across New Year.
 *
 * No ORG import on purpose: seasons.selfcheck.ts runs this under plain Node.
 */
import { useSyncExternalStore } from 'react';
import type { LookSeason } from '../org/types';

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** Western Easter Sunday (the anonymous Gregorian computus), as YYYY-MM-DD. */
export function easter(y: number): string {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  return iso(y, month, ((h + l - 7 * m + 114) % 31) + 1);
}

/** US Thanksgiving: the fourth Thursday of November, as YYYY-MM-DD. */
export function thanksgiving(y: number): string {
  const nov1 = new Date(Date.UTC(y, 10, 1)).getUTCDay(); // 0 = Sunday
  return iso(y, 11, 1 + ((4 - nov1 + 7) % 7) + 21);
}

/** One date token ('MM-DD' | 'easter' | 'thanksgiving') in year `y`. */
export function seasonDate(token: string, y: number): string {
  if (token === 'easter') return easter(y);
  if (token === 'thanksgiving') return thanksgiving(y);
  if (!/^\d{2}-\d{2}$/.test(token)) throw new Error(`bad season date "${token}"`);
  return `${y}-${token}`;
}

export interface SeasonPick {
  season: LookSeason;
  /** This year's instance, `<id>:<start>` — what "turned off" remembers. */
  key: string;
  /** Its last day, YYYY-MM-DD. */
  until: string;
}

/** This year's window for `season`, as [from, to] YYYY-MM-DD, starting in `y`. */
function windowFrom(season: LookSeason, y: number): [string, string] {
  const from = seasonDate(season.from, y);
  const to = seasonDate(season.to, y);
  return [from, to < from ? seasonDate(season.to, y + 1) : to];
}

/** The season in effect on `today` (YYYY-MM-DD), or null between seasons. */
export function seasonAt(seasons: LookSeason[] | undefined, today: string): SeasonPick | null {
  const y = Number(today.slice(0, 4));
  for (const season of seasons ?? []) {
    for (const start of [y - 1, y]) {
      const [from, to] = windowFrom(season, start);
      if (from <= today && today <= to) return { season, key: `${season.id}:${from}`, until: to };
    }
  }
  return null;
}

/** Today, on this device's clock, as YYYY-MM-DD. */
export function localToday(): string {
  const d = new Date();
  return iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/**
 * The season for this page load. `?season=<id>` previews one out of its
 * dates (for checking a look before it arrives); anything else is the clock.
 * ponytail: computed once per load — a tab left open across a boundary
 * midnight switches on its next load, not at midnight.
 */
export function currentSeason(seasons: LookSeason[] | undefined): SeasonPick | null {
  let forced: string | null = null;
  try { forced = new URLSearchParams(location.search).get('season'); } catch { /* no location (Node) */ }
  const preview = forced && seasons?.find(s => s.id === forced);
  if (preview) {
    return { season: preview, key: `${preview.id}:preview`, until: windowFrom(preview, Number(localToday().slice(0, 4)))[1] };
  }
  return seasonAt(seasons, localToday());
}

// ── On / off, per side, per device ──────────────────────────────────────────

export type SeasonSide = 'pub' | 'dir';
const offKey = (side: SeasonSide) => `${side}.season.off`;
const listeners = new Set<() => void>();
let version = 0;

export function seasonIsOn(side: SeasonSide, pick: SeasonPick | null): boolean {
  if (!pick) return false;
  try { return localStorage.getItem(offKey(side)) !== pick.key; } catch { return true; }
}

export function setSeasonOn(side: SeasonSide, pick: SeasonPick, on: boolean): void {
  try {
    if (on) localStorage.removeItem(offKey(side));
    else localStorage.setItem(offKey(side), pick.key);
  } catch { /* private mode — it still applies for this page */ }
  version++;
  listeners.forEach(l => l());
}

/** Re-render when either side's on/off changes. */
export function useSeasonVersion(): number {
  return useSyncExternalStore(
    l => { listeners.add(l); return () => listeners.delete(l); },
    () => version,
    () => version,
  );
}

// ── The staff side ──────────────────────────────────────────────────────────
// The public side paints a season through look.ts (it shares the machinery
// with a student's own colors). The staff shells have no personal colors, so
// this is all they need: attributes + values on <html> that seasons.css reads,
// scoped to `.dir-app`.

let dirPick: SeasonPick | null = null;

function paintDir(): void {
  const root = document.documentElement;
  const s = seasonIsOn('dir', dirPick) ? dirPick!.season : null;
  if (s) root.setAttribute('data-dir-season', s.pattern); else root.removeAttribute('data-dir-season');
  const vars: Record<string, string | undefined> = {
    '--dir-season-header': s?.header.color,
    '--dir-season-side': s?.side.color,
    '--dir-season-side-ink': s ? channels(inkOnSwatch(s.side)) : undefined,
    '--dir-season-light': s?.light,
    '--dir-season-dark': s?.dark,
  };
  for (const [k, v] of Object.entries(vars)) {
    if (v) root.style.setProperty(k, v); else root.style.removeProperty(k);
  }
}

export function initDirSeason(seasons: LookSeason[] | undefined): void {
  dirPick = currentSeason(seasons);
  paintDir();
}

export function dirSeason(): SeasonPick | null { return dirPick; }

export function setDirSeasonOn(on: boolean): void {
  if (!dirPick) return;
  setSeasonOn('dir', dirPick, on);
  paintDir();
}

// ── Color helpers shared with look.ts ───────────────────────────────────────

/** The two text colors a surface can carry: white, or the stock ink. */
export const LIGHT_INK = '#ffffff';
export const DARK_INK = '#18212f';

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two #rrggbb colors (1–21). */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The text color that reads best on `bg`. */
export function inkOn(bg: string): string {
  return contrast(LIGHT_INK, bg) >= contrast(DARK_INK, bg) ? LIGHT_INK : DARK_INK;
}

/** What words and icons on a swatch are drawn in: its neon, else inkOn. */
export function inkOnSwatch(s: { color: string; neon?: string }): string {
  return s.neon ?? inkOn(s.color);
}

/** '#3cf2ff' → '60 242 255', so CSS can derive translucent shades. */
export function channels(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${n >> 16} ${(n >> 8) & 255} ${n & 255}`;
}
