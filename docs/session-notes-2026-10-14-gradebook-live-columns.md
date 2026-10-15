# Session record: the Gradebook the night Quarter 1 grades were due

**14 October 2026.** The director opened the Gradebook to turn in complete
Quarter 1 grades (not an interim) and could not make it do what a grade sheet
has to do. Five complaints, in his words, over the course of the evening:

1. "At an exam" / "at a concert" **does not show the Symphony exam number 2**,
   and does not show **the extra concerts students were required to attend**.
2. The final grade "should be cumulative for everything from the interim, plus
   more grades."
3. "I should be able to **add columns at will** … from things graded inside the
   hub or otherwise … like a spreadsheet, but one that's much better because
   it's inside the hub."
4. "I don't have a way of **averaging the current lesson grades with the grades
   inputted since then. It should be continuously updating since it's all the
   same grades.**"
5. "Any concerts that are required for the Symphony members should show up as a
   required concert, just like the College Chamber Orchestra concert … I should
   be able to add things I deem necessary as affecting the grade (**like when
   people act out in class or have phones in class**)" — and then, "I'm confused"
   about how **Required Performance Attendance and the concert columns beside it
   relate**.

Invariants live in CLAUDE.md (#gradebook); the original design argument is
`docs/superpowers/specs/2026-09-14-gradebook-design.md`.

---

## What was actually wrong (read from the live data, not guessed)

The calendar and assignments are world-readable, so the diagnosis came from the
live project, not from a screenshot.

**The concerts.** The "+ Add a concert" menu offered only events with
`concertAttendance === 'required'`. In Quarter 1 the live calendar has six
concerts the Symphony plays or must attend:

| Date | Concert | Marked | Symphony is |
|---|---|---|---|
| Aug 31 | NWSA Music Faculty Recital | Required | audience |
| Sep 28 | NWSA Pops Concert | — | performing |
| Sep 29 | College Chamber Orchestra Concert | Required | audience (seniors excused) |
| Oct 3 | Festival I — The Nutcracker Project | — | performing (roll taken) |
| Oct 4 | Freedom Tower Concert | — | performing (roll taken) |
| Oct 6 | Midnight Ball | — | performing (no roll) |

Only the two audience concerts are marked Required, so only those two were on
any list. The four the Symphony PLAYS in were on none, and nothing on the screen
said why. `concert-roll-shipped` had recorded exactly this as a still-open item
("performing concerts not yet flagged Required"); it needed a code answer, not
four calendar edits and a hope.

**The exam.** Symphony Playing Exam #2 exists (`symphony-playing-exam-2`, type
Playing Exam, due Sep 23, group `symphony-orchestra`) and is inside the quarter,
so the code lists it. The live data cannot say whether it is graded in the Hub
(`assignmentResults` is staff-only). Whatever the screen showed him, the fix is
the same: every exam of the quarter is listed with "N of M graded", a score the
Hub cannot read as a whole 0–100 is counted and named ("2 unreadable"), and a
typed column covers anything graded elsewhere.

**Why the final was not cumulative.** The Gradebook keys marks by PERIOD, so an
interim's numbers are already there at the end of the quarter. What broke it was
that "Fill" and "+ Add" COPIED the Hub's number into the box. A copy is a
snapshot: lesson grades logged after the interim never reached it, and an exam
regraded after being added as a column never moved. Once a box held a number
the live suggestion was not even visible (it was only ever the placeholder of an
empty box).

**Why "required performance attendance" and the concert columns confused him.**
They were drawn as unrelated headings. The box was in fact the average of the
columns beside it, but nothing said so.

---

## What changed

- **A box follows the Hub until a director types over it.** Exams, concerts and
  the applied lesson average are live; a typed number overrides (slanted grey =
  the Hub's own, plain = typed). `↺` hands one box back, and "Follow the Hub" /
  "Use the average" does a whole category — which is also how the interim's
  stale snapshots are released in one click.
- **Every concert and exam of the quarter is offered**, grouped (the group plays
  / required in the audience / other), with a one-click "All N". A concert the
  group plays in counts as required of that group unless it is marked Optional;
  an audience concert still needs Required (the door check-in is its only
  evidence). Calendar flags were deliberately NOT edited.
- **Columns at will:** a grade of one's own (averaged into its box) and an
  incident column (a phone out, acting out) where each one takes N points off
  its box. Counts are entered with +1 beside each student. An incident never
  creates a score.
- **Each box says what it is made of** ("= average of the 2 columns on its
  right"), and a "What is counting toward each box" panel lists the exams and
  concerts behind it and what is NOT counting yet, with a button to add them.
- **The screen and the district email read one model.** The email used to be
  built from typed numbers only, so a number that was only ever a grey suggestion
  never reached it.

Code: `src/director/grades/gradeTable.ts` (all arithmetic, pure),
`AddColumnBar.tsx`, `GradebookView.tsx`; `ensembleGrades.ts` gained
`categoryResult`, the column-key grammar, `concertRole` / `concertRequiredOf` /
`concertScore`. No new collection and **no rules change**: columns live in the
open `gradeMarks.scores` map (`x:<cat>:<label>`, `d:<cat>:<points>:<label>`).

## How it was checked

- `ensembleGrades.selfcheck.ts` and the new `gradeTable.selfcheck.ts` (both in
  the self-checks action); the full local replica of that action, 73 of 73.
- The real Q1 calendar and assignments run through `buildTable`: Orchestra counts
  all six concerts and both exams; Camerata counts the recital and the CCO
  concert and Exam #1.
- Real writes against the Firestore emulator with this repo's `firestore.rules`
  enforced: add a column for a roster in one batch, type, clear (a literal null,
  the key stays), `deleteField` on a box, Remove, follow-the-Hub, and the three
  things the rules must still refuse (an extra top-level field, a non-staff
  writer, a doc id that disagrees with its fields).
- A browser pass over sample data at desktop and phone width: the add bar, the
  counting panel, grouped columns, the penalty chip, and the email tables matching
  the screen. Three grades were also recomputed by hand against the weights.
- Not exercised: a real staff session writing real marks, and the applied table
  (the fixtures have no applied studio).

## Still open

- **Pops (Sep 28) and Midnight Ball (Oct 6) have no roll receipt**, so every
  Symphony performer reads as credited 100 for them. Festival I and Freedom Tower
  had roll taken, so an absence there costs. If someone missed Pops or the Ball,
  type their number in that concert's column.
- Whether Symphony Playing Exam #2 is graded in the Hub is unknown from public
  data. The "What is counting" panel and the exam picker say so per exam.
- A column cannot be renamed or reordered (remove and re-add). The two college
  classes' drop-the-lowest rule is still unbuilt.
- The four Symphony concerts are still not marked Required on the calendar. The
  Gradebook no longer depends on it; marking them would additionally show the
  "Required concert" badge to students, which is the director's call.
