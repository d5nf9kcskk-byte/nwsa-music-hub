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
 *
 * AND THE STAFF HALF NAMED A CLASS THAT DOES NOT EXIST. `.dir-page > *`
 * shipped here and matched NOTHING, on any of the four staff shells, ever: a
 * class selector does not match a prefix, so `.dir-page-body`,
 * `.dir-page-hint` and `.dir-page-actions` never answered to it and there is
 * no `.dir-page` in the app. Nothing threw, no check failed, and the morph
 * was simply dead on every staff screen while the public side worked. That is
 * the CSP failure mode (#csp), and the pin for it is in hub2.selfcheck.ts:
 * every class this selector names must be a class the app actually renders.
 *
 * WHY NOT `.dir-content > *`. The staff shells have no page wrapper. The
 * scroller IS the page container, and its children are the shell's own strips
 * plus ONE routed view whose CHILDREN are the blocks, so `.dir-content > *`
 * yields a single giant block per screen. One block does not reform into
 * another; it gets resized, which is the artefact this whole layer removes.
 *
 * SO THE VIEW IS READ AS THE LAST CHILD, and that is the one assumption here
 * worth watching. It holds in DirectorApp, which is also the only staff shell
 * that navigates through the ROUTER at all (the assistant, applied-teacher and
 * classroom-teacher shells switch tabs with useState, so no morph can fire on
 * their tabs whatever this says). Those three already break the assumption:
 * each appends a MyCalendarFeedPanel after its view, so `:last-child` in them
 * is that panel rather than the page. Add such a row to DirectorApp and the
 * staff morph dies again with nothing thrown, so hub2.selfcheck.ts pins that
 * this shell's `.dir-content` ends on the tab list.
 */
const PANEL_SEL = '.pub-page > *, .dir-content > :last-child > *';

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

/**
 * THE LAW (the director chose this, 2026-11-09, from three built side by side).
 *
 * A CUBIC-BEZIER CANNOT BE VISCOUS, and that is arithmetic rather than taste.
 * Searched the whole bezier space for the three properties liquid needs at
 * once — a slow head (the first 10% of the travel taking at least 17% of the
 * clock), a long creeping tail (the last 10% taking at least 42%), and no
 * darting (peak velocity no more than 2.9x its own mean) — and there is no
 * solution. There cannot be: the area under a velocity curve is fixed at 1,
 * so buying a slow start AND a slow end must be paid for with a fast middle,
 * which is the one thing honey never does.
 *
 * So the travel is a TABLE, played on a linear easing: the step response of an
 * overdamped system to a force that ramps in over its first quarter. The ramp
 * is the load-bearing part, not the damping — a plain spring applies full
 * force from the first frame and darts out of the gate even when critically
 * damped. Sampled AT its own 15 points, so linear interpolation between them
 * reproduces it exactly instead of approximating it.
 *
 * AND THERE IS NO POSITIONAL OVERSHOOT. Overshoot is a SPRING cue, and liquid
 * is the thing a spring is defined against: honey does not carry past its mark
 * and come back. The overshoot moved into CURVATURE, where a real surface
 * finding its level genuinely does wobble. See the shell.
 */
const LAW = [0, .0059, .0632, .2104, .4150, .6041, .7460, .8433, .9062,
             .9455, .9695, .9838, .9922, .9972, 1];

/**
 * PERCEPTUAL MOMENTS ARE WALL-CLOCK, NOT FRACTIONS. This is the finding that
 * makes a slower morph possible at all, and it is why the earlier attempt at
 * 1500ms had to be abandoned.
 *
 * These numbers encode thresholds in a person's head: when two stacked pages
 * stop reading as one event, and when the destination becomes readable. Those
 * are fixed in milliseconds. Held as FRACTIONS they stretched with the
 * duration, so a longer morph kept the old page legible for longer and made
 * the new text wait — which is exactly the "two readable pages stacked" fault
 * that got blamed on the duration and treated by shortening it. The mechanism
 * stayed armed and re-fired at anything over about a second.
 *
 * Held here, the duration can go wherever the director wants it.
 */
const OUT_MS = 300;    // the outgoing copy is unreadable by here
const READ_MS = 480;   // the arriving text is sharp by here

/**
 * Per-panel delay, in milliseconds, ordered by DISTANCE FROM THE TAP.
 *
 * Two changes from the old 3.5%-of-duration-in-document-order version, both
 * measured. First the size: 3.5% of 900ms is 31.5ms, which sits at or below
 * the temporal fusion floor (the binding-window literature spans roughly 25ms
 * to 150ms), so neighbouring panels read as simultaneous and there was no
 * ripple to see at all. The problem was never too much stagger; it was too
 * little. Second the order: a ripple through a liquid starts where it was
 * touched and spreads outward. Running down the document is a list loading.
 */
const STAGGER = 70;

/** How many keyframes the travel is cut into. Not smoothness — the browser
 *  interpolates smoothly between any two — but ACCURACY: see the long note at
 *  the sampling, where the shell's scale and its content's counter-scale have
 *  to multiply to 1 everywhere rather than only at a keyframe. Fixed at the
 *  law's own resolution so every sample is a real measurement of it. */
const STEPS = LAW.length - 1;

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

/** The curve the outgoing copy leaves on. Front-loaded on purpose: it has to
 *  stop being a second readable page almost at once, while its GEOMETRY keeps
 *  travelling for the full duration underneath. How LONG it takes is OUT_MS,
 *  in wall clock, so this does not stretch when the pace does. */
const FADE_EASE = 'cubic-bezier(.3,.9,.4,1)';

/** How far out of focus the arriving content starts. The sample's
 *  `--slot-soften` at its dissolved setting. When it lands is READ_MS. */
const SOFTEN_PX = 9;

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
    // A PLACEHOLDER IS NOT A BLOCK. Asking this in swapped() alone was not
    // enough once the staff screens came in. swapped() only needs ONE real
    // arrival to let the morph play, and a loading staff page is not all
    // placeholder: Take Roll renders its Roll/Tracker toggle beside the bare
    // `.dir-loading` row, so the toggle satisfied swapped() and the panel next
    // to it was still morphed into the word "Loading". Dropping it here
    // answers both questions at once, since swapped() already reads a page
    // with no blocks as not arrived, and it keeps a placeholder out of
    // capture() and out of the gather branch as well.
    if (isPlaceholder(el)) continue;
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
  /** The outgoing elements themselves, kept for ONE question: has React
   *  actually swapped the page yet? See playWhenReady. */
  was: Set<Element>;
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

/** The most a child's subtree is worth scanning for glass before the answer
 *  stops being cheap. Panels hold a handful of rows, not a roster. */
const GLASS_SCAN = 48;

/**
 * Does this child carry glass, or hold anything that does?
 *
 * Such a child must not be given an opacity or a filter for the cross-fade:
 * either one makes it a backdrop root, which re-points the glass BELOW it at
 * the child's own painted content and flattens it for the length of the
 * morph. It gets the counter-scale and nothing else.
 *
 * A subtree too big to check cheaply is assumed to hold glass. Under-fading
 * one block is invisible; a card going flat half way through is the artefact
 * this whole layer exists to avoid.
 */
function holdsGlass(kid: Element): boolean {
  if (carriesGlass(kid)) return true;
  const all = kid.querySelectorAll('*');
  if (all.length > GLASS_SCAN) return true;
  for (const d of all) if (carriesGlass(d)) return true;
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
    was: new Set<Element>(els),
    rects: els.map(el => el.getBoundingClientRect()),
    radii: els.map(el => getComputedStyle(el).borderTopLeftRadius),
    clones: els.map(el => el.cloneNode(true) as HTMLElement),
  };
}

