# AS demo plan — Alpharetta Symphony (semi-professional)

*Started 2026-08-22. Supersedes `aso-demo-plan.md` (deleted 2026-08-22 — it
was untracked, so no history was lost). Companion to `VISION.md` /
`COMPETITIVE.md`.*

## Naming — read this first

- **Product name is "Fair Copy"** (working title), replacing "Opus OS."
  Confirmed by Grant 2026-08-22. A search of connected folders (Projects,
  Bottega, NWSA, Career, MMP) found no written record of the decision — it
  existed only in chat, and this doc was the first place it was written down.
- **Rename applied 2026-08-22.** `docs/opus-os/` → `docs/fair-copy/` (git
  `mv`, renames detected at R100). Updated: `VISION.md`, `COMPETITIVE.md`,
  `NON-GOALS.md`, `README.md`, `~/Documents/Bottega/CLAUDE.md`,
  `Bottega/Archivio/MAP.md`, and the `proj:hub` path in
  `Bottega/Liutaio/INBOX/2026-08-22_whole-life-architecture.findings.md`.
  "Opus OS" appeared in **documentation only** — no source file, config, or
  identifier ever carried the name, so there was no code churn.
  Other "Opus" hits in Bottega were checked and deliberately left alone:
  the Claude model name (`Archivio/model-routing.md`, Liutaio launch docs),
  musical opus numbers (`Antiquario/IDENTITY.md`,
  `RepertoireManager.tsx`), and a font hint in `contatore/triage.py`.
- **Live product name is still "NWSA Music Hub."** Fair Copy is the
  destination brand, not a UI string. Nothing user-facing changed.
- **Never call this org "ASO."** That's the Atlanta Symphony Orchestra.
  This org is the Alpharetta Symphony (adult, semi-professional). "AS" is
  fine as shorthand. Proposed `orgId`: `as` (matches the `nwsa`/`asyo`
  pattern); Firebase project something like `as-hub-demo`.

## What this is

A third white-label deployment on the ASYO pattern
(`docs/demo-asyo-setup.md`): same codebase, new `config/orgs/as.json`,
`VITE_ORG=as`, own Firebase project, own Pages site. Per the locked product
rule (still in `VISION.md` under the old name), this is NOT a new app —
same lineage as NWSA and ASYO.

**Key difference from ASYO:** ASYO is a youth ensemble — same `Student`
model as NWSA (grade, guardians, school ID, attendance for minors). AS is
the *semi-professional, adult* orchestra, paid roster. Confirmed 2026-08-22:
this demo needs **real pay/contract fields modeled**, not stubbed — that's
the whole point of the personnel build, not a nice-to-have.

## Contract / position types to model (Grant's list, 2026-08-22)

Not exhaustive ("etc." — expect more). Spans three different kinds of
things, which argues for the schema *not* being one flat "role" enum:

- **Chair/section roles** (musicians): Concertmaster, Principal, Assistant
  Principal, Section, Substitute
- **Podium**: Conductor
- **Staff/administrative**: Librarian, Personnel (manager), Operations
  Manager, Executive Assistant, Bookkeeper
- **Fee/line-item, not a person-role**: Cartage fees — this is a cost
  attached to a contract (e.g. paying for hauling a bass/harp/percussion),
  not a position. Modeling it as a role would be wrong; it belongs as a
  line item on a contract alongside base rate.

Implication for the data model: a `Contract` needs a base rate/fee
structure PLUS a line-items array (cartage, doubling, etc.), and a
role/position field that's open enough to cover musician chairs, podium,
and administrative staff without three separate types fighting each other.

## Real contract as demo seed — decided against

Grant could pull an actual AS contract to use as the demo template but
called it "a little bit invasive" — decided not to. Instead: build a
generic/basic contract structure flexible enough to demonstrate all the
position types above, with placeholder/generic terms text. Keep the
structured fields (role, rate, line items, dates) separate from the terms
text so a real contract's language could be swapped in later without a
schema change.

## "Attendance" naming — keep, and it needs no schema change

Settled 2026-08-22. Keep the word "attendance," tracked per **service**
(a called rehearsal or concert) rather than per class meeting.

