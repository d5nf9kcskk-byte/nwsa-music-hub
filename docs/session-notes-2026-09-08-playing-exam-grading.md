# Session notes — playing-exam grading (2026-09-08, PRs #150–#154, #156)

Record of the session that rebuilt playing-exam grading, added the grades CSV,
defaulted the term-shaped screens to the current semester, and eventually found
why the exam video would not play. Written so a future session can reconstruct
what changed and why without replaying the conversation.

The durable invariants from this work already live in `CLAUDE.md` under
`#exam-rubric`, `#current-term` and `#csp`. This file carries what does not
belong there: the order things happened in, the two wrong diagnoses, and what
was deliberately left undone.

## What was asked

In order, over one sitting:

1. Combine the grade sheet's two sections (the roster row that said "Submitted"
   and the separate "Video submissions" list) into one line per student.
2. Grade a playing exam in place while watching the video, with pull-downs per
   criterion, a total the app adds up, and a Confirm that saves it.
3. Then: "Rubric default on MY playing exams only, other directors will want
   their own. Make it changeable based on the exam."
4. A CSV export of the grades, done in a separate session.
5. "All lessons and assignment grading should default to the semester we are
   in, Fall currently. Anywhere this shows should be default the current
   semester."
6. Twice, as a bug report: the video shows a player and will not play.

## What shipped

| PR | What |
|---|---|
| #150 | One row per student, rubric grading in place, per-exam rubric |
| #151 | Grades CSV export (built by a spawned session) |
| #152 | `preload="metadata"` on the grade-row video |
| #153 | CSV: flag a grade filed before a rubric line was added |
| #154 | Lessons, assignments and juries open on the current semester |
| #156 | CSP `media-src`, which is what actually fixed the video |

Also merged, on request and unrelated to this work: #139 and #140, two
docs-only design PRs that had been open since 2026-09-04. They were stacked,
so #140 went into #139's branch first and #139 into `main`.

## The video bug, and two wrong answers before the right one

Worth recording in full, because the same shape will recur.

**Round one.** The reported symptom was that the video showed as not playable
and the director opened the link instead. `preload="none"` was found and
reproduced: the element sits at `readyState` 0 with `duration` NaN, so the
player is a black rectangle reading 0:00 with no total time and no first frame.
Real, fixed in #152, and **not the bug**. It made the player look dead; it was
not what kept it dead.

**Round two.** The report came back. The theory was a stale service worker,
which fit both symptoms at once (the CSV button was also missing) and had a
plausible mechanism: prompt-flow updates mean a new build waits for the user to
tap a refresh toast. The live bundle was checked and did contain every fix,
which seemed to confirm it. Wrong. The director replied that the CSV button
*was* on screen, which was the version indicator offered in the same message,
and the video still failed. That one detail killed the cache theory.

**Round three, the actual cause.** `cspPlugin` in `vite.config.ts` injects a
`<meta http-equiv>` Content-Security-Policy at build time. It had no
`media-src` directive at all. `media-src` does not fall back to `connect-src`;
it falls back to `default-src 'self'`. Storage was listed for `connect-src`, so
**uploading** a playing exam worked and **playing one back** was refused by the
browser before a byte moved. A CSP refusal is not a media error, which is why
there was no "cannot play this format" banner and nothing in the UI to read.

Reproduced in a real browser under the exact live policy:

```
no media-src    readyState=0 networkState=3 err=4
                "Refused to load media ... violates default-src 'self'"
with media-src  readyState=4, plays
```

