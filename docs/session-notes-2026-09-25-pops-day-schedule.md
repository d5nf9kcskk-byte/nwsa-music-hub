# Session note: 2026-09-25, Pops Day (Mon Sept 28) and why it took a script

The director's request, verbatim:

> POPs day schedule
>
> WE and Symphony 1:10-2:25
> Choir and WE 2:30-3:45
> All 3:45-5:30
> College released at 2:25, back at 3:45
>
> Call time 6:30
>
> - Richard Weichman is asking to not have his class canceled. That's why we
>   are releasing the college students at 2:30.
> - The orchestra will stay with me in Chapman while wind ensemble and choir
>   have their time on the stage at Chapman.
> - At 3:45, when the college students come back, we will all be combined for
>   the final time and release everyone at 5:30.

Followed by: concert runs 2 hours, pickup 9:15, and "ALL are responsible for
striking the performance area, and NO ONE will be released until all equipment
is taken care of." Cancel the director's own lessons that day. A pinned urgent
banner for the whole division, expiring after Monday. No email.

"Richard Weichman" is **Richard Fleischman** in the Hub (`conductorName` on
`class-college-music-1900`, Music from 1900–1945, Mon/Wed 2:30 in Room 4302).
It was voice dictation. His class was already Scheduled and stays that way.

## What was live before

The director had already tried this in the app on 9/24 and said it was too
complicated to finish. What the app had let them build was ONE block,
`reh-2026-09-28-high-school-choir-1430`, 1:10–5:30 in Chapman, with Choir, WE
and Symphony on it. The WE 1:10 block had been combined INTO the choir's block,
and Symphony had been added to it. Its note said "Everyone is called at that
moment [1:10]." So the choir was told to arrive at 1:10, Symphony never left
the stage, and nobody could see the college release.

That is the Combine button doing exactly what it does: it merges whole blocks
into one. The day the director actually had in mind is staggered, with
different groups on stage at different times and a subset leaving and coming
back. Combine has no way to say that.

## What was written

| Doc | Now | Undo |
|---|---|---|
| `reh-2026-09-28-wind-ensemble-1310` | re-created under its ORIGINAL id, 1:10–2:25, WE + Symphony, Chapman | `changeFrom` = normal Monday (13:10–14:25, Room 4302, WE only) |
| `reh-2026-09-28-high-school-choir-1430` | 2:30–3:45, Choir + WE, Chapman | `changeFrom` = normal Monday (14:25–15:45, Room 4204, Choir only). The stale `absorbed` copy of WE was dropped, since WE is its own doc again |
| `reh-2026-09-28-symphony-orchestra-1430` | NEW, 2:30–3:45, Symphony with Dr. Gilman, off stage | none. "Back to normal" leaves it standing |
| `reh-2026-09-28-pops-combined-1545` | NEW, 3:45–5:30, all three | none, same |
| `oc26-hs-pops` | call 6:30, 7:00–9:00, pickup 9:15, strike line appended to notes | |
| Dr. Gilman's two lessons that day | Cancelled, source + `lessonsPublic` in one batch, NO `changeFrom` (his own cancel, not a day plan) | |
| announcement `kTql65vteo7dZredCAws` | urgent, pinned, school-wide, `expiresOn` 2026-09-28 | |

Every block's `notes` carries the whole day and the college release. The
app's own `planDayChange({kind:'backToNormal'})` + `applyPlan` was run on the
result: it restores WE and Choir to exactly a normal Monday (checked against
Oct 5).

How it got there: `scripts/pops-dress-2026-09-28.mjs` + the *Pops dress day
(Sep 28)* workflow, run by a push to `.github/triggers/pops-dress-2026-09-28`
(PRs #182, #183). The script previews with no credentials (`events` and
`lessonsPublic` are world reads), refuses after the date, on a rolled block, or
if another rehearsal for these groups has appeared, and is idempotent. The
banner came from *Post Announcement*, and its body was later edited with
*Fix One Field* (`set-doc-field.mjs` on `announcements.body`). The script,
workflow and trigger are inert after Sept 28 and can be deleted.

## Left as is, on purpose

- **MIDI Electronic Music 1** (Albornoz, 2:30) and **Vocal Lit** (1:10) stay
  cancelled. The director cancelled them on 9/24. I asked whether either
  should meet now that college students are free at 2:25 and the choir isn't
  called until 2:30. No answer, so they stay as the director left them.
- **College Symphony students are still on the 2:30 Symphony roll list.** Only
  the notes say they're gone. Taking them off means per-student pull-outs in
  the app, which is student-by-student roster data and does not go through a
  script from this public repo (#student-data).
- **An urgent post made through Actions skips the Teams/email relay** that an
  urgent post from the app queues (`queueUrgentRelay`). The director said no
  email, since that process doesn't exist yet.

## What this day showed the app can't do (input for "make this simpler")

Everything below took a script, and the director could not have done it with
the buttons:

1. **Split one block into time segments.** Combine only merges.
2. **Stagger groups.** Two groups in the same building doing different things
   at the same time (WE + Choir on stage, Symphony off stage) only works as
   separate events built by hand.
3. **Release a subset partway through** (college students 2:25–3:45). The only
   ways to say it are free text or per-student pull-outs.
4. **Add a block for a group that has none that day** (Symphony on a Monday).
   Revert can't remove an added block, so "Back to normal" is only half an
   undo on a day like this.
5. **The concert's day sheet** (call, end, pickup, strike) lives on a
   different screen from the rehearsal plan for the same day.
6. **The director's own lessons** colliding with the new plan were never
   flagged. Their cancel is a separate trip to My Lessons.
7. **One banner for the day** is a separate post and has to be kept in sync
   by hand. It was edited twice here.

What the director gave was a rundown: times, who, where, one line of
exceptions. That rundown is what an easy version of this should take in.
