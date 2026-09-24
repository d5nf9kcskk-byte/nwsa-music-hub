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
 * color (inkOn), header colors must all carry white text, and a background
 * tint may never read worse than the stock page background.
 *
 * No ORG import on purpose: the self-check runs this under plain Node.
 */
import { useSyncExternalStore } from 'react';
import type { OrgConfig } from '../org/types';

export type LookPalette = NonNullable<OrgConfig['personalize']>;

/** Background patterns — org-neutral, drawn by look.css in the page's own tokens. */
export const PATTERNS = ['staff', 'dots'] as const;

/** Each key is an id from the palette; absent = Default. */
export interface Look { header?: string; side?: string; bg?: string }

const KEY = 'pub.look';
/** The two text colors a menu color can carry: white, or the stock ink. */
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

let baseThemeColor: string | null | undefined;

export function applyLook(look: Look, p: LookPalette): void {
  const root = document.documentElement;
  const header = p.header.find(s => s.id === look.header);
  const side = p.sidebar.find(s => s.id === look.side);
  const tint = p.background.find(s => s.id === look.bg);
  const pattern = PATTERNS.find(x => x === look.bg);

  const attrs: Record<string, string | undefined> = {
    'data-pub-look-header': header && 'on',
    'data-pub-look-side': side && 'on',
    'data-pub-look-bg': tint ? 'tint' : pattern,
  };
  for (const [k, v] of Object.entries(attrs)) {
    if (v) root.setAttribute(k, v); else root.removeAttribute(k);
  }
  const ink = side && parseInt(inkOn(side.color).slice(1), 16);
  const vars: Record<string, string | undefined> = {
    '--look-header': header?.color,
    '--look-side': side?.color,
    // space-separated channels so look.css can derive translucent shades
    '--look-side-ink': ink === undefined ? undefined : `${ink >> 16} ${(ink >> 8) & 255} ${ink & 255}`,
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
const listeners = new Set<() => void>();

/** Read the saved choice and apply it. No-op when the org offers no palette. */
export function initLook(p: LookPalette | undefined): void {
  palette = p;
  if (!p) return;
  let raw: string | null = null;
  try { raw = localStorage.getItem(KEY); } catch { /* private mode */ }
  current = parseLook(raw, p);
  applyLook(current, p);
}

/** Apply and remember. `{}` is Reset to Default. */
export function setLook(next: Look): void {
  if (!palette) return;
  current = Object.fromEntries(Object.entries(next).filter(([, v]) => v)) as Look;
  try {
    if (Object.keys(current).length) localStorage.setItem(KEY, JSON.stringify(current));
    else localStorage.removeItem(KEY);
  } catch { /* private mode — the choice still applies for this page */ }
  applyLook(current, palette);
  listeners.forEach(l => l());
}

export function useLook(): Look {
  return useSyncExternalStore(
    l => { listeners.add(l); return () => listeners.delete(l); },
    () => current,
    () => current,
  );
}
