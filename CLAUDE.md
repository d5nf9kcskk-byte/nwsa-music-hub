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

## Firestore local cache — who gets IndexedDB (Sept 2026)

One failed IndexedDB request latches the Firestore SDK for the life of the
page: `SimpleDbTransaction.abort()` rejects with the raw browser error, the
retry path only recognises `IndexedDbTransactionError`, and the async queue's
failure is permanent — every later call throws `INTERNAL ASSERTION FAILED:
Unexpected state (ID: b815)`. A student hit that on Submit Video after the
100 MB upload had already succeeded, which is where the Storage-orphan
submissions came from. `src/director/firestoreCache.ts` is the ONE policy:

- **Public devices get `memoryLocalCache()`** — nothing on the student site
  needs offline data, and a database the page never opens cannot fail. Do not
  "restore offline for students"; that re-opens the bug.
- **Staff devices keep IndexedDB persistence** (#37 dead-zone roll; multi-tab
  per audit A8). A staff device is a browser that completed an allowlisted
  sign-in (`AuthGate` marks `localStorage`, sign-out forgets it), so the FIRST
  load after a fresh sign-in is memory-only and every later one persists.
- **A latched queue reloads once** into the memory cache for that tab
  (`sessionStorage`), triggered by the SDK's single `INTERNAL UNHANDLED ERROR`
  log line via `onLog`. Never twice — a reload loop is worse than an error.

