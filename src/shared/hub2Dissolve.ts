/**
 * The page change under the Hub 2.0 look (#hub2-motion): ONE liquid dissolve.
 *
 * The director picked it on 2026-11-11 from docs/design/liquid-dissolve-sample.html
 * ("Liquid, slow, smooth"). The page you leave melts into soft pools, like ink
 * in water, and the pools gather into the next page.
 *
 * TWO COPIES, ONE CLOCK, AND NO BACKDROP-FILTER. The first build laid one
 * see-through lens over the page and animated its `backdrop-filter`. Chrome
 * painted it; on the director's iPhone the blur was computed (getComputedStyle
 * said 32px at the peak) and never painted, so every page change was a quick
 * fade with nothing melting (2026-11-11). An ordinary `filter` on an element
 * is painted by every engine, so this blurs COPIES of the pages directly:
 *
 *   UP    The page being left is copied (the "out" copy) at its scroll offset,
 *         beside the live page, which hides (visibility only) while the new
 *         page renders into it. The copy melts: blur, then a contrast step
 *         pivoted on the page colour, so text and edges gather into pools.
 *   PEAK  If the new page is still showing loading placeholders, the melt
 *         holds (holdMs at most) rather than clear onto placeholders.
 *   DOWN  The new page is copied (the "in" copy) at the same melt, under the
 *         out copy, which fades while both are formless. The in copy clears,
 *         and over the last fifth the live page (real glass) is revealed
 *         under it as the copy fades, so nothing pops.
 *   END   Animations cancelled, copies removed. Nothing left behind.
 *
 * Every animated value in one change starts at the same instant and runs on
 * one duration, so every pixel changes at the same rate: the answer to the
 * per-panel morphs that "don't move at the same rate".
 *
 * THE RULE THIS FILE IS BUILT ROUND: opacity, filter, mask, clip-path or
 * mix-blend-mode on an ANCESTOR of live glass silently flattens every card in
 * it. So filter and opacity go on the COPIES only (their glass is switched off
 * in hub2Glass.css: under a filter it would be flat anyway), and the live page
 * is only ever hidden and shown with `visibility`, which is not on that list.
 * Never the View Transitions API: Safari and Firefox switch `backdrop-filter`
 * off for the whole of one (WebKit 302256).
 *
 * A second change mid-way RETARGETS: while melting or holding, only the page
 * underneath changes; while clearing, what is on screen becomes the out copy
 * and the melt climbs back from wherever it had got to.
 *
 * INSIDE A SCREEN (director, 2026-11-11: "Yes, melt those too"). A screen that
 * swaps one view for another in place (Check-In's concert page, Schedule's day
 * on a phone, the assignment and form editors) changes through
 * useDissolvedState(), which is this same page dissolve. A drawer, sheet or
 * pop-up form is not a page change, so the page under it stays put and the
 * drawer itself melts: in, it forms out of the peak melt the way a new page
 * clears; out, it melts and fades the way a page being left does. Drawers are
 * found by watching the page (OVERLAY below), so none of the forty-odd needs
 * wiring of its own, and one closing is put back where it was, as its own
 * copy, for as long as it takes to melt away.
 *
 * ONE CLOCK. Duration, peak blur and hold come from the org config
 * (`hub2.glass.dissolveMs` / `dissolveBlur` / `dissolveHoldMs`, emitted as
 * --hub2-dissolve-* by hub2Tokens.ts). The one curve is LAW below. Nothing else
 * in the look may name a duration (hub2.selfcheck.ts §7).
 */
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { HUB2_ATTR } from './hub2Tokens';

/** The page area: the one scroller in each shell. */
const SCROLLER = '.pub-content, .dir-content';
/** A page still fetching. A page showing one of these is not the page having arrived. */
const PLACEHOLDER = '.pub-skeleton-card, .dir-loading';
/** Drawers, sheets and pop-up forms: each melts in and out by itself. Menus and
 *  search are left out on purpose: they are how you GET to a page, and that
 *  page change is the melt. */
const OVERLAY = '.dir-drawer-overlay, .dir-subw-overlay, .pub-subw-overlay, .pub-confirm-overlay, .pub-welcome-overlay, .dir-checkin-modal';
/** <html> carries the phase, so CSS can hide the live page while a copy shows. */
export const PHASE_ATTR = 'data-hub2-dissolve';

/** Share of the clock spent melting; the rest clears. */
const UP = 0.42;
/** Share of the clearing in which the out copy fades under the peak. */
const OUT_FADE = 0.15;
/** Share of the clearing after which the live page shows under the in copy. */
const REVEAL_AT = 0.8;
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

/** THE CURVE. The melt sets off at once and settles into the peak; the
 *  clearing stays near the peak while the old page leaves, then clears. */
const smooth = (u: number) => u * u * (3 - 2 * u);
const LAW = {
  up: (u: number) => smooth(Math.pow(u, 0.7)),
  down: (u: number) => smooth(Math.pow(u, 1.5)),
};

