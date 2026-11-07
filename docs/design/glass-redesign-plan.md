# Glass on the Hub

A plan for making the Hub glassy, in the style of the "Glassy Dashboard V2"
reference, without losing the refinement of the approved Hub 2.0 look.

Sample: `docs/design/glass-sample.html` (also published as **Glass Hub**).
Written 2026-11-06, revised the same day through four rounds of the
director's notes. Nothing in here has been built into the Hub yet.

**Round four is the current state, and it changed the transition and
nothing else.** Section 2 has the contrast work, section 6 the numbers,
**section 8c what the transition is and why the View Transitions API is no
longer in this file**, section 8b the edges, and section 12 is the one-page
summary.

**Section 8 is history now, not instructions.** It describes how to build
this with the View Transitions API, and every word of it about that API is
accurate. It is kept because the reasoning is worth having and because it
records two rounds of why the result kept being rejected. It is not what the
sample does. If you are reading one section, read 8c.

The measurement script lives beside the sample:

```
python3 -I docs/design/glass-contrast.py docs/design/glass-sample.html
```

---

## 1. What this is, and what it is not

It is **not a fourth look**. Studio Bright, Concert Hall and Spotlight stay
exactly as approved on 2026-11-03. Glass is a *depth* layer added on top of
all three: it changes how surfaces sit in space, never what colour they are.

It rides the switch that already exists. Every rule is scoped to
`:root[data-hub2="on"]`, so with the preview off the site is byte-identical
to today, and glass reaches everyone only when you say so.

### What the reference actually is

The TikTok is a Tailwind dashboard: `.glass-card`, `backdrop-filter`, a
white edge, `framer-motion whileHover={{ y: -5 }}`. No exotic technique, no
WebGL, no SVG refraction. Everything in it is reachable with plain CSS and
needs no new dependency.

What makes it work is not the blur. It is that the cards sit on a
**photograph**. Blur something flat and you get the flat thing back. This
matters more than any other sentence in this document.

### What your own mockups already said

"Frosted glass cards" is in the Spotlight prompt from 2 November, mobile and
desktop both. Glass is already in the approved direction. It is just fenced
into concert night. This plan takes the fence down.

---

## 2. The one thing that has to change first

`hub2.light.muted` is `#66717F`. On the page colour `#F4F6F8` that measures
**4.579:1** against a 4.5:1 bar. Seventy-nine thousandths of headroom.

Anything placed behind that grey text darkens the background and pushes it
under the line. So with the current palette, the strongest background wash
the Hub can carry is alpha **0.010**, which is invisible. The glass idea is
dead on arrival until this moves.

**Change `hub2.light.muted` to `#5D6773`** (5.31:1 on the page, 5.75:1 on
white). That token is only ever used as text, in two places, so nothing else
can regress. It is a one-line change in `config/orgs/nwsa.json` and it is
the gate for everything below.

### The light field has to be additive, and that is the whole trick

Round three. The sentence above is still true and it is still not enough,
because a dark wash over a pale page spends that 5.31:1 immediately. The
first two rounds hit this and quietly chose a field nobody could see: at the
alpha that kept muted text legible, the blur had nothing to blur. The one
sentence in section 1 that matters, *blur something flat and you get the
flat thing back*, was being violated by the contrast gate itself.

The way out is to turn the field upside down.

- **Deepen the page by a fixed amount** (`rgba(16,24,40,.035)` on the field
  element, not on `--hub2-bg`), so it reads 236,238,241 instead of 244,246,248.
- **Make every orb BRIGHTER than that**, measured by luminance, not by eye.

Now the darkest pixel on the page is a fixed, known colour, and the orbs can
be as strong as you like, because brightening a surface can only ever raise
contrast for dark text. The alpha budget disappears as a concept. The orbs
run at 0.88 to 0.95 instead of 0.038.

The cost is that the colours must be pale, since luminance and saturation
trade off in sRGB and the green channel carries 72% of luminance. The teal
is `#D2F5FD`, the gold `#FFF2B8`, the lilac `#F8ECF9`; magenta is the hard
one and the lilac is as saturated as it gets at that luminance.
`saturate(190%)` in the panel's own `backdrop-filter` pushes the colour back
up exactly where the glass is, which is where you want it.

**Dark is the opposite trade and needs none of this.** Every white alpha
lightens a near-black page under light text, so more transparent is also
higher contrast: the two goals point the same way. The dark field runs at
0.13 with the brand hues and the dark panels sit at 0.022 to 0.04.

### Three more token failures found by measuring

- **`--hall-gold-text` #8A6D10 measured 4.39:1** on the composited light
  glass. Darkened to `#7E6410` (5.32:1). Sample-only token: it appears
  nowhere in `config/orgs` or `src/`.
- **Spotlight's muted `#B6AECB` measured 3.55:1** over the teal glow. This
  was already failing in rounds one and two. Lightened to `#D5CEE6`, which
  is the right direction for a dark theme.
- **The travelling shine was painting OVER the text** with
  `mix-blend-mode: overlay`. Overlay with white DOUBLES any channel below
  0.5, so muted grey (93,103,115) was being dragged to (133,147,164) every
  time the band swept past, and no contrast model that measures the surface
  would ever have caught it. The shine and the fill veil now sit at
  `z-index: -1` inside the card's own stacking context: above the card's
  background, below its text.

### The measurement is a script, not a table

`docs/design/glass-contrast.py` composites the real stack — page, field base, orb,
`backdrop-filter` saturate and brightness, card tint, veil, shine — and
reports every text colour on every surface for all six combinations of
theme and glass preset. It models each direction at its own worst case:
in light the veil and shine brighten the surface and are therefore left
OUT, in dark they are left in. It also pins itself to the stylesheet by
checking that 31 exact declarations are present, so the model cannot drift
away from the CSS without failing.

Worst case across everything after this round, against a 4.5:1 bar:

| | ratio | where |
|---|---|---|
| Spotlight gold `#E4C968` | 4.60:1 | hero card over the teal glow |
| dark accent `#3AA8B8` | 4.61:1 | a row over the white spark |
| light accent `#0E7585` | 4.64:1 | bare page, no card |
| light hall gold `#7E6410` | 4.87:1 | bare page, no card |
| Spotlight muted `#D5CEE6` | 4.94:1 | hero card over the teal glow |
| light muted `#5D6773` | 4.95:1 | bare page, no card |

No failures. Note where the worst cases sit: **four of the six are text on
the bare page with no card under it at all.** The glass is not the problem.
Headings and subtitles on open page are.

---

## 3. The four parts

### 1. The field

One soft wash of teal and plum, fixed to the window, behind the whole page,
drifting very slowly. This is what gives the blur something to do.

The trick that makes it safe: put the wash on the `html` element and set
`.pub-app { background-color: transparent }`. **background-color only, never
the `background` shorthand**, which would silently erase all seven student
patterns and all eleven season drawings at a specificity nothing checks.

The page background is already claimed by 7 patterns, 2 tints and 11
seasons. So the wash switches itself off whenever `data-pub-look-tint`,
`data-pub-look-bg` or `data-pub-season` is set. A student who chose a colour
keeps the colour they chose. Same pair of rules again for `.dir-app`.

### 2. Chrome glass, at most three at a time