- **A SILENT hang reloads once too** (Oct 2026, the iPad incident). Multi-tab
  persistence shares one connection through IndexedDB, and iPad Safari
  freezes background tabs: with several Hub tabs open, the visible one showed
  "No ensembles yet", no My Lessons, and NO load-error strip — nothing threw.
  Closing the other tabs fixed it, which is the proof. `firebase.ts` now
  watches for a first server snapshot; after `STUCK_CACHE_MS` of VISIBLE time
  with none, it probes `firestore.googleapis.com`, and only if the network
  answers does it take the same one-shot memory fallback. The clock restarts
  on every `visibilitychange` (a frozen timer fires on wake and proves
  nothing), and a dead zone fails the probe and keeps its cache (#37).

`firestoreCache.selfcheck.ts` pins all four and runs in the deploy workflow.
Session record for rule 4: `docs/session-notes-2026-10-01-ipad-nav.md`.
Upgrading the SDK does not remove the need: no Firestore release through
12.18 changes the latch.

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
- `calendarViews` is one of the app's unauthenticated writes (with
  `plannedAbsences`, `parentMessages`, `assignmentSubmissions`,
  `signupResponses`, `quizSubmissions`, `copyRequests`, and — only while
  `pushSettings/global.familiesOpen` is true — `pushSubscriptions`, #push) — students
  subscribing to their OWN mix is the point of the feature. It is safe only
  because of two structural guards: the doc ID is the hash of the filters,
  and the generator ignores any doc whose ID doesn't match its contents.
  Keep both if you touch either side.
- ICS text lives in `src/shared/ics.ts` and is shared with the in-app
  snapshot download, so calendar notes carry the same repertoire (free text
  AND linked pieces) either way.
- **"My calendar" is a THIRD kind of address** (#my-calendar, Sept 2026):
  per-person, token-guarded, and served by the `staffFeed` Cloud Function at
  `/staffFeed/<email>/<token>.ics`. A view is addressed by the hash of its
  filters and a bundle by a curated slug; this one is addressed by the
  PERSON, and its membership is derived at request time from their own
  `directors` doc (`resolveAssignedEnsembleIds`, patterns included) and run
  through the shared `eventMatchesView()`. Gaining an ensemble changes what
  arrives without changing the URL — the one thing a hash-addressed view
  cannot do. A function, not a file, because it also carries the applied
  teacher's staff-only `lessons`, scoped `where('teacherEmail','==',email)`.
  **`school: true` in `myCalendarView()` is load-bearing, not cosmetic**: with
  an empty ensemble list and `school:false`, `isEveryEnsemble()` is true and
  every event in the school matches, so an applied teacher — who legitimately
  has no ensembles — would be handed the whole calendar. `staffFeed.selfcheck.ts`
  pins that, and pins that one teacher never sees another's studio; it runs in
  `deploy-functions.yml`. Token doc: `feedSecrets/staff__<email>`, distinct
  from the appointments token, and its rules clause is gated on
  `isKnownRole()` rather than `isStaff()` on purpose — teachers, classroom
  teachers and assistants are exactly who it is for.
- **Booked form times ride on it too** (#my-calendar-slots, Oct 2026): every
  slot booked on a form whose `signupOwners` email is this person, through
  `appointmentVevents()` in `functions/src/appointmentsFeed.ts` — the ONE
  reader both feeds use, same UIDs. The director had subscribed to My calendar
  in Fantastical and the bookings lived only in the separate appointments
  calendar nobody knew to add. Pinned in `staffFeed.selfcheck.ts`.
- **One-off meetings ride on `extraEventIds`** (#my-calendar-extras, Oct
  2026): the Schedule card's "+ My calendar" adds ONE event id to the
  person's OWN `directors` doc (self-update `hasOnly` list), and `staffFeed`
  adds it via `onMyCalendar()`. Never put staff on the event itself —
  `events` is world-readable and would publish who works here. It never
  widens the view; it only adds the listed meetings.
- **`assignedEnsembleIds` is the ONE answer to "whose group is this"** — it
  drives the staff named on a class/ensemble page (`assignedStaffForGroup`),
  the scoped role shells, and "my calendar". So the Directors editor must be
  able to express every group a person actually has. It could not: the picker
  offered `performingEnsembles()` to directors and the class list only to
  Classroom Teachers, so a DIRECTOR who teaches AP Theory, a college course,
  or a master class had no checkbox anywhere and their classes reached
  nothing. Fixed Sept 2026 — directors and applied teachers now get the class
  picker too, and the field is saved for applied teachers. Access-neutral by
  construction: every `firestore.rules` use of the field is gated on
  `isAssistantRole()`/`isClassroomRole()`, so ids on a director's or an
  applied teacher's doc grant nothing. **If you add a new kind of group, check
  the Directors editor offers it** — a group nobody can be assigned to is
  invisible to every one of those consumers at once.

## College and high school calendars are separate dependencies (Sept 2026, #college-hs-calendar-deps)

MDCPS (K-12) and Miami Dade College run their own academic calendars and they
do not line up — a MDCPS teacher-planning day or grading-period boundary is a
normal class day at MDC, and vice versa. `src/shared/academicCalendars.ts` is
the ONE place both calendars are defined, as two INDEPENDENTLY sourced sets:
`MDCPS_NO_SCHOOL` and `MDC_NO_SCHOOL`. Never derive one from the other, and
never let a college-facing generator fall back to the MDCPS set (or the
reverse) — that was the bug: `collegeSchedule.ts` used to reuse the MDCPS set
wholesale (labeled "college dual-enrollment students still follow many of
these campus closures"), so a dual-enrollment class went missing on every
MDCPS teacher-planning day even though MDC was in full session that day.

- **College groups depend on `MDC_NO_SCHOOL`** — `isCollegeSessionDay()` in
  `src/director/collegeSchedule.ts`, which also owns the MDC term-boundary
  logic (fall/spring start, finals, winter/spring break as date ranges, so
  `MDC_NO_SCHOOL` itself only needs holidays that fall INSIDE a term).
  Consumed by `seedCollegeProgram()` and `scripts/seed-college.mjs`.
- **High school groups depend on `MDCPS_NO_SCHOOL`** — the rehearsal/class
  generation in `src/director/seedCalendar.ts`, and the standing weekly
  lesson-time expansion in `src/director/lessonSchedule.ts` (`slotDates()`
  skips MDCPS no-school days when it expands a `lessonSlots` recipe into
  dated `Lesson` docs — see the RECIPE entry below).
- **`collegeLevel` decides, and nothing else does** (director's correction,
  2026-09-19). MDC decides college; MDCPS decides high school; there is **no
  crossover in either direction**. An MDC day off cancels the college groups
  and nothing else; an MDCPS day off cancels the high school groups and
  nothing else. In particular:
  - **College Chamber Orchestra is a college ensemble.** It follows MDC. It
    has no high school connection, and an MDCPS teacher-planning day does not
    touch it. `scripts/add-ensembles.mjs` and the `slotsForDay` entry in
    `seedCalendar.ts` used to gate its Thursday rehearsal on `MDCPS_NO_SCHOOL`
    — generating it straight through MDC's winter break while
    `collegeChamberRehearsalPatches()` patched those same doc ids against
    `isCollegeSessionDay`. Both now gate per GROUP, never per day.
  - **A master class is a high school class.** It follows MDCPS and has no
    college connection.
  Do NOT pick the dependency by where the room is, by which campus the class
  physically sits on, or by `kind`. An earlier pass reasoned from the room and
  put College Chamber Orchestra on the MDCPS calendar; that is wrong. The
  question is only ever "is this group college-level", and `isCollegeGroup()`
  is the app's ONE answer — it lives in `groupKind.ts` (re-exported by
  `utils.ts`) so Node-side code and `campusCalendar.ts` can read it without
  the org config.
- **`src/director/campusCalendar.ts` is that rule as code**, for everything
  that is not a generator. A generator knows at the call site what it is
  building; a SCREEN does not, and "Cancel the day" is the proof — it sweeps a
  whole date with no idea what is on it. `campusForGroup()` is exactly
  `isCollegeGroup` → MDC, else MDCPS. `campusForEvent()` needs EVERY group on
  the block to be a college group (a block mixing the two programs should not
  exist, so that is a fail-safe, not a rule about mixing), and an unresolvable
  group reads MDCPS, because under-cancelling is invisible and over-cancelling
  is on the review sheet. `campusForGroupId()` is the same answer for the
  SEED generators, which run from the hardcoded specs in `collegeClasses.ts`
  before any `ensembles` doc exists — `COLLEGE_GROUP_IDS` there is the ONE
  list, and the self-check pins that the two agree. `splitClosure()` is what a
  screen leads with. `campusCalendar.selfcheck.ts` pins the disagreement in
  BOTH directions (Sep 21: MDCPS off, MDC open; Dec 14: MDC's term over,
  MDCPS in session) and runs in the deploy workflow.
- **Fixing the generator does not fix the data.** The Sept 2026
  `collegeSchedule.ts` fix landed and `scripts/seed-college.mjs` was never
  re-run, so 51 college class sessions across 7 dates — every one an
  MDCPS-only closure — simply did not exist in Firestore until 2026-09-19.
  The director reported it as "you cancelled the college classes"; they had
  never been created. After changing which calendar a generator asks, re-run
  that generator (`Seed College Program` is idempotent and `workflow_dispatch`)
  and verify against the live data, which is world-readable for `events`.
- **`scripts/calendar-closures-audit.mjs` is that verification**, as a command
  (*Audit Calendar Closures*, `workflow_dispatch`). It asks the live project
  whether every closure agrees with both calendars, in BOTH directions: no
  live high school block or lesson on an MDCPS closure, every college class
  present on the MDCPS-only ones, and no live college block on an MDC closure.
  Read-only, and it reads only `events`, `ensembles` and `lessonsPublic`, which
  are all `allow read`, so it prints no student names. Anonymous reads work
  until App Check enforcement; the workflow passes
  `FIREBASE_SERVICE_ACCOUNT_JSON` so it keeps working after (Nov 2026), and a
  hand run without that secret will be refused once enforcement is on.
  Findings in the FUTURE fail; findings in the past are printed and do
  not, because a stale block on a date that already happened is a record, not
  a schedule (`--since` moves that line, `--strict` fails on both). It is NOT
  in `.github/actions/self-checks`: those are pure and offline and gate every
  build, and this one needs the network and live data. Run it after a seed,
  after editing either calendar, and when setting up a new school year.
- **A cancelled day takes the day's private LESSONS with it.** They are in
  another collection and were never in `dayEvents`, so a cancelled Monday used
  to look empty with a violin lesson still on it. It cannot be tidied up
  afterwards either: `pendingSlotDates()` reads a week holding any lesson as
  covered, so the standing weekly time will never notice. `Lesson.changeFrom`
  is the receipt the day plan leaves — "Back to normal" restores only the
  lessons IT cancelled, never one a teacher cancelled for their own reasons,
  and a graded lesson is reported and left alone rather than rewritten. An
  MDC-scoped cancel takes no lessons at all (`LESSON_CAMPUS = 'mdcps'`): the
  applied lesson program IS the high school one — `lessonLog.ts` builds the
  official High School Lesson Log and `slotDates()` already generates every
  lesson against `MDCPS_NO_SCHOOL`. If applied lessons are ever offered to
  dual-enrollment students on MDC's calendar, `LESSON_CAMPUS` and
  `slotDates()` change together or they drift.

Session record: `docs/session-notes-2026-09-19-college-hs-calendar.md` — the
director's correction verbatim, why reasoning from "where the room is" gave
the wrong answer, and the read-only audit that has to precede re-running a
seed that `set`s rather than merges.

## Change a Day: typed changes, room clashes, receipts (Nov 2026)

- **"Type what changed"** (#day-change-parse): `parseDayChange()` in
  `src/director/schedule/dayChangeParse.ts` reads one sentence into ONE
  `DayAction` — the same object a chip builds — and the screen opens the same
  review sheet on the day it names. It writes nothing. chrono-node for dates
  and times, group names plus `ORG.vanitySlugs` for groups, Locations for
  rooms. It REFUSES rather than guesses: an unknown group, a name matching two
  blocks that day, a move to another day, and every whole-day verb (those stay
  on the campus-scoped chips, #college-hs-calendar-deps). Single-block cancel
  is DayAction `cancel` (same writes as the block's Cancel sheet, no lessons).
  No model call: `DAY_CHANGE_MODEL_FALLBACK` is the named seam and stays
  `null` until a provider key and the school's vendor approval exist.
  `dayChangeParse.selfcheck.ts` pins it.
- **`roomClash`** is a `planDayChange` guard: after the plan, two live blocks on
  the same date, overlapping times, same `normalizeRoom(location)`. There is no
  rooms collection; the typed string is the room. Only clashes the plan
  CREATES are reported, and it warns rather than blocks.
- **Receipts outside Change a Day** (#change-receipts): `changeReceipt()` in
  `changePlan.ts` is what the Event form (edits, not repeats or creates) and
  `hub-calendar.mjs` `edit` add to a write that moves date, time, room or
  status — snapshot-once, like `captureOriginal`. A date move adds
  `changeFrom.date`, which `revertPlan` restores. All pinned in
  `scripts/schedule-day-plan.selfcheck.mjs`.
- **"Close a day" is Change a Day** (#close-a-day, director's call
  2026-11-04). Today's button used to sweep EVERY block on a date, on both
  campuses, and leave every private lesson standing, which is the
  #college-hs-calendar-deps mistake on a button. It now opens Change a Day
  with `closing` (a `DirNavOpts` field, so it survives the URL): the
  day-cancel buttons read "Close the high school / college / both" (a day
  with only one campus on it names that campus, never "School"), swaps and
  combines are hidden, and the action carries `closed: true`. That changes the
  WORDS only, never the writes: the note is `closedNote()` ("High school
  closed") and the one banner names the school and says "everything is
  cancelled", naming any concert outright, instead of listing every group.
  Same campus split, same lessons, same receipts, same Back to normal, all
  pinned in the day-plan self-check.

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

## Student Assistant sign-off (Sept 2026, #approvals)

A Student Assistant's four optional capabilities (`schedule` / `repertoire` /
`signups` / `announcements`) no longer write anything. They raise a request in
`pendingActions`, a director approves it on the Approvals screen, and the write
happens then. `src/director/pendingActions.ts` is the ONE definition of what a
request is and what applying one does; `pendingActions.selfcheck.ts` pins it in
the deploy workflow.

- **Roll is never gated.** Attendance is the assistant's job and it is
  time-sensitive; a rehearsal's roll sitting unapplied until a director looks
  is worse than no gate. The `rollTaken` receipt on an event is the one thing
  an assistant still writes straight through, and `firestore.rules` says so.
- **A request carries no authority, and nothing privileged applies one.**
  Approving hands the decoded write back to the DIRECTOR'S OWN browser, which
  performs it through the same hooks a director's save uses — so the rules
  still judge the real write on its merits. A Cloud Function applying these
  with the Admin SDK would be a back door: the payload is written by the
  assistant, and admin credentials would apply whatever it said. Do not
  "simplify" it into one.
- **The gate is in the RULES, not only the app.** `announcements`,
  `repertoire`, `signupForms` and event create/delete/edit dropped their
  `assistantHas(...)` clauses in the same change — the queue is the only path,
  so a devtools console cannot walk around it. The capability still matters:
  it is what a queued request is checked against (`pendingCapabilityFor`).
- **A cleared field is encoded, not dropped.** These hooks read an explicit
  `undefined` as DELETE THIS FIELD, and `JSON.stringify` drops it — which is
  exactly the "the old value survived every clear" bug their comments describe.
  Clears ride as the `CLEAR` sentinel and decode back to `undefined`.
- **Query and rule agree**: an assistant may read only their OWN requests, and
  `usePendingActions` issues the matching `where('byEmail', ...)`. Change one
  and you must change the other.
- Adding a fifth gated collection means changing `GATED_COLLECTIONS`,
  `pendingCapabilityFor()` in `firestore.rules`, and the `runPlan` switch in
  `ApprovalsView` together — and dropping that collection's direct assistant
  write, or the gate is decoration.
- Known gap, deliberately not closed here: `storage.rules` never let an
  assistant upload, so an assistant's announcement is text and links only.
  Widening Storage to them is its own decision.

Session record: `docs/session-notes-2026-09-09-assistant-approvals.md`.

## Read-Aloud board (Oct 2026, #read-aloud)

Director, 2026-10-20: one place a Student Assistant reads announcements to
their ensemble from. Director side: Library → Read-Aloud; assistant side: a
baseline tab beside Take Roll (no capability needed).
`src/director/readAloudBoard.ts` is the ONE answer to what is on a group's
board, pinned by `readAloudBoard.selfcheck.ts` in the self-checks.

- **Announcements are read live, never copied.** A post for that group or
  school-wide (`ensembleId: null`) rides along for `ANNOUNCEMENT_WINDOW_DAYS`;
  urgent ones for as long as they are live.
- **Talking points live in `readAloudItems`**: staff and assistants read,
  staff write. Not public, no mirror. Audience is ensemble ids only; empty =
  everyone in music.
- **An assistant's point goes through `pendingActions`** as the fifth gated
  collection, gated on `EVERY_ASSISTANT` rather than a capability (reading to
  the ensemble is the baseline job). `GATED_COLLECTIONS`,
  `pendingCapabilityFor()` in `firestore.rules` and the `runPlan` switch in
  `ApprovalsView` were changed together; keep them that way.
- "Said" ticks are per device, per day, in `localStorage`. A scratch pad, not
  a record.

## Excused from a concert (Sept 2026, #concert-excusals)

Roll → Subs & Pull-outs → a student → **Excused from a concert**. Built for
religious observance (the first case: a bassist out Oct 3–4, 2026 for Shabbat
and Simchat Torah), and for medical, family and other reasons.

- **The roster effect is ordinary event-scoped pull-outs**, one per concert
  per ensemble the student plays with on it. That is the whole trick: every
  screen that already honours a pull-out drops them (event roster, Take Roll,
  Who's Out, the student's schedule and .ics). Do not add an "excused" branch
  to the resolver.
- **The WHY never rides on the pull-out.** The override's `reason` is the
  generic `EXCUSAL_REASON` because every Hub role (assistants included) reads
  `rosterOverrides`, and the public mirror carries no reason at all. Category
  and the request word for word live on `concertExcusals`, read by directors
  and applied teachers only (director's call, 2026-09-24), written and deleted
  by directors only, with **no update rule** — a record is kept as filed.
  The record, its pull-outs and their mirrors are written and deleted in ONE
  batch (`useConcertExcusals`), so there is never a pull-out without a record
  or a record without the pull-out.
- **The seating chart is never edited.** A chart is the ensemble's audition
  order and serves every concert it is attached to. The program's roster pages
  filter per concert through `removedIds()` + `seatsPlaying()`
  (`src/shared/concertRosters.ts`), so a student off Oct 3 stays seated for
  Oct 17. This applies to ANY pull-out on the concert, not only excusals.
- **The Gradebook's required-concert count** subtracts, per student, the
  concerts they were pulled from (`pulledFromEvent()` — true only when every
  ensemble they play with on it pulled them). The student's own "2 of 3"
  tally (`concertTally` function) is against a fixed semester GOAL, not
  concerts held, and is deliberately unchanged.
- `concertExcusal.selfcheck.ts` pins all four promises (and reads the rules
  file for the read clause) in the deploy workflow.

## Concerts take roll (Oct 2026, #concert-roll)

Director, 2026-10-02: concert days need a way to take attendance, because
missing a concert is grounds for failing the semester. Until then Take Roll
skipped concerts on purpose, the door check-in was on for only a few concerts
(mostly ones students attend as audience), and the Gradebook credited anyone
who performs — so a performer who simply did not show left no record anywhere.

- **`takesRoll(event)` in `src/director/utils.ts` is the list Take Roll is
  built from**: everything `takesAttendance` covers plus a non-cancelled
  concert. A SEPARATE question from `takesAttendance` on purpose — that one
  also decides what a standing rotation and a lesson conflict apply to, and a
  rotation says nothing about a performance; widening it drops every Wed/Thu
  rotator off a Jazz concert (`overrideApplies`). `concertRoll.selfcheck.ts`
  pins both halves.
- One roll per (concert × ensemble): the same `attendance` docs tagged with
  the concert's `eventId`, the same `rollTaken` receipt. No new collection and
  no rules change — the `attendance` rules and the assistant's receipt write
  never looked at event type. A concert's roll has no Lesson button.
- **`rollTarget(event)` is where every "Take Roll" button lands**: onto the
  roll when one group plays, onto that day's list when a concert has several
  (the Showcase has nine) so each director picks their own, and always with
  the date and event id. The date matters beyond concerts: the "roll was never
  taken yesterday" nudge used to open TODAY's roll.
- **"Excuse…" is the short door to the existing excusal, not a second
  mechanism.** `QuickExcusalSheet` (`schedule-changes/ConcertExcusal.tsx`)
  files exactly what the Move-a-Student form files, through the same
  `fileExcusal` hook — one batch holding the record and its event-scoped
  pull-outs — so the program, the seating page and the Gradebook follow with
  no new branch. Directors only (`canFile`) and only for a concert still to
  come (`excusableConcerts` refuses a past one: there is no seat to vacate;
  afterwards, mark Absent (Excused) on that concert's roll). Offered on the
  concert's roll and on its Roster (`EventRoster`). The note is optional; the
  long form on Move a Student stays for a full paper trail.
- **The Gradebook reads the roll for a concert that is required of the
  student** — a performer's concert counts unless it is marked Optional, an
  audience concert only when it is marked Required (`concertRequiredOf()`, see
  the Gradebook section; it used to be "only when marked Required", which left
  every performing concert out). `concertRoll()` / `rollEffect()` in
  `src/shared/ensembleGrades.ts` are the ONE answer: Absent = no credit, stays
  in the denominator; Absent (Excused) = out of the denominator, same as a
  pull-out; no mark after roll was finished = credited; roll never finished =
  exactly as before, because a roll nobody took cannot call anyone present.
  A completed pair of scans outranks an Absent or Excused mark. Marks are
  facts and count even if "Finish roll" was never pressed; only "no mark means
  present" needs the receipt. Pinned in `ensembleGrades.selfcheck.ts`.
- **Concert marks stay out of the rehearsal evidence.** `attendanceByStudent`
  skips marks whose `eventId` is a concert and `meetingsHeld` skips
  `type === 'Concert'`, so one absence is never counted twice and the rehearsal
  denominator does not grow.
- Not here, on purpose: roll for groups required to ATTEND as audience
  (`attendanceEnsembleIds` — the door check-in is that tool), and adding one
  individual performer to a concert (the event's Individual performers and
  "Sub in" already do it).

Session record: `docs/session-notes-2026-10-02-concert-roll.md`.

## A student's repertoire is what they PLAY (Sept 2026, #student-repertoire)

Being on a concert is not playing on it. `src/shared/studentRepertoire.ts` is
the ONE answer to "is this piece mine" for the student's schedule page (the
practice card, "My parts", and each event card's pieces). An audience-only
concert (`attendanceOnly`) contributes nothing; on a shared program a student
gets only pieces played by an ensemble they play with on that event (a piece
naming no ensemble is kept; a NAMED performer is never trimmed); and a work
with its own personnel chart on that concert drops a student it does not seat.
Reported by the director when a Symphony student required to hear College
Chamber Orchestra was handed its whole program to practise.
`studentRepertoire.selfcheck.ts` pins it in the self-checks.

## Required to attend, without playing (Oct 2026, #required-audience)

Students, 2026-10-26: it was not obvious when a group had to be in the
AUDIENCE for a concert it does not play (Symphony at Opera Scenes). The
requirement lived in one box low on the event page; every concert card said
only who plays. Now every `PubEventCard` carries a purple "Required to attend:"
line, the event page's hero repeats it (on a phone the card starts below the
day sheet), a group's own page lists the concerts it must attend, and
`/required-concerts` (top-level nav, beside Concert Season) lists them all as
ordinary concert cards. `src/shared/requiredAudience.ts` is the ONE reader,
pinned by `requiredAudience.selfcheck.ts`. Nothing new is stored: it reads
`attendanceEnsembleIds` / `attendanceStudentIds`, and a group that also PLAYS
the concert is never called audience. The page's "Mine" view answers through
`studentExpectation()`, so a senior an event excuses is not told to come.

## Part books on a concert (Oct 2026, #part-books)

Director, 2026-10-15: "publish books as part books somewhere on the concert
card so they can download all of their parts as one single book". A part book
is one PDF per player with every piece they play on the concert, in program
order. `CalendarEvent.partBooks` (label + link per book, in the order shown)
and `partBooksSharedUrl` (the folder) hold them; absent = no books, which is
every older event, and nothing renders. `src/shared/partBooks.ts` is the ONE
reader, pinned by `partBooks.selfcheck.ts` in the self-checks.

- **A student's own book uses the SAME matcher as a piece's own part**
  (`findPartForInstrument`), so the two can never disagree about a student's
  chair. Do not write a second matcher for books.
- **Only a performer is offered their own book.** The concert card on a
  student's schedule already lists only what they play (#student-repertoire),
  so an audience-only concert shows no book link at all; the event page offers
  "My book" only when the saved student is named on the event or plays in one
  of its ensembles, never through `attendanceEnsembleIds`.
- The event page lists every book (`PartBooks.tsx`, anchor `#part-books`, one
  copy in the main column at every width); every other concert card links to
  that anchor. The Event form edits them under the concert day sheet, and
  writes the fields only when the event has books or the director adds some,
  so saving any other event writes nothing new.
- Books are not a substitute for a piece's parts: the per-piece links stay the
  source for "My part", copy requests and the piece page.

## School-day tardies vs. class attendance (Aug 2026)

Late to SCHOOL is **not** an attendance mark. The office bulletin's `TARDY`
section used to write `status: 'Late'` onto every one of a student's
ensembles, which made "arrived at the building late" and "walked into
Camerata late" indistinguishable. `mapBulletinToAttendance()` now returns
`null` for TARDY; `schoolDayTardyRows()` records it in `schoolDayTardies`
instead (doc id `${studentId}_${date}`, so re-running a bulletin updates one
record). Take Roll shows it as a chip beside the name — context, never a mark.
Staff-only, never mirrored publicly: it is attendance-class data.

## Seating charts (Sept 2026, #seating-sections / #seating-link)

A chart's `sections` array is rendered in STORED ORDER by `SeatingChartCard` —
there is no sort on the way out. That is the whole reason section order is an
editable thing: `buildSections()` seeds it in score order, but anything the
director adds afterwards is appended, and a "Violin 2" created after the fact
published below Cello and Bass on the page students read.

- **`scoreOrderRank()` in `src/director/scoreOrder.ts` is the ONE ranking**, for
  seats, sections, and jury running order alike. The editor's "Score order"
  button and `scripts/reorder-seating-sections.mjs` both defer to it (the script
  imports the `.ts` directly — Node strips types). Never add a second instrument
  spelling list; add a pattern to that table.
- **A script may reorder SECTIONS; it must never reorder SEATS.** Chair order
  inside a section is the director's audition result. The migration script is
  idempotent and skips a chart already in order, so `updatedAt` does not churn.
- **`src/director/seating/seatingLink.ts` is the ONE spelling of a chart's
  address** (`/seating/<id>`, `PublicSeating.tsx`, routed in `main.tsx`). The
  editor's copy button, the announcement a chart posts about itself, and the
  LinkPicker's Seating group all read it from there. Do not write the path out
  by hand. It lives in its own module rather than in `SeatingManager.tsx`
  because a non-component export there trips `react-refresh/only-export-components`.
- Giving a chart an address published NOTHING new: `seatingCharts` is already a
  world read and the page's names come from `studentsPublic`, the same
  projection `PublicEnsemble` uses. Keep it that way — a chart page must never
  reach `students`. (#privacy)
- **`dir-drawer-full` on a drawer OVERLAY takes it edge to edge** at every
  width, beating the ≥1024px right-pane rules in `dirShell.css` on specificity
  alone (no `!important`). Reach for it when a drawer holds a ROSTER rather than
  one decision — a whole seating chart in a 540px column pinned to the right
  edge is what it was added for. The cost is that there is no dimmed margin to
  click outside, so the panel needs its own ×/Cancel and `useModalA11y`.

Session record: `docs/session-notes-2026-09-08-seating-sections-and-links.md`.

## Who is playing at a master class (Sept 2026, #masterclass-performers)

`src/shared/eventPerformers.ts` is the ONE answer to "who plays at this
event" — the public event page, the .ics DESCRIPTION, the personal student
feed, and the student's own schedule screen all read it, or they drift.

- **The join is by the CLOCK, and by nothing else.** A booking points at a
  `slotDef` with a date and a start minute; a slot whose start falls inside the
  meeting's window is a performance in that meeting. There is no stored link
  and no new field, which is exactly why the master classes already on the
  calendar and the sign-ups already booked lit up with no migration — the
  director had already done the work once. It is also the only thing that could
  put a WRONG name on a running order, so `eventPerformers.selfcheck.ts` pins
  the containment rule and runs in the deploy workflow.
- **Bookings are joined for a `kind: 'masterclass'` group and for nothing
  else.** Sign-ups schedule lesson times, fittings and interest lists too, and
  a slot that happens to fall during a rehearsal must never make the rehearsal
  announce that somebody is playing at it.
- **An event with no start AND no end matches nothing.** Reading "no end" as
  "the rest of the day" would sweep in every later sign-up on that date. A
  missing section beats a wrong name.
- **A booked slot is its own route onto a student's schedule** — in
  `studentExpectation()` (optional `bookedEventIds`) and in the per-student feed
  in `scripts/generate-feeds.mjs`. It has to be: a student who signs up to play
  is usually NOT on the master class roster (that is what the sign-up is for),
  so neither membership nor `studentIds` reaches them, and the one event they
  personally committed to would be the one missing from their calendar. The two
  sides must keep using the same join.
- Nothing here widened what is public (#privacy). `signupSlotBookings` is
  already `allow read` — the public sign-up page greys out taken times with it
  — and each booking already carries `studentName`; `signupForms` is
  world-readable too. Named performers resolve through `studentsPublic`, never
  the staff-only `students`, and a doc id with no public record is DROPPED
  rather than printed.
- `guestPerformers` and `studentIds` on an event were write-only before this —
  saved by the Event form and rendered nowhere. They render now.
- **`icsDescription` gets performers through `lookups.performers`**, a function,
  not a field on the event: the answer is a join the event doc holds only half
  of. The sign-up confirmation email omits it (no roster to hand) and renders
  no performer line at all. The in-app snapshot download and `staffFeed` do not
  pass it yet — if you wire either up, use this module.

**Icons (#masterclass-icons).** `src/director/groupIcon.ts` upgrades a master
class from the class book to its instrument, read out of the group's own NAME
through `scoreOrderRank` — the ONE ranking table, so there is no second list of
instrument spellings and a "Flute Masterclass" created next term needs no edit.
🎻 for violin/viola, 🎸 for cello/bass (Unicode has no cello and no double
bass). A name the ranking cannot read keeps `EVENT_TYPE_ICON` rather than
guessing. `EVENT_TYPE_ICON` itself moved here from `utils.ts` and is re-exported
there, so this module reaches nothing that needs the org config and its
self-check runs without the Vite defines shim. Watch `Bass Masterclass`: the
ranking anchors the string bass as `^bass$` so Bassoon stays a woodwind, which
is why the class words come off the name before the rank is asked for.
`groupIcon.selfcheck.ts` pins all four sections and runs in the deploy workflow.

## What a student has: one module (Nov 2026, #student-day)

`src/shared/studentDay.ts` is the ONE answer to "what does this student have in
this date range": the events they are expected at (and how: performing, as a
sub, audience only), the master class slots they booked, the pieces they play
on each event, their lesson times, and the assignments due. The student page
(`PublicSchedule.tsx`) and the per-student calendar feed
(`scripts/generate-feeds.mjs`) both call it. Ask and Home's Now card must call
it too. Do not write another copy.

- **It decides nothing new.** It joins `studentExpectation`,
  `bookedPerformersForEvent`, `studentEventPieces` and the assignment rules.
  A new rule about who is expected goes in the resolver, not here.
- **Why it exists.** The feed script kept a hand copy of the page's logic
  ("plain node, no src imports") and the copy drifted three ways: it had no
  academic-class rule, it read a range pull-out with a missing date as
  open-ended where the resolver rejects it, and it matched an event pull-out
  by event id only where the resolver also matches the same ensemble's other
  meetings that day. On 2026-11-11 the live effect was one student feed
  missing 71 class meetings their page already showed.
- **Pure, and loadable by plain Node.** No React, no Firestore, no org config,
  no clock ("today" and "now" are arguments). Every relative import carries
  `.ts`, and it must never import `director/utils` (which reaches the org
  config). That is why six small rules live in the zero-import
  `src/shared/pureRules.ts`, re-exported by `utils.ts`. If this module stops
  loading under Node, the feed run fails and publishes no student calendars.
- **Public records only** (#privacy): `studentsPublic`,
  `rosterOverridesPublic`, `lessonsPublic`. It needs no staff-only field.
- **The short path is the same answer.** Only the student's own record and
  their own pull-outs are consulted, so a caller holding just those two gets
  what a caller holding the whole roster gets.
- **The feed keeps two choices of its own on purpose**: it writes events in
  fetch order (so an unchanged feed stays byte-identical), and it omits a
  cancelled lesson that the page shows struck through (#30).
- `studentDay.selfcheck.ts` runs under plain `node` in the self-checks and pins
  all of it, including that neither caller grows a copy back. It keeps the old
  page formula verbatim as its reference.
- Not switched: `DirectorSearch.tsx` `whereNow` (base membership only, by
  design a rougher answer) and `StudentDetail.tsx` (no sign-up data, its own
  sort and an 8-row cap). Moving either changes what staff see, so it is its
  own decision.

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
  screen counts responses instead of “3 of 14”. Time slots can’t be offered on
  one — a booking is anchored to a student doc — and the editor refuses that
  combination, which is the only place it could be created.
- **The honeypot must never fire on a BROWSER** (Sept 2026). It did: the decoy
  was merely parked off-screen, Chrome's autofill and password managers filled
  it, the payload gained a `website` key, `keys().hasOnly` rejected the create,
  and the student got “check your connection” on every retry — forever, since
  the value never cleared. iOS Safari fills only what it can see, so the
  college-info sign-up worked on an iPhone and nowhere else. One definition
  now, `src/public/components/Honeypot.tsx`, used by the open sign-up AND the
  parent contact form, with two guards that must stay together: `.pub-hp` is
  `visibility: hidden` at zero size (autofill and password managers skip a
  field they cannot see; a bot reading the HTML still finds it), and
  `botFields()` discards a value the browser filled, detected via `:autofill`.
  Do not re-inline a bare `<input className="pub-hp">` in a form — that is the
  shape that broke. firestore.rules is unchanged and needs no change.
- **Two audiences, two predicates.** `signupShowsInAlerts()` answers “does this
  belong on the Hub home / schedule strip”; `signupShowsInIndex()` answers
  “does this list on `/signups`”. They are NOT the same question: an open
  sign-up stays off the alert strip (it targets people who aren't in the Hub)
  but must list on the index, or it exists at its own URL and nowhere else and
  a student who loses the link has no way back. The index reused the alerts
  predicate until Sept 2026, which is exactly that bug. Invite-only stays off
  both. `scripts/signup-eligibility.selfcheck.mjs` pins the pair.
- Audience is otherwise **ensembles + instrument families only** — never a list
  of student ids. `signupForms` is world-readable, and student doc ids are
  shared with `studentsPublic`, so an invite list would publish who was
  invited to what. Unrecognized/blank instruments fail CLOSED.
- `signupResponses` is the app's fifth unauthenticated write. There is
  deliberately **no public update rule** — an unauthenticated update would
  let anyone overwrite someone else's signed form. A student who comes back
  creates a second doc; `latestPerStudent()` keeps the newest. Keep it that
  way.
- **An open sign-up is an INTAKE, so it feeds the roster** (Sept 2026).
  `src/shared/signupRosterIntake.ts` is the ONE definition of what a response
  becomes: who is new, who is already on the roster, and field by field what
  each record ends up saying. College forced it — a dual-enrollment student
  reaches the school through the form and nothing else, so whatever they typed
  is the only record there will ever be, and all of it has to land. Split by
  sensitivity, not convenience: name / instrument / grade / ensembles on the
  `students` doc, and email, phone, the guardian and every free-text answer in
  `contacts` (answers under `contacts.extra`, the bucket that already exists
  to lose nothing) — because the student doc is mirrored to the
  world-readable `studentsPublic` and an address typed into a public form must
  never ride along. The plan is shown in full before any write, since a typed
  name is the only anchor an open response has. Four promises pinned by
  `signupRosterIntake.selfcheck.ts` in the deploy workflow: an import never
  REMOVES an ensemble or blanks a field, an ambiguous name resolves to NOBODY
  rather than to the wrong student, an existing guardian is never replaced by
  the one who signed (a guardian is a person, not a value — it merges by name
  or address and adds otherwise), and `status`/`schoolId` are never written
  from a response. Writes go through `useStudents`/`useContacts` so the public
  mirror stays batched with its source doc.
  A college student's YEAR is a grade: `grade` is the app's one answer to
  "what year is this person in", so dual-enrollment students carry
  `College Freshman`/`Sophomore`/`Junior`/`Senior` (`COLLEGE_YEAR_GRADES`),
  read per student from whichever question asks for it (`yearQuestionId` +
  `collegeYearGrade()`), never a flat `College` for the whole cohort. Those
  strings all START with "College" on purpose — the roster search is a
  substring match, so the cohort is still one search — and none of them
  matches the high-school branches (`startsWith('12')` for seniors,
  `startsWith('9')` for theory placement), which is correct: a college senior
  is not a graduating 12th grader. An answer it cannot read falls back to the
  plain grade rather than guessing, and the raw text stays in `extra`.
  A family is not one parent: the signature block holds ONE guardian, so the
  others arrive as questions the director wrote, and `guardianQuestion()`
  reads a label naming both a person (mother / father / guardian / parent 2 /
  emergency contact) and a detail (name / email / phone / relation) into
  another `contacts.guardians` entry. That list is already unlimited — read
  the questions, don't add a field. It under-claims on purpose: a label with
  only one of the two, or one that smells like a consent line, stays an
  ordinary answer in `extra`. `mergeGuardian()` is the ONE way an entry joins
  that list, and it never displaces anybody.
- Answers ride in ONE bounded `answersJson` string, not a map: rules can
  bound a string's length but can't reach inside a map to bound its values.
  Read it with `parseAnswers()`, which never throws.
- Signatures are typed names plus the write's timestamp. The PDF export is
  the browser's own print-to-PDF (`printViaPopup`) over an off-screen
  packet — no PDF dependency, and it's why `.dir-signup-print-host` is
  positioned off-screen rather than `display: none`.

## "Sign-ups" is called "Forms" (Oct 2026, #forms)

Director's call, 2026-10-01, landed after the Freedom Tower trip: the
section holds permission slips and registrations as well as sign-ups, so
every WORD a person sees says "Forms" (en) / "Formularios" (es). Nothing
else was renamed, on purpose: the collections stay `signupForms` /
`signupResponses`, the code stays `Signup…`, the director tab id stays
`'signups'`, the i18n key stays `nav.signups`, and the assistant capability
stays `'signups'` (it is stored on live `directors` docs). New public links
come from `src/shared/formLink.ts` (`/forms`, `/form/<id>`); the old
`/signups` and `/signup/<id>` routes stay mounted forever — they are in
announcements, QR codes and texts already sent.

- `formKind` (`src/shared/formKind.ts`) — Sign-up / Permission slip /
  Registration / Open form — is a LABEL and a starting template, never
  behavior. Absent on old forms; read it with `formKindOf()`.
- **The public list shows open forms only.** Closed and past ones are the
  archive: on the director's list under "Closed", never on the public page.

## Signing the official PDF (Oct 2026, #sign-pdf)

Some paperwork must come back as the district's OWN document — the M-DCPS
field-trip parent permission form, first for Freedom Tower 2026-10-04 — not as
answers to Hub questions (director's call, 2026-10-01: "they have to put it in
themselves, sign it themselves, and date it themselves"). `SignupForm.signPdf`
turns a sign-up into that: the public page renders the PDF
(`PdfSigner.tsx`, pdf.js legacy build for older phones), the family types on
it, signs with a finger, dates it, and `src/shared/pdfStamp.ts` stamps exactly
those marks onto the original file. Everything else — audience, deadline,
"Still waiting", roster gate — is the ordinary sign-up machinery.

- **The signed PDF is staff-only and has no URL.** It carries medical,
  insurance and phone details. `storage.rules` `/signupSignedForms/{formId}/
  {studentId}/{file}`: directors read (not assistants, not teachers), the
  director screen reads with `getBlob`, never `getDownloadURL` (a permanent
  bearer link to a minor's medical notes) — same posture as `/checkins`.
- **Upload FIRST, then the response.** A response that says submitted must
  have its form behind it, so the Storage anchor is the sign-up (exists, has
  `signPdf`, not closed) + a real student doc, and `signedPdfPath` on the
  response is pinned by `firestore.rules` to that same folder and the
  `signedPdfPathFor()` file shape. Create-only (`resource == null`): a second
  send is a second file and `latestPerStudent()` keeps the newest.
- **Not on an 'open' sign-up** — no student doc to file under; the editor
  refuses it.
- pdf.js + pdf-lib are lazy chunks kept OUT of the precache (`globIgnores`).
- Marks are PDF points from the top-left; `pdfStamp.ts` flips once.
  `pdfStamp.selfcheck.ts` pins: an undrawable name degrades a letter rather
  than losing the form, page counts survive stamping and merging.
- A sign-up can be created without a browser: `scripts/post-signup.mjs` +
  *Post Sign-up* from `config/signups/*.json` (world-readable content only).
- **Name, school ID and grade are QUESTIONS, not hand-typed** (director,
  2026-10-01): `signPdfFields` lists every spot each answer prints, so one
  answer fills both Section I and Section III. Find a blank's position with
  `pdftotext -bbox` and confirm it by stamping and rendering with `pdftoppm`
  before shipping. The school ID lands only in the staff-only PDF, never on
  the response doc. Signature then date, and the signer hands over to Date
  after each signature.
- **Emergency contacts and medical notes are `signPdfQuestions`** (field
  `source: 'question'`), which print onto the PDF and are stored NOWHERE else
  — never in `answersJson`, which assistants and applied teachers read. Keep it
  that way: phone numbers and a child's medications belong only in the
  directors-only signed PDF. `required`, `oneOf` (at least one of a group — the
  three phone numbers) and `extra` (the optional fold) are the whole grammar.
  A field with `maxWidth` shrinks a long answer to its blank
  (`fitTextSize`, same math on screen and in the stamp).
- **The emergency-contacts spreadsheet reads the PDFs** (`pdfFieldRead.ts`,
  `signups/emergencyContacts.ts`), in the director's browser, because the
  answers are stored nowhere else. Do not "fix" it by saving the answers to
  Firestore — that is the copy the design avoids. It subtracts the blank
  form's own text, then assigns each run to the blank on its line; a blank
  ends where the next one on its line starts. `pdfFieldRead.selfcheck.ts` is
  a real stamp → pdf.js round trip.
- `highSchoolOnly` (groups mode) drops `College …` grades via
  `isCollegeGrade()` in `signupEligibility.ts` — the district form is not for
  the dual-enrollment students in a mixed ensemble.
- **The Storage bucket needs a CORS policy** (`config/storage-cors.json`,
  *Set Storage CORS* workflow) or every in-browser Storage download (getBlob,
  fetch) silently hangs: the SDK retries a CORS refusal as a network blip for
  two minutes. That was "Open signed form" stuck on "Opening…". CORS grants no
  access; storage.rules still does.

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
  **The grade is a whole number 0–100** (director's call, Sept 2026 — the
  paper log's column is numeric and the district gradebook is a percentage).
  `lessonGradeValue()` is the ONE reader; anything it can't read — blank, a
  fraction, or one of the A–F letters this replaced — is IGNORED rather than
  scored as a zero, which is the only reason retiring the letters didn't turn
  every old lesson into a failure. Live docs graded before the change still
  hold letters and the log flags them "re-enter as a number"; there is no
  migration script, on purpose (only the teacher knows what the letter meant).
- **The family email is never a side effect of saving** (director's call,
  2026-09-03 — "that may become automatic in the future, but not right now").
  `enqueueLessonLogMail()` is called from a teacher's PRESS and nowhere else;
  a save only offers. `Lesson.logMailedAt` records that a line went out, so
  the row can say "Emailed Sep 3" instead of leaving a teacher to guess and
  double-send. If you ever wire this to a save path, that is the regression.
  The press writes `lessonLogMailQueue`; the `lessonLogMailSend` Cloud
  Function turns that into a `mail` doc for the Trigger Email extension —
  **not** the Power Automate flow the old runbook described, which was never
  built (`docs/lesson-log-email.md`). That queue doc is written by a
  signed-in teacher who controls every field on it, `recipients` included, so
  the function trusts NOTHING in it but `lessonId`: content comes from the
  stored lesson, addresses from `contacts/{studentId}`, and
  `queueRequestOk()` makes the lesson agree with the student the rules bound
  the request to. `mail` stays denied to every client.
- **Files on a lesson are staff-only, and the email link expires**
  (#lesson-attachments, Nov 2026, Hub 2.0 Phase 4). A teacher attaches up to
  three PDFs, pictures or audio clips to a log line. `Lesson.attachments`
  holds `{name, path, contentType, size}`; `src/director/lessonAttachments.ts`
  is the ONE definition (zero imports, the function loads it bare).
  - Storage `lessonAttachments/{lessonId}/{file}`: read and upload only by
    that lesson's own teacher or a director, anchored on the `lessons` doc
    existing (the `/absenceExcusePhotos` shape), 50 MB, PDF/image/audio,
    create-only, and `teacherEmail` metadata that must match the lesson so
    the owner can still delete the files after the lesson doc is gone. No
    public read and no download URL ever: the app opens a file with getBlob.
  - `lessons` has no key allowlist, so `lessonAttachmentsOk()` in
    firestore.rules is the one shape check: three slots, four keys, and each
    PATH pinned to `lessonAttachments/<that lesson>/`. That pin matters
    because the function signs whatever path the doc names; the function
    re-checks it (`attachmentsToSign`). Raising the three means editing the
    rules' per-slot checks too.
  - `attachments` is in NONE of the three public lesson allowlists and must
    never be. `lessonAttachments.selfcheck.ts` pins all of this.
  - The family email (still only on the teacher's press) gets one link per
    file: a **v2 signed URL, 30 days**, made by `lessonLogMailSend` through
    the Admin SDK (`signedUrlOptions`; v4 cannot outlive seven days). Never a
    Firebase download token. Signing needs the functions runtime service
    account to hold **Service Account Token Creator on itself**
    (`iam.serviceAccounts.signBlob`); without it the file is left out and the
    email says to ask the teacher. Do not "fix" that with a permanent link.
    The mailto fallback carries no link (no signer in the browser).
  - Deleting an attachment deletes the object after the save; deleting the
    lesson deletes them when the undo window lapses (`deleteStoredPaths`).
  - My Lessons opens with "This week: N lessons, M to log"
    (`thisWeekCounts()` in lessonLog.ts), counted from the lessons the screen
    already loads.
- **The whole paper form is on screen** (#applied). `src/director/lessonLog.ts`
  holds the per-lesson blanks; the ONCE-A-TERM ones (Jury Repertoire List, the
  three signature lines) are a `LessonLogSheet` in `lessonLogSheets` on the
  teacher's own `directors/{email}` doc — same home and same reason as
  `lessonSlots` below — keyed by `sheetKey(studentId, schoolYear, term)` so
  Fall and Spring are separate sheets, as on paper. Adding a key there means
  adding it to the `hasOnly([...])` self-update list in `firestore.rules` in
  the SAME change, or the write silently starts failing. The log form is a
  full PAGE, not a drawer, because the term's earlier rows must stay on screen
  above the row being written (`logRowsWithDraft()`); don't put it back in a
  drawer.
- **A weekly lesson time is a RECIPE, not a lesson** (Sept 2026).
  `lessonSlots` on the teacher's own `directors/{email}` doc holds one
  `{weekday, startTime, endTime, location?}` per assigned student — beside the
  `assignedStudentIds` it qualifies, so there is no new collection and no
  second query/rule pair. `src/director/lessonSchedule.ts` expands it into
  ordinary dated `Lesson` docs and nothing downstream knows a slot existed.
  Three promises pinned by `lessonSchedule.selfcheck.ts` in the deploy
  workflow: a date that already has a lesson is NEVER re-created (cancelled
  ones included — re-creating one would silently undo the teacher's
  cancellation), the weekly walk is bounded, and generation skips MDCPS
  no-school days (`MDCPS_NO_SCHOOL` in `src/shared/academicCalendars.ts` —
  see #college-hs-calendar-deps above). It changed from "generates every
  matching weekday, the teacher cancels the handful that don't happen" once
  the app had a real MDCPS calendar to check against (Sept 2026) — a lesson
  landing on a holiday was a bug, not a feature, once skipping it was
  possible. It still deliberately does not auto-create `rosterOverrides` for
  conflicts with OTHER events (rehearsals, sectionals) — it reports the count
  and the teacher confirms each pull-out, which is what tells the ensemble
  director.
- Roles are a CLOSED set enforced by `isKnownRole()` in `firestore.rules`
  (owner / director / teacher / classroom / assistant; a doc with no `role` =
  legacy director). Adding a new role means deliberately updating that helper and
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

## Each listed person is tied to their own Google account (Nov 2026, #google-binding)

The Directors list names people by address. The server records, on each
entry, which sign-in account is that person's: `googleSub` (Google's own id
for them), `boundUid` (the one Hub sign-in account that goes with it),
`boundAt`, and `passwordSet` (for #password-sign-in; always false here).

- **Only `bindGoogle` writes the record** (`functions/src/googleBinding.ts`),
  and only from the token GOOGLE signs at a real Google sign-in
  (`googleIdToken.ts`: Google's keys, issued for one of this project's
  sign-in clients AND to that same client, a verified address that is the
  listed one). Neither file that does that check reads an environment
  variable, so nothing outside can switch it off. It reads "verified" from
  nowhere else. It
  never creates an entry and never moves a record to a different Google
  account. The app sends that token along; it never writes the record.
- **The account it records is always a FRESH one** (`freshAccount.ts`): a new
  account is made, the attach step is proven on it, and only then is the
  account the caller arrived on deleted and the address moved over. (A
  failure after that point leaves the person with no account until they
  sign in again, which puts it right.) The same
  Google sign-in then opens the fresh one, so there is no second pop-up. Do
  not "save a step" by recording the account the caller is already on: the
  fresh account is the mechanism, and `googleBinding.selfcheck.ts` fails if
  it goes. Nothing in `src/`, the rules or the functions keys data on a
  sign-in account's id; the browser's queue of unsent changes does, which is
  why the app lets it empty first and why other devices must sign in again.
- **One request at a time per person** (`entryLock.ts`, `signInLocks`, which
  no rule matches). Everything that reads or changes the account or the entry
  happens under that claim. A claim carries an id of its own and a request
  lets go of ITS claim only; one left by a crash, or dated in the future, is
  ignored after a minute.
- **No browser may set or alter the record, the Owner's included**
  (`bindingGuard()` in `firestore.rules`, pinned word for word by the
  self-check). The Owner may only REMOVE it from someone else's entry
  (Directors screen, Reset). `addDirector` carries an existing entry's record
  along unchanged, so re-adding a listed address does not clear it
  (`BINDING_KEYS` in `useDirectors.ts`). *Fix One Field* refuses `directors`,
  `serverConfig` and the server's other collections.
- **The app asks in ONE place**, `recordWith()` in `AuthGate.tsx`, straight
  after a Google sign-in. A person the rules already let in is never blocked:
  they get a note with "Confirm now" and "Later", and after two tries that
  did not finish the note stays away until the Hub is next opened. Only when
  the rules refuse the session is there a "One more step" screen.
- **The Hub offers to confirm only where the server step exists**:
  `features.googleConfirm` in `config/orgs/*.json`, true for NWSA only. The
  demo sites have founding addresses and no Cloud Functions, so there the
  note could only fail.
- **Every listed person is asked** (`ASKS_SERVER` in `AuthGate.tsx`). On
  the first live run only the founding address was asked and recorded; that
  condition was removed from the app and the server TOGETHER, and the
  self-check now fails if it comes back on either side: once the sign-in
  rules are in place, a person whose Hub never offers to confirm could
  never get their file access back. `docs/google-binding.md` has the steps,
  what a person sees when it worked and when it did not, and the stop button
  (delete the `bindGoogle` function in the Google Cloud console: a revert
  does not remove a deployed function).
- **It goes live in steps, on purpose**: the Owner alone, then everyone, then
  the sign-in rules with the requirement switched off, then the switch. The
  service worker holds a new app version until the person taps Refresh, so a
  phone on an old copy would be locked out the moment a stricter rule took
  effect. None of the steps on a concert day.
- **`honouredSignIn()` is the test, in three places that change together**:
  `firestore.rules`, `storage.rules`, and `functions/src/staffToken.ts`. A
  Google sign-in is honoured only when the session is on the account the
  entry names (`boundUid`) and that account has the entry's Google identity
  (`googleSub`); anything that is not a Google sign-in is refused; a new way
  of signing in gets a clause on purpose or gets nothing. Every gate calls
  it: `signedIn()` and `verifiedSelf()` in `firestore.rules` (the only two
  places that file reads a token for access; every role helper goes through
  `hasRole()`, which asks `signedIn()` first), the four staff helpers in
  `storage.rules`, and `staffFromIdToken()` in `functions/src/index.ts`, the
  ONE place a function may call `verifyIdToken` to learn who is asking
  (`bindGoogle` aside, which is what makes the record). Each such function
  checks the ROLE straight after, because an unlisted caller comes back with
  no entry rather than refused.
- **Firestore requires the record only once a server-only switch is on**
  (`serverConfig/signIn.googleTieRequired`, written by
  `scripts/require-google-ties.mjs` and nothing else; no client can write
  `serverConfig`, and only the Owner can read it). It is data and not a line
  of the rules for two reasons. This SAME `firestore.rules` is deployed to
  the demo projects, which have no Cloud Functions and so can never make a
  record: with no such document they work exactly as before. NEVER set it
  for a demo project. And turning it on or off is one write, instant and
  reversible, with no rules deploy. The bound clause comes first in the
  rule, so a bound person never costs a read of the switch. Even with the
  switch OFF, a sign-in that is not Google's is refused on a listed address.
- **"Confirmed" has ONE meaning**: the entry names an account (`boundUid`)
  and either a Google identity (`googleSub`) or `passwordSet === true`. The
  switch script (`isConfirmed` there) and the Directors screen
  (`isConfirmed` in `useDirectors.ts`) both use it. Turning the switch on
  counts EVERYONE listed, so an unused entry makes it refuse; remove the
  entry rather than forcing it.
- **Storage and the functions always require the record, with no switch.** A
  Storage rule may look at only two Firestore documents and these already use
  both, and both exist only for the school's project. So a person with no
  record can neither upload nor open staff-only files until the app has had
  the record made. The three copies are NOT word for word the same;
  `staffToken.selfcheck.ts` pins each one.
- **The switch workflow's log says nothing about the result**: not whether
  the requirement is on, not how many people have no record. The choice is
  read from the run's event file (a step's environment is printed in the
  log), the script prints one fixed line, and the result goes to
  `serverConfig/signIn.lastRun` for the Owner's Directors screen. Its
  `clear-owner` mode is how an Owner who cannot get in is put right; never
  through *Fix One Field*, which refuses that collection.
- **A hand-made test token must be a Google sign-in on the account its entry
  names** (`firebase: { sign_in_provider: 'google.com', identities: {
  'google.com': [...] } }`, with `googleSub` and `boundUid` on the entry), or
  the staff rules refuse it (Storage and the functions always; Firestore
  once the switch is on).
- `scripts/sign-in-accounts-audit.mjs` (*Audit Sign-in Accounts* workflow)
  answers, in one word, whether every sign-in account is what the Hub
  expects. It prints OK or REVIEW NEEDED and never an address: this repo's
  logs are public. Which accounts, and which listed addresses have no sign-in
  account yet, go to `serverConfig/signInAudit`, which the Owner's Directors
  screen shows.
- **The checks run before every rules deploy AND every functions deploy**
  (`rules-checks.yml`, the first job of `deploy-rules.yml` and of
  `deploy-functions.yml`, and on pull requests that touch the rules):
  `googleBinding.selfcheck.ts` and `staffToken.selfcheck.ts` (also in
  `.github/actions/self-checks`), then two emulator checks that ask the
  REAL rules: `scripts/google-binding.emulator-proof.mjs` (real sign-ins,
  every role, all three gates) and the `visitor` mode of
  `scripts/rules-verdicts.emulator-check.mjs` (with the requirement on, a
  listed person with no record gets exactly what an unlisted Google account
  gets). The self-checks compare the rules word for word, which catches a
  regrouped condition; only the emulator checks can see a rule elsewhere
  that lets the same thing through another way. `googleBinding.selfcheck.ts`
  also pins that these wirings stay. That script's `record` and `compare`
  modes show what a rules change moved against `main`; use them for the
  next rules change too.

## Playing-exam grading — one line, one rubric (Sept 2026, #exam-rubric)

The grade sheet used to be two lists of the SAME people: a roster row that
said "Submitted", and a separate "Video submissions" section further down
carrying everything a grader actually needed. You read a name twice to grade
it once, and the video opened in another tab. It is one list now — the row IS
the submission, and opening it plays the video with the rubric under it
(`src/director/assignments/GradeRow.tsx`). Two things must not regress:

- **Only the OPEN row renders a `<video>`.** A playing exam is up to 500 MB
  per student, and a player on every row would start pulling a roster's worth
  of video because a page rendered. THAT is the invariant; the `preload` value
  is not, and `preload="none"` was tried and reverted the same day. It leaves
  the element at `readyState` 0 with `duration` NaN, so the player is a dead
  black rectangle reading 0:00 with no total time and no first frame — it
  reads as "not playable" and the grader goes back to the link, which is the
  whole thing this screen replaced. `preload="metadata"` fetches the header
  and stops (measured: ~7 MB of a 40 MB file, bounded by the browser's own
  forward buffer) on a row the director deliberately opened. Do not "save
  bandwidth" by putting it back to none.
- **A submission from someone no longer on the roster still shows** (the
  "Videos from students not on this list" fold). Merging a submission-anchored
  list into a roster-anchored one is exactly where those would have vanished.

`src/director/examRubric.ts` is the ONE definition of what a rubric is and
what it adds up to; `examRubric.selfcheck.ts` pins it in the deploy workflow.

- **The rubric belongs to the EXAM, not to the app.** Another director weights
  a playing exam their own way, and a scale check is not a concerto jury. It
  is `Assignment.rubric`, seeded from the grader's own `directors/{email}`
  `examRubric`, edited on the assignment.
- **Three states, all meaningful.** ABSENT = nobody chose, so
  `rubricForAssignment()` falls back to the grader's default (Playing Exam
  only) — which is the whole reason exams created before this need no
  migration. A LIST is the exam's own. **EMPTY is not absent** — it means the
  director turned rubric grading off for that exam and must never be
  re-defaulted.
- **`examRubric` is in the directors self-update `hasOnly([...])` list in
  `firestore.rules`.** Same trap as `lessonSlots`/`lessonLogSheets`: drop it
  and saving a default starts failing silently.
- **An unscored line is not a zero.** A partial rubric produces no grade at
  all (`rubricScores()` returns null) and Confirm stays disabled. A rubric
  that shows 58 because four of six boxes are filled is a failing grade
  nobody gave.
- **A confirmed grade snapshots its own lines** (`AssignmentResult.rubric`
  carries each line's label, worth AND points). Re-weighting the exam
  afterwards therefore cannot rewrite a grade already filed; the row says it
  was given on an earlier rubric instead. `score` stays the whole-number
  percent, so a rubric that totals 60 still files a gradebook number.
- Grades are staff-only and have no public projection — `assignmentResults`
  never reaches the student site. Showing a student their own breakdown would
  be a NEW mirror with its own pinned allowlist, never a loosened read rule.

## "Which semester is it" — one answer (Sept 2026, #current-term)

`currentTerm(terms, today)` in `src/shared/concertCheckin.ts` is the ONE
answer, beside `termForDate` where a term is already defined. Every screen
that opens on a term defaults through it: the Assignments list, and a new
jury's term. Do NOT add month arithmetic anywhere in `src/` — a term's dates
are ORG CONFIG (`ORG.terms`, editable in Settings) because Fall does not start
on the first of August. At NWSA it starts Aug 17, and the hardcoded ">= month
8" guess is wrong for Aug 1-16, the winter gap, and all of June-July.

- Outside every term, `currentTerm` answers with the most recent term that has
  STARTED — in July that is the spring just finished, which is where the
  grades still being closed out are. Before the first term, the first one.
- An org with no `terms` configured (every org but NWSA today) gets `null`,
  and a screen with no term to show must show EVERYTHING rather than nothing.
  The Assignments filter renders only when `terms` is non-empty.
- An assignment due outside every term shows under "All semesters" only. It is
  never filed into the nearest term — a July make-up exam did not happen in a
  term nobody gave it in.
- **The applied-lesson log is deliberately NOT on this.** Its `TermRef`
  (`schoolYear` + Fall/Spring, month arithmetic in `src/director/lessonLog.ts`)
  is the identity of a stored `lessonLogSheets` key via `sheetKey()`. Those
  keys are live data; re-deriving them from `ORG.terms` would strand every
  sheet already written. It answers a different question — which printed sheet
  is this — and keeps its own math on purpose.
- `landingTerm()` decides which sheet a student opens on: the term we are in,
  falling back to their newest lesson's term only when this term has none.
  Following the newest lesson unconditionally was the bug — a standing weekly
  time generated in August writes lessons through May, so every student opened
  in September landed on the spring sheet. Pinned in `lessonLog.selfcheck.ts`.

## The CSP is generated, and it fails silently (Sept 2026, #csp)

`cspPlugin` in `vite.config.ts` injects a `<meta http-equiv>` policy at build
time — GitHub Pages cannot send headers, so this is the only delivery. It has
now shipped broken TWICE, and both times the failure looked like something
else entirely:

- `connect-src` was missing the Cloud Functions origin until three hours
  before the first concert that needed it. The function answered correctly and
  the browser refused to send the request; the page could only say "That did
  not reach the Hub."
- **`media-src` was missing altogether.** Storage was already listed for
  `connect-src`, so UPLOADING a playing exam worked and PLAYING one back did
  not: `<video>` fell through to `default-src 'self'`, the browser refused the
  media, and the player sat there with no error and no "cannot play" banner.
  The reported symptom was "it won't play, it won't load, nothing", and two
  plausible theories (the `preload` value, then a stale service worker) were
  both wrong before anyone looked at the policy.

**A CSP omission looks exactly like bad wifi from the inside.** Nothing
throws, no test fails, the feature is simply dead in the browser. So:

- **Every sink needs naming separately.** `media-src` does NOT fall back to
  `connect-src`; it falls back to `default-src`. Allowing Storage for one sink
  allows it for no other. Adding a feature that renders a NEW kind of remote
  resource means adding its directive in the SAME change.
- `blob:` must be listed explicitly wherever the app previews something a
  person just picked or recorded — `default-src 'self'` does not cover it.
- `scripts/csp.selfcheck.mjs` runs in `deploy.yml` AFTER the build (the
  policy only exists in the built `dist/index.html`) and pins the directives
  the app cannot work without, plus the guards that must not erode:
  `object-src 'none'`, `base-uri 'self'`, and no `'unsafe-inline'` in
  `script-src` (the two inline boot scripts are allowed by sha256 hash).

## Quarter grades and the district report (Sept 2026, #gradebook)

The Gradebook decides a quarter grade and builds the tables the teacher of
record is emailed. Four modules, three of them pure and pinned by a self-check
in `.github/actions/self-checks`.

- **The Hub does NOT grade attendance. The director does** (director's call,
  2026-09-14). An excused absence costs nothing and is a record only; an
  unexcused absence or lateness informs the Preparation mark, and by how much
  is a judgement made with the counts in view. So every category is a typed
  number, with the Hub's own records printed on the same line. Do not
  "finish the job" by computing one: roll here is exception-only, there is no
  Present record, and a rate resting on a denominator the director did not
  know they were creating is worse than a number they chose.
- **A box FOLLOWS the Hub until a director types over it** (the spreadsheet
  model, director 2026-10-14: "it should be continuously updating since it's
  all the same grades"). Playing Exams, Required Performance Attendance and the
  applied Lesson average are countable rather than observed, so they are LIVE:
  `buildTable()` in `src/director/grades/gradeTable.ts` works them out on every
  render from the exams, rolls, scans and lessons as they stand. They used to be
  a grey SUGGESTION that Fill COPIED into the box, and a copy is a snapshot —
  the lesson grades logged after the interim never reached the final, and an
  exam regraded after being added as a column never moved. Now a number typed
  into a box OVERRIDES the live one (as typing over a formula does);
  `categoryResult()` says which is which; a typed number is bold with a dot and
  its cell says "You typed 92. The Hub says 88." with "Undo: use the Hub
  number". **Never write a live number into a box** — that is the snapshot bug
  again. `fillValueFor()` is still the
  ONE answer to what Fill writes, and Fill is offered only on JUDGEMENT boxes,
  where nothing in the Hub can speak: full marks, never a computed value.
  Marks are keyed by PERIOD, not by interim-or-final, so what was entered at
  the interim is already there at the end of the quarter.
- **Automatic intake, no modes (Nov 2026 rebuild).** Every graded assignment of
  EVERY type, every concert required of someone on the table, and the lesson
  average is its own column, created by `buildTable()` the moment the first
  student on the table is graded — nobody adds a Hub column and nobody can
  remove one. A category is the mean of the cells that have a number, per
  student. Banned, and pinned by `gradeTable.selfcheck.ts` A1-A7: a hand-made
  column changing which Hub items count (the old "once one exam column exists
  the rest drop out" flip), a due-date or "as of" gate on an ASSIGNMENT grade
  (the "as of" date governs only dated things: concerts, lessons, roll), and a
  blank read as zero anywhere, the email and the college export included.
  Which category a type lands in is config (`assignmentTypes` on a category;
  anything unclaimed lands in the `suggest: 'exams'` one). A Hub column can be
  switched to "Not counting" (`off:<key>` on the table doc `_table`, filed as
  `${groupKey}_${periodId}__table` so no rules change); it stays on screen.
  Hand-made columns (`x:` grades, `d:` penalties) are registered on that same
  table doc. The UI may not say pinned, tally or suggest, and every button is
  one of a fixed list of verb phrases: the self-check reads the TSX for both.
- **High school and college never share a table (Nov 2026).** `tableSpecs()`
  is the ONE answer to which tabs exist: the configured district reports
  ("Camerata · HS"), any other HS group with a grade this quarter, and a
  College table for every group with college members that is the person's own
  (`assignedEnsembleIds`). `rosterFor()` filters by world, so a college student
  is never in the Brent Mounger email and a high schooler is never in a college
  table. A college student in Symphony is on "Orchestra · College", so the
  grade follows the student. College marks live in `gradeMarks` under
  `college:<ensembleId>` (no new collection, no rules change); a college
  table reads the student's old HS-key doc until its first save copies it
  across. College plan: `plans.college` in config (the default plan plus
  Applied Lessons, labels "Exams & Tests"). College tables end in "Copy the
  table": name, every column, category averages, final, blank never zero.
- **Re-normalize over scored categories** — the workbook's formula verbatim, so
  an unscored category leaves numerator and denominator both and an interim in
  week three is not dragged down by an exam that has not happened. A blank is
  never a zero (`gradeValue`, same fail-closed shape as `lessonGradeValue`).
  Below `COVERAGE_FLOOR` of the plan there is **no percent at all**: a
  confident 94 built from one category, arriving in a district gradebook, is
  the worst thing this code can produce.
- **`meetingsHeld` is the ROLL RECEIPT, not the calendar.** A rehearsal that
  was cancelled, moved, or never rolled is not a meeting anybody missed. It
  follows that skipping roll shrinks the number for everyone in the group,
  which is correct and is why the screen prints it beside the absences rather
  than hiding it inside a percentage.
- **School-day tardies are not attendance** and must never reach this module
  (#tardies). The four roll marks stay in SEPARATE buckets, because the
  director grades unexcused and excused differently and summing them would
  take that choice away.
- **`parseName()` is the ONE name parser, and the roster stores names BOTH
  ways.** Checked live 2026-09-14: 120 of 142 active students as
  "Rose, William F." and 22 as "Vincent T. Blades", with every student on the
  two district tables in the comma form. A parser that assumed one of them put
  the middle initial in the district's Last Name column and sorted the whole
  table by it. A comma is the signal and it is the only reliable one, since a
  two-word surname is indistinguishable from a middle name without being told.
- **The grading calendar is org config; there are NO interim dates.** The
  M-DCPS calendar publishes grading-period boundaries, a school-day count per
  quarter, and the days with no students. It publishes no interim date for any
  quarter. What exists is the teacher of record asking for the numbers by a
  given morning, which is a request and not a deadline this repo gets to
  store. An earlier pass derived one by back-solving a percentage through the
  quarter from one such request; it gave Sep 22 for Q1 and the real ask was a
  week earlier. `defaultCutoff` opens an interim on TODAY and the person
  running the report moves it.
  `gradingPeriods.selfcheck.ts` proves the configured boundaries plus
  `MDCPS_NO_SCHOOL` reproduce the district's printed counts exactly (45 / 46 /
  42 / 47, totalling 180). That only passes if the boundaries AND every
  no-school day are right, which is what makes it a test rather than a
  restatement.
- **An interim covers the QUARTER TO DATE**, never the weeks since the last
  report. Getting this wrong produces numbers that are individually plausible
  and collectively wrong.
- **Every district-specific string is org config** (`ORG.grading`): the
  weights, the comment codes, the comment triggers (79 or lower, effort 3,
  conduct C or lower), the standing request shown at the top of the screen,
  and the three table layouts. Camerata carries a Last Name column and says
  "Behavior"; Symphony drops it and says "Conduct". That is a fact about the
  course SECTION, not anybody's preference, which is why it travels on the
  layout and not in `src/`.
- **`gradeMarks` is staff-only with no public projection, and is not getting
  one.** `assignmentResults` has none either; showing a student their own
  breakdown would be a NEW mirror with its own pinned allowlist, never a
  loosened read rule (#privacy). The doc id is
  `${groupKey}_${periodId}_${studentId}` and `firestore.rules` requires the
  key fields to MATCH it, so a document cannot claim to be about a group or a
  period it is not filed under.
- The applied table is the teacher's STUDIO: the union of `assignedStudentIds`
  with anyone they actually taught in the window. A student with no lesson
  logged still appears and shows an honest blank rather than dropping off the
  report.
- **`checkin.entryOnly` credits a concert on the ARRIVAL scan alone**, for the
  night the check-out station fails. `scansCredited()` in `concertCheckin.ts`
  is the ONE answer, called by the director's board, the grade evidence, and
  the Cloud Function behind the student's own tally — if those disagree, the
  student is holding the wrong number. Per event, with no site default: a
  default would quietly retire the check-out everywhere.
  Which concerts have it is `config/entry-only-concerts.json`, applied by the
  *Set concert entry-only* workflow, so the exemption and its reason are a diff
  rather than somebody's shell history.

- **Columns** (#gradebook-columns; one concert or exam 2026-10-01, rebuilt
  2026-10-14). A table's columns are the union of the keys its
  `gradeMarks.scores` docs hold, so there is no new collection and no rules
  change (`scores` is an open map), and `tallyGrade` (plan ids only) can never
  count a column as a category. `parseColumnKey()` is the ONE reader of four
  kinds: `concert:<eventId>` / `exam:<assignmentId>` (LINKED — blank is the
  Hub's live number, a typed number overrides), `x:<categoryId>:<label>` (a
  grade of the director's own, 0-100, averaged in) and
  `d:<categoryId>:<points>:<label>` (an INCIDENT count — a phone out, acting
  out — each one takes `points` off the box). A box is the average of its
  columns, or with no exam / concert columns of its live source; incident
  columns come off afterwards and **never create a score** (no base, no value),
  and a typed box is marked down too.
  A column exists because some doc holds its key, so ADDING one writes a
  literal `null` for the roster and CLEARING a cell writes `null` — never a
  delete, which could remove the last key a column had. Only Remove deletes
  (`REMOVE` in `useGradeMarks.writeCells`, which is also how a merge save
  clears: it deep-merges maps, so a key merely left out of a patch survives).
  The label is part of a field name, so `cleanLabel()` strips the characters a
  field name wants escaped. Concert numbers are `concertScore()`: in+out (or
  `scansCredited`) 100, one scan 50, none 0, a performer 100 unless the roll
  marked them Absent, and BLANK — never zero — for a concert that is not theirs,
  an excusal, or Absent (Excused).
  Four more rules, each found by an independent review of the first version
  (`gradeTable.selfcheck.ts` §9 pins them): a linked column follows the Hub only
  INSIDE the report's window (a concert dated after the "As of" date, or an exam
  due after it, is blank — a typed number there still counts) and the Add menus
  stop at the same cutoff; a CANCELLED concert's column is blank and says
  "(cancelled)"; someone in the AUDIENCE is measurable only when the concert is
  marked Required (no Required flag means no door station, and "no scan" must not
  read as "did not come"); and a performer's roll is read from the group whose
  concert it is — the table's own group when it plays, else the groups the
  student plays with there — so two district tables never disagree about one
  student at one concert. Any event marked Required counts whatever its type.
- **The screen waits for its records.** Numbers are built from eight listeners
  (students, events, roll, check-ins, overrides, assignments, results, lessons)
  plus `gradeMarks`; until all have answered a table is incomplete (a missing
  check-in reads as a concert not attended), so Fill, Follow the Hub, Add/Remove
  column, +1 and the email are disabled behind a "Loading" banner.
  `useGradeMarks` keeps the previous period's docs until the new snapshot lands,
  so it excludes them and reports `loading` meanwhile.
- **Which concerts are required of a student** is `concertRole()` /
  `concertRequiredOf()`, reading the same three lists `studentExpectation` uses
  for a student's schedule: a PERFORMER is required unless the concert is marked
  Optional (playing in it is the requirement); someone in the AUDIENCE
  (`attendanceEnsembleIds` / `attendanceStudentIds`) only when it is marked
  Required, because that flag is also what turns on the door check-in, the only
  evidence an audience member leaves; an event that lists nobody is school-wide.
  This replaced "the Required flag is the one switch for 'this concert
  counts'": the Symphony's own concerts were never flagged, so they appeared in
  no list and counted for nothing, and no screen said why.
- **The screen and the email read ONE model.** `GradebookView` builds a
  `TableModel` for EVERY layout and the email's tables come from those same
  rows. They used to be built from whatever had been TYPED, so a number that was
  only ever a grey suggestion on screen never reached the district.

Design record: `docs/superpowers/specs/2026-09-14-gradebook-design.md`.
Session records: `docs/session-notes-2026-09-14-gradebook.md`, and for the live
boxes, columns and the Q1 concert/exam diagnosis
`docs/session-notes-2026-10-14-gradebook-live-columns.md`.

## Student data never leaves the app (Sept 2026)

A roster write is not a candidate for the trigger-file workflow pattern. This
repo is PUBLIC, so a committed list and an Actions log are both public, and a
doc id is not anonymous — anyone can map it to a name through `studentsPublic`.
Archiving a student, editing a grade, changing a contact: those happen in the
authenticated app, where the rules apply and nothing lands outside Firestore.

The concert exemption above is fine to route that way because a concert is a
public event. A student's withdrawal is a record about a minor. When an agent
is asked to make a roster change directly, the answer is the app, and the
useful thing it can do instead is VERIFY afterwards from `studentsPublic`,
which is world-readable already and so exposes nothing new.

## Online tests (Sept 2026, #online-test)

A Written Test can carry a test students take on the public assignment page,
picking their name off the class roster. Built for a college history exam: listening
identification, terms, and short answers, taken on phones in class, results
into Excel. `src/shared/quiz.ts` is the ONE definition of a test, a key, a
score, and the results sheet; `quiz.selfcheck.ts` pins it in the self-checks.

- **The key is never public.** `assignments` is a world read, so
  `Assignment.quiz` holds QUESTIONS ONLY and the answers live in the
  staff-only `assignmentKeys/{assignmentId}`. `splitQuizFile()` is the only
  place a test file is divided, and the director loads it in the app, never
  through a seed script or workflow: this repo and its Actions logs are
  public. Do not commit a test file with answers in it.
- **A written answer is not a zero.** Choice questions score against the key;
  text questions are graded by a person, so the auto total covers choice
  points only and its header says so. The results sheet carries the written
  text with an EMPTY score column. A missing key scores as not-yet
  (`unkeyed`), never as wrong.
- **Answers match by question id, never by position** — a re-ordered test must
  not move one student's answer under another question.
- **The class roster is the gate, not the link.** Students have no accounts and
  an assignment URL is public, so "only this class can take it" is enforced
  where it can be: the form offers ONLY that assignment's roster
  (`studentsPublic`, filtered by the assignment's `ensembleIds` plus anyone
  named in `studentIds`), and `quizSubmitterAllowed()` in `firestore.rules`
  re-checks that membership on every create. A student in another class is
  refused by the rules, not just by the screen. The consequence to live with:
  somebody missing from the Hub roster cannot submit, so the roster has to be
  right before the test opens.
- `quizSubmissions` is the app's sixth unauthenticated create. Same shape as
  `signupResponses`: exact key set (which is also the honeypot, via
  `Honeypot.tsx`), a students/{id} anchor, one bounded `answersJson` string,
  and NO public update — a second send is a second doc and
  `latestPerStudent()` keeps the newest.
- **Open/closed is enforced in the rules**: a create requires the assignment's
  `acceptsQuizSubmissions == true`. The public page also hides the questions
  while the test is closed, but that is courtesy, not security — the doc is
  world-readable either way.
- The public form drafts answers into `localStorage` so a reloaded phone loses
  nothing, and DELETES the draft on a successful send so a shared computer
  never opens onto the last student's name and answers.
- **The key is EDITABLE in the app, per question** (`setQuizAnswer`, the
  panel's Answer key list). A test file must name an answer for every choice
  question, but three listening excerpts share one option list and which one
  was played is decided in the room — whatever the file guessed is not it.
  Safe at any time because **a submission stores the student's ANSWERS and
  never a score**: scoring is computed on read, so changing an answer
  re-scores every test already sent. Keep it that way; caching a score onto a
  submission would freeze the first, possibly wrong, key.
- **A test grades on the ROSTER ROW, through the rubric machinery**
  (`quizGradeLines` / `quizAutoPicks` / `quizLineNotes` in `src/shared/quiz.ts`,
  rendered by `GradeRow`'s `lineNotes` + `seedPicks`). Each section's choice
  questions collapse into ONE line the key fills in; every written question is
  a line to mark with the student's words under it. One total, one Confirm, one
  snapshot — do NOT add a second sum for tests, it could only disagree with
  this one. Those functions are shaped structurally (`id`/`label`/`max`) rather
  than importing `RubricCriterion`, so `quiz.ts` stays free of the director
  layer. Three promises pinned by `quiz.selfcheck.ts`:
  a section holding ANY unkeyed question **seeds nothing** (an unset answer is
  not a wrong answer, and a line seeded two-thirds low gets confirmed by
  someone not stopping to check); a choose-N section raises lines only for the
  questions THAT student answered (a question they were told they could skip
  must not inflate their denominator); and a filed grade is never rewritten
  underneath a director — fixing the key afterwards makes the row SAY the
  scored part moved (`autoStale`), and re-scoring is the director's press.

Session record: `docs/session-notes-2026-09-22-online-test-key-and-grading.md`.

## Rehearsal absence reports (Sept 2026)

`/absence` (org-gated: `features.absenceReport`, true for NWSA, false for
ASYO — a K-12 school-day bureaucracy model that assumes an office and a
normal school day, which doesn't fit an evening/weekend youth orchestra)
replaced what was first scoped as an external Google Form. It widens the
existing `plannedAbsences` collection (#27) rather than adding a new one —
that collection already had two unauthenticated writers (the
`PlannedAbsenceButton` modal on `/student/:id`, and
`scripts/apply-absence-email.mjs`'s Mail.app parser), and every new field is
OPTIONAL in `firestore.rules` so both keep working, forever, sending only
the original 6 keys. `acknowledged` (the policy checkbox) can never become
an unconditional `== true` requirement for the same reason.

- Three categories (`AbsenceCategory` in `src/director/types.ts`): Leaving
  Early (Office Note) requires a photo; Full-Day Absence and Parent Sign-Out
  reuse the existing `reason` field rather than adding a second one. The
  category list is hand-duplicated in `firestore.rules`'s `category in [...]`
  check — `scripts/absence-report.selfcheck.mjs` pins the TypeScript side and
  names the risk, but can't close the loop on the rules file automatically.
- **Ensemble scoping**: a report naming specific `ensembleIds` shows on
  Take Roll's "reported ahead" chip only for THOSE rolls
  (`plannedAbsenceAppliesToRoll()` in `src/director/plannedAbsenceScope.ts` —
  zero imports, like `groupKind.ts`, so the self-check can import it under
  Node without pulling in the org config). Absent/empty `ensembleIds` is the
  original button's meaning ("out for every rehearsal today"), and both
  older writers never set the field, so they keep matching every roll.
- **The excuse-slip photo needs no Cloud Function.** The client generates the
  `plannedAbsences` doc's id locally, writes the Firestore doc FIRST, then
  uploads straight to `absenceExcusePhotos/{that doc's id}/excuse.jpg` —
  `storage.rules` anchors the upload on that doc already existing (same
  existence-anchor + size + content-type shape as `/submissions`), so no
  function is needed, and doc-first ordering means a failed upload never
  loses the report itself, only the photo (the director can chase that up
  directly). Read is staff/assistant-only, never public — an office excuse
  slip is at least as sensitive as the free-text `reason` field
  `plannedAbsences` already keeps staff-eyes-only.
- **No director-facing email, at any cadence — not even a digest.** This
  repo has no scheduled Cloud Function anywhere, and its only cron-like
  mechanism (GitHub Actions `schedule:`) is self-documented as unreliable
  (see `sync-drive-photos.yml`'s header). More fundamentally, nothing in this
  app emails staff synchronously off a public form submission — not
  `parentMessages`, not `signupResponses`, not a lesson pull-out (the
  structurally identical "known-ahead partial absence" case). Director
  awareness here is the same as everywhere else: live in-app reads (the
  Requests screen and its badge — #requests below — Take Roll's chip, Who's
  Out), never email. A receipt-on-submit email for the student exists
  (`functions/src/plannedAbsenceConfirmation.ts`) but is **not deployed**
  (`NOT_DEPLOYED` in `deployList.selfcheck.ts`, the director's call). The
  student's email that DOES go out is the director's ANSWER (#requests).
- `scripts/absence-report.selfcheck.mjs` runs in the deploy workflow (see
  `.github/actions/self-checks/action.yml`).

## Music copy requests (Sept 2026, #copy-requests)

Public Resources → **Request Music Copies** (`/copies`, `PublicCopyRequest.tsx`;
every piece page links to it with `?piece=<id>`). A student picks their name,
the ensemble, and the piece off the posted repertoire, or types the title when
the director has not posted it. The PART is typed and required; a part with no
number ("Violin") gets a non-blocking "which one?" warning (`partLooksVague`).
Directors work the list on the **Requests** screen (#requests below).

- `src/shared/copyRequest.ts` is the ONE definition: reasons, field ceilings,
  and `copyRequestIsMine()`. A request is MINE when it is for a group I am
  assigned to (`resolveAssignedEnsembleIds`), when its group has nobody
  assigned (synced `staff` empty and no `conductorName`), or when I have no
  groups at all. A request nobody owns is a copy nobody makes. The badge and
  the screen both go through `requestMineFilter()` so they cannot disagree.
- `copyRequests` is the app's seventh unauthenticated create: exact key set
  (also the honeypot), a real `students/{id}` AND `ensembles/{id}` anchor, a
  closed reason enum, ceilings everywhere, no public update, staff-only read
  (a request names a student). `copyRequest.selfcheck.ts` pins the reason list
  and ceilings against the rules clause; change both together.
- In-app only, no email to staff, same stance as `plannedAbsences`.

## Requests — one inbox for what students ask (Oct 2026, #requests)

The director reported getting NO absence requests: `plannedAbsences` had no
badge and no list (only Who's Out, one day at a time), and no screen called
`setStatus`, so every report ever filed sat "pending" with nobody able to
answer it. **Requests** (`src/director/requests/RequestsView.tsx`, top of the
director menu beside Take Roll, old `/director/copyRequests` URL aliased) is
now the ONE place a student request is answered: absences and copies today,
and a future kind is one more `Kind` on that screen, not a new screen.

- **One count.** The nav badge, the Today line ("N student requests waiting")
  and the screen's "Waiting" list all go through `requestMineFilter()`
  (`hooks/useCopyRequests.ts`) and `absenceAwaiting()`
  (`src/director/absenceDecision.ts`). `DirectorApp` computes the number once
  and hands it to `TodayView`; badges render through ONE `navBadge(id)` in
  both rail and drawer. An absence naming no group (older writers) is
  everyone's. A pending absence for a day already past is NOT waiting — it
  sits under "Answered & past", where it can still be approved.
- **YES does the thing.** Approving an absence writes the excused roll marks
  and the answer in ONE batch (`usePlannedAbsences.approve`), planned by
  `absenceExcuseMarks()`: one mark per roll-taking block that day, per group
  the student named (or every group they are in, for an older report),
  limited to the time window; arriving late → `LateExcused`, everything else
  → `Excused` (there is no "left early" mark; the reason line says what it
  was). **Never a downgrade**: Absent/Late become excused, an excused mark or
  a Lesson is left alone. Marks carry `source: 'request'` + `reason`, shown
  on Take Roll. Blocks not yet on the calendar get nothing — the roll chip
  still shows the request. `absenceDecision.selfcheck.ts` pins all of it.
- **NO needs a note.** `status: 'declined'` + `decisionNote`; nothing on the
  roll changes, and Take Roll's chip reads "Asked ahead, declined". Copy
  requests gained "Can't do" the same way.
- **The student is emailed the answer** — `absenceDecisionMail` (approve or
  decline) and `copyDeclineMail` (decline only; "copied" is not mailed), both
  in `functions/src/requestDecision.ts`, both on the `--only` list. They fire
  only on a status CHANGE that carries `decidedAt`, which only the Requests
  screen writes — a staff-filed "arriving late" heads-up (`addReport`) is
  marked approved without it and is never mailed, and never reaches the
  inbox. The copy form gained an OPTIONAL `email` (rules key + ceiling,
  pinned by `copyRequest.selfcheck.ts`); without one a decline reaches nobody
  and the decline box says so. `requestDecision.selfcheck.ts` pins the mail.
- Nothing became more readable: both collections keep their read rules, and
  the staff `update` they already had covers every new field.

## Phone alerts for same-day changes (Nov 2026, #push)

Hub 2.0 Phase 2. A director changes or cancels something happening TODAY and
the phones following that group buzz with the change note. Director's call:
the director trials it on their own phone first; families come later, only
after App Check enforcement is on and a two-week trial shows iPhone
subscriptions hold. The family side is BUILT and switched OFF.

- **`src/shared/pushAlerts.ts` is the ONE definition** of a subscription's
  fields (`STAFF_SUB_KEYS` / `FAMILY_SUB_KEYS`), which change is worth a push
  (`pushWorthy`: event dated today in `ORG.timezone`, a non-blank
  `changeNote`, and the note or the status moved — so Change a Day moves,
  swaps, combines, cancels and closures ("Close a day"), and the quick
  Cancel / Back on all count; "Back to normal" clearing the note does not), who it
  reaches (`subscriptionReaches`: a school-wide event reaches everyone, a
  staff `scope: 'all'` device hears everything, otherwise the ensemble lists
  must meet), and what it says (`buildPushPayload`). Zero imports, so the
  function bundle and the Node self-check load it bare.
- **A payload is the event's title or its ensembles' names, plus the
  director's change note.** All already world-readable. The builder reads no
  other field, so a student id, performer, audience list or roster move can
  never ride along. App words ("Today:", type names) go in the device's
  `lang`; the note is the director's own text.
- **Only the Cloud Functions send.** `pushOnEventChange` (an `events` onUpdate
  trigger) and `pushTestAlert` (staff-only HTTPS, ID token checked against
  the allowlist, and only to the caller's OWN device). There is no
  client-writable send queue, for the reason `mail` has none. Each change
  claims `pushSent/<eventId>_<fingerprint>` with `create()` BEFORE sending, so
  an at-least-once retry never buzzes a phone twice; `pushSent` is denied to
  every client (a client marker could suppress a real alert). Tokens FCM
  reports dead are deleted. Logic in `functions/src/pushSend.ts`.
- **Subscriptions** live at `pushSubscriptions/<sha256(token)>`, and the rules
  recompute that hash from the token being written (`hashing.sha256`), so a
  doc can only sit at its own token's address. NO client read, ever: a list
  of tokens is a list of every family's phone. Delete is open by doc id, which
  is how a device unsubscribes (the id is unguessable and unlistable).
  Staff create/update their OWN device (`staffEmail` == the signed-in email,
  `isKnownRole()`).
- **The family gate is `pushSettings/global.familiesOpen`** — world-readable
  so Home knows whether to render "Get alerts on this phone", Owner/Director
  to write, absent = closed. While it is false the rules refuse every family
  create; the button's own check is courtesy. **The sender checks it too**
  (Nov 2026): `deviceMaySend()` in `pushAlerts.ts`, read once per change in
  `handleEventChange`, so closing the switch stops every family phone that
  already signed up, not only new sign-ups; their records are kept and
  reopening resumes them. A failed read counts as CLOSED (`.catch(() =>
  false)`): families fail closed and staff still get the alert, because
  `pushOnEventChange` is a v1 trigger with no retry policy and a throw would
  lose it for everyone. While closed, a phone that already signed up still
  sees the Home card with "Turn off" only (`FamilyAlertsButton`), so a family
  can always remove its own record. A family device is one with no
  `staffEmail`. A family create is the app's
  EIGHTH unauthenticated write: exact key set (the honeypot), `scope` pinned
  to `'groups'`, bounded arrays, a `students/{id}` anchor, no update (a
  changed list is a delete + create). **Why families wait for App Check:**
  this write needs no account and costs us a send per change, so without
  App Check nothing stops a script from filling the collection. The director
  flips the switch from Menu → Phone alerts, behind a confirm that says so.
  `docs/privacy-notice.md` (and `.es.md`) describe the family side as built
  (updated Nov 2026, before it opens: the token, language, ensembles and
  saved student ids a family phone stores, and that closing stops them).
  Change what a family subscription stores and both notices change with it.
- **The service worker stays generated and deterministic.** The push and
  notificationclick handlers are `public/push-handler.js`, pulled in by the
  workbox `importScripts` option beside `sw-cleanup.js` and kept out of the
  precache. Messages are DATA-only and that handler always draws the
  notification (iOS revokes a subscription that receives silent pushes). No
  `skipWaiting`, no `clients.claim`. A tap opens only a URL inside the SW's
  own scope.
- **The messaging SDK is lazy.** `src/shared/pushClient.ts` imports
  `firebase/messaging` dynamically and is itself only ever imported
  dynamically (the staff panel, the family button), so nobody downloads it
  before tapping. `getToken` gets the app's EXISTING registration
  (`navigator.serviceWorker.ready`) and no VAPID key: the SDK's built-in
  default key works with FCM with no console step
  (`VITE_FIREBASE_VAPID_KEY` overrides it if the project ever makes its own).
- **CSP**: `firebaseinstallations.googleapis.com`,
  `fcmregistrations.googleapis.com` and `fcm.googleapis.com` are in
  `connect-src` and pinned by `scripts/csp.selfcheck.mjs` (#csp: an
  omission fails silently, as "Turn on alerts" spinning).
- **iPhone only delivers to a Hub added to the Home Screen** (iOS 16.4+,
  opened from the icon). `pushSupport()` says so instead of offering a
  button that cannot work, and "Add to Home Screen" is now step one of the
  Start Guide (`/start`) and of every poster in the QR kit.
- Self-checks: `src/shared/pushAlerts.selfcheck.ts` (in
  `.github/actions/self-checks` and the functions `selfcheck` script) pins the
  rules side — send path closed, key allowlists equal, no reads, family clause
  gated on `familiesOpen == true` — plus reach and no-student-data;
  `functions/src/pushSend.selfcheck.ts` pins per-language sends, send-once,
  and dead-token cleanup.

## Spanish change notes and the banner drafter (Nov 2026, #banner-drafter)

Hub 2.0 Phase 3 item 14, built and switched OFF ("always behind a confirm;
never a writer"). A Spanish-reading family used to see Spanish chrome around
an English change note. `CalendarEvent.changeNoteEs` is the director's
CONFIRMED Spanish version of `changeNote`, and nothing else.
`src/shared/changeNoteEs.ts` is the ONE place it is read and guarded;
`src/director/schedule/changeNoteEs.selfcheck.ts` (self-checks) and
`functions/src/bannerDrafter.selfcheck.ts` (functions selfcheck) pin it.

- **One reader.** Every public surface shows the note through
  `changeNoteFor(event, formatLang())`: Spanish only for a Spanish reader when
  a confirmed Spanish note exists, otherwise the English exactly as before.
  `.ics` feeds and push alerts stay English on purpose (a later option). The
  self-check fails on any `{x.changeNote}` rendered raw under `src/public`.
- **A stale Spanish note is the worst outcome**, so a write that changes or
  clears the English note without confirming new Spanish clears it:
  `reconcileChangeNoteEs()` runs inside `useEvents.updateEvent` (mapping the
  clear to `deleteField()`) and the Hub Calendar tool's `stage()`; `revertPlan`
  clears it on "Back to normal"; editing the English in the Event form empties
  the Spanish box. A write that touches neither field, or an event with no
  Spanish note, gains no new key, so flag-off writes are unchanged. Any NEW
  path that writes `changeNote` must go through one of those.
- **The flag** is `features.bannerDrafter` in `config/orgs/*.json`, false in
  every org (pinned). Off: no box renders, the Event form strips
  `changeNoteEs`, the review sheet passes none. On: a Spanish box and "Draft
  Spanish" under the note in the Event form and on Change a Day's review sheet
  (`ChangeNoteEsField`); only Save / Confirm writes the field.
- **The drafter function** `draftChangeNoteEs` (`functions/src/bannerDrafter.ts`)
  reads only `req.body.note` (bounded), from a verified allowlisted staff
  account, and sends only that text to Anthropic. It writes nothing. It is in
  `NOT_DEPLOYED`. Its key is `runWith({ secrets: ['ANTHROPIC_API_KEY'] })`,
  **never `defineSecret()`**: firebase-tools resolves defineSecret params for
  the WHOLE codebase before `--only` filters, so a missing secret would fail
  every other function's deploy too (pinned).
- Events have no key allowlist in `firestore.rules`, so no rules change: the
  field is the same public sentence in another language on a world-readable
  doc. Turning it on: `docs/banner-drafter.md`. No What's New entry until then.

## One nav, every width (Sept 2026, #one-nav)

**A change to what a person SEES is not shipped until it is visible at every
width.** Not the width you happened to check — every one.

This app has no responsive JavaScript: nothing branches on viewport size, so
"phone" and "desktop" are the same React tree with different CSS. Except in the
two shells, which write their nav out TWICE by hand — `PublicLayout.tsx` as the
phone drawer (`.pub-menu-panel`) and the desktop rail (`.pub-sidebar`, hidden
below 1024px by `pubShell.css`), and `DirectorApp.tsx` as `.dir-menu-panel` and
`.dir-rail`. Two hand-written trees over the same arrays is the whole trap, and
it has now bitten twice:

- `t('nav.college')` existed in the public rail ALONE, so the word "College"
  was invisible on every phone in the school. It shipped, and nobody noticed
  for weeks, because everybody who looked was on a laptop.
- `InstallAppButton` and `AppVersionRow` were in the director DRAWER alone —
  and `dirShell.css` hides the hamburger that opens it at ≥1024px. A director
  on a laptop could not install the app and could not see which build they were
  running, which is the one question those rows exist to answer.

Both fixed here; the rules that keep them fixed:

- **A destination goes in ONE list, mapped by both surfaces.** `NAV_TOP` and
  `RESOURCES` have never drifted. Everything typed out twice has. When a row
  legitimately needs a different skin per surface, that is a prop on ONE
  component (`<AppVersionRow rail />`), never a second copy.
- **The director's Ensembles / Classes / College accordions are ONE component**
  — `src/director/DirNavGroup.tsx`, rendered by the rail and the drawer over
  the single `groupAccordions` spec in `DirectorApp.tsx`. Written twice, they
  had already drifted: the drawer's "All Classes" wore College's GraduationCap
  while the rail's wore BookOpen, and only the rail lit its Ensembles heading
  on the All-Ensembles tab. What differs per surface is class names and icon
  sizes, and that lives in the `RAIL` / `DRAWER` skins — **never a class name
  written into the markup**, which would hand one surface the other's styling
  with nobody able to see it. Library is always expanded on BOTH surfaces
  (Oct 2026): the rail used to fold it shut while the phone kept it open, and
  a director moving between iPad and phone had to relearn where every
  Library screen lived. Same list, same order, same open/closed state — the
  only difference by width is whether the menu is always showing.
- **`scripts/one-nav.selfcheck.mjs` pins both shells** in the deploy workflow.
  Public: every `t('…')` key in one tree must be in the other, with **no
  exemption list on purpose** — the sets are exactly equal today, and an
  exemption list is how a check like this rots into a formality. Director:
  `DirectorApp.tsx` may not write a group-row class (`dir-rail-dot`,
  `dir-menu-dot`, `dir-menu-subitem`), and `DirNavGroup.tsx` must keep exactly
  three `<button>`s and name no surface class outside its skins. That last one
  exists because it was found by deliberately breaking it: a hardcoded
  `dir-menu-dot` on the ensemble row passes every other check, looks right in
  the drawer, and silently gives the rail the wrong dot. A genuine one-sided
  row means writing the reason in that file's header, not adding a name to an
  array.
- **Nothing here renders a component in CI** — no vitest, jest, jsdom or
  playwright, and adding one for this is not worth it. So the check covers the
  public nav's labels and NOTHING else. Everything past that is a person
  looking at 375×812 and again at ≥1024px. `preview_start` ignores worktrees,
  so look at the landed or deployed tree, not a local preview.
- **Still written twice, currently in agreement, so watch it**: the event
  page's address + Get Directions block (`PublicEvent.tsx` ~164-181 in the
  desktop-only side panel, ~275-314 in the main flow). Change one, change the
  other in the same commit.

## Overlays, and the editor that is a page (Sept 2026, #backdrop-drag / #assignment-page)

**`src/shared/backdropClose.ts` is the ONE spelling of click-outside-to-close.**
Never write `onClick={e => e.target === e.currentTarget && onClose()}` on a
backdrop again — that shipped in 49 places and threw work away. A `click` fires
on the nearest COMMON ancestor of press and release, so a drag-select that
starts in a textarea and releases past the panel edge arrives as a click ON the
backdrop and the test passes. The helper closes only when both ends of the
gesture were the backdrop. Its remembered target is MODULE state, not a closure
(handlers are rebuilt between `pointerdown` and `click` whenever a controlled
input re-renders), and it listens on `pointerdown` so mouse, touch and pen are
one path. `backdropClose.selfcheck.ts` rebuilds the handlers mid-gesture to pin
exactly that, and runs in the deploy workflow.

**The assignment editor is a PAGE, not a drawer**, with no focus trap and no
Escape — an assignment is written while looking things up in the Hub, so the
shell's nav has to stay reachable. Its draft lives in `localStorage`
(`assignments/assignmentDraft.ts`), keyed per assignment, cleared only once a
save is QUEUED; Cancel keeps it and only "Start over" discards. Deliberately
not Firestore: `assignments` is world-readable, so a half-written exam there is
a published exam. `attachments`, `publishAt` and `rubric` stay OUT of the draft
— the last two carry a meaningful "not set" that JSON cannot tell from absent
(the CLEAR-sentinel trap), and guessing wrong changes when an exam posts or how
it is scored.

**Overlays opened from inside a drawer portal to `<body>`** (Oct 2026,
#link-picker). `LinkPicker`'s fixed overlay, rendered inside the announcement
form, resolved against the drawer and the phone header hid its search row.
It now uses `createPortal(..., document.body)`; do the same for any new
full-screen overlay. Record: `docs/session-notes-2026-10-18-link-picker-search.md`.

## Picking groups (Sept 2026, #group-picker)

`GroupPicker` + `src/director/groupBuckets.ts` are how every screen that picks
ensembles/classes does it: Events (×2), Students, Repertoire, Documents,
Personnel, Directors (×2). Not Sign-ups (uses `FilterMenu`), and not the
STUDENT pickers in My Lessons / Directors.

- **`groupBuckets()` buckets exactly what it is handed and FILTERS NOTHING.**
  Load-bearing: the Event form deliberately offers Dance, Theater and Visual
  Arts because the calendar covers every division, while the roster and
  repertoire forms hand over `musicEnsembles(...)`. A picker that decided for
  itself would drop three divisions off the Event form in silence — nothing
  throws, the group is just un-pickable. Anything matching no named section
  comes out in a trailing bucket. Deciding WHICH groups a screen offers stays
  with the screen. `groupBuckets.selfcheck.ts` pins losslessness.
- **`FilterMenu` is not a substitute** — there empty means ALL, which in an
  editor field reads as "every group" when the director meant school-wide.
- **`EventForm` has no `toggleEnsemble`, and must not get one back.** Picking
  the FIRST group pre-fills a blank location and start/end time from that
  group's defaults; `setEnsembleIds` keeps that by reading the newly-ticked id
  as the one in the new list that was not in the old.
- **`assignedEnsembleIds` is ONE field edited by TWO pickers** on the Directors
  screen, each blind to the other's kind of group. The merge is
  `directors/assignedSlices.ts` — used by both pickers AND the assistant
  `FilterMenu` branch — with a third slice for ids belonging to neither (a
  group renamed or deleted) that is CARRIED, never cleaned up. That field is
  the one answer to "whose group is this" (#my-calendar), so a lost id is not a
  display bug. `assignedSlices.selfcheck.ts` pins it.

## Posting an assignment without a browser (Sept 2026)

`scripts/post-assignment.mjs` + the *Post Assignment* workflow write one
assignment from `config/assignments/*.json`. The text is a FILE, not a workflow
input: eighteen instrument parts do not fit in the Actions tab, and a file is a
reviewable diff rather than somebody's shell history (as
`config/entry-only-concerts.json` already is). Fine to route this way because
an assignment is world-readable coursework — a roster write still is not
(#student-data). The doc id is stable so a re-run updates rather than
duplicating, and it carries forward every field the APP owns:
`googleDriveFolderId` above all, since that folder is created by the Connect
Google Drive button (a Google popup no agent can drive) and a blind overwrite
would silently unhook it from a live exam. It refuses an ensemble or piece id
that does not exist — otherwise the exam posts, reaches nobody, and links to no
music, with no error anywhere.

Session record: `docs/session-notes-2026-09-17-assignment-editor-and-group-picker.md`.

## Calendar and announcements without a browser (Oct 2026, #hub-tools)

*Hub Calendar* and *Hub Announcement* (`scripts/hub-calendar.mjs`,
`scripts/hub-announcement.mjs`, plumbing in `scripts/lib/hubTool.mjs`) change
events and announcements from the Actions tab, one JSON request per run.
Usage: `docs/hub-tools.md`. Rules that keep them safe:

- **Preview by default.** Nothing is written without `--apply` (the
  workflow's "apply" box) AND the service account. A preview without the
  service account reads the world-readable collections over public REST, so
  it runs anywhere until App Check enforcement, which refuses anonymous
  reads; the workflow always passes the secret, so previews from the Actions
  tab keep working.
- **The app's own logic, imported, never copied.** A move or cancel goes
  through `captureOriginal` / `planDayChange` / `bannersForEvents`, so the
  snapshot, the one-banner-per-event rule and "Back to normal" behave exactly
  as on the Schedule screen. `loadAppModules()` stubs the CLIENT Firebase SDK
  to `db = null`; nothing here may write through it.
- **Every op but add/post names its target twice** — id plus an `expect`
  (date for events, title for posts) — and refuses on a mismatch.
- **The urgent alert follows `urgentRelay.ts`**: queued now for a post made
  now, left to the Hub's sweep for a scheduled one, never re-sent by an edit,
  `notifyQueue/ann-<id>` created and never overwritten. `"alert": false`
  stamps `relayQueuedAt` so the sweep skips it too. Change the relay's entry
  shape and this tool together.
- **No student data, ever** (#student-data): the input box and the log are
  public. Neither tool writes pull-outs, performers, audience lists, lessons
  or anything on `students`; a day cancel that must take private lessons
  stays in the app. `delete` refuses an event with roll or a roster move on it.

## Colors & background (Sept 2026, #look)

Students pick a top-bar color, a menu color and a page background from the
Appearance (sun/moon) menu → "Colors & background…". Per device, in
`localStorage` (`pub.look`), like the Light/Dark choice — there are no student
accounts to hang it on. `src/public/look.ts` applies it; `look.css` is
everything it changes.

- **A curated palette, never a color picker.** The colors are org config
  (`personalize` in `config/orgs/*.json`); absent = the feature is off. What's
  stored is palette IDS, so a retired color reads as Default.
- **Readability is pinned, not hoped for** (`look.selfcheck.ts`, in the
  self-checks). Header colors must carry the header's white text. Menu text
  takes whichever of white/ink reads (`inkOn`), and every shade `look.css`
  derives from it must pass AA. A page tint may never read worse than the
  stock background, in either theme. Cards keep their own surface.
- **No personal photos** (director's call, Oct 2026). The feature was rolled
  back in late Sept and restored without "Use your own photo"; backgrounds
  are the palette tints plus the drawn `PATTERNS` (staff, dots, piano keys,
  eighth notes, sound waves, vinyl, equalizer) and nothing else. `initLook`
  deletes any leftover `pub.look.photo` from a device. Do not re-add an
  upload of any kind.
- **The menu color covers the rail AND the phone drawer** (#one-nav).
- **Seasonal looks (#seasons, Oct 2026)** — a matched top bar, menu, page tint
  and music-themed drawing for a stretch of the year (Autumn Leaves, Danse
  Macabre, Harvest Overture, Nutcracker, Auld Lang Syne, Love Song, Music In
  Our Schools Month, Rite of Spring, Jazz Appreciation Month, Finale, Steel
  Pan Summer). Director's calls, 2026-10-01: **seasons and secular
  celebrations only, never a religious holiday**; **ON for everyone by
  default**; one tap off (the sun/moon menu on the public site, the emoji
  button in every staff header); **when it ends or is turned off, the
  person's own setup comes back**; the staff side gets it too.
  - `personalize.seasons` in the org config holds the colors and dates; the
    LIST ORDER is the priority (first window holding today wins — short ones
    sit above long ones). Dates are `MM-DD`, `easter` or `thanksgiving`.
  - `src/shared/seasons.ts` decides; `src/shared/seasons.css` draws (and
    holds the staff-side rules, scoped to `.dir-app`). A season PAINTS ON TOP
    and never writes over a saved look — that is what makes "back the way it
    was" free. The only thing stored is the season INSTANCE someone turned
    off (`pub.season.off` / `dir.season.off` = `<id>:<start>`), so next year's
    comes back on. `?season=<id>` previews one out of its dates.
  - `seasons.selfcheck.ts` pins Easter/Thanksgiving, the calendar (every
    season must win days every year, so the order can't bury one), and
    readability on both sides in both themes — including every drawn mark,
    which dark mode lays twice. A new drawing keeps one color and one
    opacity per `<g>` so the check can read it.
  - The staff header keeps WHITE text in every season (no neon there), and
    the Director Panel banner is never recolored.
- **The staff shells get the same sheet** (#look-staff, Nov 2026, director's
  ask): the palette button beside the season button in all four staff
  headers (`LookButton` in `SeasonButton.tsx`). **Stored APART**, under
  `dir.look`, the way the season switch is already apart per side: a
  director checking the student site must see what students see, and a
  student's pick on a shared laptop must not restyle the director panel.
  `look.ts` is the ONE store for both sides; the staff side paints
  `data-dir-look-*` + `--dir-look-*`, which the staff rules in `seasons.css`
  read for a person's own colors AND the season (the season paints through
  the same values). A staff header keeps white text, neon swatch or not. The
  public tint rule stays scoped to `:has(.pub-app)`; the staff one to
  `.dir-app`. `look.selfcheck.ts` §4c pins staff readability. Known and not
  this feature's: the stock staff muted grey is 4.34:1 on its own page.

## Hub 2.0 look, behind the owner's preview (Nov 2026, #hub2-look)

The new look ("Studio Bright" everywhere, Concert Hall's serif on concert,
event and program titles, Spotlight on concert night) is built behind a
preview only the OWNER can turn on, on their own device. Nobody else sees
any change. Later sessions apply it page by page.

- **The switch** is `src/shared/hub2Preview.ts`, the ONE reader/writer of
  localStorage `hub2.preview`. index.html's boot script (the one that sets
  `data-pub-theme`) sets `data-hub2="on"` on `<html>` before first paint.
  The toggle (`Hub2PreviewToggle`) renders under `isOwner` in the rail AND
  the drawer. It covers the public pages on that device too (same origin).
  **No URL parameter, ever**: a preview must not be shareable.
- **For everyone is one word in the org config** (`hub2.forEveryone`, built
  Nov 2026, false until the director's date, Sun Dec 13, 2026, after the
  last concert). org-statics in `vite.config.ts` writes it into the boot
  script as a literal `true`/`false` (so it is on before first paint, and
  the CSP hashes the final script), `hub2PreviewOn()` answers true so tokens
  and fonts follow, and the owner's toggle hides itself. `hub2.selfcheck.ts`
  §1b pins every link. With it on, the look's fonts join the precache by
  themselves (`globIgnores`), so phones keep them offline at a venue. The
  flip commit also adds a What's New entry (audience `both`), per the What's
  New rule. Flip it on a non-concert day the director can check, and confirm
  the deployed `index.html` says `var hub2Everyone = true;`.
  `scripts/csp.selfcheck.mjs` recomputes every inline script's hash from the
  built page, so a boot-script edit the CSP did not see fails the build.
- **Colors are org config** (`hub2` in `config/orgs/*.json`), injected as
  `--hub2-*` custom properties by `hub2Tokens.ts`. `src/shared/hub2.css` maps
  the existing `--pub-*` / `--dir-*` tokens onto them and holds no color of
  its own. An org without `hub2` (ASYO) has the attribute taken back off, so
  its preview is the stock look.
- **Every rule is scoped under `[data-hub2="on"]`, and specificity is the
  contract** (the shells' CSS loads in different chunks, so file order is
  not). The selectors sit ABOVE the stock dark themes and BELOW a student's
  tint (#look) and a season (#seasons), which keep painting on top. The
  ladder is written out in hub2.css's header. Flag off must stay
  pixel-identical to main: check Home, My Schedule, an event, Calendar and
  director Today at 390px and 1024px, light and dark.
- **Fonts are self-hosted and never precached.** `hub2Fonts.ts` imports the
  @fontsource latin files and is loaded ONLY by dynamic import while the
  preview is on. `globIgnores` keeps `assets/*.woff2` out of the precache and
  one same-origin `runtimeCaching` rule caches them on first use, so a
  visitor without the preview downloads no font file. No Google Fonts (the
  CSP allows none, and the app works offline).
- `hub2.selfcheck.ts` pins the switch, the scoping and the fonts; the
  palette's AA readability (both themes, under every tint and season) rides
  in `look.selfcheck.ts` and `seasons.selfcheck.ts`.
- **Themed so far: the public site** (`src/public/hub2Public.css`, Nov
  2026). Studio Bright everywhere (Plus Jakarta, big tabular times, 12px
  rows, plum selected states, sun "owed" chips); Concert Hall's Newsreader
  titles and gold hairlines on pages carrying `.pub-hall` (event, program,
  Concerts); Spotlight on the check-in pages (`.pub-checkin`,
  `.pub-checkins`) and the public Tonight banner, by re-pointing the
  `--pub-*` tokens inside the stage. Those page
  classes have NO stock CSS (the self-check fails if one gains any), which is
  what lets a component carry them with the preview off.
- **Motion: ONE liquid dissolve between pages, on one clock** (#hub2-motion).
  The look used to carry a per-panel page morph, an arrive stagger, a drill
  slide, a scroll reveal, a pop, a press ripple, a rolling count, a
  self-drawing check and a note burst, each on its own clock. After five rounds
  of tuning ("They don't move at the same rate") all of it was deleted
  (2026-11-10, `docs/design/liquid-dissolve-plan.md`), and the director picked
  the replacement from `docs/design/liquid-dissolve-sample.html` on 2026-11-11:
  "Liquid, slow, smooth". `src/shared/hub2Dissolve.ts` is the ONE mover:
  - **Two copies, an ordinary filter, no backdrop-filter.** The page being
    left is cloned into a `.hub2-ghost` placed BESIDE the live scroller (same
    parent, so every shell rule still styles it; z 39, under the header at
    50/100 and the tab bar at 60, so the bars stay sharp), and that copy melts
    with `filter: blur() saturate() brightness() contrast()`, the contrast
    pivoted on the page colour (`--hub2-bg`). The live page meanwhile hides
    with `visibility` alone while the new page renders into it. At the peak it
    HOLDS (bounded) if the new page still shows `.pub-skeleton-card` /
    `.dir-loading`; then the new page is cloned at the same melt under the
    old copy, the old copy fades while both are formless, the new copy
    clears, and over the last fifth the live page (real glass) is revealed
    under it as the copy fades. A second change mid-way retargets.
  - **Why not a lens.** The first build (PR #237) laid one fixed sheet over the
    page and animated its `backdrop-filter`. Chrome painted it; the director's
    iPhone computed it (32px at the peak) and never painted it, so every change
    was a quick fade. Do not go back to animating a backdrop-filter. Copies are
    `overflow: hidden`, not scrollers: an iPhone draws a scroller as its own
    native layer. Playwright's WebKit screenshots paint NO compositor effect
    (no backdrop-filter, no animated filter), so they cannot verify this;
    Chrome screenshots can, and WebKit can still verify the logic.
  - **Never an ancestor of live glass.** opacity, filter, mask, clip-path or
    mix-blend-mode on an ancestor flattens every card in it, silently. Filter
    and opacity go on the copies only (their glass is switched off: under a
    filter it would be flat anyway); the live page only ever changes
    `visibility`. And never
    the View Transitions API: Safari and Firefox switch `backdrop-filter` off
    for its whole duration (WebKit 302256).
  - **One clock, in the org config**: `hub2.glass.dissolveMs` (1600),
    `dissolveBlur` (32px), `dissolveHoldMs` (1200), emitted as
    `--hub2-dissolve-*`. The curve is the one `LAW` in the module.
    `dissolveMs: 0` turns it off.
  - **Wired in three ways only.** `router.subscribe` in `main.tsx`, registered
    BEFORE the app renders so it runs while the old page is still on screen
    (links, `navigate()`, Back and Forward alike; `changesPage()` keeps a filter
    tap or hash link still). `useDissolvedState()`, a `useState` whose setter
    dissolves, for a page swapped IN PLACE (director, 2026-11-11: "Yes, melt
    those too"): the three staff shells' tabs, Check-In's concert page,
    Schedule's day page (phone widths only), the assignment editor and grade
    sheet, and a form and its editor. A new list-to-page swap uses it too.
    And drawers (`OVERLAY` in the module: the editing drawers, sheets and
    pop-up forms, never a menu or search) melt BY THEMSELVES: a
    MutationObserver sees one arrive or leave after React's commit and before
    paint, so no drawer needs wiring. The page under a drawer stays put; the
    drawer forms out of the peak melt, and a closing one is put back where it
    was as its own copy and melts away. A drawer's copy sits over the REAL
    page, so its pane is the solid `--hub2-surface` (hub2Glass.css), or the
    page shows through it sharp with the form's words on top.
  - **Nothing at all** with the look off, reduced motion, reduced
    transparency, or a browser that cannot animate a backdrop filter: the page
    simply changes.
  - `hub2.selfcheck.ts` §7 pins all of it: no animation or transition in the
    look's sheets beyond the three ambient loops in `hub2Glass.css` and `none`,
    no script that animates except `hub2Dissolve.ts`, no literal duration in it,
    no backdrop-filter animated, only copies animated and the live page only
    revealed, copies beside the page, not scrollers and under the bars, the
    gate, and the wiring. A new motion goes on that list on purpose or not
    at all. Verify motion by pausing and seeking (headless Chrome reports
    reduced motion by default; override it and assert the override).
- **The public hub2 rules are `@media screen` only** (all of
  `hub2Public.css`, and the `--pub-*` block of `hub2.css`). Paper (program,
  season fridge copy, Start Guide, QR kit) prints identically with the
  preview on. Keep every new public rule inside that block; the self-check
  enforces it.
- **Teal text reads as text on the page, not only on a card.** Under the
  preview the accent must clear 4.5:1 on the page background, on every
  student tint and on every season's page (`look.selfcheck.ts`,
  `seasons.selfcheck.ts`). The light accent is #0E7585 for that reason
  (4.97:1 on the page, 5.4:1 under white), and it is the staff teal too.
  **The stock public site uses the same teal since Nov 2026** (#contrast,
  director's call): `--pub-accent` in `public.css` was #0d7e8e, 4.46:1 on the
  page. `look.selfcheck.ts` §4b pins the stock accent (with each org's
  `brand` overrides) as text on the page and a card, under white, and on
  every tint. The stock STAFF teal (`--dir-primary`, 4.36:1 on the staff
  page) is still #0d7e8e; the new look replaces it.
- **White on a teal fill takes `--pub-accent-fill` in dark, on the stock site
  and under the preview.** The dark accent is a light teal for TEXT and white
  on it is 2.8:1 ("Add to my calendar", the check-in strip, every Send). The
  stock dark theme (`uiUpdates.css`) re-points `--pub-accent` to
  `--pub-accent-fill` on every white-on-accent fill, inside a `:where()` so it
  adds no specificity and a plum selected state or the Spotlight gold still
  wins; `hub2.css` maps the fill to `--hub2-accent-fill`. An org that sets its
  own dark `--pub-accent` must set its own `--pub-accent-fill` in `brandDark`
  too (ASYO and AS use a purple), or its buttons borrow NWSA teal;
  `look.selfcheck.ts` fails otherwise. `hub2.selfcheck.ts` scans every rule in
  `src/public` and `src/shared` CSS that puts white text on a background using
  `--pub-accent` (solid, as a fallback, or in a gradient: the header, the
  concert-day "Check in") and fails until it is in that list. Inline styles in
  components are not scanned; none exist today. **The header is the one
  exception:** the Aa and sun/moon menus open inside it and show teal TEXT on
  a dark card, which the re-point would drop to 3:1, so a separate
  `:where(.pub-header)` dark rule redraws only its background (still below a
  student's header color and a season). The self-check accepts that rule and
  fails if the header ever joins the re-point list.
- **Staff screens are themed** (`src/director/hub2Staff.css`, imported by all
  four shells): Studio Bright soft cards, big times and numbers (Today, roll
  counts, Gradebook, Check-In), sun on waiting chips and nav badges; Concert
  Hall's Newsreader on a concert's title on Schedule, Today's coming-up list,
  the event drawer (Title field, gold hairline under its labels), the
  concert's roll and roster, and Check-In; Spotlight on Today's concert card
  and on Check-In's page for a concert held today. Components
  carry hooks for it (`data-event-type`, `data-hub2-spotlight`,
  `.dir-today-time`, `.dir-roll-concert`, `.dir-hall-title`) that NO other
  stylesheet may read, so flag off stays pixel-identical. **Prints never take
  the preview**: every staff rule, including the `--dir-*` mapping in
  hub2.css, is `@media screen`, and print gets the stock font back. The
  light `--dir-primary` is the plain accent (#0E7585, one teal for both
  sides), chosen to read as text on the page and under white. The ConcertDayBanner is untouched.
  `hub2.selfcheck.ts` §6 pins all of it.

### "The Higgsfield design", on every page, alive (Nov 2026, #hub2-alive)

When the director says "the Higgsfield design" he means the six mockups made
in his Higgsfield account on 2026-11-02 (Studio Bright, Concert Hall,
Spotlight; phone and laptop). They are not in this repo. On 2026-11-04 he said
the look above had misunderstood him: it took the mockups' colors and fonts
and restyled a handful of screens. He wants it on every page, with much more
motion, and approved a sketch of exactly that ("100 times yes"). The sketch is
the reference: `docs/hub2-alive/concept.html`; design and piece-by-piece plan
in `docs/superpowers/specs/2026-11-04-hub2-alive-design.md` and
`docs/superpowers/plans/2026-11-04-hub2-alive.md`. All of it ships with the
look on Dec 13 by the same one-word flip; nothing new to switch.

- **Parts, not pages.** The look attaches to the ~20 shared parts every screen
  is built from (`dir-btn`, `dir-label`, `dir-section-head`, drawers,
  `dir-ens-row`, segments, empty states; `pub-section-title`, `pub-card`,
  `pub-quick-btn`, `pub-event`, menu items, fields), so every screen changes
  at once, including screens built later. A new screen built from these parts
  needs nothing more. Do not go back to styling screens one by one: that is
  how the first pass stopped at five.
- **The eight motions of that sketch are gone** (2026-11-10): arrive, the
  page change, press, open, choose, count, finish and live. `hub2MotionOn()`,
  `hub2Celebrate()`, `Hub2Count` and their classes no longer exist. The page
  change came back as the one dissolve above; nothing else did. The parts
  stay. Take Roll still never moves on its own.
- **Proof is a contact sheet.** `scripts/hub2-contact-sheet.mjs` drives the
  system Chrome (no dependency) against the fixtures server and photographs
  every routed page, look on or off, at any widths. Run it before saying a
  piece reached every page; the Browser pane draws no frames while hidden.

### The glass (Nov 2026, #glass)

The look is glass: translucent panels that blur a slowly drifting colour
field behind them. The director chose it from `docs/design/glass-sample.html`
on 2026-11-07 (Full glass, Dissolved edges); `src/shared/hub2Glass.css` is all
of it, loaded last by `main.tsx`, and `docs/design/glass-redesign-plan.md` is
the design record.

- **It reaches every page by re-pointing tokens, not by styling pages.**
  `--pub-surface` / `--pub-border` (and the `--dir-*` twins) become a
  translucent tint and a transparent border, so every card, row, chip and
  sheet in both shells turns to glass at once. Only the chrome (header, menu,
  rail, bars, heroes) is named by hand, because a blur has to sit on the
  element that has something behind it. A class in the glass lists must be one
  the app renders (§ "the list that rots" in `hub2.selfcheck.ts`).
- **The backdrop-root trap, found in more than a dozen places:** opacity,
  filter, mask, clip-path or mix-blend-mode on an ANCESTOR of a glass element
  re-points its blur at that ancestor's own subtree, which paints nothing, so
  the glass goes flat with nothing thrown. Always reported as "it does not look
  glassy". On the element itself it is fine. Fade a copy, never a parent.
- **Two theme switches.** `data-pub-theme` on `<html>` (student site) and
  `data-dir-theme` on `.dir-app` (staff). Each glass palette block names both,
  the staff arm through `:is(:has(...))` on the root (a bare `:has()` in a
  comma list invalidates the whole rule on an engine without it).
- **Contrast is measured from painted pixels**, never reasoned: the teal
  accent used as text on the page sets the field's ceiling, and the floating
  tab bar's 70% tint is the one number that is not the sample's.
- **Three ways off, all landing on a solid panel:** blur radii of "0px" in
  `hub2.glass`, `prefers-reduced-transparency`, and no `backdrop-filter`.
- **Screen only and colours from the palette**: no colour literal but
  `white` / `black` / `transparent`, and paper prints as without the look.
- The only motion is the three ambient loops (drifting field, pane shine,
  living logo) and the page dissolve (#hub2-motion), which never animates a
  backdrop-filter.

## Clear cards, and a page per concert (Oct 2026, #clear-cards)

Director, 2026-10-27, on an iPhone: Check-In "all blurs together and looks like
a 1990s website". Tapping a concert revealed its scans BELOW the fold with no
sign anything happened, and `.dir-card` (used only there) had no style at all,
so every section was bare text on the season's bats. Rules for every screen:

- **Anything that holds content is a surface with a visible edge.**
  `.dir-card` (director.css) is the generic one; the named card classes share
  `--dir-card-shadow`; public cards use `--pub-shadow-1`. Never ship a class
  that only LOOKS like it should be a card, and never sit a section's content
  straight on the page background.
- **The season drawing is texture.** `seasons.css` lays a `--season-wash` of
  the page's own tint OVER the pattern on both sides. Do not remove the wash
  to make a season "pop"; that is what made the page unreadable.
- **On a phone, a drill-down is its own page, not a reveal below.**
  `CheckinView` swaps the list for one concert's page (back button, top of
  page, and the phone's Back gesture via `registerOverlayClose`). Do the same
  for any list → detail screen.
- Check it at 390px wide before shipping (#one-nav). Part 2 (same day) walked
  every screen in all four staff shells plus the public site with a probe
  listing visible text that has no surface behind it, and fixed the shared
  pieces it found once in `director.css` / `public.css`: empty states
  (`.dir-empty`, `.dir-empty-inline`, `.dir-loc-empty`) are dashed panels; the
  "Coming up" lists (`.dir-up-row`, `.pub-upcoming`) are stacked panels; month
  calendars, Gradebook notes and the Read-Aloud header are cards; and the
  roots that had no side gutter (`.dir-ra`, `.dir-signups`, `.dir-messages`,
  `.dir-gradebook`) have 16px. **Never cancel a card from inline style**
  (`background: 'inherit' | 'transparent'`, `border: 'none'` on a `*-row` /
  `*-card` element). That is how Who's Out and My Lessons lost theirs.
- **Schedule on a phone opens a tapped date as its own page** (below 1100px:
  `.day-open` hides the grid, a "‹ Month" row and day arrows appear, and Back
  returns). At 1100px+ the two-pane split is unchanged.
- **Purple TEXT is `--dir-blue-text`, never `--dir-blue`** (Oct 2026). The
  logo purple was unreadable as text in dark mode ("Open roll", the section
  labels). `--dir-blue-text` equals `--dir-blue` in light and is a lighter tint
  in dark; fills with white text keep `--dir-blue`. The exception is a rule
  that also hardcodes a LIGHT background (the active menu item, note
  category chips): those keep `--dir-blue`, since their background is light
  in both themes.
- **A page-level `.dir-btn` is `flex: 0 0 auto`.** The class is shaped for
  drawer footers (`flex: 1`), and in a column-stacked page that collapsed it to
  a sliver (Juries' New Jury).
- **A student's schedule page leads with TODAY** (`PublicSchedule.tsx`,
  iPhone check 2026-10-27). On a real student it started five screens down,
  under the concert-count form, the subscribe/absence buttons and every
  announcement printed in full. Order now: check-in, forms owed, Now/Next,
  Today, announcements (`collapseAfter={2}`, as Home), subscribe/absence,
  practice, times, assignments, concert count, the full schedule. Keep the
  day above the tools.
- **Greet a person with `firstName()`** (`src/shared/personName.ts`), never
  `name.split(' ')[0]`, which said "Tous,'s calendar" for every student
  stored "Last, First".
- **Fixtures can show every shell**: a `VITE_FIXTURES=1` build takes
  `?role=teacher|classroom|assistant` (AuthGate, fixtures only), so a layout
  change can be looked at as each kind of user without signing in.

## Dates and times: staff stay English, Spanish weekdays stay lowercase (Nov 2026, #staff-english)

- **Staff shells format in English, always.** The EN|ES choice lives in one
  localStorage key the public site writes, and the staff shells have no toggle
  to put it back, so a director who once tapped ES saw "3:30 p.m." on the
  concert-day banner. `formatLang()` in `src/shared/dates.ts` answers 'en' on
  any staff path (`isStaffPath()` in `src/shared/staffShell.ts`, decided from
  the URL so the first render is right). `dateLocale()` and `formatTime()` go
  through it. A public component that also renders in a staff shell (the
  announcement preview uses `PubAnnouncements`) picks its words the same way.
  Adding a fifth staff route means adding its segment there; the self-check
  reads `main.tsx` to catch it.
- **A date inside a sentence uses `fmtLongDateInline`.** `fmtLongDate` is a
  heading and capitalizes the Spanish weekday; "hasta el Miércoles" was the bug.
- `src/shared/dateLang.selfcheck.ts` pins both, and fails on any
  `{ date: fmtLongDate(` / `fmtDayHeader(` / `fmtFullDate(` in a `t()` call.

## What's New banner (auto)

Product/UX changes that affect all staff or the public student site must
update `src/shared/whatsNew.ts` in the same ship commit. Full include/exclude
rules: `.cursor/rules/whats-new.mdc`. Do not wait to be asked.
