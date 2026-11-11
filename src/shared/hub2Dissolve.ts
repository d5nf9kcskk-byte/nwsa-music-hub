/**
 * The page change under the Hub 2.0 look (#hub2-motion): ONE liquid dissolve.
 *
 * The director picked it on 2026-11-11 from docs/design/liquid-dissolve-sample.html
 * ("Liquid, slow, smooth"). The page you leave melts into soft pools, like ink
 * in water, and the pools gather into the next page.
 *
 * ONE LENS, NOT MANY MOVERS. Nothing on either page animates. One fixed sheet
 * (the lens) lies over the page area, under the header and the tab bar, and
 * fogs up and clears through `backdrop-filter`. Every pixel therefore changes
 * at the same rate on one clock, which is the whole answer to the five rounds
 * of per-panel morphs that "don't move at the same rate".
 *
 * THE RULE THIS FILE IS BUILT ROUND: opacity, filter, mask, clip-path or
 * mix-blend-mode on an ANCESTOR of live glass silently flattens every card in
 * it. So the lens is appended to <body> and is never an ancestor of a page,
 * the live page is hidden with `visibility` alone (not on that list), and the
 * only thing that fades is the ghost: a throwaway copy of the page you left.
 * And never the View Transitions API: Safari and Firefox switch
 * `backdrop-filter` off for the whole of one (WebKit 302256).
 *
 *   UP    The outgoing page is copied into a ghost at the same scroll offset,
 *         the new page goes in underneath (kept visibility:hidden), and the
 *         lens ramps from clear to its peak.
 *   PEAK  If the new page is still showing loading placeholders, wait here
 *         (holdMs at most) rather than clear onto placeholders.
 *   DOWN  The new page is shown, the ghost fades early while the blur is
 *         still near its peak (so two readable pages are never on screen
 *         together), and the lens clears.
 *   END   Animations cancelled, ghost and lens removed. Nothing left behind.
 *
 * A second change mid-way RETARGETS: while fogging up or holding, only the
 * page underneath changes; while clearing, what is on screen becomes the new
 * ghost and the lens climbs back from wherever it had got to.
 *
 * ONE CLOCK. The duration, the peak blur and the hold all come from the org
 * config (`hub2.glass.dissolveMs` / `dissolveBlur` / `dissolveHoldMs`, emitted
 * as --hub2-dissolve-* by hub2Tokens.ts). The one curve is LAW below. Nothing
 * else in the look may name a duration (hub2.selfcheck.ts §7).
 */
import { HUB2_ATTR } from './hub2Tokens';

/** The page area: the one scroller in each shell. */
const SCROLLER = '.pub-content, .dir-content';
/** A page still fetching. A page showing one of these is not the page having arrived. */
const PLACEHOLDER = '.pub-skeleton-card, .dir-loading';
/** <html> carries the phase, so CSS can hide the live page while the ghost shows. */
export const PHASE_ATTR = 'data-hub2-dissolve';

/** Share of the clock spent fogging up; the rest clears. */
const UP = 0.42;
/** Share of the clearing in which the old page fades away. */
const GHOST_OUT = 0.34;
/** Keyframes the curve is cut into, played linear. */
const STEPS = 12;
/** Liquid is blur, then contrast pivoted on the PAGE colour (plain contrast()
 *  pivots on mid grey and flashes a near-white page to white). GAIN is how
 *  hard everything that differs from the page is pushed away from it. */
const SAT = 0.8;
const GAIN = 2.6;
/** The smallest blur worth showing, in px: the radius grows by equal RATIOS
 *  from here, so every doubling takes the same share of the clock. */
const FINE = 0.5;

/** THE CURVE. Up sets off at once and settles into the peak; down stays near
 *  the peak while the old page leaves, then clears. */
const smooth = (u: number) => u * u * (3 - 2 * u);
const LAW = {
  up: (u: number) => smooth(Math.pow(u, 0.7)),
  down: (u: number) => smooth(Math.pow(u, 1.5)),
};

type Clock = { ms: number; blur: number; holdMs: number };

function clock(): Clock {
  const cs = getComputedStyle(document.documentElement);
  const n = (v: string) => parseFloat(cs.getPropertyValue(v)) || 0;
  return { ms: n('--hub2-dissolve-ms'), blur: n('--hub2-dissolve-blur'), holdMs: n('--hub2-dissolve-hold-ms') };
}

