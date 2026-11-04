/**
 * Hub 2.0 preview switch (#hub2-look) — the ONE reader and writer of the
 * on-device flag.
 *
 * The owner turns it on from the director menu (Hub2PreviewToggle, owner role
 * only). It is per DEVICE, in localStorage, and it covers the public pages on
 * that device too, since they share the origin. There is deliberately no URL
 * parameter: a preview must not be shareable.
 *
 * index.html's boot script reads the same key and sets data-hub2="on" on
 * <html> before first paint; initHub2() then injects the org's tokens and
 * starts the font download. An org with no `hub2` config takes the attribute
 * back off, so its preview shows the stock look.
 *
 * `hub2.forEveryone` in the org config turns the look on for EVERY visitor:
 * the boot script gets it as a literal at build time, hub2PreviewOn() answers
 * true, and the owner's toggle hides itself. Still never from the URL.
 */
import { ORG } from '../org';
import { HUB2_ATTR, hub2TokenCss } from './hub2Tokens';

/** localStorage key. index.html's inline boot script spells it too. */
export const HUB2_PREVIEW_KEY = 'hub2.preview';

/** Whether this org has a Hub 2.0 look to preview at all. */
export function hub2Available(): boolean {
  return !!ORG.hub2;
}

/** The look is on for every visitor (`hub2.forEveryone` in the org config). */
export function hub2ForEveryone(): boolean {
  return ORG.hub2?.forEveryone === true;
}

/** On for everyone, or this device's stored preview choice. */
export function hub2PreviewOn(): boolean {
  if (hub2ForEveryone()) return true;
  try { return localStorage.getItem(HUB2_PREVIEW_KEY) === 'on'; } catch { return false; }
}

let tokensInjected = false;
let fontsRequested = false;

function apply(on: boolean): void {
  const root = document.documentElement;
  if (!on || !hub2Available()) {
    root.removeAttribute(HUB2_ATTR);
    return;
  }
  if (!tokensInjected) {
    tokensInjected = true;
    const style = document.createElement('style');
    style.setAttribute('data-hub2-tokens', ORG.orgId);
    style.textContent = hub2TokenCss(ORG.hub2);
    document.head.appendChild(style);
  }
  if (!fontsRequested) {
    fontsRequested = true;
    // A failed chunk load (offline, first visit) just leaves the fallback stack.
    import('./hub2Fonts').catch(() => { fontsRequested = false; });
  }
  root.setAttribute(HUB2_ATTR, 'on');
}

/** Boot: match the page to the stored flag. Called once from main.tsx. */
export function initHub2(): void {
  apply(hub2PreviewOn());
}

/** The switch. Writes the flag and re-themes this tab at once. */
export function setHub2Preview(on: boolean): void {
  try {
    if (on) localStorage.setItem(HUB2_PREVIEW_KEY, 'on');
    else localStorage.removeItem(HUB2_PREVIEW_KEY);
  } catch { /* private mode: this tab only */ }
  apply(on);
}