The top bar, the menu rail, the phone tab bar, the drawers and the overlay
sheets go translucent. These are the only surfaces with genuinely moving
content behind them, so they are the only ones where a real blur earns its
cost. A fixed, small number on screen at once.

Lifting the bars off the screen edge is the single change that reads most
strongly as glass, because you can see the page sliding underneath. For the
header that is free. **For the tab bar it is not**: its height is a number
that `--pub-tabbar-h` and three hand-maintained `--nwsa-bottom-chrome`
values measure from, including the one that positions the service-worker
update toast. That is the PWA update invariant. Worth doing, on its own,
with care, not folded into a styling pass.

### 3. Hero glass, one per page

The one card that matters: what is on now, tonight's concert, what you owe.
Real frosted treatment, exactly one per screen, so the cost is fixed no
matter how long the page gets.

### 4. Everything else gets the look and not the technique

Every list row and ordinary card gets the glass **edge**, the radius and the
press, over a semi-opaque fill, with **no blur at all**. At a glance it
matches. This is the whole performance answer, and the numbers say it is not
optional:

- the public calendar renders **2,059 uncapped event cards**
- the densest staff screen carries **400 to 686 card surfaces** in one
  non-virtualised list
- this project has already measured a stall at **140** elements doing
  something far cheaper than a blur

A 78% fill over a visible colour field reads as frosted, creates no
compositing layer and runs no blur pass.

### And the lift

Cards rise a few pixels under a pointer. Keep it off `:hover` on staff
screens: the school's iPads land on the desktop breakpoint while being touch
devices. Use the `--hub2-press-scale` dip that already exists instead.

---

## 4. Four findings that change the design

These came out of a six-way audit of the codebase and would each have cost a
day to discover by building.

1. **The soft scroll reveal severs the blur.** `opacity: var(--hub2-reveal)`
   makes an element a backdrop root, so every card inside a block that is
   scrolling into view loses its glass. Measured, not theoretical. Glass and
   the reveal cannot share a subtree. Pick one per block.

   **Round three found this live in the sample and it is worse than
   "pick one per block".** The hero card carried the glass AND the reveal, so
   its blur was dead for the entire reveal and popped in at the end. Three
   things make this the single easiest mistake to ship:

   - It is **silent**. Not an error, not a warning, no fallback. The blur is
     simply a no-op and the panel is flat.
   - The full trigger list is larger than opacity: `opacity` below 1,
     `filter`, `mask`, `mask-image`, `clip-path`, `mix-blend-mode` other
     than normal, and `will-change` naming any of them. **`will-change:
     transform` is safe; `will-change: opacity` is not.**
   - **You cannot catch it by eyeballing it cross-browser**, because the
     three engines disagree about the nested case and the spec-conformant
     one, Chrome, is the one that shows no glass at all. Looking at Safari
     and seeing glass proves nothing.

   The fix in the sample: glass surfaces reveal by **transform alone**.
   Everything else keeps the fade, because nothing else carries a blur.

2. **A white edge is invisible on light glass.** It measures 1.06:1 against
   the card. The light-mode edge must be **teal** at about 35% (1.65:1), or
   80% where the card is clickable. White edges are correct in dark mode
   only. The first draft of the sample had this wrong.

3. **The staff shell has nothing to refract.** Its layout areas never
   overlap: one scroller, non-overlapping grid columns. Glass on the rail or
   header there would pay the full blur cost to blur flat paint. Real blur on
   staff screens belongs on overlays and drawers only.

4. **A new stylesheet would escape every guard.** `hub2.selfcheck.ts` names
   its three files literally. A `hub2Glass.css` containing an unscoped rule,
   a colour literal and a line outside `@media screen` passes CI green. So
   the glass goes **into the three existing files**, or the check's file list
   is widened in the same commit.

---

## 5. The rules CI already enforces

The next session must know these or it will fight the build.

- **No colour literals.** No `rgba()`, no hex, no `hsl()` in the three hub2
  files. Every translucency is
  `color-mix(in srgb, var(--hub2-surface) 72%, transparent)`.
- **`hub2Public.css` is exactly one top-level `@media screen` block.** Nest
  `@supports (backdrop-filter: blur(1px))` inside it. A second top-level
  block fails.
- **Every selector starts with the scope prefix, as a literal string.**
  `:where(:root[data-hub2="on"])` fails. `body[data-hub2="on"]` fails.
- **Animations carry `infinite` or `backwards`.** `fill-mode: both` and
  `forwards` are banned, because a permanent compositor layer is what once
  put dropdowns under the next section. The drifting field must say
  `infinite alternate`.
- **In `hub2Staff.css`, no `animation` or `transition` before the first
  `prefers-reduced-motion: no-preference` block.** `animation-timeline` is
  banned there outright.
- **No CSP change is needed** for CSS glass. An off-origin font or a CDN
  animation library would be refused by the policy and must be self-hosted.

---

## 6. The numbers

Verified against all 42 combinations of page and glass, teal/plum/sun wash,
stock/warm/mist tint, light and dark. Worst case across every one: ink
11.30:1, muted 4.86:1, accent 4.55:1. No failures.

**Superseded by round three.** The table below is the round-two model and
the "floor of 0.55" in it was wrong, for the reason given in section 2. The
numbers that hold now are these:

| | light / Full | dark / Full | Spotlight |
|---|---|---|---|
| chrome fill | **0.14** | 0.022 | 0.04 |
| hero fill | **0.17** | 0.026 | 0.05 |
| row fill | **0.30** | 0.04 | 0.07 |
| blur | 28 to 34px | 28 to 34px | 28 to 34px |
| backdrop filter | saturate 180-190%, **brightness 1.04-1.05** | saturate 180%, **brightness 0.90** | saturate 170%, brightness 0.92 |
| field | base 0.035 dark + orbs at 0.88-0.95 **brighter than the base** | teal 0.13, plum 0.12, **no gold lobe** | teal 0.38, plum 0.48 |
| muted token | **#5D6773** | #97A3B2 unchanged | **#D5CEE6** (changed) |

Blur going UP while fill goes DOWN is the point: at 0.14 the panel is barely
a tint, so the blur is doing nearly all the work of separating it from the
page. That is also the performance line to watch, and it is why the row tier
still has no blur at all.

The round-two table, for comparison:

| | light | dark |
|---|---|---|
| glass fill | 0.72 (free, 0.55 to 0.85) | 0.06, **ceiling 0.075** |
| blur | 10px | 12px |
| edge | teal 0.35, or 0.80 on a control | white 0.14, ceiling 0.22 |
| wash per lobe | 0.055, ceiling 0.120 | teal 0.10, plum 0.30 |
| muted token | **#5D6773** (changed) | #97A3B2 unchanged |

No gold lobe in dark Studio Bright: gold fails the accent at every alpha.
**Leave Spotlight's own values alone.** They already measure 14.50:1 and are
tuned to a brighter palette.

Caps to hold: at most 6 glass elements visible at phone width and 10 at
1024px and up, blur never above 12px, blurred area under about a quarter of
the window.

---

## 7. The phases

Each is one pull request. The merge freeze dates (16 and 30 November,
3, 9, 10 and 12 December) are concert days, so nothing merges on them.

**Phase 1. The field, alone.** The muted token change, the wash on `html`,
the transparent `background-color` on both shells, the opt-outs for tints
and seasons. No glass yet, no blur anywhere. The page gains depth and the
cost is one painted gradient. Ship this and look at it on your own iPad
before anything else lands. If the field alone looks wrong, nothing after it
can save it.

