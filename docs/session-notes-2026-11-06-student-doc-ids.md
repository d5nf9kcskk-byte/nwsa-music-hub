# Are student names in public URLs? Yes, for 88 of 172 students (2026-11-06)

Investigation only. No student record was read beyond the world-readable
public projections, nothing was written, no script or workflow was run.

This note deliberately contains **no student name and no real doc ID**. Every
example is masked. The counts behind it are reproducible with the commands at
the bottom.

## Short answer

Yes. 88 of the 172 `studentsPublic` docs have a doc ID that is literally the
student's name: `surname-firstname-middleinitial`. 61 of those 88 are Active
students, and 61 live files on the public GitHub Pages site are named
`feeds/student-<surname>-<firstname>-<initial>.ics` right now. They return
HTTP 200 to anyone.

It is a real violation of a rule this repo wrote down, and it is live. It is
**not an emergency**, for one reason that matters more than any other: every
name involved is *already* world-readable on purpose. The director decided in
Aug 2026 that student names, instruments, sections, grades and ensemble
membership are public, `studentsPublic` publishes exactly that for all 172
students, the public ensemble roster page prints those names and links to
`/student/<id>`, and each per-student feed already carries the student's full
name in its own `X-WR-CALNAME` header. A name-derived doc ID discloses nothing
new about anybody.

What it does do is give away one capability that was not meant to exist, and
that part is genuine. See "The one thing that is actually new" below.

It is also already self-limiting. Every code path that creates a student today
makes a random Firestore ID, so no new name-slug IDs are being minted, and 27
of the 88 (23 Graduated, 4 Inactive) no longer get a feed file at all. The
population shrinks on its own with each graduating class.

Verdict: fix it deliberately, in a quiet week, with the director's sign-off,
because the repair breaks 61 families' live calendar subscriptions. Do not
rush it, and do not do it anywhere near the concert-day freeze dates.

## The rule

From `CLAUDE.md`, "Student privacy, the projection model":

> Student doc IDs are RANDOM Firestore IDs, never the school-issued Student
> ID. Doc IDs are effectively public (shared with `studentsPublic`, and in
> `/student/<id>` URLs and `feeds/student-<id>.ics`). The school ID lives only
> in the staff-only `schoolId` field on `students`.
> `scripts/migrate-student-doc-ids.mjs` repaired the Aug 2026 import that
> briefly violated this; keep any future importer on random IDs.

The rule's stated reason is that doc IDs reach three public surfaces. Its
stated remedy was aimed at one specific thing, the school-issued Student ID.
A name is not mentioned, but the same reasoning covers it, and more directly:
a school ID is a number nobody can read, a surname is a surname.

## What the live data says

`studentsPublic` is world-readable, so these are unauthenticated REST counts,
taken 2026-11-06.

| | count |
|---|---|
| `studentsPublic` docs | 172 |
| Firestore auto-ID shape (20 mixed-case alphanumerics) | 84 |
| Non-auto-ID | **88** |

Classifying each of those 88 against that same doc's own `name` and
`preferredName` fields:

| class | count |
|---|---|
| clearly name-derived | **88** |
| possibly name-derived | 0 |
| unrelated | 0 |
| no letters in the ID | 0 |

There is no ambiguity to weigh. 87 of the 88 reproduce exactly two of the
student's own name words, and one reproduces three (a compound surname). Not
one is a near-miss or a coincidence.

The shape is `<surname>-<firstname>-<middleinitial>`, with the middle initial
dropped where the student has none. Masked examples, letters replaced with
`#` and only the first letter kept:

```
a#############-f####-e      (13-letter surname, 5-letter first name, initial)
a####-d####-d
```

Status split of the 88, which is what decides whether a feed file exists:

| status | count | feed file written? |
|---|---|---|
| Active | **61** | yes |
| Graduated | 23 | no |
| Inactive | 4 | no |

For comparison, the 84 auto-ID docs are 82 Active, 1 Graduated, 1 Inactive.
The name-slug population skews heavily toward students who have been here
longer, which fits: they are the oldest records in the database.

Total Active students is 143, so **61 of the 143 live per-student feed files,
43%, have a student's name in the filename.**

## Where it is actually exposed

Three public surfaces, and they are not equally bad.

### 1. `feeds/student-<id>.ics` on GitHub Pages. Live, and this is the real one.

`scripts/generate-feeds.mjs:533` writes one file per student whose status is
not Graduated or Inactive. Verified live against
`https://d5nf9kcskk-byte.github.io/nwsa-music-hub/`:

```
[name-slug/Active]  /feeds/student-a#############-f####-e.ics  -> HTTP 200, 88,247 bytes, 379 VEVENTs
[name-slug/Active]  /feeds/student-a####-d####-d.ics          -> HTTP 200, 145,087 bytes, 576 VEVENTs
[name-slug/Active]  /feeds/student-a###-a####-l.ics           -> HTTP 200, 153,961 bytes, 574 VEVENTs
[name-slug/Graduated] /feeds/student-b######-z######-r.ics    -> HTTP 404
[auto-id/Active]    /feeds/student-<20 random chars>.ics      -> HTTP 200, 135,502 bytes, 622 VEVENTs
```

`feeds/index.json` does **not** list per-student feeds (confirmed: 45 feeds,
369 view feeds, 8 bundles, no occurrence of the string `student-`). So the
filenames are not enumerable from the index. That is the only thing standing
between these files and a directory listing, and with a name-derived ID it
does not stand for much, because the filename no longer needs enumerating.

The file content is name-bearing either way. One live feed's header, with the
name masked:

```
X-WR-CALNAME:A#############\, F#### E. — NWSA Music
X-WR-CALDESC:Personal schedule for A#############\, F#### E.
```

So opening the file tells you whose it is whatever the filename says. The
filename is about *addressing*, not disclosure.

### 2. `/student/<id>`. A working, shareable URL.

`src/main.tsx:95` routes `student/:id` to `PublicSchedule`. GitHub Pages has
no rewrite rule, so the path returns a 404 status, but `dist/404.html` exists
and is patched at build time (`vite.config.ts:216`) and the SPA boots from it,
so the page renders normally in a browser. `/student/<name-slug>` is a real,
pasteable, bookmarkable address.

Worse, nobody has to construct it. `src/public/PublicEnsemble.tsx:380` links
`/student/${s.id}` straight off the public ensemble roster page, so every
active student's name-slug URL is one click away for any visitor. The link
text is the student's name, so a person reading that page learns nothing from
the href. A log, a history file or a pasted link is a different matter.

### 3. The "send to my other phone" link. Names in a query string.

`src/shared/deviceTransfer.ts` builds `add-students?ids=a,b,c` so a family can
carry their saved students to another device. Its own header comment justifies
this with "Student doc ids are already public (studentsPublic, /student/<id>,
feeds/student-<id>.ics), so the link holds no secret and needs no server."
That is true of the auto-IDs it was written for. With name slugs, the query
string carries the children's full names in plain text in a URL a parent
texts or emails. Its validator (`ID_RE = /^[A-Za-z0-9_-]{1,64}$/`) accepts
hyphens, so slugs pass straight through.

This is the family's own link about their own children, which softens it a
lot. It is still a URL parameter holding a name, which is the shape of thing
this project avoids everywhere else.

### Not exposed: everything else

A student ID also sits in a field on a lot of world-readable documents, but a
field is not a URL and these were already published on purpose:

| collection | how the ID appears | live docs referencing a name slug |
|---|---|---|
| `lessonsPublic` | `studentId` field | 151 of 300 (4 distinct students) |
| `rosterOverridesPublic` | `studentId` field | 93 of 137 (33 distinct) |
| `submissionReceiptsPublic` | **doc ID** `${assignmentId}_${studentId}` | **86 of 146 (45 distinct)** |
| `events` | `studentIds[]`, `attendanceStudentIds[]` | 19 of 3,005 (16 distinct) |
| `seatingCharts` | `sections[].seats[].studentId` | all 5 charts (45 distinct) |
| `signupSlotBookings` | `studentId` field | 11 of 14 (9 distinct) |
| `assignments`, `signupForms`, `announcements`, `ensembles`, `documents`, `repertoire` | none found | 0 |

`submissionReceiptsPublic` is worth flagging separately. It is world-readable,
and 86 of its 146 docs carry a name slug in **their own doc ID**, because
`submissionReceiptId()` is `${assignmentId}_${studentId}`. That is a second
public collection *keyed* by a student's name, which the rule's three named
surfaces do not mention because the collection did not exist when the rule was
written. No URL carries it, so it is not new disclosure, but a repair has to
rewrite all 86, and that collection denies every client write in
`firestore.rules`, so only the Admin SDK can touch it.

## The one thing that is actually new

Strip away everything already public and exactly one capability is left, and
it comes entirely from the filename:

**An auto-ID feed URL cannot be guessed. A name-slug one can.**

To pull a stranger's full term schedule today, with an auto-ID you must first
read `studentsPublic` over the Firestore REST API to learn their doc ID. That
is a public database, so it is possible, but it takes knowing the project id,
the collection name and the API. With a name slug you need none of that. You
need the student's name, which you can get from the public roster page or from
knowing them, and you type:

```
/feeds/student-<surname>-<firstname>-<initial>.ics
```

