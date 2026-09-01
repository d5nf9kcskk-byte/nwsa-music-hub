# NWSA Music Hub

## Every session works in its own worktree (Aug 2026)

More than one Claude session runs against this repo at the same time. They
used to share the single checkout, and it failed in all the predictable ways
— in one afternoon: a session committed another session's uncommitted file
inside its own commit; a session switched the checkout onto a feature branch
and the next session's two commits silently landed there instead of `main`;
and a shared `npm run build` failed on a half-written file belonging to
nobody in the room.

**Start by calling `EnterWorktree`.** This instruction is what authorizes
that tool — it will not fire on its own. It branches from `origin/main` and
puts the session in `.claude/worktrees/<name>/`, where nothing you do can
touch another session's files or move its branch.

- Land work with `git push origin HEAD:main` after a rebase, or by pushing
  the worktree's branch and merging. **Never** switch the MAIN checkout's
  branch — another session is standing on it.
- Never `git add -A`, and never stage a file you did not edit. `git status`
  in a shared checkout lists other sessions' work too. Stage by path; when
  one file holds your change AND someone else's, stage only your own hunks
  (`git diff` → filter → `git apply --cached`).
- `ExitWorktree` when the work has landed, so `.claude/worktrees/` does not
  silt up with dead checkouts.
- Verify against the tree you are actually pushing. Testing on a shared
  checkout that carries someone else's WIP proves nothing about your commit.

## Org config / white-label (Aug 2026)

This codebase builds MORE THAN ONE deployment. `VITE_ORG` selects a JSON
file from `config/orgs/` (default `nwsa` — every existing command still
produces the NWSA site); the object is injected as `__ORG_CONFIG__` and read
via `src/org/index.ts` (`ORG`). Rules:

- Org names, brand colors, base path, contact email, ICS PRODID/UIDs,
  vanity slugs, and feature flags live in `config/orgs/*.json` — never
  hardcode a new org-specific string in `src/`; add a config field.
- The NWSA build must stay **behavior-identical and deterministic**: after
  touching the org layer, build twice with no `VITE_ORG` and confirm the
  `[sw-precache]` hash is stable, and `grep -ri asyo dist/` is empty.
- NWSA ICS values are frozen contracts (existing subscribers) — never
  change `ics.*` in `config/orgs/nwsa.json`.
- The demo org is `asyo` (Alpharetta Symphony Youth Orchestra), Firebase
  project `asyo-hub-demo`, deployed to the `asyo-music-hub` Pages repo via
  `.github/workflows/deploy-demo.yml`. Setup: `docs/demo-asyo-setup.md`.
- `scripts/seed-demo-org.mjs` must only ever write to `asyo-hub-demo`
  (it hard-aborts otherwise). NEVER seed `nwsa-hub` with demo data, and
  NEVER put real student data in any org's seed — demo people are fictional.
- NWSA-only modules stay NWSA-hardcoded and are feature-flagged off for
  other orgs (`features.campusMap`, `features.calendarSeed`): CampusMap,
  seedCalendar, classSchedule, the attendance-bulletin pipeline,
  import-official-calendar. Do not genericize them without a plan.

## The school's name — get this exactly right, everywhere

The school is **New World School of the Arts** ("NWSA"). It is NOT
"Northwestern School of the Arts" or any other variant. This has shipped
wrong before (the printed concert program, `src/public/PublicProgram.tsx`)
and must not happen again.

Before writing the school's full name anywhere in this codebase — code,
copy, seed data, docs — search first:
```
grep -rniE "northwestern|new world" --include="*.ts" --include="*.tsx" .
```
to confirm you're matching existing usage, not inventing a new variant.

- Full name: **New World School of the Arts**
- Abbreviation: **NWSA**
- App/brand name: **NWSA Music Hub** (formerly "NWSA Director" — that name is retired)

## Student privacy — the projection model (Aug 2026)