**Phase 2. The edge, everywhere, with no blur.** Every card and row gets the
teal hairline, the radius and the press dip. Still zero `backdrop-filter`.
This is where most of the visual change actually happens, and it is free.

**Phase 3. Real glass on the chrome and the overlays.** Header, rail,
drawers, sheets. The blur becomes a token read from a new `hub2.glass` block
in the org config, zeroed by `prefers-reduced-transparency: reduce`, by
`@supports not (backdrop-filter: ...)`, and by setting the config value to
`0px`. One word turns the whole thing off. The self-check that pins the caps
and the dark alpha ceiling lands with this phase, because this is the phase
that introduces the thing worth guarding.

**Phase 4. Hero glass and the lift.** One frosted card per page, the pointer
lift, the number and chart entries. The reveal exclusion list grows here.

**Phase 5. The three looks get their own glass.** Concert Hall gets a warmer
field and a gold edge; Spotlight is already right and is the reference the
others now match.

**Phase 5b. The morph.** Section 8. It is independent of the glass and could
go earlier, but it wants a real iPhone in hand first. One drill-down to start
with, the concert row, before it goes near a roster.

**Phase 6, separate and optional. Float the bars.** The header is easy. The
tab bar touches the PWA toast numbers and gets its own careful change.

Before any of it reaches everyone, `src/shared/whatsNew.ts` gets an entry in
the same commit.

---

## 8. The morphing transition

Added 2026-11-06 at the director's request: page elements should morph into
the next page's elements, slowly enough to be felt.

The browser does this natively, and the Hub already calls the API for its
wipe. The change is choreography, not machinery. Verified working in the
sample: both directions, no duplicate-name skip, all eight pseudo-elements
present, and photographed mid-flight.

### How it is built

- **The shared element.** Before the page changes, the tapped row gets
  `view-transition-name: m-card`; the block it opens into gets the same name
  inside the update callback. The browser tweens the box. Cleared on
  `finished`.
- **Frost, not a swipe.** `::view-transition-old(root)` blurs out and shrinks
  to 0.985; `::view-transition-new(root)` resolves from a heavier blur. The
  named card is lifted out of the root snapshot automatically, so it rides
  above both, sharp the whole way.
- **Peer navigation keeps the wipe.** A tab change shares nothing, so it
  dissolves. Only a drill-down morphs. That distinction is the feature.

### Five rules it must keep

1. **One name per side. Not four.** The snapshot tree is flat: every named
   element becomes a sibling, not a child. Name the title separately and on
   WebKit it escapes its own card's rounded corner and clipping, with no way
   to restore the hierarchy. Name the card; let the text cross-fade inside it.
2. **`mix-blend-mode: normal` on old and new.** The UA default is
   `plus-lighter`, which sums two identical pictures back to the original. A
   morph is two different pictures, so on a pale glass panel the overlap
   blows out to a white flash.
3. **`object-fit: contain` on old, `cover` on new, `height: 100%`.** Without
   that pair the text stretches as the box grows.
4. **Force layout before the call.** WebKit bug 290146: a name set in the
   same tick is not picked up, because layout has not run when the snapshot
   is taken. Reading `document.documentElement.clientWidth` fixes it.
5. **A duplicate name does not degrade, it skips the whole transition**, and
   a skipped transition is indistinguishable from an unsupported browser.
   Clear every name before setting new ones.

### Support, and the one real risk

Same-document View Transitions shipped in **iOS Safari 18.0** (September
2024), on by default, pseudo-elements included. Cross-document ones are
18.2. Below 18.0 the page simply changes, which is correct.

**This is worth being blunt about, because it is a decision and not a
detail.** The Hub's floor as a whole is iOS 16.4, which is what push
notifications need. The morph's floor is **iOS 18.0**. On 16.4 and every
17.x there is no API at all, so the one thing described as the key thing
that needs to happen is simply absent on part of the fleet. Nothing breaks
— those phones get the page change the Hub's existing wipes already give
them — but how much of the school that is, and whether it matters, is the
director's call, not something to paper over. Building a second,
non-transition morph path to cover those phones is a separate decision with
a real cost, and is not recommended on the quiet.

**The risk: WebKit bug 285400.** WebKit did not implement the Snapshot
Containing Block, so group animations are computed against the viewport and
the starting position is offset **when the page is scrolled**. The gesture
this feature is made of is "scroll a list, tap a row", on exactly the fleet
that has the bug. I could not confirm from any source whether it has shipped
a fix. **Test on a real iPhone before this goes anywhere near students.** If
it is still broken, the morph stays a desktop enhancement and phones keep the
wipe, which is a one-line media query.

Two smaller ones: panels mounting inside a transition cause white flashes on
iOS (bug 300877, fix version unconfirmed), so keep the glass drawer outside
`startViewTransition`; and Safari gets slow past roughly 35 named elements,
which is far above the two this uses.

### Round three: the liquid morph

**Superseded by section 8c, and so is the rest of section 8.** Round four
removed the View Transitions API from this file entirely, so the five rules
above, the support notes, the risk notes and everything in this subsection
are a record of an approach that is no longer used. Two reasons, both in 8c:
one name on the whole phone can only reveal one picture with another and can
never morph anything, and, decisively, Safari and Firefox switch
`backdrop-filter` off for the whole duration of a view transition, which
removes the glass rather than freezing it.

The crossfade was replaced with a reveal. Five changes, in the order they
matter.

**1. The phone is named, so the document holds still.** `.screen` gets
`view-transition-name: m-screen` while a transition runs. Without it the
root snapshot is the whole web page, and the reveal below clips the
heading, the controls and the notes away and back, which reads as a bug
rather than as motion. In the real Hub the viewport IS the page, so this is
a property of the sample, not of the technique.

**2. The new page pours out of the thing you touched.** Before the
transition, JS reads the tapped element's box relative to the phone and
writes `--morph-ox` / `--morph-oy` on the root.
`::view-transition-new(m-screen)` is then revealed by a `clip-path: ellipse()`
opening from that point. The two radii grow at **different rates on
purpose** — wide and flat first (`42% 13%` a quarter of the way through),
then round. A circle growing evenly reads as a wipe; an uneven front reads
as liquid. This is the highest-value piece, it is one property, and
`clip-path` on a view transition pseudo-element is the one technique here
with no open browser question against it.

A tab tap shares no element, so nothing morphs — but it still gets an
origin, and the page pours **up out of the tab that was pressed**. The same
idea without a shared card to carry it.

**3. The corner travels.** `::view-transition-old/new(m-card)` interpolate
`border-radius` from the row's to the card's. In Dissolved that is 18px
opening to 31px, and it is the cheapest possible way of saying *this is the
same object, changing*.

**4. It settles rather than stops.** `cubic-bezier(.22, 1.2, .3, 1)` on the
group and on both card images. The overshoot past 1 is surface tension: the
panel reaches its size, goes a hair past, and comes back.

**5. A band of refracted light crosses the whole transition.** It has to be
a NAMED element, because the view transition pseudo-elements paint above
every bit of ordinary page content — a plain fixed div would be hidden
behind the thing it is meant to decorate. Same shape as the gold edge in
`src/shared/hub2Motion.ts`: a div that lives in the DOM, is invisible, and
is named only while a transition runs. **The snapshot is a still picture,
so nothing inside it can animate**; the sweep is therefore on the group,
which moves the picture.

