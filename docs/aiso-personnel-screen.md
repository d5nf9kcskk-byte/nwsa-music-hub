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
4. The sheet belongs to the AISO Google account, which is Grant's own. In
   step 5 Grant clicks Connect while signed in as that account, so the sheet's
   installable trigger runs under the AISO account, not anyone's personal one.
   No one needs to grant him edit rights first. (Corrected 2026-11-25: an
   earlier "view-only" finding came from a browser signed in to a different
   Google account.)
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

## Step 3: the Hub writes the sheet

**A registry of tabs, one engine, one adapter per kind** (Grant, 2026-11-25:
"each new tab syncs a new area of the back end"). `sheetLinks/{kind__concertId}`
(`SheetLink` in types.ts) says which tab feeds which part of the Hub:
`spreadsheetId`, `sheetId` (the tab's gid), `kind`, `concertId`, and the
function's status line `sync`. Only a registered tab syncs. A tab is bound by
its gid, never its name or position, so renaming a tab is harmless and moving
to the personnel manager's new tab is a change to one record ("Change tab" on
the Personnel screen: paste the tab's address, which ends in `#gid=`).

`functions/src/sheetPush.ts` is the shared ENGINE: find the tab by gid, read
it, ask the adapter for a plan, let the adapter save what the tab knew first,
send the edits in one batchUpdate, write the status. `ADAPTERS` holds one
kind, `concertRoster` (planner: `sheetPlan.ts`). No other kind is built; Grant
is choosing which areas come next (plan file §8). A new kind is an adapter
plus its name in the `/sheetLinks` rule.

Any write to the paid roster re-plans every registered tab; a registry write
re-plans its own tab, unless it only stamped the status line.

- **Two layouts**, columns found by heading words, never by letter (`fieldOf`,
  the importer's `fieldFor()` approach): section BLOCKS (Sheet1, checked
  against the copy, structure only: headings Part/Seat, Name, Email, Phone,
  Confirmed, Payment, Extra, Paid, Email 1, Category 2, then a header row per
  section with the section in column A and "seated/needed" under Part/Seat),
  or a FLAT table with a Section column. A tab with neither is refused, not
  guessed. Columns with headings the Hub does not know are never written.
- **Hub ID** goes in the first free column after the headings (L), hidden,
  with a warning-only protection. A row carrying one follows the Hub.
- **First meeting**: a row with no Hub ID is matched once, inside its own
  section, by email or name. The sheet fills what the Hub does not hold yet
  (email as typed, phone, seat, said yes), then the ID is written. A row the
  Hub cannot match is never touched.
- Written per player: seat, name (only when it is a different name, not just
  "Last, First" against "First Last"), email, phone, Confirmed (Y), Payment
  (the contract's total in dollars), Paid (the date, once fully paid). Extra,
  Email 1 and Category 2 of an existing row stay the sheet's.
- A player taken off the concert loses their row; a new one gets a row at the
  end of their section's block; a section with no block gets one at the end.
- Paid is not read from the sheet: a Paid cell the Hub has no payment for is
  cleared once its row carries a Hub ID. Step 4 decides what a typed Paid
  means.
- Access: the sheet is shared (Editor) with the functions' service account,
  which takes a spreadsheets-scoped token from the metadata server. The status
  line on the link says what the last pass did, in counts only; nothing
  logs the sheet id or a cell.
- Proof: `functions/src/sheetPlan.selfcheck.ts` (both layouts; "a second pass
  is empty") and `scripts/sheet-push.emulator-proof.mjs` (the real engine
  against the Firestore emulator and a fake two-tab spreadsheet: bound by gid,
  a renamed tab still syncs, the unregistered tab is never touched). Rules
  cases for the registry in `personnel-rules.emulator-check.mjs`.

## Not here, on purpose

The sheet link itself, a players-see-"said yes" change (decision 1 keeps
`memberView` as it is), field-level history, and a grid view (the sheet is
the grid).
