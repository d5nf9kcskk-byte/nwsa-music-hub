# Grades in the Hub, and the half-quarter report to the teacher of record

**Date:** 2026-09-14
**Status:** BUILT, same day, once the four syllabi, the district's comment
codes and the workbook itself turned up. See "What changed once the real
documents arrived" at the end: three of the decisions below were corrected by
those documents, and one of them (attendance) was narrowed by the director on
purpose. Supersedes the 11 Sep "Gradebook in the Hub" recommendation, whose
verdict I keep and whose build plan I replaced.

The 11 Sep note asked the right question (build it here, or wire Excel to
Firestore?) and answered it correctly: **build it here, and make the
spreadsheet an output rather than the system of record.** Firestore has no
ODBC or OData endpoint, Mac Excel has no scheduled refresh, and a bridge
leaves the numbers living in two places. None of that has changed and I am not
relitigating it.

What I am replacing is the design underneath it. Six things in that plan are
wrong or missing, and four of them would have been found late, after the
typing had already started.

---

## What the earlier plan got wrong

### 1. It assumed a grading calendar the Hub does not have

The plan says to put weights in `config/orgs/nwsa.json` "beside
`gradingPeriods`, same as the calendar boundaries." There is no
`gradingPeriods`. `grep` finds no quarter, no interim, no marking period, and
no progress report anywhere in this repo. What the config actually has is
`terms`, and `terms` is two semesters:

```json
"terms": [
  { "id": "2026-fall",   "name": "Fall 2026",   "start": "2026-08-17", "end": "2026-12-19" },
  { "id": "2027-spring", "name": "Spring 2027", "start": "2027-01-06", "end": "2027-06-03" }
]
```

The whole requirement is a report produced every half quarter. That is eight
windows a year, nested two levels below the only boundary the app knows about.
Every screen, every query and the send itself hang off that calendar, so it is
not a detail to add "beside" something. It is the first thing to build, and
CLAUDE.md already fences how: `currentTerm()` is the ONE answer to "which
semester is it", and month arithmetic in `src/` is banned because Fall does not
start on the first of August. The same rule has to hold one level down.

### 2. It treated attendance as solved. Attendance is exception-only.

The plan's table says "Have it" against Attendance and Punctuality, 30 points.
What the Hub has is **exceptions**. There is no Present record. `TrackerView`
counts `Absent`, `Late`, `Excused`, `LateExcused` and reports totals, never a
rate, and `cleanCount` finds the students with a clean record by looking for
students with no records at all.

So there is no denominator anywhere in this codebase, and 30 points of a grade
cannot be computed without one. The honest denominator already exists and
nobody has used it yet:

```ts
// src/director/types.ts:263
rollTaken?: Record<string, { at: number; by?: string; byRole?: StaffRole; absent: number }>;
```

A roll receipt per event per ensemble, stamped when roll was actually taken,
carrying the absent count at the time. **Meetings held for this group = events
in the window carrying a roll receipt for it.** Not events on the calendar: a
rehearsal that was cancelled, moved, or never rolled would otherwise count
against every student in the section, silently, and the first anyone would hear
of it is a parent on the phone.

That choice has a consequence worth stating out loud: a director who skips roll
shrinks the denominator for everyone in that group. That is the correct
behavior (we can only grade what we recorded), but the Gradebook has to show it
rather than hide it, which is why the per-student line reads "27 of 29
meetings, 2 absences" and not just "93".

### 3. It hardcodes one director's report, and one org's syllabus

Two separate violations of rules this repo already enforces.

**"A Submit to Brent button" that renders "his exact three tables"** puts a
person's name, a recipient address and three column layouts into `src/`.
CLAUDE.md: org names, contact emails and vanity strings live in
`config/orgs/*.json`, never hardcoded in `src/`. Beyond the rule, the button
breaks the day the teacher of record changes, and the layouts are not really
his preference anyway. Camerata says "Behavior" and Orchestra says "Conduct"
because those are the column headings on two different **district course
sections**. That is a fact about the course, not about the person collecting
the file, and the Hub does not currently model a course section at all.

**`gradeWeights` as one object in the org config** says the whole organization
grades on one syllabus. It does not. Brent's AP Theory section has no
Performance Attendance category. A dual-enrollment MDC course has its own
syllabus and its own calendar. Camerata and Symphony may not weight the same
either. Weights belong to the course.

