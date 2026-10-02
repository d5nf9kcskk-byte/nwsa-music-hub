# Session note — 2026-10-01: the iPad showed empty lists, and a different menu

Shipped as `ef838a8` ("Same menu at every width; reload a tab whose cache
hangs silently."), deployed and confirmed in the live bundle the same day.

Director's report, with a screenshot from an iPad in Safari:

> Ensembles page with no ensembles listed; My Lessons not accessible at all;
> and the iPad looks different from the phone, so moving between devices
> means relearning where everything is.

Two problems, and only one of them was about layout.

## 1. Empty lists: not the layout, the data

The screenshot looked like a layout bug, since items were "missing", but the
evidence pointed elsewhere:

- `ensembles` is world-readable. An empty Ensembles page means NO data reached
  the tab, not that the signed-in person lacked access.
- My Lessons is added to the nav only when `useCurrentDirector()` has read the
  person's `directors` doc and found the teacher role
  (`showMyLessons` in `DirectorApp.tsx`). No doc, no entry.
- There was **no** "Some data couldn't load" strip. `StatusStrips` renders it
  in every shell, at every width, so no listener had errored. The tab was
  waiting forever, not failing.

The rail and the drawer are mapped from the same `NAV_TOP` / `NAV_GROUPS` /
`groupAccordions` lists (#one-nav), so the nav code could not have hidden
these on one width only.

**Hypothesis, then the test.** The iPad had a dozen Hub tabs open. A staff
device runs `persistentMultipleTabManager()`: one tab owns the network
connection and the rest read through IndexedDB. iPad Safari freezes
background tabs. Per the no-speculative-pushes rule, nothing was changed until
the director ran the 30-second test: **close every other Hub tab, reload.
Ensembles appeared.** That is the evidence.

An attempt to reproduce it in desktop Chrome (busy-looping one tab to mimic a
freeze) was inconclusive: same-site tabs can share a renderer process, so the
loop froze both tabs. Don't rely on that method.

Exactly WHICH layer hangs (a secondary waiting on a frozen primary's lease, or
WebKit IndexedDB blocked by a suspended page) was not settled, and the fix
does not depend on it.

## 2. The fix: rule 4 of the cache policy

`firestoreCache.ts` already had a one-shot "reload into the memory cache"
(rule 3) for the b815 latch, but that fires on an SDK error log line, and this
hang logs nothing. Rule 4, in `firebase.ts`, only on a persisting (staff)
device:

- A sentinel listener (`ensembles`, `limit(1)`, `includeMetadataChanges`)
  waits for a snapshot with `fromCache === false`.
- After `STUCK_CACHE_MS` (15 s) **of visible time** with none, it probes
  `https://firestore.googleapis.com/` (`no-cors`; already in CSP
  `connect-src`). Network answers → `armNoPersistFallback()` → reload once.
- **The clock restarts on every `visibilitychange`.** A timer frozen in a
  background tab fires the instant the tab wakes, before Firestore has had a
  chance to reconnect, which would be a false "stuck". The first draft got this
  wrong; it was caught before landing.
- **A dead zone keeps its cache** (#37): the probe fails, so roll taken in a
  basement still queues to IndexedDB. That is why there is a probe at all
  instead of `navigator.onLine`, which reads true on Wi-Fi with no internet.
- A listener *error* counts as "heard": an error is not a hang, and the status
  strip already reports it.

Why not switch to `persistentSingleTabManager()`: audit A8 moved away from it
(a second tab silently loses offline durability), and if the hang is WebKit
IndexedDB itself, single-tab would hang the same way. The SDK's own fallback
to memory (`__PRIVATE_canFallbackFromIndexedDbError`) only runs on a thrown
error, so it cannot catch this.

`stuckCacheVerdict()` is the pure part and is pinned in
`firestoreCache.selfcheck.ts`. The timer/probe wiring is not covered by any
check, and the reload itself has **never been seen to fire on a real iPad**.

## 3. One menu arrangement at every width

The real by-width difference: the ≥1024px rail folded **Library** shut
(`libraryOpen`, default false) while the phone drawer always shows it open.
Library is now always open on both; the `libraryOpen` state and its
auto-open effect are deleted. Same items, same order, same state. What is
left by width is only whether the menu is always on screen (rail) or behind
☰ (drawer).

Still true and deliberate: most iPads in **portrait** are under 1024px and get
the phone layout, and in **landscape** they get the rail. The director was
offered "always one layout on iPad" and has not asked for it.

Verified at 1024×1366 against the worktree's own fixtures build (the
`preview-server-ignores-worktree` route: navigate to `…/dist/` first, then
`pushState` to `director`; loading `…/dist/director` directly falls through to
the MAIN checkout's index.html).

## Checks run before landing

`tsc -b`, all 67 commands in `.github/actions/self-checks`, the CSP check, two
clean NWSA builds with the identical `[sw-precache]` hash (`e25768f4`), and an
empty `grep -ri asyo dist/`. One eslint error (`set-state-in-effect` on the
accordion auto-open effect in `DirectorApp.tsx`) was already on main before
this change, and CI does not lint.

What's New: `2026-10-01-same-menu-everywhere` (staff, expires 2026-10-15).

## If it comes back

"Data missing on one device, no error strip" → ask how many Hub tabs are open
before theorizing. If a tab is stuck past ~15 s of looking at it, rule 4
failed: check `sessionStorage['hub.firestoreNoPersist']` in that tab (`'1'`
means it already used its one reload).