/**
 * Wait for the new page to BE THERE, then play.
 *
 * `router.navigate` resolves on COMMIT, and React paints on its own
 * schedule after that, so one `requestAnimationFrame` is not reliably
 * enough: measured on the real app, play() ran while the new page still had
 * no panels, every old panel took the "nothing to become" branch and melted,
 * and a tab change that should have reformed four panels dissolved one.
 *
 * WAITING FOR PANELS TO EXIST IS THE WRONG TEST, and it was a coin flip.
 * When the router resolves, the OUTGOING page is still mounted, so there are
 * always panels to find — the guard passed on the first frame whether or not
 * React had swapped anything. Measured on the built app, same page, same
 * click, eight runs: four morphed the page the person was LEAVING into a
 * shuffled version of itself (the pressed panel is moved to the front of the
 * captured list, so pairing old-with-old cross-matches every box), and then
 * the new page simply appeared with no morph at all. The other four were
 * correct. Nothing in the code was random; it was whether React had committed
 * before the first frame, which on a phone it usually has not.
 *
 * The right test is IDENTITY: the page has changed when a panel is on screen
 * that was not one of the ones just captured. React builds new elements for a
 * new route, so this flips exactly when the swap lands.
 *
 * The bound still matters, and now it has a second job. A navigation that
 * re-renders the same component with new props (a different `:id` on the same
 * route) can legitimately reuse every element, so the test would never flip;
 * after `tries` frames this plays anyway, which is the old behaviour and the
 * honest fallback. Twelve frames is about 200ms, under the time a person
 * reads as a delay and well over the one or two React needs.
 */