The useful finding: `AttendanceRecord` already carries an optional
`eventId` alongside `date` + `ensembleId`, added so a student could be
present in one period and excused in another on the same day. A "service"
in orchestral terms *is* a `CalendarEvent`, so per-service attendance is
already expressible — it just means AS treats `eventId` as required where
the school orgs treat it as optional. No new field, no migration.

What is still open is the *subject* of the record: `AttendanceRecord.studentId`
names the wrong entity for a paid roster. Two options, deliberately NOT
decided here because it is step-4 work: widen the record with an optional
`personnelId`, or add a parallel `ServiceAttendance` keyed by `personnelId`
+ `eventId`. The second is cleaner and keeps the privacy split intact;
the first is less code. Decide alongside the personnel screens.

Grant is open to alternatives but noted attendance is contractually
required language in these agreements, so "attendance" is probably already
the right word — orchestras track attendance *at services*. My
recommendation: keep the word "attendance," but track it per **service**
(rehearsal/concert called) rather than reuse NWSA's per-class-meeting
framing. No better alternative found; open to Grant's call either way.

## Concrete gaps in today's `Student` type for an adult pro roster

From `src/director/types.ts`: `Student` carries `grade`, `schoolId`,
`pronunciation`, and contacts live in a guardian-relationship model
(`Guardian.relation` = "Mother"/"Guardian"). None applies to an adult
freelance musician. Needs its own type — working name `Musician` — with its
own contact record (self, not guardian-mirrored), instrument, section,
seat/chair, section-leader flag, availability/sub status, and the
contract/pay relationship described above.

## Remaining open call

Data sensitivity: pay rate and W9/tax status are a different sensitivity
class than the student PII the app already guards (NWSA `CLAUDE.md`
privacy section). Firestore rules for a `musicians`/`contracts` collection
need to be designed fresh, not copied from `students`.

**Resolved 2026-08-23.** Rules shipped for `personnel`, `personnelContacts`,
and `contracts` as a third sensitivity tier in `firestore.rules`, written
fresh (see the `#personnel` section header there for the full rationale):
no public projection and no unauthenticated write path of any kind;
Owner/Director only (`isStaff()`, never `isKnownRole()` — teachers and
assistants get nothing); every doc pinned to an exact key allowlist so a
taxpayer-id field is unwritable on `personnelContacts` and pay can't creep
onto the roster doc; `baseRateCents` must be an integer (`is int` — the
cents rule enforced at the rules layer); and the contract lifecycle is
enforced server-side — terms freeze once Signed, Void is terminal, and only
a Draft may be deleted. `contractTemplates` stays under the default deny
until the personnel screens (step 4) land.

## First concrete steps, in order

1. Apply the Fair Copy rename (see Naming section above) — do this first so
   nothing new gets built under the old name
2. `config/orgs/as.json` — copy `asyo.json` as the template; Alpharetta
   Symphony (adult) branding, contact email, mission statement, ICS prodId
3. `Musician` type + `Contract` type (role/position, base rate, line items,
   dates) alongside (not replacing) `Student` in `src/director/types.ts`,
   feature-flagged per org like `campusMap`/`calendarSeed` already are
4. Personnel screens: parallel `PersonnelManager` view vs. feature-flagged
   variant of existing roster screens — decide once the type is settled
5. Reuse repertoire/library screens close to as-is — confirm no
   student-specific assumptions leaked into that module before assuming so
6. Seed script for AS (adult, fictional musicians and generic fictional
   contracts — same "fictional people only" rule as ASYO's
   `seed-demo-org.mjs`)

## Build log — 2026-08-22

Steps 1–3 done, one commit each on `main`, not pushed.

| | Commit | What landed |
|---|---|---|
| 1 | `a30263b` | Fair Copy rename (see Naming above) |
| 2 | `0150c6f` | `config/orgs/as.json` + `features.personnel` |
| 3 | `9934482` | `Personnel` / `Contract` types |