const mq = (q: string) => !!window.matchMedia?.(q).matches;

/** Can this browser animate a backdrop filter at all? iOS 16 and 17 know only
 *  the prefixed property. Asked once; a browser that cannot simply changes page. */
let animatable: boolean | undefined;
function canAnimate(): boolean {
  if (animatable !== undefined) return animatable;
  try {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const f = 'blur(3px)';
    const a = el.animate([{ webkitBackdropFilter: f, backdropFilter: f }, { webkitBackdropFilter: f, backdropFilter: f }], { fill: 'both' });
    a.pause();
    const cs = getComputedStyle(el) as CSSStyleDeclaration & { webkitBackdropFilter?: string };
    animatable = `${cs.backdropFilter ?? ''}${cs.webkitBackdropFilter ?? ''}`.includes('blur');
    a.cancel();
    el.remove();
  } catch { animatable = false; }
  return animatable;
}

/** The one gate: the look is on, the person has asked for neither less motion
 *  nor less transparency, the browser can do it, and the config gives a clock. */
export function dissolveOn(): boolean {
  return document.documentElement.getAttribute(HUB2_ATTR) === 'on'
    && typeof document.body?.animate === 'function'
    && !mq('(prefers-reduced-motion: reduce)')
    && !mq('(prefers-reduced-transparency: reduce)')
    && clock().ms > 0
    && canAnimate();
}

/** Where the page colour sits, 0 (black) to 1 (white): the contrast pivot. */
function pivot(at: Element): number {
  const hex = getComputedStyle(at).getPropertyValue('--hub2-bg').trim();
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return 0.955;
  return (parseInt(m[1], 16) + parseInt(m[2], 16) + parseInt(m[3], 16)) / 765;
}

/** The lens at level p (0 clear, 1 peak). */
function lensAt(p: number, c: Clock, P: number): string {
  const r = FINE * (Math.pow(c.blur / FINE + 1, p) - 1);
  const g = 1 + (GAIN - 1) * p;
  const K = 1 + 2 * P * (g - 1);
  return `blur(${r.toFixed(2)}px) saturate(${(1 + (SAT - 1) * p).toFixed(3)}) brightness(${(g / K).toFixed(4)}) contrast(${K.toFixed(4)})`;
}

type Phase = 'up' | 'hold' | 'down';
const S: {
  phase: Phase | null; anims: Animation[]; from: number; to: number; law: (u: number) => number;
  ghost: HTMLElement | null; lens: HTMLElement | null; gen: number; holdUntil: number; watch: MutationObserver | null; timer: number;
} = { phase: null, anims: [], from: 0, to: 0, law: LAW.up, ghost: null, lens: null, gen: 0, holdUntil: 0, watch: null, timer: 0 };

function scroller(): HTMLElement | null {
  return document.querySelector<HTMLElement>(`:is(${SCROLLER}):not(.hub2-ghost)`);
}

/** How fogged the lens is now, read off the clock so a retarget picks up from here. */
function level(): number {
  if (!S.phase) return 0;
  if (S.phase === 'hold') return 1;
  const g = S.anims[0]?.effect?.getComputedTiming().progress;
  return S.from + (S.to - S.from) * S.law(g == null ? 1 : g);
}

function setPhase(p: Phase | null) {
  S.phase = p;
  if (p) document.documentElement.setAttribute(PHASE_ATTR, p);
  else document.documentElement.removeAttribute(PHASE_ATTR);
}

/** Copy the page on screen into a ghost, laid exactly over it. It is placed
 *  BESIDE the live page (same parent), so every shell rule still styles it,
 *  and after it, so querySelector still finds the live one first. */
