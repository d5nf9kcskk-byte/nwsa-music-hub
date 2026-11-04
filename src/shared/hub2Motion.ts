/**
 * Motion for the Hub 2.0 look (#hub2-motion, #hub2-alive): the parts CSS
 * cannot do by itself.
 *
 * PAGE WIPES. React Router runs a View Transition only for a navigation that
 * asks for one (`viewTransition: true`). Every <Link>, <NavLink> and
 * navigate() in both shells goes through `router.navigate`, so this asks
 * once, here, instead of at a hundred call sites: only while the look is on,
 * the browser can do it, the person has not asked for reduced motion, and the
 * PAGE changes. The look's CSS draws it (hub2Public.css): the whole screen
 * wipes with one moving edge, a gold line rides that edge, and the header,
 * the menu rail and the tab bar stay still.
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

type Router = ReturnType<typeof createBrowserRouter>;

/** The one motion gate: the look is on and the person has not asked for
 *  reduced motion. Asked at the moment of each motion, so turning the preview
 *  on or off takes effect at once. */
export function hub2MotionOn(): boolean {
  return document.documentElement.getAttribute(HUB2_ATTR) === 'on'
    && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** Should this navigation wipe? */
export function pageWipesOn(): boolean {
  return hub2MotionOn() && typeof document.startViewTransition === 'function';
}

/**
 * Does this navigation go to another PAGE? A filter tap (setSearchParams
 * sends "?..."), a hash link and a search change on the same path stay on the
 * page, and must not wipe: the transition also swallows taps while it runs.
 * Paths are compared app-relative (the router's own location, no basename).
 */
export function changesPage(to: unknown, here: string): boolean {
  if (typeof to === 'string') {
    if (to === '' || to.startsWith('?') || to.startsWith('#')) return false;
    if (!to.startsWith('/')) return true; // relative: another page
    return to.split(/[?#]/)[0].replace(/\/$/, '') !== here.replace(/\/$/, '');
  }
  if (to && typeof to === 'object') {
    const p = (to as { pathname?: string }).pathname;
    return !!p && p.replace(/\/$/, '') !== here.replace(/\/$/, '');
  }
  return false;
}

/** The gold edge that rides the wipe. CSS hides it except while a View
 *  Transition runs, when it is named and its group sweeps across with the
 *  page. First in <body>, so its group paints under the header and tab bar. */
function ensureEdge(): void {
  if (document.querySelector('.hub2-wipe-edge')) return;
  const edge = document.createElement('div');
  edge.className = 'hub2-wipe-edge';
  edge.setAttribute('aria-hidden', 'true');
  document.body.prepend(edge);
}

/** Ask for a View Transition on every navigation to another page while
 *  wipes are on. History steps (navigate(-1)) are left alone; the router
 *  replays the forward transition for Back by itself. */
export function withPageWipes(router: Router): Router {
  const navigate = router.navigate.bind(router) as (to: unknown, opts?: { viewTransition?: boolean }) => Promise<void>;
  router.navigate = ((to: unknown, opts?: { viewTransition?: boolean }) => {
    const wipe = typeof to !== 'number' && pageWipesOn() && changesPage(to, router.state.location.pathname);
    if (wipe) ensureEdge();
    return navigate(to, wipe ? { ...opts, viewTransition: opts?.viewTransition ?? true } : opts);
  }) as Router['navigate'];
  return router;
}

/** What a press ripples. Typing into a field never does. */
const TAPPABLE = 'button, a[href], [role="button"], summary';

function ripple(e: PointerEvent): void {
  if (!hub2MotionOn() || e.button !== 0) return;
  const target = (e.target as Element | null)?.closest?.(TAPPABLE);
  if (!target || target.closest('input, textarea, select, [data-hub2-noripple]')) return;
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
  if (hub2MotionOn()) ensureEdge();
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