export function playWhenReady(shot: Shot, tries = 12): void {
  requestAnimationFrame(() => {
    if (tries > 0 && !swapped(shot)) { playWhenReady(shot, tries - 1); return; }
    play(shot);
  });
}

/**
 * Is REAL CONTENT on screen that was not on screen when the shot was taken?
 *
 * "New element" is not enough on the live site. A page that waits on Firestore
 * renders shimmer placeholders first, so the swap lands on a page made of grey
 * boxes: measured against the deployed site, one navigation in four morphed
 * the concert row into a skeleton card, and the real card then appeared behind
 * it. That is two transitions where the person asked for one. Nothing like it
 * shows up against fixtures, where the data is already there — which is why it
 * took running the probe against the live site to see it at all.
 *
 * A placeholder is therefore not an arrival, and panels() is where that is
 * now decided: a shimmer or a bare loading row is not a BLOCK, so a page made
 * only of them has no panels and this returns false on the count alone. The
 * test used to sit here instead, and it was too late. One real block is
 * enough to call a page arrived, which is right, but a half-loaded page then
 * played the morph with its placeholder still in the list of things to morph
 * into. If the data outruns the frame budget the morph plays anyway after the
 * bound, against the real blocks that are there and never into a placeholder.
 */
function swapped(shot: Shot): boolean {
  const now = panels();
  if (!now.length) return false;
  return now.some(el => !shot.was.has(el));
}

/**
 * Something standing in for content that has not loaded. The two shells say it
 * differently and the difference is why this is not one list.
 *
 * PUBLIC: a shimmer. SkeletonCards in public/components/PageHeader.tsx renders
 * them inside one aria-hidden wrapper, so the wrapper is the panel and the
 * shimmer is its CHILD, which is what the deep scan is for.
 *
 * STAFF: a bare loading row, `.dir-loading` (director/uiUpdates.css). It is
 * the block itself and never a wrapper, so `matches` is the whole of it and
 * the deep scan deliberately does not look for it: scanning would let a real
 * panel be thrown away for holding a loading row somewhere inside it.
 *
 * AND THE MARKER HAS TO MEAN ONLY ONE THING. `.dir-loading` does, which is
 * why it is the one named here. The other staff screens that print "Loading"
 * reach for `.dir-loc-empty` or `.dir-field-hint`, and those also carry
 * genuine empty states, error lines and hints, so treating either as a
 * placeholder would quietly stop a real block from reforming. A screen that
 * wants its loading row skipped says so by wearing `.dir-loading`.
 */
