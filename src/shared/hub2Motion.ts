/**
 * Motion for the Hub 2.0 look (#hub2-motion, #hub2-alive): the parts CSS
 * cannot do by itself.
 *
 * THE PAGE MORPH. Every <Link>, <NavLink> and navigate() in both shells goes
 * through `router.navigate`, so this hooks once, here, instead of at a
 * hundred call sites: only while the look is on, the browser can animate, the
 * person has not asked for reduced motion, and the PAGE changes. The morph
 * itself is hub2Morph.ts — every panel on the page you leave flows into the
 * panel that takes its place.
 *
 * It REPLACED a View Transition wipe with a gold edge sweeping across it. Two
 * reasons, and the first is not taste: Safari and Firefox disable
 * `backdrop-filter` for the whole duration of a view transition (WebKit
 * 302256), so on the phone this look is for, the wipe did not freeze the
 * glass, it removed it. hub2Morph.ts has the long version. Do not reach for
 * `startViewTransition` to animate anything carrying glass.
 *
 * PRESS. A ripple from where the finger lands, drawn in a fixed overlay at
 * the pressed element's box, so no component's own CSS changes.
 *
 * FINISH. hub2Celebrate() sends a burst of notes from a success (checked in,
 * form sent, roll saved). Each success path calls it.
 *
 * With the look off, or with reduced motion asked for, nothing here changes a
 * navigation, a press or a success. A browser without View Transitions just
 * changes page.
 */
import type { createBrowserRouter } from 'react-router';
import { HUB2_ATTR } from './hub2Tokens';
import { capture, changesPage, morphOn, notePress, playWhenReady } from './hub2Morph';

/** Re-exported so "does this navigation change the page" has one caller-facing
 *  home even though the morph owns the answer. */
export { changesPage };

type Router = ReturnType<typeof createBrowserRouter>;

/** The one motion gate: the look is on and the person has not asked for
 *  reduced motion. Asked at the moment of each motion, so turning the preview
 *  on or off takes effect at once. */
export function hub2MotionOn(): boolean {
  return document.documentElement.getAttribute(HUB2_ATTR) === 'on'
    && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Morph every navigation that goes to another page, while the look is on.
 *
 * The measurement has to happen BEFORE the router swaps the page and the
 * second one AFTER the new route has painted, which is why this wraps
 * navigate rather than living in a component: there is no React lifecycle
 * that straddles both sides of a route change.
 *
 * History steps (navigate(-1)) are left alone — Back is the one navigation
 * where the person already knows what they are going to see.
 */
export function withPageMorph(router: Router): Router {
  const navigate = router.navigate.bind(router) as (to: unknown, opts?: unknown) => Promise<void>;
  router.navigate = ((to: unknown, opts?: unknown) => {
    const morph = typeof to !== 'number' && morphOn() && changesPage(to, router.state.location.pathname);
    const shot = morph ? capture() : null;
    const done = navigate(to, opts);
    // The promise settles on commit; the boxes are only final once the
    // browser has laid the new page out. playWhenReady waits for that.
    if (shot) void done.then(() => playWhenReady(shot));
    return done;
  }) as Router['navigate'];
  return router;
}

/** What a press ripples. Typing into a field never does. */
const TAPPABLE = 'button, a[href], [role="button"], summary';

function ripple(e: PointerEvent): void {
  if (!hub2MotionOn() || e.button !== 0) return;
  const at = e.target as Element | null;
  // The morph pairs the panel a finger landed on with the page it opens, so
  // the press is recorded here (the one listener the look already has) even
  // when this press draws no ripple.
  notePress(at);
  if (!at?.closest || at.closest('input, textarea, select, [data-hub2-noripple]')) return;
  const target = at.closest(TAPPABLE);
  if (!target) return;
  const r = target.getBoundingClientRect();
  // Skip slivers and anything the size of a page (a whole card list that
  // happens to be one link).
  if (r.width < 20 || r.height < 16 || r.width * r.height > innerWidth * innerHeight * 0.4) return;
  const cs = getComputedStyle(target);
  const host = document.createElement('span');
  host.className = 'hub2-ripple';
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;border-radius:${cs.borderRadius};color:${cs.color}`;
  const dot = document.createElement('i');
  dot.style.left = `${e.clientX - r.left}px`;
  dot.style.top = `${e.clientY - r.top}px`;
  host.appendChild(dot);
  document.body.appendChild(host);
  setTimeout(() => host.remove(), 700);
}

/** Boot (main.tsx): one passive listener. Every press asks the gate itself,
 *  so turning the look on or off takes effect at once. */
export function initHub2Motion(): void {
  document.addEventListener('pointerdown', ripple, { capture: true, passive: true });
}

const NOTES = ['♪', '♫', '♩', '♬'];

/** Finish: a burst of notes from a success, out of `from` (the confirmation,
 *  or the button that sent it) or the middle of the screen. Does nothing
 *  without the look or with reduced motion, and removes itself. */
export function hub2Celebrate(from?: Element | null): void {
  if (!hub2MotionOn()) return;
  const r = from?.getBoundingClientRect();
  const x = r ? r.left + r.width / 2 : innerWidth / 2;
  const y = r ? r.top + r.height / 2 : innerHeight / 2;
  const host = document.createElement('div');
  host.className = 'hub2-burst';
  host.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 12; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
    const d = 70 + Math.random() * 110;
    const note = document.createElement('span');
    note.className = `hub2-note n${i % 4}`;
    note.textContent = NOTES[i % 4];
    note.style.cssText = `left:${x}px;top:${y}px;--dx:${(Math.cos(a) * d).toFixed(1)}px;--dy:${(Math.sin(a) * d).toFixed(1)}px;--r:${((Math.random() - 0.5) * 70).toFixed(0)}deg;animation-delay:${i * 22}ms`;
    host.appendChild(note);
  }
  document.body.appendChild(host);
  setTimeout(() => host.remove(), 1800);
}