function makeGhost(live: HTMLElement) {
  S.ghost?.remove();
  const r = live.getBoundingClientRect();
  const g = live.cloneNode(true) as HTMLElement;
  g.querySelectorAll('[id]').forEach(e => e.removeAttribute('id'));
  g.querySelectorAll('iframe, video, audio').forEach(e => e.remove());
  g.removeAttribute('id');
  g.classList.add('hub2-ghost');
  g.setAttribute('aria-hidden', 'true');
  g.inert = true;
  g.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`;
  live.after(g);
  g.scrollTop = live.scrollTop;
  S.ghost = g;
}

/** The lens covers the page area as it sits on screen, never the rail or bars. */
function placeLens(live: HTMLElement) {
  const r = live.getBoundingClientRect();
  const top = Math.max(0, r.top), bottom = Math.min(innerHeight, r.bottom);
  const lens = S.lens ?? document.body.appendChild(Object.assign(document.createElement('div'), { className: 'hub2-lens' }));
  lens.setAttribute('aria-hidden', 'true');
  lens.style.cssText = `left:${r.left}px;top:${top}px;width:${r.width}px;height:${Math.max(0, bottom - top)}px`;
  S.lens = lens;
}

/** Start one phase: every animated thing created now, on one duration. */
function run(from: number, to: number, law: (u: number) => number, ms: number, down: boolean): number {
  const c = clock();
  const live = scroller();
  const P = pivot(live ?? document.documentElement);
  const pts: number[] = [];
  for (let k = 0; k <= STEPS; k++) pts.push(from + (to - from) * law(k / STEPS));
  const T: KeyframeAnimationOptions = { duration: ms, easing: 'linear', fill: 'both' };
  const old = S.anims;
  S.anims = [S.lens!.animate(pts.map(p => { const f = lensAt(p, c, P); return { webkitBackdropFilter: f, backdropFilter: f }; }), T)];
  if (down && S.ghost) {
    S.ghost.classList.add('leaving');
    S.anims.push(S.ghost.animate([{ opacity: 1 }, { opacity: 0, offset: GHOST_OUT }, { opacity: 0 }], T));
  }
  old.forEach(a => a.cancel());
  S.from = from; S.to = to; S.law = law;
  return ++S.gen;
}

function startUp(from: number) {
  setPhase('up');
  const c = clock();
  const gen = run(from, 1, LAW.up, Math.max(c.ms * UP * (1 - from), 1), false);
  S.anims[0].finished.then(() => { if (gen === S.gen) hold(); }, () => {});
}

function ready(): boolean {
  const live = scroller();
  return !!live && !live.querySelector(PLACEHOLDER) && !live.matches(PLACEHOLDER);
}

/** Wait at the peak for the page to arrive, bounded. No polling clock of its
 *  own: it looks again whenever the page underneath changes. */
function hold() {
  const gen = S.gen;
  setPhase('hold');
  S.holdUntil = performance.now() + clock().holdMs;
  const check = () => { if (gen === S.gen && S.phase === 'hold' && (ready() || performance.now() >= S.holdUntil)) startDown(); };
  S.watch?.disconnect();
  S.watch = new MutationObserver(check);
  S.watch.observe(document.body, { childList: true, subtree: true });
  clearTimeout(S.timer);
  S.timer = window.setTimeout(check, clock().holdMs);
  check();
}

function startDown() {
  S.watch?.disconnect(); S.watch = null; clearTimeout(S.timer);
  const live = scroller();
  if (live) placeLens(live);
  setPhase('down');
  const gen = run(1, 0, LAW.down, clock().ms * (1 - UP), true);
  S.anims[0].finished.then(() => { if (gen === S.gen) finish(); }, () => {});
}

/** Put everything back exactly as it was before the dissolve. */
export function finish() {
  S.gen++;
  S.anims.forEach(a => a.cancel()); S.anims = [];
  S.watch?.disconnect(); S.watch = null; clearTimeout(S.timer);
  S.ghost?.remove(); S.ghost = null;
  S.lens?.remove(); S.lens = null;
  setPhase(null);
}

/**
 * Change the page. `swap` makes the change (a staff shell's setTab); the
 * router passes none, because by the time it calls here its own render of the
 * new page is already queued and has not yet reached the screen.
 * Off (see dissolveOn), it is exactly `swap()`.
 */
export function dissolve(swap?: () => void): void {
  if (!dissolveOn()) { finish(); swap?.(); return; }
  if (S.phase === 'up' || S.phase === 'hold') {
    if (S.phase === 'hold') S.holdUntil = performance.now() + clock().holdMs;
    swap?.();
    return;
  }
  const live = scroller();
  if (!live) { finish(); swap?.(); return; }
  const from = level();
  placeLens(live);
  makeGhost(live);
  swap?.();
  startUp(from);
}

/** For test scripts: the phase and the level, read only. */
if (typeof window !== 'undefined') {
  (window as unknown as { __hub2Dissolve: object }).__hub2Dissolve = {
    get phase() { return S.phase; },
    get level() { return level(); },
    animations: () => S.anims.slice(),
  };
}
