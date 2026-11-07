/**
 * The page morph (#glass) — "all of the glass elements reform like liquid
 * into the new elements on the new page" (the director, 2026-11-06).
 *
 * This REPLACED a View Transition wipe, and the reason is not taste.
 *
 * WEBKIT 302256: Safari and Firefox disable `backdrop-filter` for the ENTIRE
 * duration of a View Transition, and Chrome explicitly does not. On the phone
 * this look is designed for, a view transition does not freeze the glass, it
 * REMOVES it: every card flat for the length of the transition, glass
 * snapping back at the end. Nothing on a development machine shows that,
 * because everything here is Chrome. Do not bring the wipe back, and do not
 * reach for `startViewTransition` to animate anything that carries glass.
 *
 * The second reason: `::view-transition-old()` is a static screenshot with
 * the blur frozen into it, and the default group animation scales both sides
 * as replaced elements with `object-fit`. Half of every morph was a
 * PHOTOGRAPH of a card being stretched, which is what the director saw and
 * called "pictures sliding".
 *
 * WHAT THIS DOES INSTEAD: a FLIP. Let the new page lay out, measure where
 * each panel ended up, transform it back to where its counterpart was, and
 * animate the transform away. The panel is a LIVE element the whole time, so
 * its `backdrop-filter` is re-sampled in screen space every frame at the
 * position it has reached — a card genuinely refracts what it is passing over
 * as it travels, which is the one thing no engine does through a view
 * transition. The floor drops too: this needs the Web Animations API, which
 * every browser the app supports has had for years.
 *
 * THE TRAP THAT SHAPES THE REST. `opacity`, `filter`, `mask` and
 * `mix-blend-mode` on an ANCESTOR break a descendant's `backdrop-filter` —
 * they do not switch it off, they re-point it at the filtered subtree's own
 * painted content, which here paints nothing, so the glass goes flat. That
 * rules out the technique every animation library reaches for (overlay the
 * two counterparts and cross-fade them by opacity): both cards would go flat
 * for exactly the duration of the cross-fade. So the live panel NEVER gets an
 * opacity, a filter or a blur. The fade is carried entirely by the outgoing
 * clone, which has no glass left on it to lose.
 *
 * AND WHY THERE IS NO WRAPPER. The sample this came from wraps each panel's
 * children in one div to carry the counter-scale. React owns those children
 * here, and a div inserted under them breaks reconciliation the next time
 * that subtree updates. So the counter-scale is animated onto each child
 * directly through `element.animate()`, which lives in the animation layer
 * and never writes a style attribute or moves a node — React cannot tell it
 * happened. The counter-scale is not optional: without it the text stretches
 * as the box grows, which is the artefact this whole round exists to remove.
 */
import { HUB2_ATTR } from './hub2Tokens';

/** Every id this module gives an animation, so a second navigation can
 *  cancel the first mid-flight instead of fighting it. */
const FLIP_ID = 'hub2-morph';

/**
 * What reforms: A BLOCK OF A PAGE, by the app's own definition of one.
 *
 * `.pub-page > *` is already how the scroll reveal in hub2Public.css decides
 * what a block is, so this adds no second answer to maintain. A list of
 * class names was tried first and was wrong within an hour: it named
 * `.pub-card` and `.pub-ens-card`, and the pages people actually navigate
 * between are built from `.pub-hero`, `.pub-signup-alert`, `.pub-season-month`,
 * `.pub-day-detail` and a dozen more. A structural selector cannot drift from
 * the markup the way a list does.
 */
const PANEL_SEL = '.pub-page > *, .dir-page > *';

/** Below this a block is a heading or a one-line link, and flying it reads
 *  as jitter rather than as liquid. */
const MIN_H = 36;

/** The scrolling area. A panel below the fold has not been looked at, and
 *  flying it in from off screen is motion nobody asked for. */
const SCROLLER_SEL = '.pub-content, .dir-content';