**Step 2 notes.** AS shares the `asyo-*` brand assets on purpose:
`asyo-logo.png` is the parent **Alpharetta Symphony** wordmark, so it is
more correct for this org than for ASYO. Vite's pruning pass treats an
asset listed by two orgs as shared, so nothing is pruned and no binaries
are duplicated. The `asyo-` filename prefix is historical (ASYO shipped
first), not ownership — don't rename those files, it would churn a live
deployment.

**Step 3 notes.** The person entity is `Personnel`, not the working name
`Musician`: the position list it has to carry (Bookkeeper, Executive
Assistant, Operations Manager) is not musicians, so `instrument` is
optional and the *contract* says what someone is engaged as. Position is
modeled as a `PositionCategory` (`chair` | `podium` | `staff`) orthogonal
to an open `Position` string — category is the axis that actually differs,
which is what lets one `Contract` cover players, podium, and staff without
three types fighting. Cartage is a `ContractLineItem`, never a position.
Money is integer **cents** in every field, and the field names say so.
Contract prose is frozen onto the contract at issue with
`templateId`/`templateVersion`, so editing a template can't retroactively
change terms someone already signed.

### Resolved 2026-08-22

- **`Personnel` over `Musician`** — confirmed by Grant.
- **`contactEmail`** is `hello@alpharettasymphony.org`, from the site
  footer. (An earlier guess of `info@` was wrong.)
- **`program.missionStatement`** is now AS's real wording, from
  alpharettasymphony.org/mission-vision-values: "The Alpharetta Symphony
  exists to inspire, connect, educate, and enrich our home city of
  Alpharetta and North Fulton through the magic of classical music."
- **Builds verified on the Mac.** `VITE_ORG=as` builds clean. The NWSA
  regression gate in `CLAUDE.md` passes: two consecutive no-`VITE_ORG`
  builds produced an identical `[sw-precache]` hash (`5d90d75b`), and
  `dist/` contains no `asyo`/`Alpharetta` string and no `asyo-*` file.

### Useful facts picked up from the site

Not yet used, but this is what a seed script will want (`scripts/seed-demo-org.mjs`
pattern). **Demo people stay fictional** — the real musician, board, and
staff pages are NOT to be scraped into seed data.

- 2026-27 season: Music from the Silver Screen (9/18/26), Tchaikovsky and
  Borodin (10/30/26), An Alpharetta Holiday (11/28/26), Impressions of
  Paris (2/12/27), Beethoven's 7th (4/30/27), Let Freedom Ring! (5/31/27).
- Real positions confirmed on their org chart: Music Director, Executive
  Director, plus a Board and a Team — which matches the podium/staff split
  the `Contract` type already models.
- `program.leadership` is still `[]`. Their masthead is public, but it is
  not needed for a demo and naming the wrong incumbent on a printed
  program cover is worse than naming nobody.

### Not started

Contract surfaces (build-plan step 4). The repertoire audit (step 6) is
done (2026-08-23, PR #89): the module is reusable for AS as-is — one
student-wording copy string in the director UI, plus known silent
degradations where repertoire meets roster surfaces ("my part"
personalization, public seating, the printed program's roster pages all
key off `studentsPublic`, which the paid roster deliberately lacks) —
see build-plan step 6 for the file:line list.
Firestore rules for `personnel`/`personnelContacts`/`contracts` landed
2026-08-23 (see Remaining open call above); the data-layer hooks (PR
#86), the personnel screens (PR #87, stacked on #86), and the seed +
deploy infrastructure (PR #88, stacked on #87) followed the same day —
see `as-build-plan.md` steps 2, 3, and 7 for what shipped and what was
verified. The attendance-subject call is decided (Option B,
`ServiceAttendance` — build-plan step 5) but nothing is built for it,
and the seed deliberately writes no attendance data. What remains of the
infrastructure is console-only: Firebase project `as-hub-demo`, Pages
repo `as-music-hub`, and the `AS_*` secrets — written up for Grant in
`docs/demo-as-setup.md` (the AS mirror of `docs/demo-asyo-setup.md`).

**Agent note (corrected 2026-08-23, Step 3):** builds DO run in a Linux
agent sandbox after a fresh `npm ci` — the earlier "Mac-only" version of
this note was an artifact of a copied `node_modules` holding darwin-arm64
bindings. The deploy workflows build on Linux runners anyway.