### The liquid warp, and the one decision inside it

Both held pieces came back cleared, and the second came back with a better
answer than the one that was asked for.

**Do not put the turbulence filter on a view-transition pseudo-element.**
Whether WebKit renders `filter: url(#id)` on a composited transition layer
is genuinely unknown: no web-platform test anywhere, no bug either way, and
a WebKit engineer has stated that accelerated filters cannot use SVG
filters, which is what a composited transition layer is. It could silently
render nothing. On an ordinary element the same construct is measured
working in the engine iOS Safari uses, with SMIL driving the primitive.

So the warp is on `#wave`, a real element, and the band of light bends
rather than travelling straight. `#wave` is also the one moving part of the
transition that **contains no glass**, which is the load-bearing reason:
`filter` makes an element a backdrop root, so warping the phone itself
would switch every pane of glass inside it to flat for the duration.

**`backdrop-filter: url(#id)` is ruled out entirely**, and it is worse than
unsupported. Safari accepts the declaration, renders nothing, and
`@supports` returns a **false positive**. WebKit 245510 has been open since
2022. This is why every liquid-glass demo of the last two years is Chrome
only, and it is the line to delete if anyone copies a technique off one.

Tuning, because the cost cliff is not where you would guess: it is **size,
not octaves**. Safari has a ceiling on the source-graphic size a filter will
process, and past it it tiles the effect into mismatched blocks or drops it
(WebKit 266295, open, specifically with `feDisplacementMap`). So the filter
region is 112% rather than the habitual 150%, which costs 2.25 times the
pixels on its own; `numOctaves` is 2, where cost is linear; and the
animation drives `scale`, not `baseFrequency`, because changing the
frequency regenerates the noise field every frame while changing the scale
only resamples the field that already exists.

### Duration

**Round three raises the default to 900ms**, with 420 and 1500 either side.
This is the second time slower has been asked for, so here it is, and the
tradeoff is worth one sentence rather than an argument: past about 500ms a
transition stops reading as caused by the tap and starts reading as lag, and
while it runs it **swallows taps**. A student moving quickly through the Hub
will feel that before they admire it. Quick is kept so the two can be
compared back to back. The exit is always shorter than the entry (620ms of
the 900) so the ghosting overlap stays brief.

### The scroll reveal

Scroll-driven animations (`animation-timeline: view()`), which the Hub already
uses for its soft reveal, need **iOS 26**. So on every iPhone between 18.0 and
18.7 the existing reveal does not run at all, while view transitions do. A
slower reveal therefore has to be built on IntersectionObserver plus a plain
CSS transition, which is what the sample uses, or most of the school will
never see it.

### How these frames were photographed, and what would not work

Worth recording, because three plausible methods failed and the fourth is
not obvious.

Chrome's `--virtual-time-budget` does not advance view transition
animations. So:

- **Seeking with JS does not work.** An rAF poll for `getAnimations()`
  exhausts before the pseudo-elements exist, and `vt.ready` never resolves
  at all under virtual time. Every "pinned" frame came out byte-identical.
- **`animation-play-state: paused` with a negative delay does not work.** A
  transition that never finishes never lets the compositor produce a frame,
  and headless Chrome hangs until it is killed.
- **Stretching the transition to 6 or 30 seconds does not work either**, for
  the same reason: it cannot complete inside the budget, so the shutter
  never opens.
- **What works** is letting a SHORT transition run in real time and sampling
  — vary the budget, shoot several, keep the frames that landed mid-flight,
  and read the moment off the picture rather than trusting a label.

And the in-app browser pane is no help here at all. While it is hidden a
view transition is not merely frozen, it is **skipped** — both WebKit and
Chromium throw `InvalidStateError: View transition was skipped because
document visibility state is hidden` — so `document.getAnimations()` comes
back empty and the transition appears never to have run. It had not run;
the page had simply navigated. Do not try to verify a morph through a
browser pane that is not actually on screen.

**And know that the Chrome screenshots overpromise.** WebKit captures view
transition snapshots at layout size and lets the GPU upscale them (bug
317712, open since June 2026), so a named group is already blurrier in
Safari than in Chromium before any filter of ours touches it. For a glass
look that is arguably in our favour, but the screenshots should not be
allowed to make a claim about sharpness on his phone.

A WKWebView harness was left at
`/private/tmp/claude-501/-Users-grantgilman-Projects-nwsa-music-hub/de170a08-4522-4f49-b8d1-6e3a624825bd/scratchpad/vt/`
(`wk.swift`, `test.html`, `smil.html`, `big.html`). It runs the same engine
as iOS Safari's renderer and will answer the open filter questions on any
machine with a visible display. It needs a display; do not try to make it
run headless.

## 8c. Round four: the panels reform, and the View Transitions API is gone

What you said, which is the whole specification:

> The wave across the screen is kind of annoying. I want it to look like a
> liquid change from one screen to the next. All of the glass elements reform
> like liquid into the new elements on the new page.
>
> A side-angled swipe is not the kind of transition that I asked for or
> described, so try again.
>
> However, everything else looks really good. I like the fact that you have
> found other ways to make these elements look very glass-like, but the
> transitions still lack what I am asking for.

The glass is finished and only the transition changed. Nothing in sections 2,
6 or 8b moved, and the contrast script still passes with all 31 pinned
declarations present and the same numbers to two decimal places.

### The finding that decided the architecture

**WebKit bug 302256: `backdrop-filter` is disabled outright for the entire
duration of a View Transition, in Safari and in Firefox, and explicitly not in
Chrome.** Filed November 2025, still open and unassigned, severity Major.

On the phone this is being designed for, a view transition does not freeze the
glass. It **removes** it. Every card goes flat for the length of the
transition and the glass snaps back on at the end. No amount of correct naming
fixes that, and nothing on this machine would ever have shown it, because
everything here is tested in Chrome.

That is the whole reason the View Transitions API is no longer in this file.
It is the right tool for a per-element morph and the wrong tool for a morph of
**glass**.

### And it is also the diagnosis of "pictures sliding"

`::view-transition-new()` is documented as a live representation, so half of
the earlier assumption was wrong. But **`::view-transition-old()` genuinely is
a static screenshot with the blur frozen into it**, cross-fading out over the
new side, and the default group animation scales both as replaced elements
with `object-fit`, which is literally image stretching.

So half of every morph was a photograph of a card being stretched and faded.
That is what you were looking at, and no amount of choreography on top of it
was going to stop it being that.

Round three compounded it by putting **one** name on the whole phone, which
meant the page was captured as a single flat picture and revealed by an
expanding ellipse with a band of warped light crossing it. You read the
ellipse as a side-angled swipe and the band as a wave, and both readings are
correct. With one name per page there is nothing for anything to morph into.

### What replaces it: FLIP

Let the new page lay out, measure where each card ended up, transform it back
to where its counterpart was, and animate the transform away. The card is a
**live element** the whole time.

That is not merely "not a snapshot". It is better than live: the
`backdrop-filter` is re-sampled in screen space every frame at the position
the card has reached, so **a card genuinely refracts whatever it is passing
over as it travels**. That was verified by animating a card across a boundary
between solid red and sharp stripes and freezing it mid-flight: it renders
half red-blurred and half grey-blurred with the split exactly on the boundary
it is over. No engine does that through a view transition.

