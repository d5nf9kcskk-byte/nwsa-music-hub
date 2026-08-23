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

## "Attendance" naming — leaning keep

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

## Not started

No `config/orgs/as.json` exists yet. No `Musician`/`Contract` type exists
yet. No rename applied yet. This is a planning doc, not a build log.
