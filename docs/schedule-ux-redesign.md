# Schedule-Change UX Redesign

**Status:** plan only — no application code changed.
**Date:** August 2026.
**Scope:** how a director *changes* the schedule. The five screens traced:
`ScheduleView`, `EventForm`, `ScheduleSwapView` ("Schedule Change"),
`ScheduleChangeView` ("Temporary Roster Changes"), `EventRoster`; plus the two
data models they express, `sharedBlock.ts` and `rosterResolver.ts`.
Related but different problem: `docs/ui-redesign-study.md` (app shell).

---

## 1. Why the current design is hard

### 1.1 The concrete failure, traced end to end

Task: *swap two blocks, and have Wind Ensemble and Symphony meet together in
one room for pops.* One intention. The current UI requires **three separate
operations on two screens, ~18 taps, and it ends with a family-facing banner
that is wrong.**

**Leg A — the swap** (menu → Schedule Change): open menu, tap "Schedule
Change", tap the day on the month grid, tap **Swap** on block A, **Swap** on
block B, **Review swap**, **Swap the blocks**. 7 taps. Fine on its own — this
flow is actually good. It stamps `changeFrom` snapshots, a change note, and
posts one red banner: "Block swap Tue: WE now 3:30, SO now 2:00."

**Leg B — the combine** (menu → Calendar): the swap screen cannot merge
blocks, and nothing on it says where merging lives. The director must already
know that "meet together" is a checkbox inside the event editor on a
*different* screen. Menu, "Calendar", tap the day, tap the WE event card,
scroll the ~20-field form, check "Symphony Orchestra", check "They meet
together", retype the room, Save. 8+ taps. This save posts **no banner**,
captures **no `changeFrom`** (EventForm never calls the snapshot machinery),
and hand-typing the "Schedule change note" field is on the director.

**Leg C — the cleanup**: Symphony's own event for that day still exists, now a
duplicate. The director must notice this themselves, open it, and either
Delete (2 taps + losing the record and any revert path) or set Status →
Cancelled (which shows families "Symphony Orchestra — Cancelled", which is
false — Symphony is meeting, in the Auditorium, with Wind Ensemble).

**The wreckage**: the Leg-A banner still says "SO now 2:00 in the Orchestra
Room" — but SO is actually in the Auditorium with WE. No screen owns fixing
it. And revert is shattered three ways: `revertEvent` restores only
time/room/status (never `ensembleIds`/`sharedBlock`, so the combine is
permanent), the deleted SO event is unrecoverable, and Leg B never snapshotted
anything to revert *to*.

### 1.2 The rest of the repertoire, same treatment

| Task | Where | Taps | Verdict |
|---|---|---|---|
| Cancel today's rehearsal + tell families | Schedule Change → day → **Change** → "Cancel this rehearsal" (notify pre-checked) | ~5 | Good — *if* you know cancel lives under the clock-icon "Change" button here, not the Status dropdown on the Calendar's event form (which cancels **silently** and irreversibly — a trap that exists today) |
| Two ensembles trade slots for a day | Schedule Change swap flow | ~7 | Good flow, findable only by prior knowledge of the label |
| Move a block's room for a day | Schedule Change → Change sheet | ~6 | Good |
| Combine several ensembles for a block | EventForm checkbox + manual duplicate cleanup | ~12 | The Leg B/C mess above; no banner, no revert |
| Pull a student for a lesson / lend for a day | Temporary Roster Changes | ~8 + typing | Works, but behind up to **five segmented-control decisions** (mode: by student/by date → kind: Temporary/Lesson/Permanent → change: Sub in/Pull out → destination: Another ensemble/Lesson/Other → when: day/range) to say "Maya has a lesson at 3" |
| Standing rotation (Camerata Mon/Wed, Wind Ens Fri) | **Nowhere.** | ∞ | `RosterOverride.days` + `destEnsembleId` fully support it, `rosterResolver` resolves it, `describeWhen()` displays it, `scripts/rotation-check.mjs` verifies it — and no form can create it. Today it requires a hand-written Firestore doc. |

### 1.3 The concepts a director is forced to learn (and shouldn't)

