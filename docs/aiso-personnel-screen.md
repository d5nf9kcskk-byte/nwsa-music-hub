# AISO Personnel: the concert screen and the sheet link (steps 1 to 4)

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
- Paid is now read from the sheet too: see step 4.
- Access: the sheet is shared (Editor) with the functions' service account,
  which takes a spreadsheets-scoped token from the metadata server. The status
  line on the link says what the last pass did, in counts only; nothing
  logs the sheet id or a cell.
- Proof: `functions/src/sheetPlan.selfcheck.ts` (both layouts; "a second pass
  is empty") and `scripts/sheet-push.emulator-proof.mjs` (the real engine
  against the Firestore emulator and a fake two-tab spreadsheet: bound by gid,
  a renamed tab still syncs, the unregistered tab is never touched). Rules
  cases for the registry in `personnel-rules.emulator-check.mjs`.

## Step 4: two-way sync, one document shown two ways (2026-11-26)

Grant, 2026-11-26: "an easy two-way sync, one updating the other on all
things, not just a few things, all things, and immediately." Built as below.

### What was wrong first

Linking the test copy said "The Hub cannot open the sheet" because the
**Google Sheets API was switched off** on the `aisymphony-hub` project, so
Google refused every request. The message hid that: it was printed for any
refusal. `sheetsError()` now names the cause: Sheets switched off (with the
link to turn it on), the sheet not shared (with the address to share it
with), no spreadsheet at that link, or too many requests. Google's docs
confirm 1st gen functions honour `?scopes=` on the metadata token, so the
token itself was fine.

### The ways it could be done, and the one chosen

From Google's own docs (Nov 2026):

| Way | How soon | What it sees | What it costs / needs | Verdict |
|---|---|---|---|---|
| Apps Script in the workbook, installable `onEdit` + `onChange` triggers, ringing a Hub function | seconds | typing and pastes (`onEdit`); rows and columns added or removed, sorts, new tabs (`onChange`: EDIT, INSERT_ROW, REMOVE_ROW, INSERT_COLUMN, REMOVE_COLUMN, INSERT_GRID, REMOVE_GRID, FORMAT, OTHER). NOT edits made by the API or another script ("Script executions and API requests don't cause triggers to run") | free; a gmail account gets 90 min of trigger time and 20,000 URL calls a day, 20 triggers per script. Paste once, press Connect once | **chosen** |
| Drive `files.watch` push notifications | not documented | only "the file changed": an empty body, no cells | a channel lasts one day at most, so a renewal job | no: no faster, more parts |
| Apps Script writing Firestore itself over REST | seconds | same as above | Hub credentials or rules for the script; the merge logic written twice, in two languages | no |
| Polling the sheet | as often as you poll | everything | Sheets allows 60 reads a minute per account | only as a 5-minute safety net |
| AppSheet / Connected Sheets | | | AppSheet has no Firestore connector; Connected Sheets is BigQuery only, read-only | not possible |

### How it works

- **A pass compares state, not events.** Every pass reads the tab, the Hub,
  and `base`: what both sides held after the last pass (`sheetState/{linkId}`,
  matched by no rule, so server only). For each cell, whichever side moved
  away from `base` made the edit; the other side is updated. So it does not
  matter what woke the pass or whether a doorbell was missed: the next pass
  sees every difference. Planner: `planSheetSync()` in `sheetPlan.ts`.
- **What wakes a pass**: any Hub write to the paid roster (the existing
  triggers), and the workbook's doorbell. The script
  (`docs/aiso-sheet-sync.gs`) posts to `sheetEdited` on every edit, paste,
  row insert or delete, and once every five minutes. It sends no cell values:
  only which workbook and tab, and the Hub ids on the edited rows (for
  clashes). The function re-reads the real sheet. The caller must be a
  verified Owner or Director (its Google token, checked with Google).