The same omission one directive up: `img-src` listed `data:` and
`googleusercontent` but not Storage, and `blob:` appeared nowhere. Both were
proven blocked under the live policy and loading under the new one. That had
been silently breaking announcement pictures (the feature #148/#149 was about),
sign-up reference images, attachment thumbnails, and the preview a student sees
of a take they just recorded.

### What to take from it

- **A CSP omission looks exactly like bad wifi from the inside.** Nothing
  throws, no test fails, the feature is simply dead. The file already carried a
  comment saying so, about `connect-src` missing the functions origin three
  hours before a concert, and nobody had added a check.
- `scripts/csp.selfcheck.mjs` now runs in `deploy.yml` **after** the build,
  against `dist/index.html`, since that is the only place the generated policy
  exists. It was verified failing against both halves of this bug before being
  wired in.
- **The version indicator was the useful part of the wrong answer.** Telling
  the director "you are on the new build if you can see the CSV button" is what
  produced the fact that disproved the theory. Offer one of those whenever a
  diagnosis depends on which build someone is running.

## Decisions worth keeping

Most are in `CLAUDE.md`. The ones that are easy to re-argue:

**An unscored line is not a zero.** A partial rubric produces no grade at all
and Confirm stays disabled at "4 of 6 scored". A rubric reading 58 because four
of six boxes are filled is a failing grade nobody gave. Same fail-closed
posture as `lessonGradeValue`.

**A confirmed grade snapshots its own lines.** Re-weighting an exam later can
never rewrite a grade already filed. This is also why the CSV matches rubric
cells **by criterion id, never by position**: two students on one exam can
carry different line sets, and laying the second out by position would file one
student's Rhythm points in another's Musicality column.

**The CSV's earlier-rubric flag fires in both directions** (#153). It first
counted only stored lines that no current column wanted, which catches a
dropped or reweighted line and misses a line *added* after some students were
graded. Those rows came down with a blank cell and no flag, which reads as "you
skipped this one" rather than "this grade predates the line". Deliberately not
`rubricChangedSince()`, which compares positionally and would call an
identical-but-reordered snapshot "earlier".

**The semester comes from org config, not month arithmetic.** NWSA's Fall runs
Aug 17 to Dec 19, so a `>= August` guess is wrong for Aug 1-16, the winter gap,
and all of June and July. The applied-lesson log is the documented exception:
its Fall/Spring `TermRef` is the identity of a stored `lessonLogSheets` key, so
re-deriving it from `ORG.terms` would strand every sheet already written.

**`landingTerm()` fixed a real bug, not just a default.** The lesson log opened
a student on their newest lesson's term, and a standing weekly time generated
in August writes lessons through May, so every student opened in September
landed on the spring sheet: blank jury list, blank signatures, none of this
term's lessons on screen.

## Deliberately not done

- **The lesson log still runs on its own month math.** Correct today, and it
  only diverges from `ORG.terms` in the gaps (Aug 1-16, the week after Dec 19,
  June and July), where the log would say Fall and the rest of the app would
  not. Fixing it properly needs a migration for existing `lessonLogSheets`
  keys, which is why it was not done here.
- **No whole-term grades export.** The CSV is one assignment's sheet. A term
  export is a different report with different columns (a student per row, an
  assignment per column).
- **No student-facing view of a rubric breakdown.** `assignmentResults` is
  staff-only with no public projection. Showing a student their own breakdown
  would be a NEW mirror with its own pinned allowlist, never a loosened read
  rule.
- **HEVC video is untested.** If a specific exam video fails while others play,
  the likely cause is an iPhone recording in a format Chrome cannot decode.
  That needs transcoding at upload and is real work.
- **The update prompt is still a toast that can be missed.** The director ran
  several builds behind for part of this session. A version line and a "check
  for updates" item in the staff menu was offered and not taken up.

## Self-checks added

| File | Pins |
|---|---|
| `src/director/examRubric.selfcheck.ts` | Three states of `Assignment.rubric`, partial rubric saves nothing, a grade snapshots its lines, one rounding |
| `src/director/assignments/assignmentGradesCsv.selfcheck.ts` | Hostile name quoted and formula-neutralised, points under the right column, earlier-rubric rows never misalign, ungraded exports blank |
| `scripts/grade-video.selfcheck.mjs` | Exactly one `<video>` in the grade row, and an explicit `preload="metadata"` |
| `scripts/csp.selfcheck.mjs` | Every directive the app cannot work without, plus the guards that must not erode |
| `concertCheckin.selfcheck.ts`, `lessonLog.selfcheck.ts` | `currentTerm` across every gap; `landingTerm` and its fallback |

Each was verified failing against the bug it describes before being wired into
`deploy.yml`.