They also change on a different clock than the calendar does. A grading
calendar changes once a year and is a published school fact, so org config is
right for it. A syllabus gets revised when a director decides to revise it, and
routing that through a pull request, a deploy, a service worker rebuild and a
CSP self-check to move ten points from Prep to Professionalism is absurd.
Weights belong in Firestore, edited in the app.

### 4. Fixed category names fork every consumer

`judgmentScores` with fields `prep`, `performance`, `professionalism`, and
`gradeWeights` with six fixed keys, means that the day someone adds
Sectionals, or drops Professionalism, or asks for the sight-reading check to
count, you are editing a type, a rule, a screen, an export and a formula
together. This codebase already solved exactly this shape twice and both
solutions are lists of named, weighted lines with stable ids:
`RubricCriterion` for exams, `sections`/`seats` for seating.

The requirement "ask for other grades as well to average" is the tell. It is
not a seventh field. It is proof that the category set is data.

### 5. The phases are ordered by visibility, not by risk

The plan builds the entry screen first, the arithmetic second, the output
third. But the entry screen is the only part nobody doubts, and it is also the
part that costs the director hundreds of keystrokes. The real unknown is
whether the computed number agrees with the number they would have given by
hand. Find that out before anyone types anything.

This is affordable because the 11 Sep note is right that 60 of the 100 points
already exist. Re-normalizing over scored categories (which the plan correctly
requires) means a grade built from attendance, concerts and playing exams alone
is a valid grade on the subset. Compute last quarter's, put it beside the
workbook's, and look at the gaps. If they disagree, the disagreement is the
project.

### 6. "One caution" about FERPA, and no mechanism

The last paragraph says adding grades raises the stakes and is worth a
conversation. Agreed, and it needs more than a conversation, because the
feature ends in an **email containing a roster of named students with grades**
leaving the building through the school's SMTP account. This repo has already
worked out how to do that safely, twice, and the answers are specific:

- `mail` is denied to every client in `firestore.rules` and must stay that way.
- `lessonLogMailSend` trusts **nothing** in the queue doc but `lessonId`,
  because the queue doc is written by a signed-in teacher who controls every
  field on it, `recipients` included.
- The family email is never a side effect of saving. A teacher presses.

All three carry over, and the recipient rule gets stricter: the address is
never in the request.

---

## The design

### Two homes, two clocks

**The grading calendar is org config**, next to `terms`, because it is a
published school fact that changes once a year:

```json
"gradingPeriods": [
  { "id": "2026-q1", "termId": "2026-fall", "name": "Quarter 1",
    "start": "2026-08-17", "end": "2026-10-17",
    "reportDates": ["2026-09-19", "2026-10-17"] },
  { "id": "2026-q2", "termId": "2026-fall", "name": "Quarter 2",
    "start": "2026-10-20", "end": "2026-12-19",
    "reportDates": ["2026-11-14", "2026-12-19"] }
]
```

`reportDates` is typed, not computed. Halving a quarter lands the interim on
whatever day the arithmetic picks, which will sooner or later be a teacher
planning day, the Monday after a hurricane closure, or the week of juries. The
district publishes these dates. Type them. Same reasoning that put term
boundaries in config rather than a `month >= 8` guess.

**Weights are Firestore, per group.** `gradingPlans/{ensembleId}`, staff-only,
edited in the app. Three states, and all three mean something, exactly as
`Assignment.rubric` does:

- **no document**: nobody has chosen, so the org's default plan answers. This
  is what every existing ensemble carries, which is why there is no migration.
- **a list of categories**: this course's own plan.
- **an empty list**: grading is deliberately off for this group. AP Theory may
  be graded entirely in the district system. Never re-default an empty plan.

### `src/shared/gradingPeriods.ts` is the ONE answer to "what am I reporting"

`currentReportingWindow(periods, today)` returns the period, the span, and
whether today is a report day. Three things it pins, and the self-check runs in
the shared self-checks action:

1. **A report covers the QUARTER to date, not the half quarter.** Half quarter
   is the cadence, not the span. An interim says how the student is doing in
   this quarter so far; it is not a grade for six weeks in isolation. Getting
   this wrong produces numbers that are individually plausible and collectively
   wrong, which is the worst failure mode available here.
2. **Outside every period, answer with the most recent one that has started**,
   matching `currentTerm`'s posture. In July, that is Q4.
3. **An org with no `gradingPeriods` gets `null`**, and a screen with no window
   shows everything rather than nothing. Every org but NWSA is in that state
   today.

### A category is a named, weighted line with a source