/** The only thing ever animated on the LIVE page: whether it is shown. */
const REVEAL: Keyframe[] = [
  { visibility: 'hidden' }, { visibility: 'hidden', offset: REVEAL_AT },
  { visibility: 'visible', offset: REVEAL_AT }, { visibility: 'visible' },
];

type Clock = { ms: number; blur: number; holdMs: number };

function clock(): Clock {
  const cs = getComputedStyle(document.documentElement);
  const n = (v: string) => parseFloat(cs.getPropertyValue(v)) || 0;
  return { ms: n('--hub2-dissolve-ms'), blur: n('--hub2-dissolve-blur'), holdMs: n('--hub2-dissolve-hold-ms') };
}

const mq = (q: string) => !!window.matchMedia?.(q).matches;

/** The one gate: the look is on, the person has asked for neither less motion
 *  nor less transparency, and the config gives a clock. */
export function dissolveOn(): boolean {
  return document.documentElement.getAttribute(HUB2_ATTR) === 'on'
    && typeof document.body?.animate === 'function'
    && !mq('(prefers-reduced-motion: reduce)')
    && !mq('(prefers-reduced-transparency: reduce)')
    && clock().ms > 0;
}

/** Where the page colour sits, 0 (black) to 1 (white): the contrast pivot. */
function pivot(at: Element): number {
  const hex = getComputedStyle(at).getPropertyValue('--hub2-bg').trim();
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return 0.955;
  return (parseInt(m[1], 16) + parseInt(m[2], 16) + parseInt(m[3], 16)) / 765;
}

/** The melt at level p (0 sharp, 1 peak). */
function meltAt(p: number, c: Clock, P: number): string {
  const r = FINE * (Math.pow(c.blur / FINE + 1, p) - 1);
  const g = 1 + (GAIN - 1) * p;
  const K = 1 + 2 * P * (g - 1);
  return `blur(${r.toFixed(2)}px) saturate(${(1 + (SAT - 1) * p).toFixed(3)}) brightness(${(g / K).toFixed(4)}) contrast(${K.toFixed(4)})`;
}

type Phase = 'up' | 'hold' | 'down';
const S: {
  phase: Phase | null; anims: Animation[]; from: number; to: number; law: (u: number) => number;
  out: HTMLElement | null; in: HTMLElement | null; gen: number; holdUntil: number; watch: MutationObserver | null; timer: number;
} = { phase: null, anims: [], from: 0, to: 0, law: LAW.up, out: null, in: null, gen: 0, holdUntil: 0, watch: null, timer: 0 };

function scroller(): HTMLElement | null {
  return document.querySelector<HTMLElement>(`:is(${SCROLLER}):not(.hub2-ghost)`);
}

/** How melted the page is now, read off the clock so a retarget picks up from here. */
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

/** Copy the live page, laid exactly over it. It goes BESIDE the live page
 *  (same parent), so every shell rule still styles it, and directly after it,
 *  so querySelector still finds the live one first and a newer copy sits
 *  UNDER an older one. */
function copyOf(live: HTMLElement): HTMLElement {
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
  return g;
}

function melt(from: number, to: number, law: (u: number) => number): Keyframe[] {
  const c = clock();
  const P = pivot(scroller() ?? document.documentElement);
  const k: Keyframe[] = [];
  for (let i = 0; i <= STEPS; i++) k.push({ filter: meltAt(from + (to - from) * law(i / STEPS), c, P) });
  return k;
}

function begin(gen: number, anims: Animation[], from: number, to: number, law: (u: number) => number) {
  S.anims.forEach(a => a.cancel());
  S.anims = anims; S.from = from; S.to = to; S.law = law;
  return gen;
}

function startUp(from: number) {
  setPhase('up');
  const T: KeyframeAnimationOptions = { duration: Math.max(clock().ms * UP * (1 - from), 1), easing: 'linear', fill: 'both' };
  const gen = begin(++S.gen, [S.out!.animate(melt(from, 1, LAW.up), T)], from, 1, LAW.up);
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
  if (!live) { finish(); return; }
  S.in?.remove();
  S.in = copyOf(live);
  setPhase('down');
  const T: KeyframeAnimationOptions = { duration: clock().ms * (1 - UP), easing: 'linear', fill: 'both' };
  const anims = [
    S.in.animate(melt(1, 0, LAW.down), T),
    S.in.animate([{ opacity: 1 }, { opacity: 1, offset: REVEAL_AT }, { opacity: 0 }], T),
    live.animate(REVEAL, T),
  ];
  // The out copy stays fully melted while it fades: its own melt animation is
  // about to be cancelled, and a fading copy that snapped back sharp would put
  // the old page on screen for a moment.
  if (S.out) {
    const peak = melt(1, 1, LAW.down)[0].filter as string;
    anims.push(S.out.animate([{ opacity: 1, filter: peak }, { opacity: 0, filter: peak, offset: OUT_FADE }, { opacity: 0, filter: peak }], T));
  }
  const gen = begin(++S.gen, anims, 1, 0, LAW.down);
  S.anims[0].finished.then(() => { if (gen === S.gen) finish(); }, () => {});
}