/** How many panels may move at once. The director's answer to "how many"
 *  was "all of them", and this is the honest reading of it: every panel a
 *  person can actually SEE. A roster of 140 is not a choreography. */
const CAP = 10;

/** Per-panel delay, so the page reforms in a ripple rather than a block. */
const STAGGER_MS = 40;

/** How far past its mark a panel carries before settling back. The morph
 *  used to be over in 15% of its duration: the look's own spring curve is
 *  enormously front-loaded, and with a FLIP the geometry IS the animation,
 *  so the panel arrived almost instantly and then sat still. The settle is
 *  an explicit keyframe at 72% instead. */
const SETTLE_AT = 0.72;
const SETTLE_PAST = 0.045;

/**
 * HOW FAR APART TWO BLOCKS MAY BE AND STILL BE THE SAME OBJECT.
 *
 * Positional pairing is right for furniture and wrong for everything else,
 * and nothing was stopping it: first-with-first, whatever the two were. A
 * 24px section heading paired with a 400px month grid, and what a sixteen
 * times scale looks like is a panel being STRETCHED, which is the exact
 * artefact round four existed to remove. The director's word for it was
 * "messy instead of liquidy".
 *
 * So a positional pair must be roughly the same shape, and one that is not
 * is better served by the two branches that already exist: the old one
 * melts where it stood and the new one gathers out of a haze.
 *
 * THE PRESSED ROW IS EXEMPT, and it has to be: a 56px row opening into a
 * 150px hero is a nine-times area change and it is the single animation
 * this whole feature is named after. A finger landed on it, so the person
 * already knows those two things are the same object and the scale reads
 * as growth rather than as stretching.
 */
const MAX_SCALE = 3.2;

/** How much of the morph the outgoing clone is visible for, and on what
 *  curve. Short and front-loaded, for the reason written where it is used:
 *  anything slower leaves two legible pages stacked on each other. */
const FADE_OF = 0.34;
const FADE_EASE = 'cubic-bezier(.3,.9,.4,1)';

const num = (v: string) => parseFloat(v) || 0;

/** The look's own easing, and the morph duration the org config sets.
 *  0 means no morph: pages change instantly, which is also what a browser
 *  without `element.animate` gets. */
function timing(): { ms: number; ease: string } {
  const cs = getComputedStyle(document.documentElement);
  return {
    ms: num(cs.getPropertyValue('--hub2-morph-ms')),
    ease: cs.getPropertyValue('--hub2-morph-ease').trim() || 'ease',
  };
}

export function morphOn(): boolean {
  return document.documentElement.getAttribute(HUB2_ATTR) === 'on'
    && typeof document.body?.animate === 'function'
    && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    && timing().ms > 0;
}

/**
 * Does this navigation go to another PAGE? A filter tap (setSearchParams
 * sends "?..."), a hash link and a search change on the same path stay on
 * the page and must not morph: the motion also swallows taps while it runs.
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

/** The panel a finger last landed on, so a row can pair with the page it
 *  opens rather than with whatever happens to be first. Recorded by the
 *  press listener in hub2Motion.ts. */
let pressed: Element | null = null;
export function notePress(el: Element | null): void {
  pressed = el?.closest?.(PANEL_SEL) ?? null;
}

/**
 * Panels the person can actually SEE, in document order.
 *
 * "Substantially visible", not "wholly inside the scroller". The sample this
 * came from used the strict test and it was right there, where every panel
 * was small; in the app a single concert card is routinely taller than what
 * is left of the phone below the header, so the strict test matched NOTHING
 * on the busiest page in the Hub and the morph silently did not run. Half
 * the panel, or 120px of it, is the line.
 */
