/**
 * "Colors & background" (#look): a student's own top bar, menu and page
 * background, picked from the org's CURATED palette (`ORG.personalize`) and
 * remembered per device, like the Light/Dark choice in theme.ts beside it.
 *
 * Stored as ids, never colors: an id the palette no longer has reads as
 * Default, so retiring a color can't strand anyone on it. Applied as
 * attributes + custom properties on <html>, which look.css turns into
 * styles — main.tsx calls initLook() before the first render, so a stored
 * choice never flashes the default first.
 *
 * Readability is enforced by construction, and pinned by look.selfcheck.ts:
 * menu text takes whichever of white or ink contrasts more with the chosen
 * color (inkOn) unless the swatch is neon, header colors must all carry white
 * (or their neon) text, a background tint may never read worse than the
 * stock page background, and a pattern's heaviest mark keeps the page's ink
 * at AA.
 *
 * A SEASON (#seasons, src/shared/seasons.ts) paints through the same
 * machinery, on top: while it is on, its colors show and the student's own
 * choice sits untouched in storage underneath. Turning it off, picking any
 * color of their own, or the season ending, puts their setup straight back.
 *
 * There is NO personal photo, on purpose (Oct 2026, director's call): the
 * backgrounds are the curated tints and patterns below and nothing else.
 *
 * No ORG import on purpose: the self-check runs this under plain Node.
 */
import { useSyncExternalStore } from 'react';
import type { LookSwatch, OrgConfig } from '../org/types';
import { channels, currentSeason, inkOnSwatch, seasonIsOn, setSeasonOn, type SeasonPick } from '../shared/seasons';

export { contrast, DARK_INK, inkOn, LIGHT_INK } from '../shared/seasons';
export type LookPalette = NonNullable<OrgConfig['personalize']>;

/** Background patterns — org-neutral, drawn by look.css in the page's own tokens. */
export const PATTERNS = ['staff', 'dots', 'keys', 'notes', 'waves', 'vinyl', 'eq'] as const;

/** Each key is an id from the palette; absent = Default. */
export interface Look { header?: string; side?: string; bg?: string }

const KEY = 'pub.look';

/** What words and icons on a swatch are drawn in: its neon, else inkOn. */
export const inkFor = (s: LookSwatch) => inkOnSwatch(s);

/** Keep only ids the palette actually offers; anything else is Default. */
export function parseLook(raw: string | null, p: LookPalette): Look {
  let v: unknown;
  try { v = JSON.parse(raw ?? '{}'); } catch { return {}; }
  if (!v || typeof v !== 'object') return {};
  const { header, side, bg } = v as Record<string, unknown>;
  const look: Look = {};
  if (p.header.some(s => s.id === header)) look.header = header as string;
  if (p.sidebar.some(s => s.id === side)) look.side = side as string;
  if (p.background.some(s => s.id === bg) || PATTERNS.some(x => x === bg)) look.bg = bg as string;
  return look;
}

/** What is actually painted: resolved colors, from a Look or from a season. */
interface Paint {
  header?: { color: string; neon?: string };
  side?: { color: string; neon?: string };
  tint?: { light: string; dark: string };
  /** One of PATTERNS (look.css). */
  pattern?: string;
  /** A season's drawing (src/shared/seasons.css). */
  seasonPattern?: string;
}

function fromLook(look: Look, p: LookPalette): Paint {
  return {
    header: p.header.find(s => s.id === look.header),
    side: p.sidebar.find(s => s.id === look.side),
    tint: p.background.find(s => s.id === look.bg),
    pattern: PATTERNS.find(x => x === look.bg),
  };
}

let baseThemeColor: string | null | undefined;

function paint({ header, side, tint, pattern, seasonPattern }: Paint): void {
  const root = document.documentElement;
  // 'glow' = a neon swatch: look.css adds the glow to its words and icons.
  const kind = (s: Paint['header']) => s && (s.neon ? 'glow' : 'on');
  const attrs: Record<string, string | undefined> = {
    'data-pub-look-header': kind(header),
    'data-pub-look-side': kind(side),
    'data-pub-look-tint': tint && 'on',
    'data-pub-look-bg': pattern,
    'data-pub-season': seasonPattern,
  };
  for (const [k, v] of Object.entries(attrs)) {
    if (v) root.setAttribute(k, v); else root.removeAttribute(k);
  }
  const vars: Record<string, string | undefined> = {
    '--look-header': header?.color,
    '--look-header-ink': header?.neon && channels(header.neon),
    '--look-side': side?.color,
    '--look-side-ink': side && channels(inkOnSwatch(side)),
    '--look-bg-light': tint?.light,
    '--look-bg-dark': tint?.dark,
  };
  for (const [k, v] of Object.entries(vars)) {
    if (v) root.style.setProperty(k, v); else root.style.removeProperty(k);
  }

  // The phone's status bar / address bar should match the header under it.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    if (baseThemeColor === undefined) baseThemeColor = meta.getAttribute('content');
    meta.setAttribute('content', header?.color ?? baseThemeColor ?? '');
  }
}

let palette: LookPalette | undefined;
let current: Look = {};
let season: SeasonPick | null = null;
let state: { look: Look; season: SeasonPick | null; seasonOn: boolean } = { look: current, season, seasonOn: false };
const listeners = new Set<() => void>();

function refresh(): void {
  if (!palette) return;
  const on = seasonIsOn('pub', season);
  const s = on ? season!.season : null;
  paint(s ? { header: s.header, side: s.side, tint: s, seasonPattern: s.pattern } : fromLook(current, palette));
  state = { look: current, season, seasonOn: on };
  listeners.forEach(l => l());
}

/** Read the saved choice and today's season, and apply. No-op without a palette. */
export function initLook(p: LookPalette | undefined): void {
  palette = p;
  if (!p) return;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
    // the retired personal photo (Sept 2026): free its space on this device
    localStorage.removeItem('pub.look.photo');
  } catch { /* private mode */ }
  current = parseLook(raw, p);
  season = currentSeason(p.seasons);
  refresh();
}

/** Apply and remember. Choosing your own colors turns the season off. */
export function setLook(next: Look): void {
  if (!palette) return;
  current = Object.fromEntries(Object.entries(next).filter(([, v]) => v)) as Look;
  try {
    if (Object.keys(current).length) localStorage.setItem(KEY, JSON.stringify(current));
    else localStorage.removeItem(KEY);
  } catch { /* private mode — the choice still applies for this page */ }
  if (season && seasonIsOn('pub', season)) setSeasonOn('pub', season, false);
  refresh();
}

/** Reset to Default. */
export function resetLook(): void { setLook({}); }

/** The season's look on or off for this device; off puts the student's own setup back. */
export function setPubSeasonOn(on: boolean): void {
  if (!season) return;
  setSeasonOn('pub', season, on);
  refresh();
}

export function useLook(): typeof state {
  return useSyncExternalStore(
    l => { listeners.add(l); return () => listeners.delete(l); },
    () => state,
    () => state,
  );
}
