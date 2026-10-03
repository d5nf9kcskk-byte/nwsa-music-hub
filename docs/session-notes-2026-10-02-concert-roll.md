# Session note — 2026-10-02: concerts take roll, and a short door to "excused" (#concert-roll)

Director's ask: "On concert days, there needs to be a way to take attendance. This
is a very important thing, as missing a concert is grounds for failing the
semester. How do we simply apply the roll taking to the concerts also?

Also, I need a simpler way of adjusting the roster specifically for the concert. I
know that I can add entire ensembles in, but then, when there is a change that has
to be made (because of religious reasons, they can't make the concert, or
something like that), that is an excused absence. I need to be able to mark that."

## What was already true

- Take Roll worked for any event — `RollPeriod` is keyed by (date, ensemble,
  eventId) and nothing in it cared what the event was. It skipped concerts in
  exactly one place: the list of periods was filtered by `takesAttendance()`.
- The door check-in (#concert-checkin) records who walked in and out, but it was
  switched on for only a few concerts, mostly ones students attend as AUDIENCE.
  None of the Symphony's concerts the week of this note (Oct 3, 4, 6) had a
  station, and none was marked Required.
- The Gradebook credits anyone who plays on a concert (`concertItemScore`:
  `performs → 100`), because a performer never scans. The consequence the
  director was pointing at: a performer who did not show up left no record in the
  Hub at all, and the Gradebook would have given them full marks.
- "Excused from a concert" already existed (#concert-excusals, shipped Sept 24),
  at the end of a long path — Move a Student → pick the student → "Excused from a
  concert" → a form that requires the whole request pasted in. The ask for a
  "simpler way" was a shorter door to that, not a second mechanism.

## What was built

1. **Concerts on Take Roll.** `takesRoll()` (utils.ts) = `takesAttendance` plus a
   non-cancelled concert, and only the roll list uses it. `takesAttendance` stays
   false for concerts because a standing rotation and a lesson conflict read it,
   and a rotation says nothing about a performance.
2. **`rollTarget()`** so every "Take Roll" button opens the right roll — and the
   Today card for a concert has one, and the "roll was never taken" reminder now
   covers concerts. That reminder used to open TODAY's roll for a roll missed
   yesterday; it carries the date and event id now.
3. **`QuickExcusalSheet`** — reason (Religious / Medical / Family / Other) and an
   optional note, on a concert's roll and on its Roster. It files through the same
   `fileExcusal` hook as the long form.
4. **The Gradebook reads the roll** for a concert marked Required
   (`concertRoll` / `rollEffect` in ensembleGrades.ts), and concert marks are kept
   out of the rehearsal absence counts and the meetings-held denominator.

## Decisions taken, and by whom

- Scope was proposed in chat and approved with "go" (director, 2026-10-02): all
  three parts, including the Gradebook one the director was offered the chance to
  hold back.
- Audience-required groups are NOT on the roll — the door check-in is their tool.
  Adding an individual performer is NOT built — the event's Individual performers
  and "Sub in" already do it. Both were named to the director as left out.

## Not seen working

Everything visible was checked in a browser against the fixture data (the roll for
a concert, the day list, the Excuse sheet from both doors, phone width, a past
concert hiding Excuse, the Gradebook rendering). Fixture mode cannot WRITE, so a
real mark on a concert's roll, a real excusal from the new sheet, and the
Gradebook with real concert marks have been checked only through the pure
functions and their self-checks. They ride the same hooks as the rehearsal roll
and the long excusal form, which are in use — but check the first real concert.

The performing concerts on the live calendar are not marked Required, so the
Gradebook part has nothing to act on until they are (event editor → Concert
attendance → Required).
