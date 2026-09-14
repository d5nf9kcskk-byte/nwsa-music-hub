# Session record: the Gradebook, built the night before a Q1 interim

**14 September 2026.** Started as "reformulate a spec", finished with the
feature live, three pull requests merged, two real bugs caught, and one
correction from the director that improved the design.

Shipped in [#169](https://github.com/d5nf9kcskk-byte/nwsa-music-hub/pull/169),
[#171](https://github.com/d5nf9kcskk-byte/nwsa-music-hub/pull/171) and
[#173](https://github.com/d5nf9kcskk-byte/nwsa-music-hub/pull/173).
Invariants live in CLAUDE.md (#gradebook); the design argument is in
`docs/superpowers/specs/2026-09-14-gradebook-design.md`.

---

## What it does

Pick a quarter and whether it is the interim or the end of it. Every student on
that section comes up with what the Hub already knows on the same line:
unexcused absences, excused absences, lateness, rehearsals that actually took
roll, playing exam scores, required concerts credited. Type the six category
scores, pick effort and conduct, add any comment codes the district requires.
Press Build the email and the three tables come out in the layouts the teacher
of record expects, ready to paste into Outlook with their borders and header
colours intact.

---

## The design changed twice, both times for the better

**The Hub does not grade attendance.** The first design computed an attendance
score from a deduction table. The director's call was simpler and truer to how
the work is actually done: an excused absence costs nothing and is a record
only; an unexcused absence or lateness informs the Preparation mark, and by
how much is a judgement. That deleted an entire subsystem and left the Hub
doing what it is good at, which is putting the evidence on one line.

It is also the honest shape. Roll here is exception-only. There is no Present
record, so a rate would have rested on a denominator nobody knew they were
creating.

**Fill at full marks came later the same evening**, after the screen existed
and the director used it. Every column now fills, the four observed categories
at 100 with adjustment downward, which is the same exception-only idiom as
taking roll. The cost is stated on screen rather than hidden: once a column is
filled, a student nobody looked at reads the same as one who was considered and
left at 100. That was a deliberate trade, not an oversight.

---

## Two bugs the live data caught that the schema could not

Roughly half the Hub is world-readable by design, because the public student
site has to read it. That means the public projections can be read with no
credential at all, which is what `scripts/generate-feeds.mjs` already does.
Using it to check the work found both of these.

**The report had the wrong names in it.** The name helpers assumed
`First Last`. The roster stores 120 of its 142 active students as
`Rose, William F.` and 22 as `Vincent T. Blades`, and **every student on the
two district tables is in the comma form**. So the Last Name column was
printing the middle initial (`Beyra, Benjamin A.` → `A.`) and the tables sorted
by it. Alphabetical order is requirement number one on the standing request.

This would have gone to the district unnoticed. No test failed, nothing threw,
and the tables looked plausible.

**The interim dates were invented.** An earlier pass stored a "due" date
derived by treating one teacher-of-record request as the 60% point of its
quarter and applying the same fraction to the others. The district publishes no
interim date for any quarter. The model gave Sep 22 for Q1 and the real ask was
a week earlier. Nothing stores one now.

That correction came from the director, who drew the distinction precisely:
being asked for the numbers by a given morning is not a district deadline.

**In place of the invented dates**, each quarter carries the district's own
printed school-day count and the self-check proves the configured boundaries
plus `MDCPS_NO_SCHOOL` reproduce them: 45 / 46 / 42 / 47, totalling 180. That
only passes if the boundaries **and** every no-school day are right.

It found a missing day (June 4, the planning day after the last day of school),
and adding it then broke a different pinned check: `lessonSchedule.selfcheck`
probed its 120-week cap from a hardcoded date chosen to sit after the last
closure, June 4 is a Friday, and the probe used a Friday slot. The probe start
is derived from the set now. Worth recording because the day-count test could
not have caught it: June 4 falls outside every quarter.

---

## Other things checked against live data

| | Camerata | Symphony |
|---|---|---|
| Active roster | 34 | 79 |
| High school | 34 | 63 |
| College | 0 | 16 |
| Rehearsals with roll taken, Aug 13 to Sep 14 | 12 | 14 |
| Events on the calendar in that window | 18 | 19 |
| Playing exams due in the window | 1 | 1 |

Two things fell out of that and both are grading facts rather than code facts.
**Playing Exams, 15% of the grade, rests on a single exam per ensemble.** And
**Required Performance Attendance, another 15%, rests on one concert**, the
NWSA Music Faculty Recital on Aug 31. The next required concert is Sep 29,
after the interim.

---

## The recital, and where the line is

The check-out station failed at the door on the night of Aug 31, so every
student who scanned in read as having attended nothing. `checkin.entryOnly`
credits that concert on the arrival scan alone, and `scansCredited()` is the
one function the director's board, the grade evidence and the student's own
tally all call.

Applying it needed admin credentials, so it went the way this repo already does
admin writes: a committed list carrying the reason, applied by a workflow using
a secret that never reaches the session. Verified afterwards by reading the
event back out of Firestore, where `entryOnly: true` sits beside every other
check-in setting, untouched, because the script writes one field by dotted path
rather than replacing the block.

**A roster write is not the same kind of thing, and the same route is wrong for
it.** This repo is public. A committed list would put "this student withdrew"
into git permanently, which the project already had to purge history for once,
and workflow inputs land in an Actions log that is equally public. A doc id is
not anonymous either, since anyone can map it to a name through
`studentsPublic`.

So when the director asked for a student to be archived directly, the answer
was the app, with an offer to verify afterwards from data that is already
world-readable. That verification confirmed status Inactive on both the source
and the mirror, and the two interim tables dropping from 34 and 63 to 33 and
62. This is now a CLAUDE.md rule rather than a judgement call made once.

---

## Still open

- **Q2 and Q3 have no interim date and never will have a stored one.** Each
  period's ask arrives by email and the cutoff box is where it goes.
- **The two college classes are not built.** String Pedagogy is six weighted
  assessments with expected counts and a drop-the-lowest rule; Music History is
  40/40/20 with the same rule. Neither shape exists here. Canvas has never been
  used, so the Hub is the gradebook for them too, eventually.
- **Nothing sends.** The report is pasted. Everything is built for a send,
  `interimReport.ts` is pure and runs in the Functions bundle, but the rules
  that would make it safe (the recipient never in the request, the function
  mailing what the director read, once) are written down and not yet exercised.
- **Two loose ends on the withdrawn student**, neither of which archiving
  handles: he is still seated on two published Camerata charts, and if a viola
  teacher has him on a standing weekly lesson time that recipe keeps generating
  lessons.
- **Grades are an education record.** The first design note raised this and it
  has not been answered: attendance is administrative, grades are not, and
  whatever the current understanding is about the Hub being a personal tool
  rather than an institutional system, this raises the stakes with MDC IT and
  the registrar. Worth a conversation before it reaches other directors.
