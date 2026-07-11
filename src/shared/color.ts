/**
 * Color math for data-driven surfaces (redesign Phase 0).
 *
 * Ensemble colors are director-set arbitrary hex values, so any surface that
 * paints text over them (gradient heroes, tiles, chips) must COMPUTE its ink
 * color — the app has already shipped one hand-tuned contrast correction
 * (--pub-gold-text) and these helpers generalize that lesson. Pure functions,
 * no DOM: safe for both surfaces and for unit checks.
 */

/** Parse #rgb / #rrggbb to [r,g,b] 0-255. Returns null for anything else. */
export function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** WCAG relative luminance (0 = black, 1 = white). */
export function relativeLuminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map(v => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colors (1..21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export interface InkChoice {
  /** The ink to use over the background(s). */
  color: '#ffffff' | '#18212f';
  /**
   * True when neither black nor white ink reaches 4.5:1 against every
   * provided background — the caller must add a scrim/overlay behind the
   * text (or use the provided scrim suggestion) rather than ship it.
   */
  needsScrim: boolean;
  /** Worst-case ratio achieved by the chosen ink across all backgrounds. */
  ratio: number;
}

/**
 * Choose readable ink for text rendered over one or more backgrounds —
 * for a gradient, pass EVERY stop: the ink must pass against the worst one.
 * AA normal text is the bar (4.5:1).
 */
export function inkOn(...backgrounds: string[]): InkChoice {
  const white = Math.min(...backgrounds.map(b => contrastRatio('#ffffff', b)));
  const dark = Math.min(...backgrounds.map(b => contrastRatio('#18212f', b)));
  const useWhite = white >= dark;
  const ratio = useWhite ? white : dark;
  return { color: useWhite ? '#ffffff' : '#18212f', needsScrim: ratio < 4.5, ratio };
}

/** Clamp helper. */
function clamp01(v: number): number { return Math.min(1, Math.max(0, v)); }

/** Mix a hex color toward black (amount 0..1). */
export function darken(hex: string, amount: number): string {
  const rgb = parseHex(hex) ?? [0, 0, 0];
  const f = 1 - clamp01(amount);
  const [r, g, b] = rgb.map(v => Math.round(v * f));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/**
 * Deterministic two-stop gradient for an ensemble's generated "cover art".
 * The second stop is a seeded darkening of the base color, so two ensembles
 * sharing a hue still differ structurally, and the same ensemble renders
 * identically everywhere, forever (no randomness — resume-safe, memory-safe).
 */
export function ensembleGradientStops(hex: string, seedText: string): [string, string] {
  let h = 0;
  for (let i = 0; i < seedText.length; i++) h = (h * 31 + seedText.charCodeAt(i)) >>> 0;
  const amount = 0.28 + (h % 5) * 0.05; // 0.28..0.48, stable per ensemble id
  return [hex, darken(hex, amount)];
}