function panels(): HTMLElement[] {
  const scroller = document.querySelector(SCROLLER_SEL);
  if (!scroller) return [];
  const box = scroller.getBoundingClientRect();
  const out: HTMLElement[] = [];
  for (const el of document.querySelectorAll<HTMLElement>(PANEL_SEL)) {
    const r = el.getBoundingClientRect();
    if (r.height < MIN_H) continue;
    // Never transform something pinned to the viewport: an action bar or a
    // nav that is fixed or sticky would be dragged off its anchor and, worse,
    // would take its own containing block with it.
    const pos = getComputedStyle(el).position;
    if (pos === 'fixed' || pos === 'sticky') continue;
    const shown = Math.min(r.bottom, box.bottom) - Math.max(r.top, box.top);
    if (shown >= Math.min(r.height * 0.5, 120)) out.push(el);
    if (out.length >= CAP) break;
  }
  return out;
}

interface Shot {
  rects: DOMRect[];
  clones: HTMLElement[];
  radii: string[];
  /** Did a finger land on the first one? See MAX_SCALE. */
  anchored: boolean;
}

/** Glass on the element OR on the pane it carries. The panes put their
 *  blur on a `::before` (hub2Glass.css §4, so the edge mask can live on the
 *  same element as the blur), and a host asked about its own
 *  `backdropFilter` answers "none" — which would let the gather branch fade
 *  it, and an ancestor opacity re-points its pane's blur at an empty
 *  subtree. Flat glass, nothing thrown, nothing logged. */
function carriesGlass(el: Element): boolean {
  for (const pseudo of [null, '::before'] as const) {
    const f = getComputedStyle(el, pseudo).backdropFilter;
    if (f && f !== 'none') return true;
  }
  return false;
}

/** A fixed layer for the outgoing clones. `contain: paint` keeps a clone
 *  from ever lengthening the page while it travels. */
function ghostLayer(): HTMLElement {
  let host = document.getElementById('hub2-ghosts');
  if (!host) {
    host = document.createElement('div');
    host.id = 'hub2-ghosts';
    host.setAttribute('aria-hidden', 'true');
    document.body.appendChild(host);
  }
  return host;
}

/** FIRST: where everything is, and a copy of what it looks like, taken
 *  before the router swaps the page. */
export function capture(): Shot | null {
  if (!morphOn()) return null;
  const els = panels();
  if (!els.length) return null;
  // The pressed panel pairs first, so the row a finger landed on becomes the
  // page it opens. Everything else pairs by position: these pages hold
  // completely different content and there is no identity to pair on, so the
  // furniture flows into the furniture.
  const at = pressed ? els.indexOf(pressed as HTMLElement) : -1;
  if (at > 0) els.unshift(...els.splice(at, 1));
  return {
    anchored: at >= 0,
    rects: els.map(el => el.getBoundingClientRect()),
    radii: els.map(el => getComputedStyle(el).borderTopLeftRadius),
    clones: els.map(el => el.cloneNode(true) as HTMLElement),
  };
}

/**
 * Wait for the new page to exist, then play.
 *
 * `router.navigate` resolves on COMMIT, and React paints on its own
 * schedule after that, so one `requestAnimationFrame` is not reliably
 * enough: measured on the real app, play() ran while the new page still had
 * no panels, every old panel took the "nothing to become" branch and melted,
 * and a tab change that should have reformed four panels dissolved one. The
 * retry stops the moment there is something to measure, so in practice this
 * is one frame; the bound is there so a page that genuinely has no panels
 * still melts the old ones rather than hanging.
 */
export function playWhenReady(shot: Shot, tries = 6): void {
  requestAnimationFrame(() => {
    if (tries > 0 && !panels().length) { playWhenReady(shot, tries - 1); return; }
    play(shot);
  });
}

