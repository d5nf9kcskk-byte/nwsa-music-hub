import type { OrgConfig } from './types';

// Injected by vite.config.ts `define` from config/orgs/<VITE_ORG>.json —
// only the selected org's strings enter the bundle (an NWSA build contains
// no ASYO text and vice versa). Tests/tooling that import this outside Vite
// would throw; scripts/vite-defines-shim.mjs supplies it for the self-checks
// that do (wired into deploy.yml).
declare const __ORG_CONFIG__: OrgConfig;

export const ORG: OrgConfig = __ORG_CONFIG__;

/**
 * Does this deployment have Cloud Functions behind it? Today only the
 * school's project does. The demo and adult projects have none, so a feature
 * a function has to finish (a phone alert is SENT by one) would be offered,
 * switched on, and then never arrive. Entry points to those features ask
 * here, and do not render where the answer is no.
 *
 * `googleConfirm` currently stands for "this project has Cloud Functions":
 * it is the one feature flag that is true exactly where they are deployed.
 */
// ponytail: one flag stands for server functions until a second server feature needs its own
export function hasServerFunctions(): boolean {
  return ORG.features.googleConfirm;
}

/**
 * Apply the org's CSS custom-property overrides and self-hosted @font-face
 * files. A <style> tag (not inline styles on <html>) so the dark-theme
 * token block in uiUpdates.css — `:root[data-pub-theme='dark']` — keeps its
 * higher specificity, and the org's own `brandDark` block can override it
 * in turn. No-op when brand, brandDark, and fonts are all empty (NWSA),
 * leaving the stock palette and font stack byte-for-byte alone.
 */
export function applyBrand(): void {
  const light = Object.entries(ORG.brand);
  const dark = Object.entries(ORG.brandDark);
  if (light.length === 0 && dark.length === 0 && ORG.fonts.length === 0) return;
  const decl = (pairs: [string, string][]) => pairs.map(([k, v]) => `${k}:${v};`).join('');
  const fontFaces = ORG.fonts
    .map(f => `@font-face{font-family:'${f.family}';font-weight:${f.weight};`
      + `font-style:normal;font-display:swap;`
      + `src:url('${import.meta.env.BASE_URL}${f.file}') format('woff2');}`)
    .join('');
  const css =
    fontFaces +
    (light.length ? `:root{${decl(light)}}` : '') +
    (dark.length ? `:root[data-pub-theme='dark']{${decl(dark)}}` : '');
  const style = document.createElement('style');
  style.setAttribute('data-org-brand', ORG.orgId);
  style.textContent = css;
  document.head.appendChild(style);
}
