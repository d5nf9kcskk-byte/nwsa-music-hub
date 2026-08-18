# Security recommendations — deferred items

Written 2026-08 alongside the PWA hardening PR. That PR already shipped the
cheap, high-value fixes:

- fail-closed roles in `firestore.rules` and `storage.rules` (an explicit
  unknown role keeps only self-service access to its own directors doc —
  no student, roster, log, or Storage access; assistants can no longer
  write Storage),
- `email_verified` required on every allowlist check,
- hardened `plannedAbsences` create (real student id, real date, bounded
  strings) — the first of what are now four unauthenticated writes, all held
  to the same standard,
- sign-out purge of the Firestore IndexedDB cache,
- a build-time CSP meta tag.

**Update 2026-08-17**: the deferred list was worked through. Items 3, 4, 5,
6 and the manifest screenshots are now **done**; item 1 (App Check) is
implemented but dormant until a site key exists — the remaining steps are
console work and are listed below. Item 2 was reviewed and deliberately NOT
implemented; the reasoning is recorded so it isn't re-litigated from scratch.
Custom domain and the break-glass list remain the Owner's decisions.

Each entry keeps enough context to pick up cold. None of this regresses the
projection model in CLAUDE.md — that stays the backbone: privacy is enforced
by what data exists publicly.

## 1. App Check on the anonymous write path — CODE IN, needs a site key

**Status: implemented, dormant.** `src/director/firebase.ts` initializes App
Check when `VITE_RECAPTCHA_SITE_KEY` is set and does nothing when it isn't;
the SDK is dynamically imported, so while it's off visitors don't even
download it. `deploy.yml` already passes the secret through, so setting the
secret is the entire deploy-side change.

Why it matters: the four unauthenticated writes — `plannedAbsences`,
`parentMessages`, `assignmentSubmissions`, and `calendarViews`
(#subscribe-any-view, a student saving their own mix of ensembles as a live
calendar feed) — are shape-checked but nothing else stops a script from
hammering them. `calendarViews` is the cheapest to abuse and the least
valuable: docs hold only ensemble ids and event types, the doc ID is the hash
of its own contents (honest re-subscribes rewrite one doc), the generator
ignores any doc whose ID doesn't match its contents, and it builds at most
`MAX_REGISTERED_VIEWS` of them. Spam costs Firestore writes, not correctness
or privacy — but App Check settles all four at once.

**What's left (console work, in this order):**

1. Firebase console → App Check → register the web app with reCAPTCHA v3;
   copy the site key.
2. Add it as the `VITE_RECAPTCHA_SITE_KEY` GitHub secret and redeploy. App
   Check now runs in **monitor mode** — it reports, it does not block.
3. Watch App Check metrics for a few days: verified vs unverified requests
   should be overwhelmingly verified. Anything else means real users would be
   locked out by step 5.
4. **Before enforcing**, give feed generation a credential: add the
   `FIREBASE_SERVICE_ACCOUNT_JSON` secret (the one
   `backfill-public-projections.yml` already uses) — `deploy.yml` passes it
   and `generate-feeds.mjs` will then read Firestore with an access token.
   Enforcement applies to anonymous REST reads too, so without this the
   4-hourly feed refresh would return 403 and every subscribed calendar would
   quietly stop updating. Confirm the run logs
   "Feed generation authenticated with the service account".
5. Turn enforcement on for Firestore, then Storage.

Local development with a key set: register a debug token in the console and
put it in `VITE_APPCHECK_DEBUG_TOKEN`.

## 2. Custom-claims role migration — NOT DONE, on purpose

Roles live in `directors/{email}` docs, so every rules check pays a `get()`.
Firebase custom claims (`role: 'director'` on the token) would make those
checks free.

**Reviewed 2026-08-17 and deliberately not implemented.** Claims are carried
in the ID token, which is refreshed roughly hourly. Making a claim
authoritative therefore means a removed or demoted director keeps their old
access until their token refreshes — up to an hour of standing access after
the Owner has already taken it away. Today, revocation is instant: the next
rules check reads the directors doc and the answer has already changed. For a
school app where "cut this person off now" is the whole point of the Owner
role, instant revocation is worth more than saved document reads at this
scale (a handful of staff accounts, a `get()` that Firestore caches within a
request).

If it is ever revisited, it needs a revocation story first — a claims-setter
Action plus forced `getIdToken(true)` on role change, and rules that treat the
directors doc as the tiebreaker for removals. Do not switch the primary check
to claims without it.

## 3. Freeze the `rosterOverridesPublic` shape — DONE