```ts
export interface GradeCategory {
  id: string;        // stable, so renaming a line keeps its marks
  label: string;     // "Attendance & Punctuality"
  weight: number;    // points out of the plan's total
  source: CategorySource;
}

export type CategorySource =
  | { kind: 'attendance'; cost: MarkCost }               // roll for this group
  | { kind: 'concerts'; required: number; choice?: number }
  | { kind: 'assignments'; types?: AssignmentType[] }    // assignmentResults
  | { kind: 'lessons' }                                  // Lesson.grade average
  | { kind: 'manual' };                                  // a judgment mark
```

Every category scores 0 to 100 and is worth its `weight` of the plan's total.
That is one scale in one place, and it is what lets a plan hold six categories
or nine without anything downstream caring.

**Where the six syllabus categories land.** Attendance and Punctuality is
`attendance`. Performance Attendance is `concerts`. Playing Exams is
`assignments` filtered to `Playing Exam`, which is how "use the exam grades as
given in the app itself" is satisfied: the rubric total a director already
confirmed while watching the video, read straight off `assignmentResults`, with
no second entry anywhere. Preparation and Participation, Performance and
Professionalism are `manual`.

**The line between an assignment and a mark.** If it has a date and a roster,
it is an Assignment and it grades on the existing grade sheet. If it is a
judgment about a span of time, it is a mark on the Gradebook screen. A director
wanting three quiz scores averaged should be making three assignments, not
typing an average into a box, because assignments carry a due date, a
submission, a rubric and a CSV, and a typed average carries nothing. This rule
is what keeps "other grades to average" from becoming a second, worse
assignment system.

### `src/shared/ensembleGrades.ts` is the arithmetic, and nothing else

Pure, no Firestore, no DOM, no `ORG` import, explicit `.ts` on its relative
imports, so it runs under Node for its self-check and inside the Cloud
Functions bundle. Same posture as `concertCheckin.ts`, and for the same reason:
the screen, the export and the send must never be able to disagree about a
student's grade.

Six behaviors it has to get right. The first three the earlier plan already
identified and I am keeping verbatim in intent:

1. **Re-normalize over scored categories.** A category with no score drops out
   of numerator and denominator both, so an interim in week three is not
   punished for a playing exam that has not happened. Same posture as
   `criterionPointValue` and `lessonGradeValue`: a blank is never a zero.
2. **Concerts split required from choice.** Required is credited over what was
   offered in the window. The choice requirement is a semester test, applied in
   Q2 and Q4 only, and only once a choice concert has actually been logged. The
   counting itself is already written and pinned: `tallyScans()` in
   `functions/src/concertTally.ts`, where a concert counts only when BOTH scans
   exist. Reuse it. Do not write a second count, or the student's "2 of 3" and
   their grade will drift apart and the student will be right.
3. **A `Lesson` pull-out is never an absence.** Already true in the tracker.

Three more that were missing:

4. **Class attendance only.** `Late` and `LateExcused` are the tardies that
   count. `schoolDayTardies` is not attendance and must never reach this
   module. That distinction was a real bug once, fixed in Aug 2026 when the
   office bulletin's TARDY section was writing `status: 'Late'` onto every one
   of a student's ensembles and making "arrived at the building late" and
   "walked into Camerata late" indistinguishable. A gradebook reading the wrong
   one would re-import the bug with money on it.
5. **Missing and not-yet-happened are the same number and different UI.** Both
   drop out of the average. But "no concerts have occurred yet" is fine and
   "you have not marked Professionalism for eleven students" is a blocker, and
   the report screen has to tell them apart before anything is sent.
6. **Below a coverage floor, refuse to print a number.** If less than half the
   plan's weight is scored, the row shows the categories and no percent. A
   confident 94 computed from attendance alone, arriving in a gradebook, is the
   single worst thing this feature can produce.

### Attendance scoring: one code path

Every mark costs points off 100. What varies is the cost, and the cost is
either a fixed number or proportional to meetings held:

```ts
type MarkCost = { absent: number | 'proportional'; excused: number; late: number; lateExcused: number };
```

A rate model and a penalty model are the same arithmetic with a different
`absent`. Supporting both as one path means there is one place to look when a
grade is questioned, and the syllabus picks the numbers rather than the code.

**What an excused absence costs is a policy question, not an engineering one,
and it needs an answer in writing before this ships.** A category that deducts
for district-excused absences, IEP or 504 accommodations, or religious
observance is a different kind of exposure than anything the Hub currently
carries. The field exists; the number comes from the syllabus.

