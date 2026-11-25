# AISO Personnel: the concert screen (steps 1 and 2)

Approved by Grant on 2026-11-25 (option A, all six default answers). The plan
and its clickable mockup live outside the repo, in Grant's Hub App plan folder
(`2026-11-25_personnel-sheet-sync.html`). This file is the part of it that is
built here: the screen and the concert link. Steps 3 to 5 (the link to the
personnel manager's Google Sheet) come later and need Grant: the Sheets API
turned on in `aisymphony-hub`, and a copy of the sheet to test on.

Nothing about a real player is in this repo. The sheet's real names, emails
and fees stay in the sheet. Fixtures are invented people.

## The decisions this builds on

1. A player sees only their own fee and paid status. `memberView` is unchanged.
2. "Confirmed: Y" on the sheet is a BOOKING flag: they said yes to the date.
   It is separate from signing the contract, which stays the player's own act.
3. One sheet tab is one concert.
4. Grant connects the sheet once the owner makes him an Editor (step 5).
5. The personnel manager gets the Director role. No new role, no rules change.
6. Taking a player off a concert voids that concert's contract (a draft is
   deleted). They stay on the roster.

## Step 2: the concert link

A concert is a `CalendarEvent` of type Concert. Who plays it is decided by
contracts, through `calledIds()` in `personnelOrder.ts`, the same answer the
service roll already uses. There is no second membership list.

What a concert needs that a contract cannot hold lives in ONE staff-only doc,
`concertPersonnel/{eventId}` (`ConcertPersonnel` in `types.ts`):

- `sections`: `{ name, needed? }[]` in the sheet's order. `needed` is the
  number the personnel manager types after the slash in "Violin 1 · 12/12". The seated number
  is counted, never stored. A section with no `needed` reads "chairs needed
  not set" (the sheet's Flute header has none).
- `saidYes`: personnel ids who said yes to this concert (decision 2).
- the usual `updatedAt` / `updatedBy` / `updatedByRole`.

The doc id must be a real event. Owner/Director only, exact key allowlist, no
public mirror, no member read (the same tier as every #personnel collection).
`scripts/personnel-rules.emulator-check.mjs` asks the real rules for every
field.

A concert with no doc still works: its sections are the sections of the
people it calls, then the rest of the roster's sections, in score order.

## Step 1: the screen

Personnel opens on the next concert. A picker switches concerts, or to the
whole roster.

- **Section cards** in the concert's section order, each with "seated/needed"
  and a fill bar. Rows show seat, name, and three marks: said yes, paid, no
  usable email.
- **Filters**: Everyone, Unpaid, No usable email, Not confirmed, Open chairs.
  On the whole roster: Everyone, No usable email, Sub list, Archived.
- **Add in place**: "+ Add player" under a section opens one row. Name, Tab,
  Email, Tab, Fee, Enter. The player is saved and the row stays open, empty,
  for the next one. A name that is already on the roster, once and only once,
  reuses that person (a sub joining this concert) rather than making a twin.
- **Player card** slides in from the side. Name, section and seat sit at the
  top. Tabs:
  - Info: email, phone, how we pay them, pay handle, said yes, Hub sign-in,
    and "More details" for the rest of the roster record.
  - Pay (staff only; the whole screen is): this concert's fee, the contract's
    extras and status, Mark paid / Undo.
  - Parts: the parts of this concert's pieces that `partIsMine()` gives them.
    Change section or seat and the list changes.
  - History: what the records already say happened (contract drafted, sent,
    signed, countersigned, voided; payments; last roster change).
    Field-by-field history, both sides of a clash, arrives with the sheet
    link (step 4), which is what writes it.
  Every field saves itself on Enter or when focus leaves it. Escape puts the
  old value back.
- Typed values go through the importer's guard (`refusedCell()` in
  `importPlan.ts`): a value shaped like a Social Security or employer id is
  refused and never stored.

The old tools stay: Attendance, Reports, Import, Contract templates, and the
tick-and-email bar (invite to sign in, mark sent).

## Not here, on purpose

The sheet link itself, a players-see-"said yes" change (decision 1 keeps
`memberView` as it is), field-level history, and a grid view (the sheet is
the grid).