The floor also drops. The morph needed iOS 18.0 before, which section 8 had to
flag as a real decision. A FLIP needs the Web Animations API, which every
browser this app supports has had for years.

### The trap, and it is specific to this file

The backdrop-root rule is **self versus ancestor**: `opacity`, `filter`,
`mask` and `mix-blend-mode` break a `backdrop-filter` only from an
**ancestor**, and an element already carrying `backdrop-filter` is a backdrop
root anyway, so piling more onto it changes nothing.

**"Break" is the honest word, not "kill", and the better model is worth
having.** An ancestor filter does not switch the blur off. It **re-points** it
at the filtered subtree's own painted content. Measured with a wrapper that
paints only its left half: the card whose backdrop falls inside the painted
area stays bit-identical to the control and still blurs, while the card whose
backdrop falls outside it goes crisp. Our cards sit in a subtree that paints
almost nothing, so the practical result is a flat panel either way, but the
mechanism is what tells you where a wrapper may safely go.

In this file the glass lives on `.tier-hero::before`, which makes **the card
an ancestor of its own glass**. So opacity on a card flattens that card. That
is round three's bug restated, and it rules out the technique that looks like
the obvious answer: overlaying the two counterparts and cross-fading them by
opacity, which is what Framer Motion and GSAP both do, would put **both**
cards flat for exactly the duration of the cross-fade.

So the practical rule for this file, and it fails the way a missing CSP
directive fails: **never put `opacity`, `will-change: opacity`, `filter`,
`mask` or `mix-blend-mode` on a card, on `.view`, on `.pad`, on `.screen` or
on the stage.** Nothing throws, nothing logs, the glass is simply gone.

Two measured non-escapes, so nobody spends an afternoon on either:

- **There is no cheap version of a filter.** `filter: blur(0px)`, an identity
  SVG filter, and `will-change: filter` with no filter set are all
  bit-identical in effect to `blur(8px) contrast(20)`. Declaring the intent is
  the whole cost.
- **`isolation: isolate` is a pure no-op here.** It neither creates a backdrop
  root nor repairs one. It is on `.screen` for z-index stacking and does no
  work for the glass in either direction.

### Apple's own split, which is the way out

`GlassEffectContainer` is documented as combining shapes that "morph
individual shapes into one another", and Apple's API notes describe animating
the shell and the content by two different mechanisms. Mapped onto this file:

1. **The shell** morphs its geometry and never fades. Transform and
   `border-radius` only, so its `::before` keeps live blur the entire way.
2. **The content** cross-fades, and the opacity goes on `.cw`, a **sibling**
   of the glass pseudo-element rather than an ancestor of it.

`.cw` is inserted by JavaScript around every panel's children after each
paint, so none of the nine page templates had to change, and it inherits the
card's own layout so a flex row stays a flex row. It has three jobs: the
opacity, the counter-scale, and a small blur in flight. The counter-scale is
not optional: without it the text stretches as the box grows, which is the
exact artefact this round exists to remove.

The outgoing content is cloned into a ghost layer, travels the same path as
its counterpart and fades out. That is the other half of the cross-fade. A
paired ghost is **content only**, with the glass tokens zeroed on the clone,
because its live counterpart is already carrying the real shell along the same
path and two translucent shells stacked read as one much denser shell.

### Pairing, and what happens to the odd ones out

The row you tapped and the block it opens into are the same object, so they
pair by **identity**. Everything else pairs by **position**: first with first,
second with second, because these pages hold completely different content and
there is no identity to pair on. The furniture flows into the furniture.

A panel with no counterpart melts out, or gathers itself in out of a haze.
Today's four quick actions have nothing to become on a concert page.

A tab tap morphs now too. In round three it shared no element so it only
dissolved; position pairing needs no shared element, so Today into Tonight
flows four panels into four. That turned out to be the clearest demonstration
of the idea in the whole sample.

Two conditions decide which panels take part, and both are load-bearing. A
panel must be **fully inside the scrolling area**, measured against the tab
bar rather than the bottom of the phone, and it must be **actually revealed**.
The row you tapped is always included whatever those say, because a row a
finger landed on is by definition on screen.

### Six things found by measuring, four of which were shipping

1. **The phone changed width depending on which page was in it.** `.stage`
   centres its children, which makes each one shrink-to-fit, and `.screen`
   asks for `width: 100%` of a parent that is itself sized by its content.
   Circular. The phone was 390px on the first screen and **360px on every
   screen after the first navigation**. It had been in the sample since it was
   written, and it took a FLIP to find it, because a FLIP reads boxes on both
   sides of a change and the two disagreed.
2. **Unpaired ghosts came back.** `fill: 'backwards'` holds the start pose
   through a stagger delay but applies nothing after the end, and a ghost's
   natural resting state is "fully visible". The melted rows reappeared at
   full strength half way through the morph and sat on top of the new page.
   Ghosts need `fill: 'both'` and are removed as they finish.
3. **The morph was over in 15% of its duration.** The overshooting curve
   inherited from round three, `cubic-bezier(.22,1.2,.3,1)`, is enormously
   front-loaded. With a view transition the opacity crossfade was carrying the
   time and it did not show; with a FLIP the geometry **is** the animation, so
   the panel arrived almost instantly and then sat still for the rest of the
   Pace setting. The settle is now an explicit keyframe at 72% that carries
   the box a few per cent past its mark and brings it back.
4. **The counter-scale broke the concert hero.** Once `.cw` carries a
   transform it becomes the containing block for every absolutely positioned
   descendant, so the hero's light beam and floor, which are positioned in
   percentages, collapsed for the whole flight and snapped back at the end.
5. **The reveal was measured mid-transition.** `wireReveal` has to read the
   scroller's box before it can decide what is on screen, and that read
   flushes layout, so adding `.in` a moment later animated over 1300ms instead
   of applying. Every panel measured 26px low and the lower ones fell outside
   the scroller and were dropped from the pairing.
6. **Both halves of the identity pair were held back from the positional
   pool even when only one of them existed**, so a card that failed the
   visibility test took its counterpart out of the morph with it, and the one
   card the whole feature is named after animated not at all.

### A known imprecision, left alone on purpose

The first forced layout after a page's worth of new nodes uses fallback font
metrics, so the concert title wraps onto two lines and its card measures 131px
tall at measuring time and 98px one frame later. Everything below it is then
measured about 33px out of place. An extra layout flush does not fix it: the
re-resolve needs a real frame, not another read.

The effect is bounded and self-correcting, because the animation ends at the
element's true box either way. Only the starting pose is off: that card begins
about a quarter too short, and two programme lines begin 33px high. The fix,
if it ever shows, is to pin each card at its first pose synchronously and
re-measure on the next frame. That was not built because it adds a state where
a backgrounded tab leaves cards pinned in place.

### The merge is an enhancement and is not built yet

Cards **fusing** with each other, rather than merely travelling into each
other, is our reading of the word liquid. It is available: the goo threshold
filter has to live inside an SVG `<mask>` applied to the glass layer, never in
a `filter`, and that was verified in Chrome with `backdrop-filter: invert(1)`,
which is binary and unfakeable. Two shapes fuse into one blob with a proper
concave fillet and the glass stays live underneath.

Three routes are closed permanently and are worth writing down so nobody
reopens them.