1. **The data model is the navigation.** "Schedule Change" = mutations of
   `CalendarEvent` docs; "Temporary Roster Changes" = `RosterOverride` docs;
   "Calendar" = `CalendarEvent` editing *without* the change machinery. Three
   doors whose labels are near-synonyms in English ("Schedule Change" vs
   "Temporary Roster Changes") and whose real distinction — which Firestore
   collection gets written — is invisible and irrelevant to the person
   standing in a rehearsal room.
2. **Banner and revert are properties of the door you walked through, not of
   the change.** Cancel via Schedule Change: red banner, revertible. Cancel
   via EventForm's Status dropdown: silent, no snapshot. Same change, opposite
   family-facing outcomes.
3. **Combining is a checkbox plus homework.** `sharedBlock` shipped in the
   data, but "setting one up" means knowing to edit one event, absorb the
   other ensemble, and then hunt down and dispose of the now-duplicate event
   yourself.
4. **The override vocabulary quiz.** Temporary vs Lesson vs Permanent, add vs
   remove, three destinations, day vs range — abstract category words the
   director must map onto their own concrete verbs ("she's with Jazz Friday")
   before the form lets them through.
5. **The cross-links disagree.** EventRoster's footer sends you to "Make
   roster changes" (Temporary Roster Changes); ScheduleSwapView's hint sends
   you to "Take Roll" for students; EventForm sends you nowhere.

---

## 2. The redesign: one door, verbs not nouns

### 2.1 Principle

There is exactly one entry point for "something about the schedule is
different that day," and it speaks the director's verbs — Cancel, Move, Swap,
Combine, Move a student — not the data model's nouns. Every verb, whichever
record it ends up writing, carries the same three guarantees:

- a **change note** (drives the public red banner text),
- **one family banner** per changed day, kept true by whichever operation ran last,
- **revert to normal**, one tap.

