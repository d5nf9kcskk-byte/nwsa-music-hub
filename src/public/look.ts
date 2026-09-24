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
 * stock page background, and a personal photo is veiled so heavily that text
 * over its darkest (or, in dark mode, brightest) pixel still passes AA.
 *
 * A personal photo NEVER leaves the device: it is shrunk in a canvas and kept
 * in localStorage (`pub.look.photo`) — no Firestore, no Storage, no upload of
 * any kind. Many students are minors and this site is public. Reset deletes it.
 *
 * No ORG import on purpose: the self-check runs this under plain Node.
 */
import { useSyncExternalStore } from 'react';
import type { LookSwatch, OrgConfig } from '../org/types';

export type LookPalette = NonNullable<OrgConfig['personalize']>;

/** Background patterns — org-neutral, drawn by look.css in the page's own tokens. */
export const PATTERNS = ['staff', 'dots'] as const;

/** The background id for the student's own photo. */
export const PHOTO = 'photo';

/** Each key is an id from the palette; absent = Default. */
export interface Look { header?: string; side?: string; bg?: string }

const KEY = 'pub.look';
const PHOTO_KEY = 'pub.look.photo';
// Long edge of the stored photo. Small on purpose: it keeps the stored copy
// ~100 KB (localStorage is ~5 MB for the whole site), and a photo stretched
// up from this is soft — detail is what would pull the eye off the page.
const PHOTO_EDGE = 800;
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

/** What words and icons on a swatch are drawn in: its neon, else inkOn. */
export function inkFor(s: LookSwatch): string {
  return s.neon ?? inkOn(s.color);
}

// '#3cf2ff' → '60 242 255', so look.css can derive translucent shades.
function channels(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${n >> 16} ${(n >> 8) & 255} ${n & 255}`;
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
  if (p.background.some(s => s.id === bg) || PATTERNS.some(x => x === bg) || bg === PHOTO) look.bg = bg as string;
  return look;
}

let baseThemeColor: string | null | undefined;

/** `photo` is the stored data URL; a Look asking for it without one is Default. */
export function applyLook(look: Look, p: LookPalette, photo: string | null = null): void {
  const root = document.documentElement;
  const header = p.header.find(s => s.id === look.header);
  const side = p.sidebar.find(s => s.id === look.side);
  const tint = p.background.find(s => s.id === look.bg);
  const pattern = PATTERNS.find(x => x === look.bg) ?? (look.bg === PHOTO && photo ? PHOTO : undefined);

  // 'glow' = a neon swatch: look.css adds the glow to its words and icons.
  const kind = (s: LookSwatch | undefined) => s && (s.neon ? 'glow' : 'on');
  const attrs: Record<string, string | undefined> = {
    'data-pub-look-header': kind(header),
    'data-pub-look-side': kind(side),
    'data-pub-look-bg': tint ? 'tint' : pattern,
  };
  for (const [k, v] of Object.entries(attrs)) {
    if (v) root.setAttribute(k, v); else root.removeAttribute(k);
  }
  const vars: Record<string, string | undefined> = {
    '--look-header': header?.color,
    '--look-header-ink': header?.neon && channels(header.neon),
    '--look-side': side?.color,
    '--look-side-ink': side && channels(inkFor(side)),
    '--look-bg-light': tint?.light,
    '--look-bg-dark': tint?.dark,
    '--look-photo': pattern === PHOTO ? `url("${photo}")` : undefined,
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
let photo: string | null = null;
const listeners = new Set<() => void>();

/** Read the saved choice and apply it. No-op when the org offers no palette. */
export function initLook(p: LookPalette | undefined): void {
  palette = p;
  if (!p) return;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
    // only ever what shrinkPhoto() writes — it lands inside a CSS url("…")
    const stored = localStorage.getItem(PHOTO_KEY);
    photo = stored && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(stored) ? stored : null;
  } catch { /* private mode */ }
  current = parseLook(raw, p);
  applyLook(current, p, photo);
}

/** Apply and remember. */
export function setLook(next: Look): void {
  if (!palette) return;
  current = Object.fromEntries(Object.entries(next).filter(([, v]) => v)) as Look;
  try {
    if (Object.keys(current).length) localStorage.setItem(KEY, JSON.stringify(current));
    else localStorage.removeItem(KEY);
  } catch { /* private mode — the choice still applies for this page */ }
  applyLook(current, palette, photo);
  listeners.forEach(l => l());
}

/** Reset to Default — and forget the photo, so a shared computer keeps nothing. */
export function resetLook(): void {
  photo = null;
  try { localStorage.removeItem(PHOTO_KEY); } catch { /* private mode */ }
  setLook({});
}

/** The stored photo (a data URL), for the sheet's preview; null when none. */
export function lookPhoto(): string | null { return photo; }

/**
 * Use a picture from this device as the background. 'bad' = not a picture
 * this browser can read; 'unsaved' = shown now, but too big to keep here.
 */
export async function choosePhoto(file: File): Promise<'ok' | 'unsaved' | 'bad'> {
  let url: string;
  try { url = await shrinkPhoto(file); } catch { return 'bad'; }
  photo = url;
  let saved = true;
  try {
    localStorage.removeItem(PHOTO_KEY); // free the old one's space first
    localStorage.setItem(PHOTO_KEY, url);
  } catch { saved = false; }
  setLook({ ...current, bg: PHOTO });
  return saved ? 'ok' : 'unsaved';
}

async function shrinkPhoto(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('not an image');
  const src = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = src;
    await img.decode();
    const k = Math.min(1, PHOTO_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * k));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * k));
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.7);
  } finally {
    URL.revokeObjectURL(src);
  }
}

export function useLook(): Look {
  return useSyncExternalStore(
    l => { listeners.add(l); return () => listeners.delete(l); },
    () => current,
    () => current,
  );
}
