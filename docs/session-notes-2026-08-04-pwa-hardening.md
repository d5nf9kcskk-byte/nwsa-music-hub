# Session notes — PWA hardening + security fixes (2026-08-04, PR #44)

Record of the session that produced branch `claude/pwa-offline-github-pages-dt4tf9`
(11 commits on `main` @ eecb2e7, shipped as draft PR #44). Written so a future
session — or a future human — can reconstruct what changed, why, and what's
still open, without replaying the conversation.

## What was asked

Upgrade the site into a secure, production-ready PWA while keeping the GitHub
Pages deployment: (1) full manifest + service worker + caching so staff can
install it and run it offline in standalone mode; (2) service-worker lifecycle
management so pushed fixes reach users seamlessly, without cache breakage;
(3) security best practices for the role model (directors / teachers /
assistants) and for sensitive data on a static-hosted frontend.

## What we found before writing any code

- **The app was already a PWA** — hand-rolled `public/sw.js`, manifest, update
  toast in `main.tsx`, and a `swCacheBust()` Vite plugin. The task became
  repair/upgrade, not conversion.
- The old SW had three confirmed defects (also in `docs/audit-2026-08.md`
  §4.1): `skipWaiting()` on install put a new SW in control of tabs still
  running old code (the toast rarely fired; a chunk-reload band-aid in
  `main.tsx` papered over it); the navigate handler cached responses without a
  status check, so GitHub Pages' `404.html` could become the offline shell;
  the precache held only two URLs and the cache was wiped on every deploy.
- Firestore offline persistence was already on (`persistentLocalCache`), but
  single-tab only, and the auth gate's membership check was a server-first
  `getDoc` that hung offline.
- Open audit items: S4–S7, S9 (rules gaps, no email_verified, sign-out left
  IndexedDB populated, no CSP), plus a fail-open `isStaff()` default.

## Decisions (made with the director, via explicit choices)

1. Security rules fixes ship **in this PR**, not as recommendations only.
2. CSP ships as its **own revertible commit** (meta tag — Pages can't send headers).
3. Precache **everything including the director chunk** (~2 MB total): staff
   offline-on-first-boot outweighs the ~160 kB gz cost to public visitors.
4. Install button + iOS popup→redirect sign-in fallback: **both included**.

## What shipped (commit by commit)

| SHA | What |
|---|---|
| `96bf7f3` | Deps: `vite-plugin-pwa` ^1.3.0 (first release with Vite 8 peer support); removed unused `@anthropic-ai/sdk` and dead `src/nwsaLogo.ts`; `npm ci` in deploy.yml |
| `e98db3b` | SW replaced: Workbox `generateSW`, prompt-flow updates, full-app precache, `navigateFallback` + feeds/file denylist, `src/pwa.ts` owns registration + toast, `[sw-precache]` build stamp replaces `[sw-cache-bust]` |
| `af4721f` | Manifest completed: `id`, `scope`, `display_override`, 192px maskable icon, shortcuts (Take Roll / Today / Calendar / Find My Schedule), `orientation: any` |
| `7915b2b` | Offline: auth gate membership check → cache-first `onSnapshot` (audit A5); `persistentMultipleTabManager()` (A8) |
| `c3f343f` | Rules: `email_verified` in `signedIn()` (S6); fail-closed `isStaff()`; hardened `plannedAbsences` create (S4); storage.rules assistant fix (S5); sign-out purges Firestore IndexedDB (S7) |
| `078066f` | CSP meta tag injected at build time; inline boot scripts allowed by sha256 of the final HTML |
| `0ace9a0` | `firebase/auth` + `firebase/storage` split into `src/director/firebaseAuth.ts` — public entry 345.9 → 315.6 kB gz (A6); Firestore preconnect |
| `2599ccc` | `InstallAppButton` in the director menu (Chromium prompt / iOS hint); popup-blocked → `signInWithRedirect` fallback in standalone |
| `49972c8` | Release-checklist rewrite for the new SW contract; `docs/security-recommendations.md` (deferred items with rationale) |
| `c4c5466` | The 10 adversarial-review fixes (below) |

## Adversarial review (before push)

A 31-agent review workflow ran over the full diff: 5 reviewer dimensions
(SW lifecycle, rules semantics, client auth, CSP completeness, frozen
contracts), every finding cross-examined by 2 independent verifiers primed to
refute it. 13 raw findings → 10 confirmed → all 10 fixed in `c4c5466`:

1. **(major)** Legacy `nwsa-hub-*` cache purge ran in `onRegisteredSW` — i.e.
   while the OLD SW was still the controller and still needed that cache for
   its offline fallback. Moved into the new SW's `activate`
   (`public/sw-cleanup.js` via workbox `importScripts`).
2. **(major)** Sign-out purge could silently destroy queued offline writes
   (dead-zone roll marks) after its 4 s flush bound. Now asks for explicit
   confirmation before discarding; cancel keeps the session.
3. **(major)** `directors/{email}` self-service get/update still trusted an
   unverified email claim → `verifiedSelf()` helper.
4. **(major)** Offline cache-miss left "Checking access…" with no escape → 8 s
   bound routes to the error screen (retry + sign-out); listener stays live.
5. Unknown explicit role retained `signedIn()`-tier access (full `students`
   incl. grade/pronunciation, `rosterOverrides.reason`, public-mirror writes)
   → new `isKnownRole()` closed set gates every shared-tier rule.
6. Break-glass fallback could overwrite an already-resolved real role with
   `owner` on a late listener error → applies to the initial read only.
7. No `getRedirectResult` consumer — a failed redirect sign-in looped
   silently → consumed on mount, errors surface in the sign-in UI.
8. Toast button `font:700 13px inherit` is invalid CSS (whole declaration
   dropped; pre-existing, carried over verbatim) → `font:inherit` + longhands.
9. Docs overstated "unknown role gets nothing" (true only after fix 5) → both
   the rules comments and the recommendations doc now match the rules.
10. Checklist claimed an unconditional IndexedDB purge → reworded: names the
    `firestore/*` database, notes the second-tab persistence-lease precondition.

Three findings were refuted by the verifiers and correctly dropped (CSP regex
edge cases that can't occur in this repo; a duplicate of finding 10).

## Verification that gates this PR

- **12-step Playwright E2E** against `vite preview` in headless Chromium:
  SW install/activate; offline reload + offline deep link render via
  `navigateFallback` (and are NOT the 404 shim); update toast appears in an
  open tab while old code runs; Refresh reloads exactly once into the new
  build; a **seeded** legacy `nwsa-hub-*` cache survives until the new SW
  activates and is gone after; no page errors. 12/12.
- **Determinism**: back-to-back builds → byte-identical `dist/sw.js` (the
  4-hourly feed cron must never toast users).
- `tsc -b` + `vite build` clean; **ESLint delta vs `main` = zero** (61
  pre-existing findings on both sides, byte-identical list).
- CSP: both inline-script hashes recomputed from the built HTML and matched;
  policy sits directly after `<meta charset>`.
- Bundle split confirmed: `identitytoolkit`/`firebasestorage` markers absent
  from the public entry chunk, present in the DirectorApp chunk.

## Still open (post-merge actions)

1. Merge PR #44 (draft, at owner's discretion).
2. `firebase deploy --only firestore:rules,storage` — rules do NOT ship with
   the Pages deploy. Safe in either order vs. the app deploy.
3. Run the CSP smoke list in `docs/release-checklist.md` (sign-in popup,
   sign-out, upload, ICS import, avatar, charts, QR kit, print views,
   planned-absence submit).
4. Deferred security work lives in `docs/security-recommendations.md`
   (App Check, custom-claims migration, `rosterOverridesPublic` shape freeze,
   offline-honest forms, teacher lesson-read scoping, Storage limits).

## Operational lessons (for future sessions in this repo)

- **The container's baked-in `origin/main` snapshot can be stale** — this
  session's clone pointed at a different (pre-rewrite) lineage, which made
  `git diff main` show phantom changes. Always `git fetch origin main` before
  baselining or diffing against main.
- **Never `git checkout -- <file>` as a script cleanup step** when the tree
  has uncommitted work — an E2E harness did exactly that and reverted two
  uncommitted fixes (caught immediately; re-applied).
- Vite's `transformIndexHtml` `tags` API entity-escapes quotes in attribute
  values (`'` → `&#39;`); inject raw HTML strings when the attribute content
  must stay readable (the CSP meta).
- `onRegisteredSW` fires when registration *resolves* — long before the new
  SW controls the page. Anything that assumes the new SW has taken over
  (cache migration, cleanup) belongs in the SW's own `activate` handler.
- ESLint runs are only comparable against the same dependency install; use a
  worktree + shared `node_modules` symlink for a fair baseline.