**The goo can never be applied to the glass cards themselves.** The threshold
matrix tail `19 -9` sends alpha below 0.474 to zero, and these cards sit at
0.14 to 0.22, so a threshold filter erases them outright. That is what a
threshold is, and no wrapper fixes it. A later render test closed every escape
from that: re-tuning the threshold so 0.17 survives makes the shape measure
255,255,255, fully opaque white, with the glass gone, and the gentlest
threshold that keeps any translucency still triples the opacity.
**That test's own headline over-reaches, and the distinction matters.** It
concludes the gooey route is dead in both engines, which is true of applying
goo to the CARDS and says nothing about the mask route, which it did not test.
A goo inside a `<mask>` thresholds opaque white rectangles; the glass alpha
never meets the matrix at all. That is why the Chrome render shows a fused
blob with live glass under it.

**One filter cannot do the merge and the soft edge at the same time.** This
was floated as an economy, a gentler multiplier giving both, and it is a false
one: once the feather is on, no neck forms at any gap, because the feather
zeroes the alpha in exactly the band where a neck would have to grow. They are
in direct conflict. The two-ramp mask stays.

**And the CSS-only `blur` plus `contrast` version is out** because it needs an
opaque uniform parent to pivot against, which would cover the colour field,
and it destroys text.

One tuning note if it is ever built: `stdDeviation` is literally "how far
apart can two shapes be and still look connected, in pixels". Shapes merge
while the gap is at or under 1x it. The render test measured at 8 with the
cards 18px apart and found no bridge, which is a mismatch rather than a wall;
a separate run bridged cleanly at 13 with a 10px gap. Re-sweep at 16 to 20 for
this layout and watch the corners, which round off by roughly that many
pixels.

It is not built here because the build order says so, and the order is right:
the FLIP morph and the content cross-fade are the spine, they satisfy the
sentence you wrote, and they have no open question on any engine. The merge is
Chrome-verified, Safari-unknown, and degrades to "no bridge". It also costs
real things: one full-bleed masked glass layer instead of one glass element
per card, which loses the per-card rim light that round two existed to get
right, and which changes the composite stack enough that the contrast script
has to be re-derived rather than re-run.

### How these frames were photographed

Round three's note lists four capture methods that do not work on this
machine and settles for sampling under `--virtual-time-budget`, which it
honestly calls a race. The race is unnecessary now.

**Drive Chrome over the DevTools Protocol in real time.** Node 26 has
`WebSocket` and `fetch` built in, so a sixty-line script with no dependency
launches headless Chrome with `--remote-debugging-port`, clicks the row, then
takes real screenshots as fast as the protocol allows and stamps each with the
real millisecond. A 1800ms morph yields about 28 frames spread evenly across
it, every time, with no virtual clock anywhere.

Harnesses in this session's scratchpad: `film.mjs` and `sheet.mjs` for the
frames, `why.mjs` for measuring what the code actually saw rather than what
the settled page looks like, and `check.mjs`, which walks all five navigations
and asserts for each that a FLIP ran, that ghosts were made and cleaned up,
that the stylesheet parsed whole, and above all that **no element carrying a
backdrop-filter has a faded or filtered ancestor mid-flight**. It walks the
ancestor chain rather than naming a list of suspects, so a wrapper added later
cannot slip through. It exits non-zero.

### What is still not verified

- **Nothing has been run in Safari or on an iPhone.** Every measurement here
  is desktop Chrome. The nine backdrop-root conditions have standalone test
  files; they should be run on a real phone before any of this ships.
- **No cost measurement anywhere.** A FLIP animates live glass, which is
  compositing a blur every frame at a moving position. Chrome on a desktop
  does it comfortably. That says nothing about an iPad.
- The round-three claim that WebKit renders nothing for `backdrop-filter:
  url()` came from a harness that **cannot photograph a backdrop-filter at
  all**, which was caught by putting an unfiltered baseline panel in the same
  frame and seeing it come back blank too. The conclusion is probably still
  right on the bug-tracker evidence, but not on that screenshot. New rule:
  every render probe of a backdrop-filter needs a no-mask, no-filter baseline
  panel in the same frame, or the result is unreadable.
- **That harness limit is now settled: stop trying.** Three independent
  attempts agree that no WKWebView snapshot on this machine can photograph a
  `backdrop-filter`, confirmed by a five-row page in which a row carrying no
  `backdrop-filter` at all rendered identically to the rest. The obvious
  workaround is gone too, since `CGWindowListCreateImage` was removed in
  macOS 26. Verifying any of this in WebKit means a real Safari or a real
  phone, and nothing short of that.
## 8b. The edges

The second of the three asks. "Too penciled" is three separate things and
they are three separate variables, which is what makes them adjustable:

1. **The 1px border line.** `--glass-ring-w`, set to `0px` in both soft
   modes. There is no `border: 1px` written anywhere in the stylesheet any
   more; every surface reads the variable.
2. **The hard inner specular line.** `inset 0 1px 0 white` replaced by a
   blurred inner highlight, `inset 0 4px 26px -9px`, plus a soft inner shade
   at the bottom. A line becomes a light source.
3. **The tight drop shadow.** Replaced by a wide low-alpha bloom in three
   layers out to 130px. In dark mode it cannot be a grey shadow, because the
   page is already darker than any shadow, so it is a dark halo plus the
   faintest white spill — that spill is what separates a 2%-alpha panel from
   the page behind it.

Plus a fourth that is new: **the fill is top-weighted rather than flat.** A
veil gradient stops at 54% of the card's height in Dissolved, so the bottom
of the panel sits at the base tint alone and gets dimmer toward its lower
edge instead of ending at full strength. That is the part of "rolls off"
that needs no mask.

A fourth segmented control, **Edges: Crisp / Soft / Dissolved**, so the
change is legible rather than something to take on faith. Crisp is round
two exactly.

### And the fifth, which is the honest one: the blur itself runs out

`--glass-fade`, 14px in Soft and 22px in Dissolved. Two linear ramps
intersected into a mask, so all four edges feather and the corners feather
twice. The panel stops being a rectangle that ends and becomes a patch of
blur that runs out.

Three constraints decide the shape of this, and none of them is optional.

- **The mask must be on the SAME element as the `backdrop-filter`.** That
  is what masks the whole composited result, blurred backdrop included —
  which is the entire point, since it is the BLUR that has to dissolve, not
  just the tint. Putting the mask on a parent and the blur on a child is
  the folk version and it is finding 1 of section 4 by construction: the
  child sits in an empty backdrop root, the three engines disagree, and the
  spec-correct one shows nothing. Nested `backdrop-filter`s do not stack in
  any engine either.
- **So it goes on a pseudo-element, not the card.** A mask on the card
  would fade the card's own TEXT out at the edges along with the panel. The
  blur, the tint, the veil, the inner highlight and the mask all live on
  one `::before`.
- **Standard `mask-composite` only.** It is Safari 15.4 and iOS 15.4, a
  year below the floor, and `-webkit-mask-composite: source-in` has been an
  *invalid* declaration in Chrome 120 and up — discarded, not honoured — so
  the prefixed form buys nothing anywhere. Separately,
  `-webkit-backdrop-filter` stays FIRST and unprefixed second: they are
  cascade aliases sharing one value, so the later declaration wins, and iOS
  16.4 and 17 have only the prefixed one.