### Marks: one doc per student per group per period

`gradeMarks/{ensembleId}_{periodId}_{studentId}`, staff-only, no public
projection, ever.

```ts
interface GradeMarks {
  ensembleId: string; periodId: string; studentId: string;
  scores: Record<string, number>;   // category id → 0..100
  notes?: string;
  effortOverride?: string; conductOverride?: string;
  updatedAt: number; updatedBy: string;
}
```

A composite doc id rather than a random one, so a second save updates one
record instead of stacking duplicates, the same guard `checkinDocId` and
`schoolDayTardies` already use. A map keyed by category id rather than named
fields, so adding a category to a plan is a plan edit and nothing else.

**Marks carry forward.** Opening a period seeds each student at their previous
period's value, so the director changes the exceptions and leaves the rest.
That is the same idiom as exception-only roll, and it is the difference between
a screen used in week six and a screen used the night before the report is due.
A grade is a continuation, not a fresh invention every six weeks. Carry-forward
values are marked as carried until touched, so "I have not looked at this
student since September" is visible rather than disguised as a judgment.

**Effort and conduct codes derive from the marks**, through a band table on the
plan (effort 1 to 3, conduct A to F, or whatever the section actually uses),
with a per-student override. One entry, no drift, and the override is there
because a code is sometimes a judgment the number does not capture.

### The report

`gradeReports/{periodId}_{ensembleId}_{reportDate}`, staff-only, holding the
rows **as they were read and approved**: a plan snapshot, the cutoff date,
every student's categories with their scores, the percent, the codes, and who
generated it.

Snapshotting rather than recomputing is the `AssignmentResult.rubric` rule
applied one level up: re-weighting a plan in November must not silently rewrite
what was submitted in September. What went to the district is a record.

Layout is data, on the plan: which columns, in what order, and what the conduct
column is called in that district section. Which is the missing field that
makes the tables paste-ready:

```ts
districtCourse?: { code: string; section: string; teacherOfRecord: string; conductLabel: string };
```

Who gets a report is `assignedEnsembleIds`, the app's ONE answer to "whose
group is this". Not a list in a file.

### The send

```
director reviews the report on screen, presses Send
  └─ gradeReportQueue/{id}   { reportId }            ← the ONLY field read
      └─ gradeReportSend  (Cloud Function)
          ├─ reads gradeReports/{reportId}           (the CONTENT, already approved)
          ├─ resolves the recipient from directors + ORG config
          ├─ checks the sender's assignedEnsembleIds covers the report
          ├─ refuses if sentAt is already set
          └─ writes mail/{queueDocId}                (Admin SDK, create not add)
              └─ Trigger Email extension → SMTP
```

Nothing new to install: this is the same Trigger Email extension the sign-up
confirmation and the lesson-log email already use.

Four invariants:

- **The recipient is never in the request.** The teacher of record is a
  configured key in `config/orgs/nwsa.json` resolved against the `directors`
  collection and `staffMdcContacts`, which already knows
  `brent.mounger@mdc.edu`. A typed address in a queue doc is a roster of
  student grades addressed anywhere, sent as the school.
- **The function sends what the director read**, not a recompute. A report that
  changes between the review and the send is not a report.
- **Once, ever.** Mail doc id is the queue doc id and it is `create()`d.
  Cloud Functions deliver at least once.
- **Nothing is sent without a press.** Same rule as the lesson-log family
  email, for stronger reasons.

### The cadence, and the thing that actually fails

"Every half quarter" cannot be a button you remember. A button on eight dates a
year is a button that gets missed in February. But a scheduled job that mails
grades on its own is worse than missing one, because grades go out that nobody
read.

So the schedule nags and the person sends. A cron reads `gradingPeriods`,
counts what is unmarked, and drops a `staffNotices` doc, which the Today view
already surfaces per director and each person dismisses for themselves:

> Quarter 1 interim is due Friday. Camerata: 11 students have no
> Professionalism mark. Symphony: ready.

The nag starts a week out, is specific about what is missing, and knows the
difference between "nothing has happened yet" and "you have not graded this".

---

## Invariants to pin, and where

One self-check file per module, added to `.github/actions/self-checks`, which
is the one list both the deploy and the pull-request workflow run.

`gradingPeriods.selfcheck.ts`
- A report covers the quarter to date, never the half quarter alone.
- Outside every period, the most recent started one answers.
- No periods configured returns null, and never throws.

