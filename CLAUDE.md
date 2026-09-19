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

`firestoreCache.selfcheck.ts` pins all three and runs in the deploy workflow.
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
  `signupResponses`, `quizSubmissions`) — students
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
  dated `Lesson` docs — see the RECIPE entry below). `scripts/add-ensembles.mjs`
  also depends on it for the College Chamber Orchestra's Thursday rehearsal,
  which is correctly MDCPS-scoped even though the ensemble is college-level:
  that rehearsal happens ON the NWSA campus during the high school's own
  schedule, not at MDC.
- A rehearsal or class held on NWSA's campus follows MDCPS regardless of
  which students or which `collegeLevel` flag it involves. Only an actual MDC
  course (`COLLEGE_CLASSES`, meeting per the MDC schedule) depends on
  `MDC_NO_SCHOOL`. Don't pick the dependency by "is this a college thing" —
  pick it by which campus's calendar governs whether the room is open.
- **`src/director/campusCalendar.ts` is that rule as code**, for everything
  that is not a generator. A generator knows at the call site which calendar it
  is building against; a SCREEN does not, and "Cancel the day" is the proof —
  it swept 2026-09-21 and cancelled nine dual-enrollment classes that were
  meeting, the same bug `collegeSchedule.ts` fixed, reached through a different
  door. `campusForGroup()` reads MDC from `kind: 'class'` **plus**
  `collegeLevel` and nothing else, so College Chamber Orchestra
  (`kind: 'ensemble'`) and a college master class (`kind: 'masterclass'`) stay
  MDCPS — they are in NWSA rooms. `campusForEvent()` needs EVERY group on the
  block to be an MDC course, and an unresolvable group reads MDCPS, because
  under-cancelling is invisible and over-cancelling is on the review sheet.
  `splitClosure()` is what a screen leads with. `campusCalendar.selfcheck.ts`
  pins the disagreement in BOTH directions (Sep 21: MDCPS off, MDC open;
  Dec 14: MDC's term over, MDCPS in session) and runs in the deploy workflow.
- **A cancelled day takes the day's private LESSONS with it.** They are in
  another collection and were never in `dayEvents`, so a cancelled Monday used
  to look empty with a violin lesson still on it. It cannot be tidied up
  afterwards either: `pendingSlotDates()` reads a week holding any lesson as
  covered, so the standing weekly time will never notice. `Lesson.changeFrom`
  is the receipt the day plan leaves — "Back to normal" restores only the
  lessons IT cancelled, never one a teacher cancelled for their own reasons,
  and a graded lesson is reported and left alone rather than rewritten. An
  MDC-scoped cancel takes no lessons at all (`LESSON_CAMPUS`): a lesson is
  taught in an NWSA room whatever year the student is in, which is the same
  reason `slotDates()` generates against `MDCPS_NO_SCHOOL`.

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
- **Two categories carry a computed SUGGESTION** (Playing Exams, Required
  Performance Attendance) because those are countable rather than observed. A
  suggestion is a placeholder, never a saved value, until Fill is pressed.
  `fillValueFor()` is the ONE answer to what Fill writes: the suggestion where
  there is one, `FULL_MARKS` on a judgement category, and **nothing at all**
  when a computed category has no suggestion. Filling an ungraded exam at 100
  is exactly as wrong as counting it a zero.
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

Design record: `docs/superpowers/specs/2026-09-14-gradebook-design.md`.
Session record: `docs/session-notes-2026-09-14-gradebook.md`.

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
  awareness here is the same as everywhere else: live in-app reads (Take
  Roll's chip, Who's Out), never email. The student DOES get a confirmation
  email (`functions/src/plannedAbsenceConfirmation.ts`, mirroring
  `signupConfirmation.ts` field-for-field) — that one is a receipt for them,
  not a notification to staff.
- `scripts/absence-report.selfcheck.mjs` runs in the deploy workflow (see
  `.github/actions/self-checks/action.yml`).

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
  with nobody able to see it. The Library accordion stays rail-only on purpose
  (the phone keeps Library expanded — no accordion tax once the menu is open).
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

## What's New banner (auto)

Product/UX changes that affect all staff or the public student site must
update `src/shared/whatsNew.ts` in the same ship commit. Full include/exclude
rules: `.cursor/rules/whats-new.mdc`. Do not wait to be asked.