The WebKit bug worth worrying about here, 142662, was **fixed in 2016**,
eight major versions below the floor, and WebKit carries its own regression
test for this exact construct. Chromium had the matching "the mask applies
to the background but the blur stays a hard rectangle" failure and fixed it
in Chrome 77. Safari, Chrome and Firefox all pass the current
backdrop-filter-plus-mask tests.

The failure mode is graceful, so the `@supports` guard is a belt rather
than a necessity: if `mask-composite` were ever dropped, both layers keep
the initial `add`, which is a union, so all four edges go fully opaque and
only the corners feather. Wrong, but visible and legible. The spec rules
out the vanishing case outright.

**The contrast question answers itself.** The mask can only ever move a
surface from its full tint toward the bare page, and the table in section 2
already measures both ends: the hero at full tint and the bare page with no
card at all. Both pass, so everything between them passes. Rows and the
quick-action tiles keep no mask at all — they carry no blur, so there is
nothing to dissolve, and a 44px row cannot spare 22px of feather top and
bottom.

**Worth trying next, not built:** a single data-URI SVG image mask, a white
rounded rect with an `feGaussianBlur` baked in. One mask layer, no
compositing, and a true rounded feather instead of two crossed linear
ramps, which is closer to "rolls off" than crossed ramps ever get at the
corners. It rides the SVG-as-image path Safari passes rather than the SVG
`<mask>` element path Safari still fails — but nothing anywhere tests it
over a `backdrop-filter`, so it is the experiment, not the default.

---

## 8d. The one thing to look at on your own phone

Everything in rounds one to three was checked in Chrome, against a model,
or against someone else's test suite. Three things can only be settled by
you holding an iPhone, and they are worth doing in one sitting.

1. **Does the soft edge actually feather, or is there still a rectangle?**
   No engine has a pixel test for a soft ALPHA GRADIENT mask over a
   `backdrop-filter`. Every passing test in every suite uses a binary
   clip-path. The behaviour is correct by spec and by WebKit's own layer
   structure, and nobody anywhere has photographed it. Put one glass card
   over something high contrast, on the oldest iPhone in the fleet, and
   look for a visible straight edge at the panel boundary. Also confirm the
   card has not gone **invisible**, which is the other way this could fail.
2. **Does a card still look like glass while it is MOVING?** This is the
   round-four question and it replaces the one that used to be here.
   WebKit 285400, about view transitions starting in the wrong place on a
   scrolled page, no longer applies: there are no view transitions in this
   file any more. What matters now is whether a live `backdrop-filter`
   keeps re-sampling as its element travels. On desktop Chrome it does, and
   beautifully: a card picks up the colours it passes over. Three WebKit
   bugs sit near this and none of them was testable here, all about a
   child's animation disturbing a parent's filter (219729, 201987, 306755).
   Tap a row, watch one card cross the coloured field, and look for the
   glass going flat or flickering while it moves.
3. **Does 900ms feel like life or like lag?** That is not a measurement,
   and it is the question the Pace control exists to answer.

## 9. What I could not verify

- **Nothing has been measured on real hardware.** The caps above are a
  model, not a measurement. Phase 1 exists so there is something to measure
  before committing to the rest.
- CI does not check build determinism. Build twice and diff `dist/sw.js` by
  hand after the first CSS change.
- The contrast gate reads opaque hex from the config and knows nothing about
  translucency. The three new assertions it needs are listed in the audit.

### Two bugs found on the way, unrelated to glass

- `src/public/components/gradientHero.css:83` sets `backdrop-filter` with no
  `-webkit-` prefix, so the hero has had no blur on any pre-18 iPad since it
  shipped.
- `director.css` has 37 uses of `--dir-card`, `--dir-muted`, `--dir-card-bg`,
  `--dir-chip-bg` and `--dir-accent` that are never defined and fall through
  to hardcoded white and grey. The Gradebook and Approvals cannot follow any
  look until those exist, and defining them is itself a visible dark-mode
  change those screens have never had.

---

## 10. What you decide

1. **How much glass.** The sample defaults to Full, and Full is now four
   times thinner than it was in round two.
2. **How soft the edges are.** Dissolved by default. Crisp is round two, so
   the two are directly comparable.
3. **How slow the transition is**, knowing that past about 500ms it reads as
   lag rather than life, and that it swallows taps while it runs. Default is
   now 900ms, which is well past that line and is what was asked for.
   Round four adds a second question underneath it: **how many panels should
   move at once.** Every one of them does today, because that is what was
   asked for. If it turns out to be busy rather than liquid, the fix is to
   pair fewer of them, and that is one number in the sample.
4. **Whether the bars come off the edge**, knowing the tab bar costs a
   careful separate change.
5. **Whether the cards should also FUSE, not just travel.** Two drops of
   water joining, rather than each panel flowing into its own counterpart.
   It is available and verified in Chrome, it is unknown in Safari, and it
   costs the per-card edge treatment that round two was about. Section 8c
   has the terms. This is the real decision left in the transition.
   The old item here, whether an iPhone below iOS 18 matters, is **gone**:
   that was the View Transitions floor, and there are no view transitions
   in this file any more.
6. **Whether Phase 1 ships on its own first**, which is what I would do.

## 11. Round three, in one page

Three things were asked for and all three are in the sample.

| Asked | Done |
|---|---|
| "It needs more transparency" | Panels 0.56 → **0.14**, made safe by turning the light field additive |
| "The edges are too penciled" | Border removed entirely, soft inner highlight, 130px bloom, top-weighted fill, **and the panel's own alpha fading out over its last 22px so the blur runs out instead of ending**. An **Edges** control to compare |
| "Slower, more of a morph, a liquid morph" | **900ms** default, `clip-path` ellipse reveal from the tap point, radius interpolation, overshoot settle, and a band of light bent by an `feTurbulence` displacement |

Nothing is held. Both of the pieces that were waiting on browser research
came back cleared, and the second came back with a better answer than the
one that was asked for: the turbulence goes on a real element, never on a
view transition pseudo-element.

### Five bugs found by measuring rather than looking

1. **The glass was dead during the reveal.** The hero card carried both the
   blur and the reveal's opacity, which makes it a backdrop root, which
   makes its own blur a silent no-op. Invisible in Safari, visible in
   Chrome, an error in neither.
2. The shine was painting **over** the text with `mix-blend-mode: overlay`,
   which doubles any channel under 0.5.
3. `--hall-gold-text` #8A6D10 measured **4.39:1** on light glass.
4. Spotlight's muted #B6AECB measured **3.55:1** over the teal glow, and had
   done since round one.
5. The round-two "alpha floor of 0.55" was an artefact of modelling the wash
   as if it sat on top of the text rather than behind the card.

Not one of these was visible by eye, and the first one could not have been
found by looking in a browser at all, because the engine that is correct is
the one that shows nothing. Four came out of compositing the real stack in
a script. That is the argument for having the script.

## 12. Round four, in one page

One thing was asked for and it is in the sample.

| Asked | Done |
|---|---|
| "The wave across the screen is kind of annoying" | Gone. The element, the name, the keyframes and the whole SVG turbulence filter it used, deleted, not hidden behind an option |
| "A side-angled swipe is not the kind of transition I asked for" | Gone. The ellipse opening from the tapped point and the origin that fed it are both removed, and nothing in the transition has a direction any more |
| "All of the glass elements reform like liquid into the new elements on the new page" | Every panel you can see is paired with the panel in the same position on the next page. The real card travels and resizes while the writing inside it fades across. A panel with nothing to become melts; a new one with nothing to come from gathers itself out of a haze |
| "Everything else looks really good" | Nothing else was touched. The contrast script passes with the same 31 pinned declarations and the same numbers |