/** Put everything back exactly as it was before the dissolve. */
export function finish() {
  S.gen++;
  S.anims.forEach(a => a.cancel()); S.anims = [];
  S.watch?.disconnect(); S.watch = null; clearTimeout(S.timer);
  S.out?.remove(); S.out = null;
  S.in?.remove(); S.in = null;
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
  if (S.phase === 'down' && S.in) {
    // What is on screen (the clearing in copy) becomes the page being left.
    S.out?.remove();
    S.out = S.in; S.in = null;
  } else {
    S.out?.remove();
    S.out = copyOf(live);
  }
  swap?.();
  startUp(from);
}

/**
 * useState whose changes swap the whole screen in place, so they change
 * through the page dissolve. `melt` says whether this change really swaps what
 * is on screen (Schedule's day is its own page only below 1100px).
 */
export function useDissolvedState<T>(init: T | (() => T), melt: () => boolean = () => true) {
  const [value, setNow] = useState(init);
  // Read through refs so `set` is the same function every render, like a
  // useState setter (effects list it as a dependency).
  const now = useRef(value);
  const meltNow = useRef(melt);
  useLayoutEffect(() => { now.current = value; meltNow.current = melt; });
  const set = useCallback((next: T) => {
    if (Object.is(next, now.current)) return;
    now.current = next;
    if (meltNow.current()) dissolve(() => setNow(next));
    else setNow(next);
  }, []);
  return [value, set] as const;
}

/** A drawer copy waiting to clear, by the live drawer it is a copy of. */
const forming = new WeakMap<HTMLElement, HTMLElement>();

/** A drawer opened: a copy of it forms out of the peak melt above it, and the
 *  live drawer (real glass) is revealed under it near the end. */
function overlayIn(live: HTMLElement) {
  const z = getComputedStyle(live).zIndex;
  const g = copyOf(live);
  g.style.zIndex = z;
  forming.set(live, g);
  const T: KeyframeAnimationOptions = { duration: clock().ms * (1 - UP), easing: 'linear', fill: 'both' };
  g.animate([{ opacity: 0 }, { opacity: 1, offset: OUT_FADE }, { opacity: 1, offset: REVEAL_AT }, { opacity: 0 }], T);
  const shown = live.animate(REVEAL, T);
  g.animate(melt(1, 0, LAW.down), T).finished.then(() => { g.remove(); shown.cancel(); forming.delete(live); }, () => {});
}

/** A drawer closed: the node React just removed goes back where it was, as a
 *  copy nobody can tap, melts the way a page being left does, then fades. */
function overlayOut(gone: HTMLElement, parent: Node, next: Node | null) {
  if (!parent.isConnected) return;
  gone.getAnimations().forEach(a => a.cancel());
  forming.get(gone)?.remove();
  gone.querySelectorAll('[id]').forEach(e => e.removeAttribute('id'));
  parent.insertBefore(gone, next && next.parentNode === parent ? next : null);
  const z = getComputedStyle(gone).zIndex;
  gone.classList.add('hub2-ghost');
  gone.setAttribute('aria-hidden', 'true');
  gone.inert = true;
  gone.style.zIndex = z;
  const c = clock();
  gone.animate(melt(0, 1, LAW.up), { duration: c.ms * UP, easing: 'linear', fill: 'both' });
  gone.animate([{ opacity: 1 }, { opacity: 0 }], { delay: c.ms * UP, duration: c.ms * (1 - UP) * OUT_FADE, easing: 'linear', fill: 'both' })
    .finished.then(() => gone.remove(), () => {});
}

const overlayOf = (n: Node): HTMLElement | null =>
  n instanceof HTMLElement && !n.classList.contains('hub2-ghost')
    ? (n.matches(OVERLAY) ? n : n.querySelector<HTMLElement>(OVERLAY))
    : null;

/** Watch for drawers. A mutation observer runs after React's commit and before
 *  the browser paints, so neither the drawer arriving nor the one leaving is
 *  ever on screen unmelted. Not during a page change: that melt covers it. */
if (typeof MutationObserver === 'function' && typeof document !== 'undefined') {
  new MutationObserver(records => {
    let on: boolean | undefined;
    const gate = () => (on ??= !S.phase && dissolveOn());
    for (const r of records) {
      r.removedNodes.forEach(n => { const o = overlayOf(n); if (o && gate()) overlayOut(o, r.target, r.nextSibling); });
      r.addedNodes.forEach(n => { const o = overlayOf(n); if (o && o.isConnected && gate()) overlayIn(o); });
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
}

/** For test scripts: the phase and the level, read only. */
if (typeof window !== 'undefined') {
  (window as unknown as { __hub2Dissolve: object }).__hub2Dissolve = {
    get phase() { return S.phase; },
    get level() { return level(); },
    animations: () => S.anims.slice(),
  };
}