The Calendar/EventForm stays what it is good at: *defining* events (title,
repertoire, concert day sheet, pieces). The new screen owns *what's different
about a day*. That split matches director intent ("plan the season" vs "react
to today"), instead of the current split by Firestore collection.

### 2.2 The main screen, concretely

`ScheduleSwapView` is already 80% of this screen. It grows verbs; it does not
get rewritten. Nav label: **"Schedule Changes"** (one item — the "Temporary
Roster Changes" menu entry retires).

```
Schedule Changes                          [Day] [List] [Month]

            ‹   Tuesday, August 25   ›              (Today)

  ┌─────────────────────────────────────────────────────┐
  │ ● Wind Ensemble        2:00–3:20 · Band Room        │
  │                        [Change ▾]  [Revert]         │
  │ ● Symphony Orchestra   3:30–4:50 · Orchestra Room   │
  │                        [Change ▾]                   │
  │ ● Jazz Ensemble        2:00–3:20 · Room 4302        │
  │                        [Change ▾]                   │
  └─────────────────────────────────────────────────────┘

  Ensemble times AND student moves — everything that's
  different about this day starts here.
```

**[Change ▾]** on a block opens one action sheet — the whole vocabulary in
one place, in the director's words:

```
  Wind Ensemble · Tue Aug 25

  Move time or room…            (existing TimeChangeSheet)
  Cancel this rehearsal…        (existing cancel path, notify pre-checked)
  Swap with another block…      (existing pick-two flow; this pre-picks WE)
  Combine with another block…   (NEW — §2.3)
  ────────────────────────────
  Move a student…               (→ this block's roster → existing ChangeForm,
                                 ensemble + date prefilled)
  Revert to normal              (only when changed)
```

"Swap with…" and "Combine with…" enter the existing pick-mode: tap the other
block, get a confirm sheet. No new interaction grammar.

**Student moves** keep the existing `ChangeForm` machinery but are entered by
verb, so the segmented-control quiz disappears — each entry point pre-answers
the categories:

```
  Move a student — Wind Ensemble · Tue Aug 25
  (tap the student, then:)

  Lesson pull-out…              → kind=lesson, ensemble+date set
  Send to another ensemble today…→ kind=temporary, remove, dest=ensemble
  Sub someone in…               → kind=temporary, add
  Out today (trip, excused)…    → kind=temporary, remove, dest=other
  Standing weekly rotation…     → NEW form face over the same
                                  RosterOverride (§2.4)
```

The By-student global picker survives (some changes start from "Maya", not
from a day): it becomes the second tab of this same screen, which is exactly
the current `ScheduleChangeView` student list. Nothing is thrown away.

**Entry points that route here** (one obvious place to start, reachable from
wherever the director already is): the Calendar's day-detail panel gets one
"Change this day…" button; each Rehearsal/Sectional event card's existing
button row gains "Change…" deep-linking here with the date set (the
`DirNavigate` intent plumbing for this already exists); Today view's rehearsal
rows likewise. EventRoster's footer link retargets here and its label changes
from "Make roster changes" to "Move a student".

### 2.3 The Combine flow — the one genuinely new piece

Combine is what makes the pops task one intention, one flow. Note it
**subsumes the swap**: "swap two blocks so WE and SO can rehearse together"
was only ever a workaround for "the combined block meets at one of the two
times." So:

```
  Combine blocks                          Tue Aug 25

  Wind Ensemble  +  Symphony Orchestra  meet together —
  one room, one downbeat. Roll is still taken per ensemble.

  When    (•) 2:00–3:20  (Wind Ensemble's slot)
          ( ) 3:30–4:50  (Symphony's slot)
          ( ) Custom…

  Where   [ Auditorium            ]

  [x] Post an urgent announcement
      "WE + SO combined rehearsal Tue: 2:00 in the Auditorium"

              [Cancel]   [Combine the blocks]
```

The pops task becomes: menu → Schedule Changes → tap day → Change ▾ on WE →
Combine with… → tap SO → pick slot → type room → save. **~8 taps, one screen,
one banner, and the banner is true.**

What the save does (all existing machinery except the snapshot extension,
§4.1): pick WE's event as host → `updateEvent(host, { ensembleIds: union,
sharedBlock: true, startTime/endTime/location: chosen, changeNote,
changeFrom+absorbed snapshot })` → delete the absorbed SO event → post/update
one banner via the existing `announce()` one-banner-per-event logic. The
combined event carries both `ensembleIds`, so it appears in both ensembles'
filtered views and ICS feeds automatically — `calendarView` and the feed
generator already handle multi-ensemble events, and `EventRoster` already
renders the merged "N in the room" list via `mergeSharedRoster`.

**Revert to normal** on the combined block: restore the host from its
snapshot and re-create the absorbed event(s) **under their original doc ids**
(ICS UIDs derive from doc ids — same id, same UID, subscribers see the event
come back instead of a stranger). Delete the banner. One tap undoes the whole
intention, matching what the swap flow already promises.

### 2.4 Standing rotations get a form face

Zero data-model work — `days: number[]` + `destEnsembleId` already exist and
resolve correctly. The rotation entry is a small face over `ChangeForm`:

```
  Standing rotation — Maya Chen

  Base ensemble      [ Camerata            ▾]
  But on             [M] [T] [W] [Th] [F]        (tap weekdays)
  they're with       [ Wind Ensemble       ▾]
  From [Aug 25]  to  [Dec 18]   (defaults: today → end of term)

  Mon/Wed: Camerata · Fri: Wind Ensemble