/** LAST, INVERT, PLAY. */
export function play(shot: Shot): void {
  if (!morphOn()) return;
  const { ms, ease } = timing();
  // A second navigation mid-flight: drop the first rather than compose with
  // it, or the two fight over the same transform.
  for (const a of document.getAnimations()) if (a.id === FLIP_ID) a.cancel();

  const now = panels();
  const host = ghostLayer();

  for (let i = 0; i < Math.max(shot.rects.length, now.length); i++) {
    const delay = Math.min(i, 6) * STAGGER_MS;
    const opts: KeyframeAnimationOptions = { duration: ms, easing: ease, delay, fill: 'both' };

    // Is there a counterpart, and is it the same SHAPE? See MAX_SCALE: a
    // positional pair that is not gets taken apart and handed to the melt
    // and gather branches below, which is what they are for.
    const el: HTMLElement | undefined = now[i];
    const from: DOMRect | undefined = shot.rects[i];
    const to = el?.getBoundingClientRect();
    let paired = !!(from && to && to.width && to.height);
    if (paired && !(shot.anchored && i === 0)) {
      const kx = from!.width / to!.width;
      const ky = from!.height / to!.height;
      paired = Math.max(kx, 1 / kx, ky, 1 / ky) <= MAX_SCALE;
    }

    // A panel with a counterpart: the live element travels, and the outgoing
    // copy travels the same path and fades out over it.
    if (paired && el && from && to) {
      const sx = from.width / to.width;
      const sy = from.height / to.height;
      const dx = from.left - to.left;
      const dy = from.top - to.top;
      // Nothing to reform: skip rather than animate a no-op.
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) continue;

      const r = num(getComputedStyle(el).borderTopLeftRadius);
      const osx = sx + (1 - sx) * (1 + SETTLE_PAST);
      const osy = sy + (1 - sy) * (1 + SETTLE_PAST);
      const odx = dx - dx * (1 + SETTLE_PAST);
      const ody = dy - dy * (1 + SETTLE_PAST);
      // The radius is pre-divided by the scale on each axis, or a circular
      // corner comes out as an ellipse for the whole flight.
      const shell = el.animate([
        { transformOrigin: '0 0', transform: `translate(${dx}px,${dy}px) scale(${sx},${sy})`, borderRadius: `${r / sx}px / ${r / sy}px` },
        { offset: SETTLE_AT, transformOrigin: '0 0', transform: `translate(${odx}px,${ody}px) scale(${osx},${osy})`, borderRadius: `${r / osx}px / ${r / osy}px` },
        { transformOrigin: '0 0', transform: 'translate(0,0) scale(1,1)', borderRadius: `${r}px` },
      ], { ...opts, fill: 'backwards' });
      shell.id = FLIP_ID;

      // The counter-scale, one animation per child, in the animation layer
      // only. See the header: no wrapper, no DOM mutation, React untouched.
      for (const kid of el.children) {
        if (!(kid instanceof HTMLElement)) continue;
        const x = kid.offsetLeft;
        const y = kid.offsetTop;
        const back = (ax: number, ay: number) =>
          `translate(${(x * (1 - ax)) / ax}px,${(y * (1 - ay)) / ay}px) scale(${1 / ax},${1 / ay})`;
        const a = kid.animate([
          { transformOrigin: '0 0', transform: back(sx, sy) },
          { offset: SETTLE_AT, transformOrigin: '0 0', transform: back(osx, osy) },
          { transformOrigin: '0 0', transform: 'none' },
        ], { ...opts, fill: 'backwards' });
        a.id = FLIP_ID;
      }

      // The clone carries the fade AND the size change of the old content,
      // so the live panel never needs an opacity. Its glass is zeroed by
      // CSS (#hub2-ghosts .hub2-ghost), because two translucent shells
      // stacked read as one much denser shell.
      // THE CLONE CARRIES THE WHOLE CROSS-FADE, and it has to be OVER
      // early. The live panel never gets an opacity (the backdrop-root
      // trap, see the header), so for as long as the clone is legible BOTH
      // pages are legible at once, on top of each other. At the old 62% of
      // a 1500ms morph that was most of a second of two readable pages
      // stacked: photographed at 404ms, "Calendar / All ensembles" sat
      // across "Today at NWSA Music" with every word of both sharp. That is
      // the whole of "the transitions look messy instead of liquidy".
      // So: gone by 38%, and BLURRED on the way, which stops it being
      // readable at about 15% — long before it is invisible. The geometry
      // still takes the full duration underneath, which is the part that
      // reads as liquid. The clone keeps travelling its counterpart's path
      // the whole way; only the fade is early.
      const ghost = shot.clones[i];
      ghost.classList.add('hub2-ghost');
      ghost.style.cssText += `;left:${from.left}px;top:${from.top}px;width:${from.width}px;height:${from.height}px`;
      host.appendChild(ghost);
      // It travels its counterpart's path, on the morph's own curve.
      const gt = ghost.animate([
        { transform: 'translate(0,0) scale(1,1)' },
        { transform: `translate(${to.left - from.left}px,${to.top - from.top}px) scale(${to.width / from.width},${to.height / from.height})` },
      ], opts);
      gt.id = FLIP_ID;
      // AND THE CROSS-FADE IS A SEPARATE ANIMATION ON ITS OWN CLOCK, which
      // is the whole of the fix. It cannot share the morph's curve: that
      // one is deliberately slow at both ends so the GEOMETRY spends the
      // time travelling, and a fade on it is still at 95% a tenth of a
      // second in. Photographed before this split, at 130ms and again at
      // 404ms of a 1500ms morph, both pages were sharp and stacked —
      // "Calendar / All ensembles" written across "Today at NWSA Music".
      // That is the director's "messy instead of liquidy", and it is not
      // the morph, it is the clock on the fade. Fast curve, a third of the
      // duration, and a blur that makes the clone unreadable long before it
      // is invisible, which is what reads as melting rather than as a
      // double exposure. The live panel still never gets an opacity (the
      // backdrop-root trap, see the header); the clone carries all of it.
      const g = ghost.animate([
        { opacity: 1, filter: 'blur(0px)' },
        { opacity: 0, filter: 'blur(9px)' },
      ], { ...opts, duration: ms * FADE_OF, easing: FADE_EASE });
      g.id = FLIP_ID;
      g.finished.then(() => ghost.remove(), () => ghost.remove());
      continue;
    }

    // An odd one out. A panel with nothing to become MELTS: the clone sinks
    // and blurs away where it stood. Today's four quick actions have nothing
    // to turn into on a concert page.
    if (from) {
      const ghost = shot.clones[i];
      ghost.classList.add('hub2-ghost');
      ghost.style.cssText += `;left:${from.left}px;top:${from.top}px;width:${from.width}px;height:${from.height}px`;
      host.appendChild(ghost);
      // fill 'both', not 'backwards': a ghost's resting state is "visible",
      // so with backwards the melted panels reappear at full strength half
      // way through the morph and sit on top of the new page.
      const g = ghost.animate([
        { opacity: 1, transform: 'translateY(0) scale(1)', filter: 'blur(0px)' },
        { opacity: 0, transform: 'translateY(14px) scale(.96)', filter: 'blur(10px)' },
      ], { ...opts, duration: ms * FADE_OF, easing: FADE_EASE });
      g.id = FLIP_ID;
      g.finished.then(() => ghost.remove(), () => ghost.remove());
    }

    // A new panel with nothing to come from GATHERS ITSELF out of a haze.
    // The live element gets no filter and no opacity, so this runs on a
    // clone-free element only when it carries no glass of its own; one that
    // does simply rises into place, which is the trade the header explains.
    if (el) {
      const a = el.animate(carriesGlass(el)
        ? [{ transform: 'translateY(16px) scale(.985)' }, { transform: 'none' }]
        : [{ opacity: 0, transform: 'translateY(16px) scale(.97)', filter: 'blur(8px)' },
           { opacity: 1, transform: 'none', filter: 'blur(0px)' }],
        { ...opts, fill: 'backwards' });
      a.id = FLIP_ID;
    }
  }
}