and you get their whole term: every rehearsal, class, concert and call time,
plus their private lesson day, time, location and teacher (`lessonsPublic`
publishes lesson times by the director's 2026-09-01 decision). 379 to 576
events per file.

That bar is low enough to matter. Not because of the data, which is public
either way, but because "type a predictable URL" and "query a public database"
are different thresholds, and a person's weekly physical whereabouts is the
kind of data where the threshold is the point.

Two smaller effects, worth a line each:

- A URL spreads where a database field does not: browser history, bookmarks,
  texted links, the calendar app's own subscription settings UI (so the name
  shows in a family member's calendar chrome), GitHub Pages access logs, and
  any proxy in between.
- A removed student's feed file disappears on the next build, but a URL
  someone already has keeps naming them.

## Why the earlier repair did not cover this

`scripts/migrate-student-doc-ids.mjs` was never meant to. Its filter is one
line:

```js
const SCHOOL_ID_RE = /^\d{7}$/;
```

It matched exactly the 7-digit school-issued Student IDs that the Aug 2026
import had used as doc IDs, and nothing else. A hyphenated name slug never
matched it, so the script looked at the 88 of them and correctly concluded
there was nothing to do. Confirmed against live data: zero 7-digit doc IDs
remain, so that migration finished its job cleanly. It just had a different
job.

The name slugs are older than that import. They come from
`scripts/migrate.js`, commit `1e25a56`, 2026-06-18, whose own message says it
loaded 24 students "with deterministic slug IDs so the script is idempotent".
That is a reasonable thing to want and the wrong way to get it: the auto-ID
path in today's importer gets idempotency from a resume marker instead. The
file is long gone from `HEAD`. The remaining 64 slugs presumably came from
later runs of the same convention.

Nothing live can create another one. Verified:

- `scripts/import-2026-rosters.mjs:268` uses `db.collection('students').doc().id`
- `src/director/hooks/useStudents.ts:45` uses `doc(collection(dbRef, 'students'))`

Both are random auto-IDs. The bleeding has stopped.

## What a repair would cost

This is the part that argues for doing it deliberately rather than soon.

### Every place a student ID is referenced

The old script handled 11 collections. Nine more have been added since, three
of which embed the ID in a **doc ID** rather than a field, which means a
rewrite is a delete plus a create, not an update.

Covered by the old script, so the pattern already exists:

| target | how |
|---|---|
| `students` | doc ID (re-key, keep `schoolId`) |
| `studentsPublic` | doc ID (projection mirror) |
| `contacts` | doc ID |
| `rosterOverrides` + `rosterOverridesPublic` | `studentId` field |
| `attendance` | `studentId` field |
| `progressNotes` | `studentId` field |
| `assignmentResults` | `studentId` field |
| `assignmentSubmissions` | `studentId` field |
| `plannedAbsences` | `studentId` field |
| `lessons` | `studentId` field |
| `events` | `studentIds[]` array |
| `assignments` | `studentIds[]` array |
| `seatingCharts` | nested `sections[].seats[].studentId` |

Added since, and **not** handled by the old script:

| target | how | note |
|---|---|---|
| `lessonsPublic` | `studentId` field | the public lesson-time mirror |
| `submissionReceiptsPublic` | **doc ID** `${assignmentId}_${studentId}` | 86 live docs; Admin SDK only, clients cannot write it |
| `gradeMarks` | **doc ID** `${groupKey}_${periodId}_${studentId}` + field | `firestore.rules` requires the key fields to match the doc ID, so both move together |
| `schoolDayTardies` | **doc ID** `${studentId}_${date}` + field | |
| `concertCheckins` | **doc ID** `${eventId}_${studentId}_${kind}` + field | |
| `concertExcusals` | `studentId` field | written and deleted by directors only, **no update rule**, so a re-key is a delete plus a create and the record's "kept as filed" promise needs thinking about |
| `quizSubmissions` | `studentId` field | |
| `signupResponses` | `studentId` field | |
| `signupSlotBookings` | `studentId` field | |
| `copyRequests` | `studentId` field | |
| `juries` | running order holds student IDs | |
| `directors/{email}.assignedStudentIds` | array | an applied teacher's studio |
| `directors/{email}.lessonSlots` | per-student standing weekly times | the `hasOnly([...])` self-update list in `firestore.rules` applies |
| `directors/{email}.lessonLogSheets` | **map keys** via `sheetKey(studentId, schoolYear, term)` | map keys, not docs; rewriting them means rewriting the map |
| `signupAudiences/{formId}.studentIds` | array | |

That is roughly 28 targets across about 20 collections, three composite doc-ID
patterns, two map-key patterns, and one collection no client can write.

Two of those need a decision rather than code. `concertExcusals` has no update
rule on purpose, so that a filed record is kept as filed; re-keying it means
deleting and recreating a record the rules were written to make immutable.
And `lessonLogSheets` keys are live data whose identity is the key itself, the
same trap `CLAUDE.md` already flags for `ORG.terms`.

### What breaks for people

- **61 live `.ics` subscriptions stop resolving.** The old script's header
  calls this out: "Saved schedules and personal-feed subscriptions made under
  the old IDs stop resolving, that is the point, and families re-pick once."
  It is still the point and it is still 61 families having to re-subscribe.
  A dead subscription on a phone calendar fails quietly, which is the worst
  way for it to fail. Whatever lands should go out with a note to families
  first.
- **Saved students in localStorage break** for those families
  (`src/shared/identity.ts`), so the Hub opens on `/lookup` and they re-pick.
- **Bookmarked `/student/<id>` links break.**
- **Any already-shared device-transfer link breaks**, which is harmless.
- Nothing staff-facing breaks visibly, as long as every target above is
  rewritten in the same run. Miss one and a student silently loses a grade
  mark, a check-in or a log sheet, which is the real risk in this work.

### A shortcut that is not one

The obvious cheap move is to leave the IDs alone and hash the feed filename,
a two-line change in `studentFeedUrl()` (`src/public/feedUrl.ts`) and
`scripts/generate-feeds.mjs`. It is worse on both counts: it breaks all 143
subscriptions rather than 61, and it fixes only surface 1, leaving
`/student/<id>`, the device-transfer query string and the 86
`submissionReceiptsPublic` doc IDs still name-bearing. Re-keying the 88 is
both the smaller blast radius and the only thing that satisfies the rule.

### Doing nothing is a defensible option too

27 of the 88 already generate no feed file, and each graduating class retires
more. Nothing creates new ones. Left alone, the problem drains to zero over
about four years without anyone touching a database. That is worth saying out
loud next to a migration that touches 28 reference sites and breaks 61
subscriptions.

### Not an agent's job

Per `CLAUDE.md`, "Student data never leaves the app": a roster write is not a
candidate for the trigger-file workflow pattern, because this repo is public
and so are its Actions logs, and a doc ID maps to a name through
`studentsPublic`. A re-key is the largest roster write there is. It belongs to
a migration script run with a service-account credential by the director, with
a dry run read first, exactly as `migrate-student-doc-ids.mjs` was. The useful
thing an agent can do afterwards is verify from `studentsPublic`, which is
world-readable already and so exposes nothing new.

## One separate finding, lower priority

`CLAUDE.md` says seed rosters with real students "were purged from files AND
git history in Aug 2026". That is true of `main`. It is not true of the whole
repository.

Commit `1e25a56` still exists on the remote, reachable from the branch
`origin/claude/nwsa-music-hub-presentation-dxdw1e` (confirmed present via
`git ls-remote`). It contains `scripts/migrate.js` with 24 real students
hardcoded: `name`, `grade`, `instrument`, `ensembleIds`, `status`. On a public
repo, anyone can fetch that branch and read them.

Proportion matters here. Those five fields are exactly the field list that
`studentsPublic` publishes to the world today, including for graduated
students, so the blob discloses nothing that is not already public by the
director's own decision. It is a documentation error and a tidiness problem,
not a leak. The repo has 109 remote branches; a sweep of stale `claude/*`
branches would close it, and would be its own small piece of work.

## How to re-run any of this

All read-only, all unauthenticated, no credential needed.

List the public projection and count the shapes:

```bash
curl -s "https://firestore.googleapis.com/v1/projects/nwsa-hub/databases/(default)/documents/studentsPublic?pageSize=100"
```

Page with `nextPageToken`. Use `pageSize=100`, not `300`: at `pageSize=300`
`lessonsPublic` returned exactly 300 documents with no continuation token,
which looks like a complete answer and is a page cap. Paging at 100 and at 50
both reached 300 and neither ended holding a token, which is how the 300 above
was confirmed as a real total rather than a truncation.

An ID is auto-generated if it matches `/^[A-Za-z0-9]{20}$/` and mixes cases.
Everything else on this project is a name slug.

Check a feed file is live, substituting a real ID:

```bash
curl -sI "https://d5nf9kcskk-byte.github.io/nwsa-music-hub/feeds/student-<id>.ics"
```

Confirm the index does not enumerate them:

```bash
curl -s "https://d5nf9kcskk-byte.github.io/nwsa-music-hub/feeds/index.json" | grep -c "student-"
```

Confirm no live code path mints a slug ID:

```bash
grep -rn "collection('students').doc(\|doc(collection(dbRef, 'students')" src/ scripts/
```

Scratch scripts used for the counts in this note were left in the session
scratchpad, not committed. They print counts, shapes and masked examples only,
and were written that way on purpose so no student name entered a transcript.
