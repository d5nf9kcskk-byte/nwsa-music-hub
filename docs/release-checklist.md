# Release checklist — frozen contracts

Every redesign phase (and any release that touches shell/layout/CSS) must pass
this list before merge. These are the contracts printed on paper, saved in
calendars, and baked into muscle memory — breaking any of them silently is a
shipped incident, not a style bug.

## URLs (never change — printed on QR posters and saved as bookmarks)

- [ ] Router basename `/nwsa-music-hub` (vite.config.ts `base` + main.tsx)
- [ ] All public routes resolve: `/`, `/calendar`, `/ensembles`, `/ensemble/:id`,
      `/repertoire`, `/lookup`, `/student/:id`, `/piece/:id`, `/event/:id`,
      `/announcements`, `/assignments`, `/documents`, `/signups`, `/signup/:id`,
      `/start`, `/concerts`, `/map`, `/program/:id`
- [ ] Vanity slugs redirect: `/so /we /wind /jazz /cam /choir /opera /cco`
- [ ] Hash anchors scroll: `/ensemble/:id#repertoire`, `/map#<anchor>`
- [ ] Query deep links work: `?ensemble=`, `?focus=`, `?staff=1`, director
      `?ensemble/date/event/student/announcement=` intent params
- [ ] ICS feed URLs unchanged: `{origin}/nwsa-music-hub/feeds/{all,ensemble-*,student-*}.ics`
- [ ] Filter-view feed slugs unchanged: `feeds/view-<hash>.ics` is a live
      subscription URL, and the hash comes from `viewSlug()` in
      `src/shared/calendarView.ts`. Changing the canonical string or the hash
      silently kills every subscribed custom view —
      `node scripts/calendar-view.selfcheck.mjs` pins two of them.
- [ ] Sign-up audiences still resolve — `node scripts/signup-eligibility.selfcheck.mjs`
      pins instrument families and who a sign-up reaches. Drift is silent: a
      director opens one for "Camerata strings" and half the section never
      sees it.
- [ ] Standing rotations still resolve — `node scripts/rotation-weekday.selfcheck.mjs`
      pins the `days` weekday filter and that generate-feeds.mjs agrees with
      the resolver (it runs in the deploy workflow). To check the LIVE data on
      a real school day rather than the logic,
      `node scripts/rotation-check.mjs [YYYY-MM-DD | --week]` resolves every
      rotating student through the same resolver the app uses, reading only the
      public projections — no credentials. If it and the app disagree, the app
      is out of date, not the plan (director menu → **App version**).
- [ ] 404.html SPA shim still routes deep links on GitHub Pages

## Print (four load-bearing paper surfaces)

- [ ] Concert program (`/program/:id`) — masthead reads exactly
      **New World School of the Arts** (grep before writing any name string)
- [ ] Season fridge copy (`/concerts`)
- [ ] Start guide (`/start` — print expands all tabs/answers)
- [ ] Director QR kit
- [ ] Sign-up packet (Director Panel → Sign-ups → **Print / save PDF**) — one
      signed form per page, signature and timestamp on every sheet
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

- [ ] Build prints `[sw-precache] sw.js content hash: <hash>` — the hash
      changes iff app code changed, and is identical when only feeds
      regenerate (the 4-hourly cron redeploy must NOT toast open tabs:
      build twice, `sha256sum dist/sw.js` matches)
- [ ] `dist/sw.js` precaches no feeds: the only `feeds` reference in it is
      the navigateFallback denylist regex
- [ ] Update toast appears in an open tab after deploy; Refresh reloads
      exactly once into the new build (prompt flow — the waiting SW only
      activates on Refresh, never mid-session)
- [ ] Toast anchors above current bottom chrome (`--nwsa-bottom-chrome`)
- [ ] Installed app boots offline (airplane mode) immediately after a
      deploy — including `/director` (auth gate answers from cache)
- [ ] Public bundle contains no director code (ESLint boundary + spot-check
      `dist/assets` — DirectorApp stays a separate lazy chunk; firebase
      auth/storage live in the DirectorApp chunk, not the public entry)

## Data safety

- [ ] Public Firestore writes remain exactly one: planned-absence create
- [ ] No contact info in the repo, in bundles served to the public surface,
      or in logs
- [ ] Attendance stays exception-only (unmarked = present; no bulk
      "present" writes)
- [ ] Sign-out purges the Firestore cache: with NO other Hub tab/window
      open, sign out, then DevTools → Application → IndexedDB no longer
      lists any `firestore/...` database (other `firebase-*` databases
      remain — they hold no student data). A second open tab holds the
      persistence lease and legitimately blocks the purge; close it and
      repeat when testing
- [ ] CSP meta tag present in `dist/index.html` with two script hashes;
      after any release that touches auth, storage, or external URLs,
      re-run the CSP smoke list: sign-in popup, sign-out, file upload,
      ICS import, avatar renders, charts, QR kit, print views,
      planned-absence submit (a CSP violation shows in the console)

## Bottom-edge chrome (one budget, one occupant per slot)

- [ ] At most one extra bar above the tab bar at a time
      (priority: SW toast > happening-now > contextual action bar)
- [ ] Nothing may appear at, or swap into, a position within ~500ms of a
      pointer-down near it (no mis-tap materialization)
- [ ] Short-viewport guard: extra bars hide under ~560px viewport height