Decided by the director (session note, 2026-08-03; revised 2026-08-13):
student names, instruments, sections, ensemble membership, schedules, and
**grade level** are public; contacts, pronunciation, attendance, and notes
are staff-only. No opt-out system — privacy is enforced by what data
exists publicly, not per-student flags.

How it works — do not regress this:

- `students` and `rosterOverrides` are **staff-only** in `firestore.rules`
  (any allowlisted role may read; only the public projections are
  world-readable).
- The public site reads ONLY `studentsPublic` (name, preferredName,
  instrument, section, ensembleIds, status, grade — **never
  pronunciation**) and `rosterOverridesPublic` (all fields **except the
  free-text `reason`**), via `src/public/hooks/usePublicRoster.ts`.
- The field contract lives in `src/director/publicMirror.ts`. Every write in
  `useStudents` / `useRosterOverrides` / `useLessons` batches the mirror doc
  with the source doc; `scripts/backfill-public-projections.mjs` (GitHub
  Action) converges mirrors on demand.
- **A lesson's TIME is public; the rest of the lesson is not** (director's
  decision, 2026-09-01). `lessonsPublic` mirrors only `studentId`, `date`,
  `startTime`, `endTime`, `status`, `location`, `teacherName`, `instrument`,
  so a student's own `feeds/student-<id>.ics` can carry their lesson beside
  their rehearsals. This is a real widening and was chosen knowingly: that
  file is a public Pages artifact and student doc ids are already shared with
  `studentsPublic`, so who takes lessons with whom, and when, is now public.
  The mark, `gradeNote`, repertoire, notes and both parties' initials are NOT,
  and the guard is an ALLOWLIST in three places that must change together —
  `publicLessonFields()`, the `/lessonsPublic` key allowlist in
  `firestore.rules`, and `PUBLIC_LESSON_KEYS` in the backfill script. Adding a
  field to `Lesson` publishes nothing until all three say so. `lessons` itself
  stays staff-only; the private lessons Cloud Function below is unchanged.