`ensembleGrades.selfcheck.ts`
- An unscored category leaves the average, numerator and denominator both.
- A blank is never a zero, at every level.
- A lesson pull-out is not an absence, and a school-day tardy is not a mark.
- The denominator is meetings with a roll receipt, not events on the calendar.
- Below the coverage floor, no percent is produced.
- Concert counting agrees with `tallyScans()` exactly.

`gradingPlan.selfcheck.ts`
- Absent plan falls back to the org default; empty plan stays empty.
- Weights, category ids and band tables validate the way `rubricProblem` does.

`gradeReportSend.selfcheck.ts`, run in `deploy-functions.yml` before any
credential is written, as `lessonLogMail.selfcheck.ts` already is
- The recipient never comes from the queue doc.
- A queue doc naming a report outside the sender's `assignedEnsembleIds` is
  refused.
- A report already sent is refused.
- The mail doc id is the queue doc id.

---

## Phases, ordered by risk

**Phase 0. The calendar and the plan. Nothing visible.**
`gradingPeriods` in org config, `src/shared/gradingPeriods.ts`, the
`GradeCategory` types, the default NWSA plan, two self-checks. Ships behind no
UI and no new write rules.

**Phase 1. The arithmetic, and the falsification.**
`src/shared/ensembleGrades.ts` plus a read-only Gradebook preview over the 60
points that already exist. Run last quarter through it and put it beside the
workbook. **This is the phase that can kill the project, so it comes before the
typing.** If the numbers disagree, the disagreement is the actual
specification and everything after it is cheaper for knowing.

**Phase 2. The 40 points.**
The marks screen: roster down the side, a column per manual category, carry
forward from the last period, band tables producing effort and conduct. Rules,
query and screen land together, with the query scoped to match the rule.

**Phase 3. The report.**
The archive doc, the tables on screen, copy to clipboard, CSV, print. Fully
usable at this point, by hand, with no email at all: the director copies and
pastes. Worth shipping here and living with for a cycle.

**Phase 4. The send.**
Queue, Cloud Function, the cron nag through `staffNotices`.

**Phase 5, only if it is actually needed. The division applied roll-up.**
See the open question below.

Each phase that changes anything staff or students see updates
`src/shared/whatsNew.ts` in the same commit.

---

## What I could not answer from the repo

**1. The syllabus itself.** I have a six-category weighting from an earlier
conversation (Attendance 30, Performance 20, Performance Attendance 15, Playing
Exams 15, Prep 10, Professionalism 10) and no document behind it. The whole
design treats those weights as data, so nothing is blocked, but the default
plan should be typed from the actual syllabus, per course. AP Theory and
Camerata do not share one.

**2. What an excused absence costs.** Needs to be in writing before the
attendance category has a number in it.

**3. Effort and conduct scales, per section.** What the codes are, what bands
produce them, and whether the teacher of record wants them derived or typed.

**4. Is Brent the teacher of record entering these into the district
gradebook, and for which sections?** The design assumes so and resolves him
through config rather than naming him in code, so a wrong assumption costs one
config edit. But the three table layouts follow from which district sections
these are, and that is worth confirming before the layouts get built.

**5. Applied lessons across teachers.** `useLessons` issues
`where('teacherEmail', '==', email)` and the rules match it, so a director
compiling a division-wide applied table cannot read another teacher's lessons.
That is the privacy model working, not a bug. Three ways out: the report covers
the runner's own studio only (simplest, ships now); each applied teacher
presses Send for their own studio and the function merges them into one
period report (rule-preserving, more machinery); or a Cloud Function reads
every studio with the Admin SDK (a real widening, and the kind of back door
this repo has deliberately refused elsewhere). I would ship the first and build
the second only when someone asks for the division sheet.

**6. Do students ever see this?** `assignmentResults` has no public projection
and is not getting one by accident. A student seeing their own breakdown would
be a new mirror with its own pinned allowlist and its own decision, never a
loosened read rule. Out of scope here, and worth deciding deliberately, because
the answer changes what the marks screen is for.


---

## What changed once the real documents arrived

Written the same evening, after the four Fall 2026 syllabi, the district's
comment-code list, Brent's standing request email and the Excel workbook all
turned up. Four corrections, and they are the reason this section exists
rather than the plan above being treated as finished.

### The weights were wrong in the plan above, and right in the workbook

Camerata and MUN 1210 Symphony carry the SAME five categories, verbatim:
Attendance & Punctuality 30, Preparation & Participation 25, Performance 20,
Required Performance Attendance 15, Professionalism 10. There is no Playing
Exams category at all. Both syllabi put exams inside Preparation: "your
development will be monitored through rehearsal performance, playing exams,
and conductor observation."

