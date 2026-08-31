# Schedule Changes: People Move, Time Moves

**Status:** Phases 4a–4d all shipped.
**Date:** August 2026 (2026-08-29).
**Scope:** supersedes the *navigation and screens* of
`docs/schedule-ux-redesign.md` §2. That doc's data-model decisions (§4 —
`changeFrom`, combine snapshots, revert-by-original-doc-id) remain in force,
as does all of its shipped write machinery.

---

## 0. Where we stood

Phases 1–3 (PRs #79–81) fixed the write layer: cross-roster sync is one
`RosterOverride` doc resolved by `rosterResolver` (nothing to desync), and
every macro change carries snapshot-once / one-true-banner / one-tap-revert
via `changeOps`. What stayed broken was the conceptual model:

- The two tools shared one door — the student flow was a **tab inside** the
  macro screen, and "Move a student…" also hid inside each block's Change
  menu. Micro and macro overlapped on the same screen.
- The student swap was three layers deep (picker → panel → verb drawer →
  form drawer).
- No pre-calculated options — swap meant hand-picking both blocks; a
  colliding move was never resolved by the system.

This redesign is ground-up at the level that was broken (mental model,
navigation, screens) and deliberately conservative at the level that works
(`rosterResolver`, `changeOps`/`changePlan`, banner/ICS contracts,
selfchecks).

## 1. The mental model: two doors, named by who moves

A director never picks a tool by data type. One question decides:
**is a person going somewhere different, or is an ensemble meeting at a
different time?**

| | **Move a Student** (`scheduleChanges`) | **Change a Day** (`scheduleSwap`) |
|---|---|---|
| Mover | a person | an ensemble / the day |
| Examples | Webber with Jazz today; lesson pull-out; out for a trip | swap blocks; combine for pops; cancel; move rooms |
| Character | frictionless, quiet, **staff-facing — no family banner, ever** | deliberate, loud, **family-facing — always bannered, always revertible** |
| Writes | `rosterOverrides` (+ membership for rotations) | `events` via `changeOps` |

Every roster row in the app (Take Roll, Ensemble Hub, Who's Out, event
rosters) is an entry into the student door with the person pre-selected;
every calendar day panel and Today rehearsal row is an entry into the day
door with the date set. Each screen cross-links the other in one quiet line
for mismatched intent.

## 2. Pillar 1 — Move a Student (Phase 4b: the sentence page)

One page, no drawers, no category quiz. The director completes a sentence;
the system fills in everything it already knows:

> **Webber (piano)** is with **[Jazz Ensemble ▾]** instead of
> *Symphony Orchestra* **[today ▾]**.

- The "instead of" is **computed** by `resolveRoster` (shared blocks and
  rotations included), never asked.
- Verbs are chips that mutate the sentence — *With another ensemble* /
  *Lesson pull-out* / *Out (trip, excused)* / *Sub in* — not forms that
  replace it. Same write shapes as today's `VERB_PRESET`s.
- Defaults are the common case: today, single day; a reason is required only
  when the student leaves the building.
- A consequence card states the outcome before save: "Symphony's roll today:
  Webber flagged → Jazz, not marked absent. Jazz's roll: Webber as sub."
- The student's active moves list on the same page, one-tap delete each
  (undo = deleting one doc).
- **New (decision 2026-08-29):** on save, drop an in-app notice for every
  affected director (both the losing and gaining ensemble's), not just the
  roll-time flag.

## 3. Pillar 2 — Change a Day (Phase 4c: the day board)

The screen is shaped like the school's two daily rehearsal periods
(1:10–2:25 and 2:30–3:45, `TIME_BLOCKS`): blocks render in their grid
positions so a swap reads spatially. Tapping a block opens the shipped verb
sheet unchanged.

- **Quick options are enumerated plans, not gestures**, computed per day:
  block-pairs sharing no ensembles are swappable as wholes; co-resident
  blocks are combinable; cancel-the-day; back-to-normal.
- **No shift feature** (decision 2026-08-29): the bell schedule fixes the
  periods; "shift everything an hour" is not a real NWSA verb. Swap,
  combine, cancel, revert are the vocabulary.
- **Displacement is never silent:** moving an ensemble onto an occupied slot
  leads the review sheet with the collision and one-tap resolutions — swap
  with the occupant, combine with the occupant, or overlap anyway
  (legitimate; different rooms).
- **Review shows the whole day** before → after, plus the exact banner text.
  One save, one banner, revert restores the day's chain.
- Engine: extend `changePlan.ts` with a pure
  `planDayChange(dayEvents, action) → { writes, bannerText, guards }`,
  pinned by a selfcheck in the deploy workflow. Committing replays the plan
  through `changeOps`, inheriting the three guarantees. Guards surface
  per-plan: roll already taken on an absorbed block, stranded event-scoped
  overrides, lesson windows falling outside a moved block
  (`lessonConflicts`).

The coupling rule that keeps the pillars independent: student moves key on
**ensemble + date, never clock time** — when a day changes shape, every
student move still applies. The one true cross-pillar interaction (a
lesson's fixed window vs. a moved block) is exactly what the lesson-conflict
guard reports at review time.

## 4. Rotations — their own page (Phase 4d; decision 2026-08-29)

Not all students rotate, so the ones who do get **a single reference point**:
a dedicated Rotations page listing every student with a standing rotation
("Mon/Wed: Camerata · Fri: Wind Ensemble"), each editable and deletable in
place, plus add. It reuses `rotationWrites()` and the existing
member-of-both convention untouched; the sentence page's "Every week…" chip
becomes a link to this page instead of an inline form. Delete = remove the
rotation's override docs (membership stays, per the convention — removing
membership is a Roster decision, not a rotation one).

## 5. Decisions from the director (2026-08-29)

1. **Notify affected directors** of incoming/outgoing student moves via
   in-app notice (Phase 4b). Related but separate workstream, tracked
   outside this redesign: roll reminders — a nudge when a rehearsal starts,
   and another after it ends if roll wasn't taken.
2. **Applied Teachers do not write roster overrides.** Lesson/rehearsal
   overlap is institutional, not an app problem. No rules change.
3. **No shift feature** (see §3).
4. **Rotations get their own page** (see §4).

## 6. Phasing

- **4a — split the doors** *(shipped, this commit)*: two nav items ("Move a
  Student", "Change a Day"); the Students tab leaves `ScheduleSwapView`; the
  block menu's "Move a student…" becomes a deep link carrying date + event;
  cross-links both ways; labels/hints/FAQ updated. Pure navigation — no
  write-path changes.
- **4b — the sentence page** + affected-director notices. Exit test: the
  Webber task in ≤4 interactions, consequence text visible before save.
- **4c — the day board + planner** (`planDayChange` + selfcheck). Exit test:
  full-day swap in 3 taps; no committed plan leaves an unacknowledged
  collision or stranded student move.
- **4d — the Rotations page.**

Each phase updates `whatsNew.ts` in its ship commit; standard double-build
determinism check applies.
