# Hub 2.0, alive: the Higgsfield design on every page, with motion

Date: 2026-11-04. Status: approved by the director the same day ("Yes, 100
times yes, everything in that artifact looks awesome"). Ships to everyone with
the Hub 2.0 switch on Sun Dec 13, 2026.

Approved reference: the sketch page `docs/hub2-alive/concept.html` (published
privately for the director as "Hub 2.0 Motion Sketch"). When this document and
the sketch disagree about how something should look or move, the sketch wins.

## 1. What the director asked for

"This Higgsfield design needs to be applied to every single aspect and page of
this entire site, not just select things. More motion and animation need to be
applied to everything... make it feel more like it's alive and a joy to use.
Plus all of the simplification things... Come up with some new graphics that
make it pop."

"The Higgsfield design" is the six mockups generated in the director's
Higgsfield account on 2026-11-02: Studio Bright, Concert Hall and Spotlight,
each for phone and laptop. They are not in this repo. The director chose a
hybrid (Studio Bright everywhere, Concert Hall titles on concert pages,
Spotlight on concert night), recorded in
`docs/session-notes-2026-11-03-hub-2-0.md`.

## 2. What went wrong the first time

The first build (#206, #211, #213, #221) treated the mockups as a palette: it
mapped colors and fonts onto the existing tokens and restyled a handful of
named components (Today's cards, the event card, check-in, concert titles).
The mockups' signature pieces were never built: the Now card with a live
progress bar, the week strip, the glowing Tonight card with its countdown and
gold clef, the concert hero, instrument icons in circles. Every other screen
changed color and nothing else. Motion reached a few lists, the drill-down
slide, a press dip, the page wipe and the public scroll reveal.

The root cause is structural: it styled screens one at a time. The Hub has
about 130 screens and they are built from about 20 shared parts, so a
screen-by-screen pass cannot reach them all and will not reach the next one.

## 3. Decisions

- **Parts, not pages.** The look and the motion attach to the shared parts
  (section 4), so every screen that uses a part changes, including screens
  built after this. Named screens get the signature pieces on top.
- **Motion level: Lively everywhere.** Showtime's ambient motion (drifting
  glow, gold dust, a looping shimmer and glint) appears only on concert-night
  surfaces: the Tonight card, the check-in pages and Today's concert card.
  Take Roll never moves on its own: staff use it all day.
- **Graphics drawn in code** (inline SVG, CSS, one small canvas). No photos and
  no new Higgsfield images (they spend the director's credits; ask first).
- **One switch.** Everything sits behind the existing `data-hub2="on"`
  attribute. Nothing new to flip on Dec 13: `hub2.forEveryone` turns all of
  this on at once, exactly as #220 built it.
- **Staff phones get a bottom bar** (Today, Take Roll, Calendar,
  Announcements, More), under the look only. Recommended by the Hub 2.0 users
  and UX review (F1) and shown to the director in the plan he approved.
- **No new dependencies.** CSS for everything that can be CSS; one script
  (`src/shared/hub2Motion.ts`) for the motions CSS cannot do; small React
  pieces for the signature components.

## 4. Parts: every page at once

Every rule is scoped under the look and sits in `@media screen`, as today.

Staff (`src/director/hub2Staff.css`):

| Part | Classes | Becomes |
|---|---|---|
| Buttons | `.dir-btn` (+ primary, ghost, danger), `.dir-tool-btn`, `.dir-icon-btn`, `.dir-link-btn`, `.dir-quick-btn` | Studio Bright: 12px radius, 44px minimum target, bolder weight, a soft colored shadow on primary, press dip and ripple |
| Fields | `.dir-input`, `.dir-select`, `.dir-textarea`, `.dir-label`, `.dir-field-hint` | Taller, 12px radius, a teal focus ring, sentence-case labels |
| Drawers | `.dir-drawer-overlay`, `.dir-drawer` and its header, body, footer, handle, close | 24px top radius, springs up, title in the display weight |
| Cards and rows | `.dir-card`, `.dir-ens-row` and the card family listed in `director.css` (`.dir-student-card` ... `.dir-search-item`) | White soft cards (18px), rows 12px, a group-colored left bar where a row has a group, a chevron where it opens something |
| Segments and tabs | `.dir-segment`, `.dir-segment-btn`, `.dir-mode-toggle`, `.dir-tab` | Plum selected state that pops in; gliding pill where the browser supports anchor positioning |
| Section heads | `.dir-section-head`, `.dir-section-title`, `.dir-detail-section-title`, `.dir-form-section-label` | Sentence-case bold headings instead of small grey capitals |
| Empty states | `.dir-empty`, `.dir-empty-inline`, `.dir-loc-empty` | A drawing (the music stand) and a kind line |
| Badges and chips | `.dir-status-badge`, `.dir-nav-badge`, chips | Pill shapes on the palette, pop on change |

Public (`src/public/hub2Public.css`): `.pub-card`, `.pub-h1`,
`.pub-section-title`, `.pub-btn` / `.pub-btn-ghost`, `.pub-quick-btn`,
`.pub-chip`, `.pub-event`, the inputs (`.pub-input`, `.pub-absence-input`,
`.pub-signup-textarea`, `.pub-search`), `.pub-menu-item`, `.pub-back-link`,
`.pub-confirm-*`, `.pub-empty`, the sign-up and piece rows, the same way.

Untouched, as today: the header and the Director Panel banner (#seasons), a
student's tint and a season (they keep painting on top), every print.

## 5. Eight motions

| Motion | What | Where | How |
|---|---|---|---|
| Arrive | Pieces rise in, one after another (first 16 of a list) | Every card and row list, both shells | CSS, fill `backwards` |
| Change page | The existing wipe, now with a gold leading edge | Every page change | View Transition; the edge is an element named only while a transition runs |
| Press | Dips to 97% and ripples from the finger | Every button, row and card that opens something | CSS dip; ripple drawn by `hub2Motion.ts` as a fixed overlay, removed when done |
| Open | Springs into place | Every drawer, sheet and menu | CSS easing on the existing entrance |
| Choose | The selection pops in, glides where supported | Segments, tabs, week strip, chips | CSS |
| Count | Numbers roll when they change | Elements marked `data-hub2-count` | `hub2Motion.ts` watches them |
| Finish | A check draws itself, with a burst of notes | Every success: checked in, form sent, roll saved, test sent, absence reported | CSS for the check; `hub2Celebrate()` for the notes, called from each success path |
| Live | Bars fill, countdowns tick, a dot pulses | The Now card, Tonight, Today's current block | Small React pieces on a one-minute (bar) or one-second (countdown) clock |

Rules every motion keeps (the #hub2-motion lesson): only transform, opacity
and clip-path move; fill mode `backwards` so nothing stays a layer once it is
done; off under `prefers-reduced-motion`; never on a print; nothing ambient on
a working staff screen.

## 6. Signature pieces

Rendered only while the look is on (a `useHub2On()` hook reads the attribute
the switch already sets), so the stock site is byte-for-byte unchanged.

1. **Now card and week strip.** The student page (`PublicSchedule`) leads with
   a big Now (or Next) card: group, time, room, a live progress bar and
   "N min left", and a Monday to Friday strip that jumps to a day. Staff Today
   gets the same card for the block in progress.
2. **Tonight.** On a concert day, Home and the student page open with the
   Spotlight card: the gold clef, the concert, call time, a countdown to the
   downbeat and the gold Check in button (the existing check-in route).
3. **Concert hero.** Event, program and Concerts pages for a concert get the
   drawn stage behind the Concert Hall title, a gold rule that draws itself,
   and the details as chips.
4. **Instrument badges.** One SVG badge per family (strings, winds, brass,
   percussion, keys, voice, class, ensemble), chosen through `groupIcon.ts`
   and `scoreOrderRank`, in place of the emoji wherever a group or a lesson is
   listed.
5. **The living mark.** The NWSA mark as inline SVG in the header, waves that
   move on load and when tapped (the note burst already lives there).
6. **Drawn empty states** (section 4) and **the done check** (section 5).
7. **Take Roll.** Counts that roll, a colored bar on a marked row, and the
   finish moment on save. No ambient motion.

## 7. Simplification

- What a person needs first sits at the top, in one big card: the Now card on
  the student page and on staff Today (the UX review's F7).
- Everything a student owes (forms to sign, check-in) gathers into one sun
  card under the Now card.
- Bigger targets: 44px minimum on every staff button (section 4).
- The staff bottom bar on phones (section 3). It maps the existing nav list,
  so `one-nav.selfcheck.mjs` keeps holding.

## 8. Verification

- `hub2.selfcheck.ts` grows with the work: scoping, screen-only, no color
  literals, motion only under no-preference, `backwards` fills, the edge named
  only while transitioning, `data-hub2-count` and `useHub2On()` read by
  nothing else.
- Every self-check in `.github/actions/self-checks`, a double build with a
  stable `[sw-precache]` hash, `grep -ri asyo dist/` empty, `csp.selfcheck.mjs`.
- Flag off pixel-identical to main at 390px and 1024px, light and dark.
- A contact sheet: every public and staff route, look on, at 390px and
  1280px, captured in headless Chrome against the fixtures server (the
  Browser pane draws no frames while hidden). The director sees it before each
  piece lands; it is the proof that nothing was skipped.

## 9. Delivery

| Piece | Contents | Checked by the director |
|---|---|---|
| 1 | Parts on both shells, all eight motions, the gold-edge wipe, the contact sheet | Sun Nov 8 |
| 2 | Public signature pieces: Now card and week strip, Tonight, concert hero, badges, living mark, empty-state drawings | Sun Nov 15 |
| 3 | Staff signature pieces: Today Now card, Take Roll, bottom bar, finish moments on every success path | Sun Nov 22 |
| 4 | Fixes from his checks, a full contact sheet, a real-iPhone pass | Sun Nov 29 and Dec 6 |
| Flip | `hub2.forEveryone: true` plus a What's New entry | Sun Dec 13 |

No merges on concert days (Nov 16, Nov 30, Dec 3, 9, 10, 12). Each piece is
its own pull request, merged only green and reviewed.