```

Writes ONE override doc (`action: 'remove'`, `days`, `destEnsembleId`) —
exactly the shape `rosterResolver` and `rotation-check.mjs` already handle,
including the concert exemption (rotations never touch performances). The
student panel's existing `describeWhen()` already displays it.

### 2.5 Close the silent-cancel trap

The root cause of "banner and revert depend on the door" is that snapshot +
banner logic lives inside `ScheduleSwapView` component scope. Extract
`captureOriginal`/`snapshot`/`announce`/`bannersForEvents` into a small shared
module (`src/director/schedule/changeOps.ts`) that both screens call. Then
EventForm's Status → Cancelled runs through the same path: snapshot, change
note, offer-the-banner. One fix at the shared function, both doors behave
identically. (`whatsNew.ts` entry ships in the same commit as each
user-visible phase, per house rule.)

---

## 3. Phasing

**Phase 1 — one door (ships standalone, smallest useful win).**
No data change, no new flows. Retire the "Temporary Roster Changes" menu item;
`ScheduleSwapView` becomes "Schedule Changes" and gains (a) the per-block
**Change ▾** action sheet re-fronting its existing three verbs plus "Move a
student…", which mounts the existing by-date roster → `ChangeForm` (both
already componentized in `ScheduleChangeView` and reusable as-is), and (b) the
By-student tab (the existing student picker, moved). Add the "Change this
day…" entry from the Calendar day panel and Today. The `scheduleChanges` tab
id stays valid for old deep links. Extract `changeOps.ts` and route EventForm's
cancel through it. Exit test: every task in §1.2's table except Combine and
Rotation is completable from one menu item.

**Phase 2 — Combine (depends on Phase 1's action sheet + §4.1 data change).**
The combine sheet, absorb-and-snapshot write, extended revert. Ship with a
guard: if roll has already been taken against an event being absorbed, warn
and keep that event's attendance intact (records also carry
`ensembleId`+`date`, so history survives regardless — §4.2).

**Phase 3 — verb-named student entries + rotation form (depends on Phase 1;
independent of Phase 2).** The five pre-answered entry points over
`ChangeForm`, and the rotation face. Also add a one-line rotation summary to
the student panel ("Mon/Wed: Camerata · Fri: Wind Ensemble" — the data for
`describeWhen` is already loaded).

Each phase is revertible and none touches feeds, slugs, rules, or the
public surface's read set.

---

## 4. Data-model changes and risks

### 4.1 The one real change: `changeFrom` learns to un-combine

Extend the snapshot (additive, optional fields — old docs unaffected):

```ts
changeFrom?: {
  status; startTime?; endTime?; location?;          // existing
  ensembleIds?: string[]; sharedBlock?: boolean;    // NEW — host restore
  absorbed?: Array<{ id: string } & EventSnapshot>; // NEW — deleted events,
}                                                   //   restored under the
                                                    //   SAME doc ids (ICS UID)
```

`revertEvent` grows the corresponding restore arms. `events` writes are
staff-only, so no `firestore.rules` change; nothing here is mirrored publicly.

### 4.2 Risks, honestly

- **Deleting absorbed events.** `AttendanceRecord.eventId` may point at a
  deleted doc. Records also key on `ensembleId`+`date`, so Tracker/Who's-Out
  survive; the Phase-2 guard (warn when attendance exists) covers the rest.
  Overrides with `scope:'event'` on an absorbed event stop applying — the
  combine sheet should list them ("2 pull-outs on Symphony's block — they'll
  carry over/won't apply") before saving. This is the riskiest edge of the
  plan and the reason Combine is its own phase.
- **ICS churn.** An absorbed event vanishing from a feed and the host's
  summary changing is identical to what the manual flow does today; no frozen
  contract moves (view slugs, feed URLs, UIDs all untouched — revert restores
  original doc ids precisely to keep UIDs stable). `scripts/rotation-check.mjs`
  before/after any Phase-2 QA day is the safety net for "did students'
  resolved schedules change?"
- **`ensembleId` keying: untouched.** Roll, attendance, rules, and
  `resolveRoster` all keep keying on `ensembleId`; a combined block is one
  event with N ensemble ids and per-ensemble roll, exactly as `sharedBlock`
  shipped. No rules or query changes anywhere in this plan.
- **Determinism/SW:** UI-only + one optional-field type change; nothing enters
  the build that varies. Standard double-build check after each phase.
- **Banner truth under composition.** Solved structurally for the pops case
  (combine is one operation, one banner). Still possible to compose (swap,
  then move a room) — the existing one-banner-per-event
  update-don't-stack logic already handles that case correctly.

### 4.3 Questions for the director (wrong guesses cost a phase)

1. **Combine reach:** is same-day always the unit, with a recurring combine
   ("every Friday through October") just repeated taps — or is a standing
   combined block real repertoire? (Plan assumes one-day; a standing combine
   would instead be an *event-definition* job for the Calendar.)
2. **Absorbed-ensemble messaging:** default banner text says "combined" —
   should the absorbed ensemble's families *also* see it framed as a room
   change ("SO meets in the Auditorium today, with WE")? The banner is one
   string; happy to word it however families actually read it.
3. **Permanent membership moves:** `ChangeForm`'s "Permanent" kind currently
   lives in the same form as day moves. Keep it here, or does "permanent"
   belong only in Roster? (Plan keeps it — it's built and occasionally handy
   in the same breath as a temporary move.)
4. **Rotation defaults:** is "end of term" the right default end date, and is
   term end a date the app should know per-org (config field) rather than the
   director typing it each time?
