# Security recommendations — deferred items

Written 2026-08 alongside the PWA hardening PR. That PR already shipped the
cheap, high-value fixes:

- fail-closed roles in `firestore.rules` and `storage.rules` (an explicit
  unknown role gets nothing; assistants can no longer write Storage),
- `email_verified` required on every allowlist check,
- hardened `plannedAbsences` create (real student id, real date, bounded
  strings) — still the app's only unauthenticated write,
- sign-out purge of the Firestore IndexedDB cache,
- a build-time CSP meta tag.

What follows is the **deferred** list: items that need console setup, a
migration story, or a judgement call. Each has enough context to pick up
cold. None of them regress the projection model in CLAUDE.md — that stays
the backbone: privacy is enforced by what data exists publicly.

## 1. App Check on the anonymous write path

`plannedAbsences` create is shape-checked but any script on the internet can
still spam it (rate-limited only by Firestore pricing). Firebase App Check
(reCAPTCHA v3/Enterprise) raises the bar to "real browser on our origin".

Needs (user actions, not code): register the site in Firebase console →
App Check, get a site key, then ~10 lines in `src/director/firebase.ts`
(`initializeAppCheck(app, { provider: new ReCaptchaV3Provider(KEY) })`) and
flip enforcement on for Firestore. Do it in **monitor mode first** — the
4-hourly `generate-feeds.mjs` reads the REST API unauthenticated and App
Check enforcement on Firestore applies to it too; verify feed generation
still works before enforcing (it may need a debug token or to move to the
Admin SDK like the other scripts).

## 2. Custom-claims role migration

Roles live in `directors/{email}` docs, so every rules check pays a `get()`
and the role model depends on rules-side defaults. Firebase custom claims
(`role: 'director'` on the token itself) would make checks free and
impossible to fail open.

Cost: a small Admin-SDK claims-setter (GitHub Action like the existing
`seed-directors.yml`), the Directors screen calling it via a queue doc, and
a re-auth story (claims refresh on token refresh — up to an hour, or force
`getIdToken(true)` after changes). Bigger than a one-liner; do it when the
Directors screen next gets touched.

## 3. Freeze the `rosterOverridesPublic` shape

`studentsPublic` writes are locked to an exact key allowlist; the
`rosterOverridesPublic` mirror only denies `reason`, so any signed-in role
(teachers and assistants write lesson pull-outs there) could add arbitrary
extra keys to a world-readable doc. A `keys().hasOnly([...])` allowlist
mirroring `publicOverrideFields()` in `src/director/publicMirror.ts` closes
it — deferred because every schema addition would then need a rules deploy
in lockstep with the app, and the write path is staff-only today.

## 4. Offline-honest forms (audit A4)

Non-attendance forms `await` the server ack, so offline they sit on
"Saving…" forever even though the write is durably queued in the Firestore
cache. The fix pattern (per form): client-generated doc id, close the form
once the write is queued, show a "queued — syncs when you reconnect" state
driven by `useOnline()`. Touches many forms; do it screen by screen.

## 5. Scope teacher reads + stop trusting self-declared log fields (audit S10)

- `lessons` reads are `isStaff() || isTeacherRole()` — every teacher can
  read every teacher's lessons. Scoping reads to
  `resource.data.teacherEmail == request.auth.token.email` for teachers
  requires the queries to filter the same way, or listeners error.
- `loginEvents` / `activityLog` creates verify `email` matches the token but
  accept whatever `name`/`role` the client claims. Either derive them in
  rules from the directors doc, or treat those fields as display-only.

## 6. Storage hygiene

Uploads have no size or content-type limits, and nothing ever calls
`deleteObject` — replaced files stay world-readable at their old URLs
forever. Add `request.resource.size < 20 * 1024 * 1024` (and a
content-type allowlist if uploads should be documents only) to
`storage.rules`, and delete the old object when a document/assignment
attachment is replaced or removed.

## 7. Nice-to-haves

- **Manifest screenshots** (`screenshots` with `form_factor: 'wide'` and
  narrow) make the install prompt a rich sheet on Android/desktop.
- **Custom domain** would drop the `/nwsa-music-hub/` base and shorten QR
  URLs; fronting with a CDN (e.g. Cloudflare) would also unlock real HTTP
  headers — header-delivered CSP with `frame-ancestors`, HSTS — that
  GitHub Pages cannot send. Base path is referenced in ~8 files; see the
  README's custom-domain notes before attempting.
- **Break-glass list**: `AuthGate.tsx` grants owner UI client-side when the
  membership read errors for `nwsaorchestras@gmail.com`. Rules still block
  actual data access, but consider removing it once the migration era is
  clearly over.