function isPlaceholder(el: Element): boolean {
  // .pub-signup-loading is on the MATCHES side only, and that asymmetry is
  // the whole point: three public pages (the sign-up, the copy request and
  // the absence report) render it as the sole child of .pub-page while they
  // wait, so without it those three morph into their own "Loading…" line.
  // But it is ALSO used nested inside real content — a Suspense fallback
  // while a PDF opens — so a deep scan for it would read a page that is
  // mostly there as a placeholder and refuse to morph it.
  return el.matches('.pub-skeleton-card, .dir-loading, .pub-signup-loading')
    || !!el.querySelector('.pub-skeleton-card');
}

/** LAST, INVERT, PLAY. */
export function play(shot: Shot): void {
  if (!morphOn()) return;
  // The curve the org config names is no longer asked for: the travel runs on
  // the LAW, played linear. See the constant for why no bezier can do this.
  const { ms } = timing();
  // A second navigation mid-flight: drop the first rather than compose with
  // it, or the two fight over the same transform.
  for (const a of document.getAnimations()) if (a.id === FLIP_ID) a.cancel();

  const now = panels();
  const host = ghostLayer();

  /* THE RIPPLE SPREADS FROM THE TAP. Rank every panel by how far it is from
     the one a finger landed on (or from the top of the screen when nothing
     was tapped), and let that rank buy the delay. Document order made the
     change run down the page like a list loading; distance makes it travel
     across the screen like something displaced. */
  const originY = shot.anchored && shot.rects[0]
    ? shot.rects[0].top + shot.rects[0].height / 2
    : 0;
  const away = shot.rects.map(r => Math.abs(r.top + r.height / 2 - originY));
  const place: number[] = [];
  shot.rects.map((_, i) => i)
    .sort((a, b) => away[a] - away[b])
    .forEach((idx, rankAt) => { place[idx] = rankAt; });

  for (let i = 0; i < Math.max(shot.rects.length, now.length); i++) {
    // THE LAG IS PAID FOR OUT OF THE DURATION, NOT ADDED TO IT. Liquid does
    // not start all at once, but it does finish all at once: in the sample the
    // delay grows with the panel and the duration shrinks by exactly as much,
    // so the last panel still lands on the beat the duration promises. The app
    // added the delay on top instead, so a four-panel page took 1500ms + 240ms
    // and the panels arrived one after another, which is what reads as a page
    // settling in instalments rather than reforming.
    // And the lag is a FRACTION of the duration, not a fixed 40ms. With a
    // fixed one, `ms - delay` reaches zero at morphMs 240 and goes negative
    // below it, and element.animate throws on a negative duration — morphOn()
    // only guards ms > 0, so a short morph in some future org config would
    // break every navigation in it. A fraction cannot do that, and it is also
    // what the sample does: the ripple stays proportionate at any pace.
    // Paid OUT OF the duration, never added on top, so every panel still
    // lands on the beat the duration promises however late it set off. And
    // capped, so a long page cannot push the last panel past the end: with a
    // floor on the duration there is no way to reach a negative one, which is
    // what element.animate throws on.
    const delay = Math.min(place[i] ?? i, 5) * STAGGER;
    const dur = Math.max(ms - delay, 200);
    const opts: KeyframeAnimationOptions = { duration: dur, easing: 'linear', delay, fill: 'both' };

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

      // MEASURE THE CHILDREN FIRST, while nothing has moved. The shell
      // animation below is created with fill: 'backwards', so from the moment
      // it exists the panel is already wearing its starting transform and
      // every rect inside it is the transformed one.
      //
      // The old code sidestepped that by using offsetLeft/offsetTop, which are
      // layout values no transform can touch. But those are measured from the
      // nearest POSITIONED ancestor, and a page block is `position: static`,
      // so offsetParent was <body> and the numbers were the child's distance
      // from the top of the PAGE rather than from its panel. Measured on the
      // event page: a hero's first child reports (16, 192) where its true
      // offset inside the panel is (0, 0), so the counter-scale shoved it
      // 192px up the screen for the whole flight. Rects relative to the panel
      // are the right answer; they only have to be read before anything moves.
      const kids: Array<{ el: HTMLElement; x: number; y: number; fade: boolean }> = [];
      for (const kid of el.children) {
        if (!(kid instanceof HTMLElement)) continue;
        const kr = kid.getBoundingClientRect();
        kids.push({ el: kid, x: kr.left - to.left, y: kr.top - to.top, fade: !holdsGlass(kid) });
      }

      const r = num(getComputedStyle(el).borderTopLeftRadius);
      // How much the box thins across its direction of travel at the fastest
      // moment. Liquid in a hurry is not the shape it is at rest. Scaled by
      // the distance, so a short hop does not squash at all.
      const hurryMax = Math.min(0.05, Math.hypot(dx, dy) / 4000);
      // THE PATH, SAMPLED — and this is what keeps the text the right shape.
      //
      // The shell scales by s and the content counter-scales by 1/s, so the
      // product is 1 and the words stay the size they are. That is true AT a
      // keyframe and nowhere else: between two keyframes the browser
      // interpolates s linearly and 1/s linearly, and the product of two
      // straight lines through 1/s is not 1. With three keyframes the gaps are
      // enormous (0 to 0.72, then 0.72 to 1) and the error peaks around +24%
      // for a panel growing from 0.4 — a quarter of the way too big, in the
      // middle of the flight, which is exactly the stretch this layer exists
      // to remove. Two independent passes over the frames caught it on two
      // different pages: "condensed horizontally, narrow tall letterforms".
      //
      // So both sides are sampled from the SAME path at the same offsets. The
      // residual error is quadratic in the gap between samples, so going from
      // 2 segments to STEPS of them takes roughly +24% down to a fraction of
      // one per cent, which is under a pixel on a line of type.
      //
      // Sampling in progress space is right even with an easing on the
      // animation: the easing decides WHEN each progress value is reached, and
      // it is the same easing for the shell and for its children, so they
      // arrive at matching samples together.
      // Sampled at the law's own points, so linear interpolation between them
      // reproduces the curve exactly rather than approximating it.
      const path = LAW.map((v, k) => ({ offset: k / STEPS, v }));

      /* THE SHELL. Geometry only, as ever: the card is an ancestor of its own
         glass, so an opacity or a filter here would flatten it. What changed
         is what the geometry is made of.

         POSITION rides the law and simply stops. CURVATURE carries the
         overshoot instead: the corners swell by half again as the panel lets
         go, stay loose while it flows, and come home through one damped
         wobble. That is the brief's own sentence — lose the edge before
         moving and regain it on settling — said in the only property a glass
         panel is allowed to have animated. A rectangle whose corners are
         relaxing reads as a surface finding its level; a rectangle that
         carries past its mark and comes back reads as a spring, which is the
         thing liquid is defined against. */
      const shell = el.animate(path.map(({ offset, v }) => {
        const ex = sx + (1 - sx) * v;
        const ey = sy + (1 - sy) * v;
        const hurry = Math.sin(Math.PI * offset) * hurryMax;
        const ax = ex * (1 + hurry);
        const ay = ey * (1 - hurry);
        const swell = offset < .5
          ? 1 + .55 * (offset / .5)
          : 1 + .55 * Math.exp(-6 * (offset - .5)) * Math.cos(11 * (offset - .5));
        return {
          offset,
          transformOrigin: '0 0',
          transform: `translate(${dx * (1 - v)}px,${dy * (1 - v)}px) scale(${ax},${ay})`,
          // Pre-divided by the scale on each axis, or a circular corner comes
          // out as an ellipse for the whole flight.
          borderRadius: `${(r * swell) / ax}px / ${(r * swell) / ay}px`,
        };
      }), { ...opts, fill: 'backwards' });
      shell.id = FLIP_ID;

      // The counter-scale, one animation per child, in the animation layer
      // only. See the header: no wrapper, no DOM mutation, React untouched.
      //
      // AND THE CONTENT CROSS-FADE, which the app did not have at all. In the
      // sample the arriving content rises out of nothing and un-blurs as the
      // box settles while the outgoing copy fades out over it, and that PAIR
      // is most of what reads as liquid rather than as a box being resized.
      // The app had only the outgoing half, so the new text appeared instantly
      // at full strength inside a box that was still the wrong size and still
      // travelling — sharp new words sliding around inside a growing rectangle.
      //
      // Opacity and a filter on a CHILD are safe for the panel's own glass.
      // The backdrop-root rule re-points a DESCENDANT's backdrop-filter, and
      // the panel — along with the ::before it keeps its pane on — is an
      // ANCESTOR of these children, not a descendant. A child that carries
      // glass of its own, or holds one that does, is the exception, and gets
      // the counter-scale alone.
      for (const kid of kids) {
        const back = (ax: number, ay: number) =>
          `translate(${(kid.x * (1 - ax)) / ax}px,${(kid.y * (1 - ay)) / ay}px) scale(${1 / ax},${1 / ay})`;
        // The same offsets as the shell, so every sample is an exact inverse —
        // AND THAT INCLUDES THE SQUASH. Leaving it out of the counter-scale
        // was tried and measured: the content then ran 4.4% out of shape at
        // the fastest moment, which is the same artefact, by the same amount,
        // that two separate reviews caught as "condensed, narrow and tall".
        // Squash and stretch has always worked this way — the CONTAINER
        // deforms and the features inside it stay readable. The box still
        // visibly thins across its travel; the words do not.
        //
        // The moment the words become sharp is a wall-clock one, READ_MS from
        // the start of the whole transition — see the constant. A panel that
        // set off late simply resolves earlier in its own progress, so the
        // page becomes readable at the same instant however long the morph is
        // and whatever order the panels left in. That is what lets the pace go
        // to the slowest setting without it feeling like a wait.
        const readAt = Math.max(.08, Math.min(.92, (READ_MS - delay) / dur));
        const a = kid.el.animate(path.map(({ offset, v }) => {
          const hurry = Math.sin(Math.PI * offset) * hurryMax;
          const ex = (sx + (1 - sx) * v) * (1 + hurry);
          const ey = (sy + (1 - sy) * v) * (1 - hurry);
          const f: Keyframe = {
            offset,
            transformOrigin: '0 0',
            transform: offset === 1 ? 'none' : back(ex, ey),
          };
          if (kid.fade) {
            const g = Math.min(1, offset / readAt);
            f.opacity = g;
            f.filter = `blur(${(SOFTEN_PX * (1 - g)).toFixed(2)}px)`;
          }
          return f;
        }), { ...opts, fill: 'backwards' });
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
      // It travels its counterpart's path, on the law, so the old copy and
      // the live panel under it move as one thing rather than drifting apart.
      const gt = ghost.animate(path.map(({ offset, v }) => ({
        offset,
        transform: `translate(${(to.left - from.left) * v}px,${(to.top - from.top) * v}px) `
          + `scale(${1 + (to.width / from.width - 1) * v},${1 + (to.height / from.height - 1) * v})`,
      })), opts);
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
      ], { ...opts, duration: Math.min(dur, OUT_MS), easing: FADE_EASE });
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
      ], { ...opts, duration: Math.min(dur, OUT_MS), easing: FADE_EASE });
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
