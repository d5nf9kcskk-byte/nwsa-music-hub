# Release checklist — frozen contracts

Every redesign phase (and any release that touches shell/layout/CSS) must pass
this list before merge. These are the contracts printed on paper, saved in
calendars, and baked into muscle memory — breaking any of them silently is a
shipped incident, not a style bug.

## URLs (never change — printed on QR posters and saved as bookmarks)

- [ ] Router basename `/nwsa-music-hub` (vite.config.ts `base` + main.tsx)
- [ ] All public routes resolve: `/`, `/calendar`, `/ensembles`, `/ensemble/:id`,
      `/repertoire`, `/lookup`, `/student/:id`, `/piece/:id`, `/event/:id`,
      `/announcements`, `/assignments`, `/start`, `/concerts`, `/map`, `/program/:id`
- [ ] Vanity slugs redirect: `/so /we /wind /jazz /cam /choir /opera /cco`
- [ ] Hash anchors scroll: `/ensemble/:id#repertoire`, `/map#<anchor>`
- [ ] Query deep links work: `?ensemble=`, `?focus=`, `?staff=1`, director
      `?ensemble/date/event/student/announcement=` intent params
- [ ] ICS feed URLs unchanged: `{origin}/nwsa-music-hub/feeds/{all,ensemble-*,student-*}.ics`
- [ ] 404.html SPA shim still routes deep links on GitHub Pages

## Print (four load-bearing paper surfaces)

- [ ] Concert program (`/program/:id`) — masthead reads exactly
      **New World School of the Arts** (grep before writing any name string)
- [ ] Season fridge copy (`/concerts`)
- [ ] Start guide (`/start` — print expands all tabs/answers)
- [ ] Director QR kit
- [ ] All four print correctly with the OS in **dark mode** (forced-light
      tokens in base.css must keep winning)
- [ ] All four print correctly with "Aa" text size at Largest (zoom reset)
- [ ] No new chrome appears in print — new fixed elements carry `.no-print`

## Accessibility

- [ ] "Aa" control still scales content at 1.15× and 1.3× on a small phone
      (360×640) — no fixed chrome overlaps, bottom chrome fits the budget
- [ ] Focus visible on every interactive element (`:focus-visible` outline
      survives — it lives in base.css now)
- [ ] Every new user-facing string has EN **and** ES keys (`t()`/`tn()`);
      no concatenated word-order-dependent strings
- [ ] Text over any data-driven color (ensemble gradients) uses
      `inkOn()` from src/shared/color.ts — never assumed contrast
- [ ] Reduced-motion honored for any new animation (CSS-based only)

## PWA / offline

- [ ] Build stamps a new SW cache name (`[sw-cache-bust]` line in build log)
- [ ] Update toast appears in an open tab after deploy, and reload works
- [ ] Toast anchors above current bottom chrome (`--nwsa-bottom-chrome`)
- [ ] Public bundle contains no director code (ESLint boundary + spot-check
      `dist/assets` — DirectorApp stays a separate lazy chunk)

## Data safety

- [ ] Public Firestore writes remain exactly one: planned-absence create
- [ ] No contact info in the repo, in bundles served to the public surface,
      or in logs
- [ ] Attendance stays exception-only (unmarked = present; no bulk
      "present" writes)

## Bottom-edge chrome (one budget, one occupant per slot)

- [ ] At most one extra bar above the tab bar at a time
      (priority: SW toast > happening-now > contextual action bar)
- [ ] Nothing may appear at, or swap into, a position within ~500ms of a
      pointer-down near it (no mis-tap materialization)
- [ ] Short-viewport guard: extra bars hide under ~560px viewport height
