/**
 * Hub 2.0 look (#hub2-look) — the org config's `hub2` block as CSS.
 *
 * Pure and import-free (types only), so the self-check can run it under Node.
 * Every rule is scoped under `[data-hub2="on"]`: with the preview off nothing
 * here matches, which is the whole "flag off means nothing changes" promise.
 * src/shared/hub2.css maps the existing --pub-* / --dir-* tokens onto these.
 *
 * The public site's theme lives on <html> (data-pub-theme) and the staff
 * shell's on .dir-app (data-dir-theme), independently — a director can run
 * the panel light while the public pages are dark — so each shell gets its
 * own light and dark blocks.
 */
import type { Hub2Look, Hub2Palette } from '../org/types';

/** The <html> attribute the boot script and the preview switch set. */
export const HUB2_ATTR = 'data-hub2';

/** Selectors, one place: html for the public site, .dir-app for the staff shell. */
export const HUB2_SCOPE = {
  pub: ':root[data-hub2="on"]',
  pubDark: ":root[data-hub2=\"on\"][data-pub-theme='dark']",
  dir: '[data-hub2="on"] .dir-app',
  dirDark: '[data-hub2="on"] .dir-app[data-dir-theme="dark"]',
} as const;

const PALETTE_VARS: Record<keyof Hub2Palette, string> = {
  bg: '--hub2-bg',
  surface: '--hub2-surface',
  ink: '--hub2-ink',
  muted: '--hub2-muted',
  line: '--hub2-line',
  accent: '--hub2-accent',
  plum: '--hub2-plum',
  sun: '--hub2-sun',
  accentFill: '--hub2-accent-fill',
  plumText: '--hub2-plum-text',
  sunInk: '--hub2-ink-on-sun',
};

function palette(p: Hub2Palette): string[] {
  return (Object.keys(PALETTE_VARS) as (keyof Hub2Palette)[])
    .filter(k => p[k] !== undefined)
    .map(k => `${PALETTE_VARS[k]}:${p[k]};`);
}

/** The custom properties for one org's look. Empty string when it has none. */
export function hub2TokenCss(look: Hub2Look | undefined): string {
  if (!look) return '';
  const shared = [
    `--hub2-radius-card:${look.radius.card};`,
    `--hub2-radius-row:${look.radius.row};`,
    `--hub2-shadow:${look.shadow};`,
    `--hub2-hall-gold:${look.concertHall.gold};`,
    `--hub2-spot-bg:${look.spotlight.bg};`,
    `--hub2-spot-surface:${look.spotlight.surface};`,
    `--hub2-spot-ink:${look.spotlight.ink};`,
    `--hub2-spot-gold:${look.spotlight.gold};`,
    `--hub2-spot-teal-glow:${look.spotlight.tealGlow};`,
    `--hub2-spot-plum-glow:${look.spotlight.plumGlow};`,
    `--hub2-font-body:${look.fonts.body};`,
    `--hub2-font-title:${look.fonts.title};`,
    `--hub2-font-spot-display:${look.fonts.spotlightDisplay};`,
    `--hub2-font-spot-body:${look.fonts.spotlightBody};`,
  ];
  const light = [...palette(look.light), ...shared].join('');
  const dark = palette(look.dark).join('');
  return `${HUB2_SCOPE.pub},${HUB2_SCOPE.dir}{${light}}`
    + `${HUB2_SCOPE.pubDark},${HUB2_SCOPE.dirDark}{${dark}}`;
}