**The reason the last two rounds could not have satisfied this, and it turned
out to be two reasons.** They put one name on the whole phone, and one name
means one flat picture, and a flat picture can only be revealed by another
flat picture. Underneath that, half of every morph was a **photograph** of a
card being stretched and faded, because the outgoing side of a view
transition is a static screenshot with the blur frozen into it. Now the real
card moves.

**And the thing that would have been invisible to us.** Safari and Firefox
switch `backdrop-filter` off for the whole duration of a view transition
(WebKit 302256, open). On your phone, the previous approach would not have
frozen the glass, it would have **removed** it: every card flat for the length
of the transition, glass snapping back at the end. Everything on this machine
is tested in Chrome, where it works. That one fact is why the whole mechanism
changed rather than the choreography.

The side effect is a lower floor. The morph needed iOS 18 before. It now needs
the Web Animations API, which every phone in the school has had for years.

**One bug found on the way that had nothing to do with the transition:** the
phone in this sample changed width depending on which page was in it, 390px on
the first screen and 360px on every screen after a navigation. It had been
there since the sample was written. A FLIP measures boxes on both sides of a
change, and the two disagreed.

**What to look at first, on a phone, not on a laptop.** Nothing in this round
has been run in Safari or on an iPhone, and the one thing that matters most is
simply whether the glass still looks like glass while a card is moving. Scroll
a list, tap a row, and watch one card as it travels.

**What is deliberately not built yet.** Cards fusing *into each other* like
two drops of water joining, rather than each flowing into its own
counterpart, is available and is Chrome-verified: the trick is that the goo
filter has to live inside an SVG mask rather than in a `filter`, or it kills
the glass it is shaping. It is held back because it is unverified in Safari,
because it costs the per-card edge treatment that round two existed to get
right, and because the morph you asked for works on every engine without it.
It is the obvious next round if you want it.

---

## 13. Round five: it is in the Hub

You chose Full glass, Dissolved edges and Slowest, and asked for all of it to
go into the Hub on the same timeline as before, for every part of the site,
with the logo made of glass, alive, and sitting top right next to the menu.
That is what this round did. It is code now, not a sample.

**The timeline is unchanged.** The glass rides the Hub 2.0 flag, exactly as
the look already does. It is yours alone on your own device until
`hub2.forEveryone` flips, which is still Sunday 13 December, after the last
concert, with families on 3 January. Turn it on and off from the Director
Panel menu, the same switch as before. With the switch off, nothing on the
site changes by a single pixel.

### Every part of the site, from two lines

Your words were "every single part of the site", and the honest way to do
that is not to restyle a hundred pages. It is to change what a panel IS.

The app paints `--pub-surface` in 84 places and `--pub-border` in 139. Making
the surface a 30% white and the border invisible turns every card, every row,
every chip, input and sheet in the Hub to glass in one declaration each, with
no page touched and nothing moved on screen. The border keeps its one pixel
of space and simply stops being a line, so no layout shifts anywhere.

Only the chrome had to be named by hand, because a blur has to sit on the
element that has something behind it: the header, the menu, the rail, the tab
bar, drawers and sheets, and the one hero card a page leads with.

### Three things found by measuring, not by looking

1. **The field was invisible and every number said it was there.** Both
   shells paint the page colour on `<html>` AND on `<body>`, on purpose, so
   an overscroll bounce never flashes the wrong colour. The light sits behind
   the page, which clears the first of those and not the second. It is
   painted a layer higher now.
2. **The autumn leaves were on top of it.** A season paints a wallpaper over
   the whole page, and a wallpaper and a field of light are two answers to
   the same question. Under the glass the field wins and the season keeps its
   colours. A background YOU picked is untouched, because glass over your own
   photo is the best this design can look.
3. **The field was quietly costing you contrast.** Measured from the painted
   pixels rather than reasoned about: the teal you use for links and headings
   dropped to 4.4 to 1 on the brightest part of the field, under the 4.5
   floor, and the grey subtitle text to 4.1. The orbs came down and the
   secondary grey went a shade darker. Everything now clears the floor on the
   darkest pixel the page can reach, in both themes, at phone and laptop
   width. There is a script that measures it from a screenshot.

### The transition the Hub already had was the one you rejected

This is the part worth knowing. The Hub 2.0 preview has been shipping a page
transition since it was built: the whole screen wipes sideways with one
moving edge and a gold line riding that edge. That is the wave, and that is
the side-angled swipe. It is gone.

In its place is the morph from the sample: every panel on the page you leave
flows into the panel that takes its place, the writing fades across, a panel
with nothing to become melts, and a new one gathers out of a haze. 1.5
seconds, which is Slowest.

There is a second reason the wipe had to go and it would never have shown up
here. Safari and Firefox switch glass off for the whole length of a wipe
(WebKit bug 302256) and Chrome does not. On your phone the old transition
would not have frozen the glass, it would have removed it, and put it back at
the end. Everything on this machine is Chrome.

Four things the morph needed that the sample did not:

- **A panel is `.pub-page > *`**, the app's own idea of a block, the same one
  the scroll fade already uses. A hand written list of card names was tried
  first and was wrong within the hour.
- **Half a panel on screen is enough.** The sample asked for the whole panel
  to be visible. A concert card is taller than what is left of a phone below
  the header, so the strict test matched nothing on the busiest page in the
  Hub and the morph silently did not run at all.
- **Wait for the new page.** The router says it is done before the browser has
  drawn, so the first version measured an empty page, decided nothing had a
  counterpart, and dissolved four panels instead of reforming them.
- **Its own easing.** The look's curve is a fast spring made for a quarter
  second slide. On a morph it put every panel on its mark in the first fifth
  of the time and then held still, so Slowest looked exactly like Quick.

### The logo

Glass chip, a slow band of light crossing it every ten seconds, and a bloom
that swells and settles out of step with the light so it never looks like a
loop. It is at the top right, next to the menu, on the public site and in the
Director Panel both. The mark itself is never tinted or faded: the glass is
the chip around it and the light that crosses it.

On the public site the move is done with ordering rather than by moving the
markup, so with the look switched off the header is exactly where it was.

### What is still not verified

- **Nothing has been run in Safari or on an iPhone.** Every measurement here
  is desktop Chrome, headless. This matters more than usual now, because the
  whole reason the transition changed is a WebKit bug nobody here can see.
- **Nothing has been run on a real staff device with real data.** The
  measurements are the fixtures.
- **No cost measurement.** A morph animates live glass, which means
  compositing a blur every frame at a moving position, up to ten panels at
  once. Chrome on a laptop does it without complaint. That says nothing about
  an iPad in a rehearsal room.
- **The cards still do not FUSE into each other.** That is section 8c's
  enhancement and it is still the real decision left. Unchanged.

### What to look at first

Turn the preview on and open the Hub on your phone. Tap between the tabs
along the bottom and watch the blocks reform rather than slide. Then look at
one card while it is moving and see whether the glass still looks like glass,
which is the single thing that cannot be checked from here.