- `scripts/generate-feeds.mjs` must only ever fetch the public projections
  for PUBLIC feeds.
  It runs unauthenticated by default; when `FIREBASE_SERVICE_ACCOUNT_JSON` is
  set it uses a service account instead (so App Check enforcement can be
  turned on without killing the feeds — docs/security-recommendations.md #1).
  The credential does NOT widen what any PUBLIC feed may read: public
  projections only.
- **The private lessons calendar is a Cloud Function, never a file**
  (#lessons-feed). It serves the staff-only `lessons` collection at
  `https://us-central1-<project>.cloudfunctions.net/lessonsFeed/<token>.ics`,
  and the unguessable token is the whole of its access control (a calendar
  app cannot sign in). Source: `functions/src/`.
  **Never publish it through the Pages pipeline.** The first attempt wrote
  `dist/feeds/lessons-<token>.ics`, and GitHub Pages IS the workflow artifact
  (`actions/upload-pages-artifact` takes the whole `dist/` tree) on a PUBLIC
  repo — anyone could download the run and take both the schedule and the
  token. `LESSONS_FEED_ENABLED = false` in `scripts/generate-feeds.mjs` is
  permanent; do not flip it, and never add a lessons file to
  `feeds/index.json`. Never log the token — workflow logs are public too.
  The function keeps the token in `feedSecrets/lessons` (staff-only), compares
  it in constant time, answers every failure with the same 404, reads names
  from `studentsPublic` rather than the staff-only `students`, and bounds its
  query window. `functions/src/lessonsFeed.selfcheck.ts` pins those guards and
  runs in `deploy-functions.yml` BEFORE any credential is written.
- Student doc IDs are RANDOM Firestore IDs, never the school-issued Student
  ID — doc IDs are effectively public (shared with `studentsPublic`, and in
  `/student/<id>` URLs and `feeds/student-<id>.ics`). The school ID lives
  only in the staff-only `schoolId` field on `students`.
  `scripts/migrate-student-doc-ids.mjs` repaired the Aug 2026 import that
  briefly violated this; keep any future importer on random IDs.
- **NEVER commit real student data** (names, grades, rosters) to this repo —
  seed/baseline rosters with real students were purged from files AND git
  history in Aug 2026. Contact info is imported at runtime from a private
  JSON file (`src/director/contactsImport.ts`), never committed.

## PWA / service worker — invariants (Aug 2026, PR #44)

The service worker is GENERATED by `vite-plugin-pwa` (config in
`vite.config.ts`); page-side lifecycle lives in `src/pwa.ts`. Do not
hand-write SW fetch/install logic. Rules that must not regress:

- **Prompt-flow updates**: a new SW installs and WAITS until the user taps
  the refresh toast. Never reintroduce `skipWaiting()`/`clients.claim()` on
  install — that puts a new SW in control of tabs running old code (the
  original bug this replaced).
- **Deterministic builds**: unchanged source → byte-identical `dist/sw.js`.
  The deploy cron rebuilds hourly to refresh ICS feeds; a
  nondeterministic SW would toast every open tab each time. Check the
  `[sw-precache]` line in the build log (contract in
  `docs/release-checklist.md`).
- **`dist/feeds/**` never enters the precache** — it's written AFTER
  `vite build` by `scripts/generate-feeds.mjs` and regenerates hourly
  (`globIgnores` + the navigateFallback denylist both enforce this).
- One-time cache migrations run in the SW's own `activate`
  (`public/sw-cleanup.js` via `importScripts`) — never from page code, which
  can execute while the OLD SW still controls the tab and needs its caches.
- The SW must keep ignoring cross-origin requests: Firestore offline is the
  SDK's IndexedDB cache, not Cache Storage.

## Calendar feeds & filter views (Aug 2026)

- `src/shared/calendarView.ts` is the ONE definition of what a filtered
  calendar shows. The Schedule screen, the public calendar, and
  `scripts/generate-feeds.mjs` (which imports the `.ts` directly — Node
  strips types) all filter through it. Do not re-implement the filter.
- School-wide items (no `ensembleIds`) ride along with an ensemble filter;
  **academic Classes do not**, unless the type filter names them. Classes
  showing under "Symphony Orchestra" was a reported bug, not a feature.
- Every filter mix is subscribable: `feeds/view-<slug>.ics`, slug =
  `viewSlug()` hash of the filters. Common mixes are pre-built each deploy
  (`autoViewSpecs`); wider mixes are registered in `calendarViews` and built
  on the next feed refresh. **The slug hash is a frozen subscription
  contract** — `scripts/calendar-view.selfcheck.mjs` pins it.
- **Named bundles** (`src/shared/calendarBundles.ts`, configured per org in
  `config/orgs/*.json`) are curated calendars at a STABLE address
  (`feeds/bundle-<slug>.ics`) whose MEMBERSHIP is resolved on every build —
  by ensemble id and by name pattern, so a "Jazz Combo #2" created next term
  joins the bundle it matches without anyone re-subscribing. That is the one
  thing a hash-addressed view cannot do, since changing a view's filters
  changes its URL. Bundles are also defined NOT to overlap (an ensemble
  bundle drops the school-wide ride-along unless `includeSchoolWide`), so
  subscribing to several never repeats a holiday. A published slug is a
  subscription contract — never rename one.
  `scripts/calendar-bundles.selfcheck.mjs` pins both promises and runs in the
  deploy workflow.
- `calendarViews` is one of the app's five unauthenticated writes (with
  `plannedAbsences`, `parentMessages`, `assignmentSubmissions`,
  `signupResponses`) — students
  subscribing to their OWN mix is the point of the feature. It is safe only
  because of two structural guards: the doc ID is the hash of the filters,
  and the generator ignores any doc whose ID doesn't match its contents.
  Keep both if you touch either side.
- ICS text lives in `src/shared/ics.ts` and is shared with the in-app
  snapshot download, so calendar notes carry the same repertoire (free text
  AND linked pieces) either way.

## Ensembles vs. classes (Aug 2026)

`Ensemble.kind` splits the one `ensembles` collection into performing groups
and classes. **Absent = `'ensemble'`** — every group that predates the field
keeps its meaning with no migration, and that default lives in exactly one
place: `isClassGroup()` / `isMasterClass()` / `performingEnsembles()` /
`classGroups()` in `src/director/utils.ts`. Never read `kind` directly.

- `'class'` — Music Theory, Jazz Theory, Music Appreciation, college courses.
  Roster, roll, assignments, documents. No repertoire library, no seating,
  never on a concert. A meeting carries `unitInfo` (unit/chapter), not
  `repertoire`.
- `'masterclass'` — also a class everywhere a LIST is shown, but its students
  play in it: a meeting picks performers (`studentIds`) and the pieces they
  bring (`pieceIds`), plus `guestPerformers` — free-text names of visiting
  players who are on no roster and must never get a student record, a feed
  entry, or an attendance mark.
- The four string master classes (`masterclass-*`) were seeded as ensembles
  before this existed. `scripts/migrate-group-kinds.mjs` stamps them by doc-id
  prefix and is idempotent; `scripts/seed-masterclass.mjs` now sets `kind`.
- "Whole Music Division" means `performingEnsembles`, not `musicEnsembles` —
  it must never sweep a theory section onto a concert.
- **College is a FLAG, not a kind** — `Ensemble.collegeLevel?: boolean`
  (dual-enrollment / Miami Dade College). `kind` decides BEHAVIOR (repertoire
  vs. unit vs. performers); college-ness decides none of it — a college course
  has the same roster, roll, units, and absence of repertoire as an in-house
  one. A fourth kind would fork every `kind === 'class'` branch for zero
  behavior difference. It is display + filtering only and never changes who may
  read anything. Read it through `groupKindLabel()` in `src/director/utils.ts`,
  the ONE spelling of "class" / "master class" / "college class" / "college
  master class", so the director list and the public class list cannot drift.
- **The public site splits ensembles from classes too** (as of this ship).
  `PublicEnsembles`, `PublicDocuments`, and the `PublicLayout` nav use
  `performingEnsembles()` / `classGroups()`; a class page leads with its
  documents and renders no repertoire and no seating. Nothing here widened
  what is world-readable — `documents` and `ensembles` are already
  `allow read` in `firestore.rules` and were before this change. The remaining
  `musicEnsembles()` calls on the public side are FILTER menus, where listing
  every group is correct.
- `scripts/../src/director/groupKind.selfcheck.ts` pins all of the above and
  runs in the deploy workflow.

## School-day tardies vs. class attendance (Aug 2026)

Late to SCHOOL is **not** an attendance mark. The office bulletin's `TARDY`
section used to write `status: 'Late'` onto every one of a student's
ensembles, which made "arrived at the building late" and "walked into
Camerata late" indistinguishable. `mapBulletinToAttendance()` now returns
`null` for TARDY; `schoolDayTardyRows()` records it in `schoolDayTardies`
instead (doc id `${studentId}_${date}`, so re-running a bulletin updates one
record). Take Roll shows it as a chip beside the name — context, never a mark.
Staff-only, never mirrored publicly: it is attendance-class data.

## Juries (Aug 2026) — a deliberate stub

`juries` + `src/director/juries/` exist to hold what is known as it firms up.
Every field but `name` is optional on purpose, because the date, running
order, and panel aren't settled until the juries are close. Do not grow this
into a scheduler, a scoring system, or a rubric engine without a plan.

`runningOrder.ts` is the only logic here, and it is deliberately list
arithmetic rather than process: `appendInScoreOrder()` adds a whole roster at
once (forty string players was forty typeahead searches) and
`sortIntoScoreOrder()` re-sorts, both leaning on the ONE ranking table in
`scoreOrder.ts`. Two promises it must keep, pinned by
`runningOrder.selfcheck.ts` in the deploy workflow: a bulk add NEVER reshuffles
an order the director already sequenced, and a sort loses nobody — an id whose
student record is gone moves to the end rather than vanishing from a jury. No
per-student slot times (that is the scheduler) and no marks or rubrics (that is
the scoring system); every field stays optional.

## Sign-ups (Aug 2026)

"Tell me you want to do this, and fill out the paperwork while you're here."
Built to replace the manual loop a director described: collect names → type
them into the state's system → email everyone the file → chase the signed
copies.

- `src/shared/signupEligibility.ts` is the ONE definition of who a sign-up
  reaches, and `src/shared/instrumentFamily.ts` the one instrument → family
  map (derived from `scoreOrderRank`, never a second spelling list). The
  public page, the Home/schedule alerts, and the director's "3 of 14
  responded" all filter through them. Pinned by
  `scripts/signup-eligibility.selfcheck.mjs`, which runs in the deploy
  workflow. Those two modules import with explicit `.ts` extensions on
  purpose — Node's type-stripping loader (the self-check) can't resolve
  extensionless relative imports.
- Audience has a third mode, **`'open'` (“Anyone with the link”)**: the form
  IS the intake, so there is no name to pick — the person types their own and
  the response carries **no `studentId` at all** (firestore.rules requires the
  key to be ABSENT, not blank; `signupSubmitterAllowed()`). It is the one mode
  without the roster anchor, so its brake is the same honeypot
  `parentMessages` uses — the exact-key-set rule. Nobody is “eligible” and
  nobody is “waiting” (`eligibleForSignup` returns false), so the director’s
  screen counts responses instead of “3 of 14”, and it stays off the Hub home
  page. Time slots can’t be offered on one — a booking is anchored to a
  student doc — and the editor refuses that combination, which is the only
  place it could be created.
- Audience is otherwise **ensembles + instrument families only** — never a list
  of student ids. `signupForms` is world-readable, and student doc ids are
  shared with `studentsPublic`, so an invite list would publish who was
  invited to what. Unrecognized/blank instruments fail CLOSED.
- `signupResponses` is the app's fifth unauthenticated write. There is
  deliberately **no public update rule** — an unauthenticated update would
  let anyone overwrite someone else's signed form. A student who comes back
  creates a second doc; `latestPerStudent()` keeps the newest. Keep it that
  way.
- Answers ride in ONE bounded `answersJson` string, not a map: rules can
  bound a string's length but can't reach inside a map to bound its values.
  Read it with `parseAnswers()`, which never throws.
- Signatures are typed names plus the write's timestamp. The PDF export is
  the browser's own print-to-PDF (`printViaPopup`) over an off-screen
  packet — no PDF dependency, and it's why `.dir-signup-print-host` is
  positioned off-screen rather than `display: none`.

## Roles & Firestore rules — invariants (Aug 2026, PR #44)

- **The `teacher` role is the Applied Teacher** (Aug 2026) — a private
  studio/instrument teacher, scoped to their OWN assigned students: those
  students' lessons, the grades on those lessons, and scheduling for them.
  NOT a classroom theory teacher (that's a director). The label reads
  "Applied Teacher" everywhere; the **stored value stays `'teacher'`** and
  must not be migrated — it's the `role` field on live `directors/{email}`
  docs, compared by name in `isTeacherRole()`/`isKnownRole()` and in the
  loginEvents/activityLog rules. Renaming it means a data migration plus a
  window where the rules accept BOTH strings, i.e. widening the closed set.
  Role words live in `STAFF_ROLE_LABEL` (`src/director/types.ts`) — the one
  place a future rename touches.
- **Lesson grades live on the `Lesson` doc**, not a grades collection
  (`grade` + `gradeNote`; marks and the term average in
  `src/director/lessonGrades.ts`, pinned by `lessonGrades.selfcheck.ts` in the
  deploy workflow). A lesson is already scoped to exactly one applied teacher,
  so the grade inherits that scoping and there is no second query/rule pair to
  keep in agreement. Don't split grades into their own collection without
  redoing the `where('teacherEmail', ...)` treatment on both sides.
- **A weekly lesson time is a RECIPE, not a lesson** (Sept 2026).
  `lessonSlots` on the teacher's own `directors/{email}` doc holds one
  `{weekday, startTime, endTime, location?}` per assigned student — beside the
  `assignedStudentIds` it qualifies, so there is no new collection and no
  second query/rule pair. `src/director/lessonSchedule.ts` expands it into
  ordinary dated `Lesson` docs and nothing downstream knows a slot existed.
  Two promises pinned by `lessonSchedule.selfcheck.ts` in the deploy workflow:
  a date that already has a lesson is NEVER re-created (cancelled ones
  included — re-creating one would silently undo the teacher's cancellation),
  and the weekly walk is bounded. Generation deliberately does not know the
  district calendar (holidays are generated, then cancelled by hand) and
  deliberately does not auto-create `rosterOverrides` for conflicts — it
  reports the count and the teacher confirms each pull-out, which is what
  tells the ensemble director.
- Roles are a CLOSED set enforced by `isKnownRole()` in `firestore.rules`
  (owner / director / teacher / assistant; a doc with no `role` = legacy
  director). Adding a new role means deliberately updating that helper and
  the role's specific rules — until then the new role can access nothing
  beyond its own `directors/{email}` doc. Never gate a collection on bare
  `signedIn()`.
- Every allowlist check requires `email_verified` (incl. the directors
  self-service paths via `verifiedSelf()`). Keep it that way if another
  sign-in provider is ever added.
- **Rules auto-deploy** (since Aug 2026). The *Deploy Firestore & Storage
  rules* workflow ships **both** `firestore.rules` and `storage.rules` on
  every push to `main` that touches them — and, since the demo was set up,
  `firestore.rules` to `asyo-hub-demo` as well (skipped when
  `ASYO_SERVICE_ACCOUNT_JSON` is absent). Rules are no longer per-project
  hand work for ANY org. Storage runs as its own step after
  Firestore, so a Storage failure can't take the Firestore deploy with it —
  that was the bug that kept Storage out of this workflow while the project
  was on Spark and had no bucket. To deploy by hand anyway:
  `firebase deploy --only firestore:rules,storage`.
- Sign-out must keep purging the Firestore IndexedDB cache
  (`AuthGate.handleSignOut`: flush-with-consent → `signOut` → `terminate` →
  `clearIndexedDbPersistence`) — staff caches hold grades, contacts,
  attendance, and notes (audit S7).
- **Query and rule must agree**: rules match per document, so a scoped read
  rule only works if the app's query asks for the same subset. A Teacher may
  read only their OWN `lessons`, and `useLessons.ts` issues the matching
  `where('teacherEmail', ...)` query — change one and you must change the
  other, or the listener errors for that role.
- `rosterOverridesPublic` is pinned to an exact key allowlist mirroring
  `publicOverrideFields()`. Adding a field to `RosterOverride` means adding it
  to `firestore.rules` in the SAME change, or the mirror write starts failing.
- `loginEvents` / `activityLog` verify the claimed `role` against the
  directors doc; `name` is display-only and must never gate access.
- Storage: staff uploads are capped at 50 MB, and student video submissions
  are capped at the assignment's own `maxVideoSizeMB` (read across services
  from the assignment doc). `src/director/storageCleanup.ts` deletes objects
  when the record pointing at them goes away — after the save for
  replacements, and only once the undo window lapses for undoable deletes.
- Deferred security work is tracked in `docs/security-recommendations.md`;
  the session record for all of the above is
  `docs/session-notes-2026-08-04-pwa-hardening.md`.

## What's New banner (auto)

Product/UX changes that affect all staff or the public student site must
update `src/shared/whatsNew.ts` in the same ship commit. Full include/exclude
rules: `.cursor/rules/whats-new.mdc`. Do not wait to be asked.
