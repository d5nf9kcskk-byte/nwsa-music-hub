# Session note — 2026-09-19: MDC decides college, MDCPS decides high school

Director's report, two things:

> "This coming Monday is a day off for the HS students, not college. You
> canceled the college classes along with the hs classes. Fix that and any
> other errors like it."

> "I am also still seeing a violin lesson for a hs student on this Monday. All
> [events] were canceled automatically, why not this one? Fix that bug too."

Monday was 2026-09-21: an MDCPS teacher planning day, and an ordinary Monday at
Miami Dade College.

Both reports were right. Neither was what it looked like.

## 1. The rule, corrected

The first pass at this got the rule backwards, and it is worth writing down
*why* it was wrong, because the wrong version is the intuitive one.

It reasoned from **where the room is**: College Chamber Orchestra rehearses on
NWSA's campus during the high school's own afternoon, so surely an MDCPS
closure closes the room. `campusForGroup()` was keyed on `kind === 'class'`
**plus** `collegeLevel`, which put CCO — an ensemble — on the MDCPS calendar.
CLAUDE.md said the same thing, in as many words ("A rehearsal or class held on
NWSA's campus follows MDCPS regardless of … which `collegeLevel` flag it
involves").

The director's correction:

> "MDC decides college, and MDCPS decides high school. The College Chamber
> Orchestra is not MDCPS. In any way, shape, or form, there are no high school
> connections with the College Chamber Orchestra, and there is no college
> connection with the masterclasses. These are separate things completely. …
> If it's an MDC day off, then MDC classes get canceled. If it is an MDCPS day
> off, then those classes get canceled, and there is no crossover."

So: **`collegeLevel` decides, and nothing else does.** College Chamber
Orchestra and College Vocal Ensemble follow MDC. The four string master
classes follow MDCPS. The two programs do not cross over in either direction.

That is exactly `isCollegeGroup()`, which the app already had — every College
screen and filter reads it. The fix was therefore not to invent a rule but to
stop spelling it a second way: `isCollegeGroup` moved from `utils.ts` to
`groupKind.ts` (re-exported, so no caller changed) where `campusCalendar.ts`
can reach it without pulling in the org config, and `campusForGroup()` became
that predicate and nothing more.

The corroborating evidence was already in the tree and nobody had noticed:
`collegeChamberRehearsalPatches()` in `collegeSchedule.ts` has *always* patched
CCO's rehearsals against `isCollegeSessionDay`. The generators disagreed with
it. The patcher was right.

## 2. "You cancelled the college classes" — they were never created

Sep 21 in the live project held exactly one document: the school-wide "MDCPS:
Teacher Planning Day — No School" marker. No college classes at all, cancelled
or otherwise.

The September `collegeSchedule.ts` fix (#college-hs-calendar-deps) corrected
the generator to use `MDC_NO_SCHOOL`. `Seed College Program` last ran
2026-08-28, under the old MDCPS gate. **The code was right and the data still
had the old gate's holes** — 51 class sessions missing across seven dates,
every one an MDCPS-only closure:

| date | classes | why MDCPS is shut |
|---|---|---|
| 2026-09-21 | 9 | teacher planning day |
| 2026-11-03 | 6 | professional learning day |
| 2026-11-23 | 9 | Thanksgiving recess |
| 2026-11-24 | 6 | Thanksgiving recess |
| 2026-11-25 | 10 | Thanksgiving recess |
| 2027-01-15 | 1 | teacher planning day |
| 2027-03-10 | 10 | teacher planning day |

MDC closes for the Thursday and Friday of Thanksgiving only, which is why
Mon–Wed of that week are missing too.

**The lesson worth keeping: fixing a generator does not fix the data.** After
changing which calendar a generator asks, re-run it and verify against the
live project. `events` is `allow read` in `firestore.rules`, so the whole
audit needs no credentials — the same unauthenticated REST path
`scripts/generate-feeds.mjs` uses by default.

### Before writing anything

`scripts/seed-college.mjs` writes class sessions with a plain `set`, not a
merge, so any field on a live doc that the generator does not produce would be
destroyed. A read-only diff of all 1070 existing sessions against what the
seed produces came back: **0 docs would lose a field, 0 docs would change a
value, 0 carried a change note, roll receipt or non-Scheduled status.** Only
then was the seed re-run. Event docs went 2934 → 2985, exactly +51.

Do this every time before re-running a seed that `set`s rather than merges.

## 3. Two generators had the rule backwards

`seedCalendar.ts` (`slotsForDay`, Thursday) and `scripts/add-ensembles.mjs`
both gated CCO's Thursday rehearsal on `MDCPS_NO_SCHOOL`. Consequences:
rehearsals generated straight through MDC's winter break, and skipped on days
MDC was in session. Three docs existed on dates MDC is not in session —
2026-08-13, 2026-08-20 (before MDC's Aug 24 term start) and 2026-12-17 (after
its Dec 11 finals).

Both now gate **per group, never per day**, through `campusForGroupId()`.
`COLLEGE_GROUP_IDS` in `collegeClasses.ts` is the ONE list the seeds ask —
built from `COLLEGE_CLASSES` + `COLLEGE_ENSEMBLES`, the same lists
`seed-college.mjs` writes `collegeLevel: true` from — and
`campusCalendar.selfcheck.ts` pins that it agrees with the flag on the live
doc. A generator that hardcodes "which of these is the college one" a second
time is exactly how this happened.

The class and choir loops in `seedCalendar.ts` went per-group too. Everything
in those lists is high school today, so it changes nothing now; it is there so
a college entry added later cannot silently reintroduce the bug.

2026-12-17 was cancelled in Firestore. Aug 13 and Aug 20 are past and were
left alone. (`evt-2026-08-13-handbook-reading` also carries CCO in its
`ensembleIds` — a hand-made all-school event, not a generated rehearsal.
Untouched.)

## 4. "Why not this one?" — lessons are in another collection

The violin lesson was real: Sep 21, 2:30–3:20 PM, Dr. Grant Gilman.

Cancelling a day never touched lessons. `ScheduleSwapView`'s `dayEvents` is
`events` only, so a cancelled Monday looked empty with a lesson still sitting
under it. And **it could not be tidied up afterwards**: `pendingSlotDates()`
reads a week that holds *any* lesson as already covered, so the standing
weekly time will never notice and never offer to fix it.

A cancelled day now takes that day's lessons with it:

- `Lesson.changeFrom` is the receipt the day plan leaves, so "Back to normal"
  restores only the lessons **it** cancelled and never overrules a teacher's
  own cancellation. Staff-only — not in `PUBLIC_LESSON_KEYS`, so it publishes
  nothing.
- A **graded** lesson is a record of one that happened. Reported in the review
  sheet, never rewritten.
- An MDC-scoped cancel takes none. `LESSON_CAMPUS = 'mdcps'` — not because of
  where the room is (that reasoning is what broke CCO) but because the applied
  lesson program **is** the high school one: `lessonLog.ts` builds the
  official High School Lesson Log, `defaultPayrollMinutes()` bands by grades
  9–12, and `slotDates()` already generates every lesson against
  `MDCPS_NO_SCHOOL`. Generation and cancellation must name the same set.

### The live data was worse than one lesson

29 live lessons were sitting on MDCPS closures, all in the future, across 16
dates — Thanksgiving, Christmas Eve, New Year's Eve, MLK Day, Presidents' Day,
spring break, Memorial Day. All generated before `slotDates()` learned to skip
closures in Sept 2026.

`scripts/cancel-no-school-lessons.mjs` + the *Cancel No-School Lessons*
workflow handle them. Notes on its shape:

- **`set-doc-field.mjs` refuses `lessons` on purpose** — the collection has a
  public projection, and writing `status` alone would leave `lessonsPublic`
  saying the lesson is still on, so the student's own
  `feeds/student-<id>.ics` would keep carrying it. That guard is correct. This
  script batches the mirror with every write instead.
- Never a graded lesson, never the past by default (`--from`, default today: a
  lesson on a past closure either happened or did not, and nothing here can
  tell), and **never a delete** — `status: 'Cancelled'` is what stops the
  weekly time re-creating it.
- Counts and dates in the log, never a name. Actions logs on this repo are
  public (#student-data).

## 5. Cancel the day, scoped

`cancelDay` and `backToNormal` both take an optional `campus`. The day board
offers the scoped plans first, ordered by which calendar is actually shut, and
says why above the chips:

> Sep 21 is a day off at the high school (MDCPS). Miami Dade College is in
> session — those classes still meet.

"Cancel everything" stays — a hurricane closes both. Reverting splits the same
way, so a wrongly-cancelled program goes back on in one press instead of nine
per-block un-cancels.

One trap found by walking the recovery path rather than the happy path:
**private lessons have to count towards MDCPS when deciding whether a day
spans two programs.** Without that, putting the college classes back leaves
nine live college blocks plus one live lesson, which reads as a single-program
day — and the only chip on offer would be the unscoped sweep that cancels them
again.

## 6. What shipped, and what to watch

Merged as `67bdfd4` (PR #179). In Firestore: 51 college classes restored,
Dec 17 CCO cancelled, 29 holiday lessons cancelled with their mirrors. Feeds
regenerated and deployed, so the Hub and every subscribed calendar agree.

- The `.ics` feeds are written **only** by the deploy job. "Fixed in
  Firestore" is not "fixed for a subscriber" until a deploy runs — the app
  reads Firestore live, the feeds do not. Dispatch `deploy.yml` after a data
  repair rather than waiting for the hourly cron.
- The generator fixes change what a **future** re-run produces. They do not
  retroactively delete anything; the three stray CCO rehearsals were handled
  by hand.
- If applied lessons are ever offered to dual-enrollment students on MDC's
  calendar, `LESSON_CAMPUS` and `slotDates()` change together or they drift.

Pinned by `campusCalendar.selfcheck.ts` (in `.github/actions/self-checks`):
the calendars disagree in **both** directions — Sep 21 (MDCPS off, MDC open)
and Dec 14 (MDC's term over, MDCPS in session), so neither set can be quietly
re-derived from the other — College Chamber Orchestra answers MDC and a master
class answers MDCPS by name, two ensembles differing only in `collegeLevel`
land on different calendars, and `campusForGroup` is exactly `isCollegeGroup`
across every shape of group.