`firestore.rules` now pins the mirror to an exact key allowlist matching
`publicOverrideFields()` in `src/director/publicMirror.ts`, so a teacher or
assistant writing a lesson pull-out can no longer add arbitrary extra keys to
a world-readable doc. The original reason to defer — "every schema addition
would need a rules deploy in lockstep" — expired when rules started
auto-deploying on merge to main: the two now ship in the same commit.

**If you add a field to `RosterOverride`**, add it to that allowlist in the
same change or the mirror write starts failing.

## 4. Offline-honest forms (audit A4) — DONE

Forms used to `await` the server ack, so in a dead zone they sat on "Saving…"
forever — and the two that raced a 15-second timeout (Schedule, Assignments)
told the director the save had *failed* when it had merely been queued and
would sync fine later.

`whenQueued()` in `src/director/writeStatus.ts` resolves as soon as a write is
durably queued: immediately when the browser reports offline, otherwise on the
ack or after a short grace period, whichever comes first. Rejections still win
the race when they arrive first, so a genuine permission or validation error
still shows in the form, and late failures still reach the retry tray via
`trackWrite`. Applied to the schedule, assignment, announcement, note,
student, ensemble, seating, location, lesson, and directors forms. The offline
strip already tells the user what "queued" means.

## 5. Scope teacher reads + stop trusting self-declared log fields — DONE

- `lessons` reads are now `isStaff() || (isTeacherRole() && resource.data
  .teacherEmail == request.auth.token.email)`, so a teacher can no longer read
  another teacher's private-lesson schedule. `useLessons.ts` issues the
  matching filtered query for the teacher role — rules match per document, so
  the query has to ask for only what the rule allows or the listener errors.
  Deliberately no `orderBy` alongside that filter (it would need a composite
  index); the teacher's own list is sorted client-side.
- `loginEvents` / `activityLog` creates now require `role` to equal the
  directors doc's role. An audit trail that let the audited party choose their
  own label was not an audit trail. `name` stays client-supplied and is
  display-only — it has no server-side source of truth (it can fall back to
  the Google account name) and is never used for an access decision.

## 6. Storage hygiene — DONE

- `storage.rules` caps staff uploads (assignments, documents) at 50 MB.
  Content types stay open on purpose: directors legitimately upload PDFs,
  images, Office docs, MusicXML, and audio, and those paths are staff-only.
- Student video submissions are capped at **the limit the director set on that
  assignment** (`maxVideoSizeMB`, entered in MB in the assignment form), read
  across services from the assignment doc with a 500 MB fallback. The path
  carries the assignment id, so the rule can look it up; a submission for an
  assignment that doesn't exist is refused outright.
- `src/director/storageCleanup.ts` deletes the object when the thing pointing
  at it goes away: replacing or clearing a document's file, dropping an
  assignment attachment, deleting a submission (the video goes with it), and
  deleting a document or assignment outright. Deletions that offer **undo**
  clean up only once the undo window lapses (`offerUndo`'s `onExpire`) — a
  restored document must not point at a file that has already been deleted —
  and replacements clean up **after** the save, so cancelling an edit never
  deletes the live file.

## 7. Nice-to-haves

- **Manifest screenshots — DONE.** `public/screenshots/` holds a wide and a
  narrow capture, declared in `public/manifest.json`, so the install prompt is
  a rich sheet on Android/desktop. They are shot from a **fixtures** build
  (`VITE_FIXTURES=1 npm run build && npx vite preview`), never from live data —
  the people and repertoire in them are fictional, which is the only
  acceptable way to commit app screenshots to this repo (#privacy). They are
  excluded from the service-worker precache (`globIgnores`) because only the
  OS install UI ever reads them. To refresh: rebuild with fixtures, screenshot
  `/calendar` at 1280x800 and 414x896, replace the two files.
- **Custom domain** — still open, and still a decision rather than a task. It
  would drop the `/nwsa-music-hub/` base and shorten QR URLs; fronting with a
  CDN would also unlock real HTTP headers (header-delivered CSP with
  `frame-ancestors`, HSTS) that GitHub Pages cannot send. The base path is
  referenced in ~8 files, and every printed QR poster and saved bookmark
  points at the current URL — see the README's custom-domain notes, and treat
  the existing URLs as a migration to plan, not a flag to flip.
- **Break-glass list** — still open, and deliberately the Owner's call:
  `AuthGate.tsx` grants owner UI client-side when the membership read errors
  for `nwsaorchestras@gmail.com`. Rules still block actual data access, so the
  exposure is a UI shell, not data. Removing it is one line; the reason to
  keep it is that it is the recovery path if the directors collection is ever
  unreadable. Decide once the migration era is clearly over.