The workbook had already resolved this, on the director's own instruction, by
carving 15 points out of Preparation into a Playing Exams line, leaving Prep
at 10. That is what shipped, because it is what the director decided and
because it is what makes "use the exam grades the app already has" mean
anything. The syllabus split is one config edit away if it should read the
other way.

The two college classes are a different shape entirely and are NOT built yet:
String Pedagogy is six weighted assessments with expected counts and a
drop-the-lowest rule, Music History is 40/40/20 with the same rule. **Expected
count** and **drop lowest N** are real requirements that no category in this
design carries. They are the college phase's first job.

### The Hub does not grade attendance. The director does.

The director's call: an excused absence costs nothing and is a record only; an
unexcused absence or lateness informs the Preparation mark, and by how much is
a judgement made with the counts in view.

That deletes the whole `MarkCost` deduction table proposed above, and it is a
better answer than the one I argued for. Roll here is exception-only, so a
computed rate would have rested on a denominator the director never knew they
were creating. What shipped instead: every category is a typed number, with
the Hub's records printed on the same line, and two categories (Playing Exams,
Required Performance Attendance) arriving with a computed suggestion in grey
because those are countable rather than observed.

The attendance module still exists and still matters. It just feeds a person
rather than a formula, and it keeps every bucket apart (unexcused, excused,
late, late excused, lesson pull-out) precisely because the director grades
them differently.

### The grading calendar was half in the Hub already

`src/director/seedCalendar.ts` has carried the MDCPS grading-period boundaries
since the season was seeded, and they are correct: Q1 Aug 13 to Oct 16, Q2 Oct
19 to Jan 14, Q3 Jan 19 to Mar 19, Q4 Mar 30 to Jun 3. What is nowhere in the
Hub, or in the district's published calendar, is an INTERIM date. The workbook
derived its four by taking the one confirmed deadline (Brent's Q4 email, Wed
May 6) as 60% through that quarter's school days and applying the same
fraction to the others.

That model gives Sep 22 for Q1. The real Q1 interim is Sep 15. So the model is
wrong, and the file now says so: `interim` is a published date where one is
known (Q1 and Q4), flagged `interimEstimated` where it is not (Q2 and Q3), and
the screen prints the warning rather than letting an estimate pass as a
deadline. `defaultCutoff` never invents one.

Two calendar facts worth a look, both unresolved: `ORG.terms` says Fall 2026
starts **Aug 17**, while MDCPS started Aug 13 and MDC starts Aug 24, and that
field is what concert tallies count against. And the Camerata and Symphony
syllabi both run 08/24 to 12/11, the MDC term, while the students on them are
graded on the MDCPS quarters.

### Concert credit, for the night the check-out failed

The first faculty concert took arrivals and then the station failed at the
door on the way out. `tallyScans()` credits a concert only when both scans
exist, so every one of those students reads as having attended nothing.

`checkin.entryOnly` on the event fixes it, and the rule lives in ONE place,
`scansCredited()` in `concertCheckin.ts`, called by the director's board, by
the Gradebook evidence, and by the Cloud Function behind the student's own
"2 of 3". If those two ever disagree, the student is the one holding the wrong
number. It is per concert and deliberately has no site default: a default
would quietly retire the check-out everywhere, which is the opposite of what
it is for.

### What shipped

- `src/shared/gradingPeriods.ts`: the calendar, and the rule that an interim
  covers the quarter TO DATE rather than the weeks since the last one.
- `src/shared/ensembleGrades.ts`: the arithmetic, the fail-closed readers,
  the coverage floor, the evidence tallies, and the district's comment rules.
- `src/shared/interimReport.ts`: the three tables, alphabetical by surname,
  with each section's own column headings, as HTML that survives a paste into
  Outlook.
- `src/director/grades/GradebookView.tsx`: the screen.
- `gradeMarks` in `firestore.rules`: staff-only, key fields pinned to the doc
  id, no public projection and not getting one.
- Three self-checks in the shared CI action.

### Still open

- Q2 and Q3 interim dates.
- The two college classes: expected counts and drop-the-lowest.
- Whether the report should SEND rather than be pasted. Everything above is
  built for it, `interimReport.ts` is pure and runs in the Functions bundle,
  but nothing sends yet, and the send is where the rules in "The send" above
  become load-bearing rather than theoretical.