- **No echo.** The Hub's writes to the sheet go through the Sheets API, which
  never fires the workbook's triggers. The sheet's writes to the Hub do fire
  the Firestore triggers, so a pass records the commit time of each document
  it wrote and the trigger for exactly that write is skipped. Even an
  unskipped echo plans nothing, since both sides already agree.
- **Rows** are tied by the hidden Hub ID column. Moving a row inside its
  section changes nothing; moving it into another section's block changes
  their section.
- **Every synced column goes both ways**: Seat, Name, Email, Phone,
  Confirmed (said yes), Payment (this concert's fee), Paid, the section, and
  the "/needed" in a section's header row. Typing a date (or anything) in Paid
  records a payment of what is still owed on that date (today when it is not
  a date); clearing it deletes that concert's payments for that player.
- **A row typed into the tab** is a player on the concert: someone on the
  roster with exactly that name joins (a sub), anyone else is a new roster
  player; either way with a Draft contract for this concert at the typed fee.
  A copied row gets its own Hub ID. A new section block becomes a section.
- **A row deleted from the tab** takes that player off the concert (a draft
  is deleted, anything else voided), never off the roster (decision 6).

### In the workbook: Connect this tab, and the Hub tab (2026-11-26)

Grant's "Step 4 in the sheet" (below, Tab-per-area decisions), built:

- **AISO Hub → Connect this tab…** opens a small window on the tab you are
  looking at, with two choices: what the tab is (today only "A concert's
  players") and which concert (the calendar's concerts from 60 days ago on,
  plus the tab's current one, which is picked). Connect writes the same
  `sheetLinks/{kind__concertId}` record as Personnel's "Link the personnel
  sheet", by the tab's gid. The window asks the Hub through `sheetEdited`
  (`action: 'choices'` / `'connect'`, `connectChoices` / `connectTab` in
  `sheetPush.ts`) with the clicker's own Google token, so the Hub acts only
  for an Owner or Director, as the Personnel screen does. One tab is one
  concert: the tab's other link goes. Choosing a concert that was on another
  tab moves it here, and the window says the other tab stopped syncing.
  Sheet1 and the Hub tab are refused. The menu exists only when the script is
  inside the workbook: Google lets no standalone script add a menu.
- **The "Hub" tab.** After every pass the Hub rewrites one tab of the
  workbook: each connected tab, its concert, its last sync, what happened,
  and under it one line per row to look at ("Row 12: Seat takes a chair
  number, so the Hub put its value back"), numbered as the sheet reads after
  that pass. Never a cell's value. The rows come from the planner
  (`SheetEdits.problems`: refused values, clashes, a row it cannot place) and
  ride on the link's status as `sync.problems`. The tab is locked (only the
  workbook's owner can type in it) and found by a marker
  (`aisoHubStatus` developer metadata), never by its name: a person's own tab
  called "Hub" is never written over (ours is then "Hub status"), and ours
  may be renamed. API writes fire no trigger, so it never rings the doorbell.
- **Moving a link to another tab forgets the old agreement.** `linkChanged`
  (the registry trigger) deletes `sheetState` when a link's tab changes or
  the link goes. Before, Personnel's "Change tab" kept it, and the first pass
  on the new tab would have read every player missing from it as deleted
  there and taken them off the concert.
- **A first link keeps every row.** A row carrying the Hub ID of a roster
  player who is not on the concert now joins them when there is no agreement
  yet (a tab copied from last concert's), instead of being deleted from the
  sheet. Only a row both sides had agreed on, and the Hub then took off, is
  removed.

### Its real limits, in plain words

- **"Immediately" means a few seconds** each way: the script wakes, the Hub
  reads the tab and writes. Two people typing in the same cell within those
  seconds is a clash: **the later edit wins** (the sheet's time comes from the
  doorbell, the Hub's from its records; when the Hub cannot tell, the Hub's
  wins). The status line counts clashes.
- **Refused, and put back**: anything shaped like a tax ID, a word in Seat, a
  fee on a signed, void or season contract, and deleting the row of a player
  a season contract calls (take them off in the Hub).
- **Accidents are undone**: more than 5 rows vanishing at once come back,
  and a sort that throws players into other sections' blocks does not change
  anyone's section (their rows go back).
- **Extra, Email 1 and Category 2** are the sheet's own: the Hub has no place
  for them, so they are never read and never overwritten (a moved row carries
  them along).
- **The script runs as the account that pressed Connect** (the AISO account),
  for everyone's edits. If that account loses access, or someone deletes the
  script, the sheet's edits wait until the next Hub change or until Connect is
  pressed again. The Hub's edits keep reaching the sheet regardless.
- A gmail account's 90 minutes a day of trigger time is roughly 1,500 to
  3,000 edits a day.

### Setting it up (once per workbook)

1. Turn on the Google Sheets API for `aisymphony-hub` (one click in the
   Google Cloud console).
2. Share the workbook (Editor) with the Hub's service account
   (`aisymphony-hub@appspot.gserviceaccount.com`).
3. Link the tab in Personnel (paste the tab's address), or use the
   workbook's menu once step 4 is done.
4. In the workbook: Extensions → Apps Script, paste
   `docs/aiso-sheet-sync.gs`, Save, reload the sheet, then AISO Hub → Turn
   on sync, signed in as the AISO account, and allow it. When Google says
   "unable to open the file" (its bug when several Google accounts are signed
   in to one browser), open the workbook in a browser window signed in to the
   AISO account only. A standalone project (the AISO account's
   script.google.com → New project, paste, put the workbook's address in
   `WORKBOOK`, Save, run `connect`) syncs too, but has no menu.
5. Connect each concert's tab: open it, AISO Hub → Connect this tab… (or
   step 3 in Personnel).

Proven live on 2026-11-26 on Grant's test copy (a "Sync test" tab of three
made-up players, linked to a throwaway past-dated concert): an email typed
in the sheet was on the player's Hub card within seconds, a phone typed in
the Hub was in the sheet within seconds, and a tax-ID-shaped number typed
in the sheet was wiped and never stored.

Proof: `functions/src/sheetPlan.selfcheck.ts` (every rule above, and "after
any pass, a second pass changes nothing on either side") and
`scripts/sheet-push.emulator-proof.mjs` (the real engine against the
Firestore emulator and a fake Sheets server: both directions, echo skip, the
doorbell's caller check, refusals, row deletes, Google's refusals in words).

## Tab-per-area decisions (Grant, 2026-11-25: "Yes, A + defaults")

- **A**: tabs are linked through the `sheetLinks` registry, by tab id, with
  one engine and one adapter per area (built in step 3).
- **Next areas**, after the concert roster is live (steps 4 and 5) and nothing
  else until Grant asks: Musicians (master roster and sub list, one tab for
  the orchestra) and Schedule (calendar, one tab per season).
- **Who may connect a tab**: anyone who can edit the workbook.
- **Payments** are edited only through the roster's Paid column. A Payments
  ledger tab, if one is ever built, is Hub → sheet only.
- **"Sheet1"** stays unconnected and ignored (the registry already does this).
- **Step 4 in the sheet**: an "AISO Hub → Connect this tab…" menu with two
  dropdowns (what the tab is; which concert or season), and a locked "Hub"
  status tab listing each connected tab, its last sync, and rows with
  problems. "Change tab" in Personnel stays as the staff-side way to connect.
  Built 2026-11-26 (above, "In the workbook"). One difference from "who may
  connect a tab: anyone who can edit the workbook": the Hub registers a tab
  only for an Owner or Director, the same rule as the Personnel screen,
  because the Hub cannot check from a Google token that the person can edit
  that workbook.

## Not here, on purpose

A players-see-"said yes" change (decision 1 keeps `memberView` as it is),
field-level history (the status line counts clashes; the losing value is not
kept), unlinking from the sheet (Personnel's Unlink does it), and a grid view
(the sheet is the grid).
