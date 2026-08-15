import type { OrgConfig } from './types';

// Injected by vite.config.ts `define` from config/orgs/<VITE_ORG>.json —
// only the selected org's strings enter the bundle (an NWSA build contains
// no ASYO text and vice versa). Tests/tooling that import this outside Vite
// would throw; nothing does today.
declare const __ORG_CONFIG__: OrgConfig;

export const ORG: OrgConfig = __ORG_CONFIG__;

/**
 * Apply the org's CSS custom-property overrides. A <style> tag (not inline
 * styles on <html>) so the dark-theme token block in uiUpdates.css —
 * `:root[data-pub-theme='dark']` — keeps its higher specificity, and the
 * org's own `brandDark` block can override it in turn. No-op when both
 * maps are empty (NWSA), leaving the stock palette byte-for-byte alone.
 */
export function applyBrand(): void {
  const light = Object.entries(ORG.brand);
  const dark = Object.entries(ORG.brandDark);
  if (light.length === 0 && dark.length === 0) return;
  const decl = (pairs: [string, string][]) => pairs.map(([k, v]) => `${k}:${v};`).join('');
  const css =
    (light.length ? `:root{${decl(light)}}` : '') +
    (dark.length ? `:root[data-pub-theme='dark']{${decl(dark)}}` : '');
  const style = document.createElement('style');
  style.setAttribute('data-org-brand', ORG.orgId);
  style.textContent = css;
  document.head.appendChild(style);
}
