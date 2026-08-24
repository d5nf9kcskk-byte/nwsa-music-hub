# Fair Copy — Alpharetta Symphony build plan

**Open with:** `Read docs/fair-copy/as-build-plan.md and start at Step 1.`

Work order for the AS deployment. Context, decisions already made, and the
build log live in `as-demo-plan.md` — read it first, and do not restate it
here. This file is only the sequence and what "done" means for each step.

Written 2026-08-22. Steps 1–3 of the original plan are finished; this
covers everything after.

---

## Where things stand

Landed and on `main` (merged as PR #82):

| Commit | What |
|---|---|
| `a30263b` | Product rename Opus OS → Fair Copy |
| `0150c6f` | `config/orgs/as.json` + `features.personnel` |
| `9934482` | `Personnel` / `Contract` types |
| `9d74372` | Plan doc: build log, attendance settled |
| `c2f02d2` | Real contact email + mission statement; builds verified |

**Nothing reads any of it.** The types compile and lint. There is no hook,
no screen, no Firestore rule, no Firebase project, and no data. That is the
honest starting line.

Verified: `VITE_ORG=as` builds clean on the Mac; the NWSA regression gate
passes (two builds, identical `[sw-precache]` hash `5d90d75b`, no
`asyo`/`Alpharetta` string in `dist/`).

---

## What constrains this work

Read these before writing code. Each has already been paid for once.

- **Query and rule must agree.** Firestore rules match per document, so a
  scoped read rule only works if the app's query asks for the same subset.
  Change one, change the other, or the listener errors for that role.
- **The NWSA build must stay deterministic.** After anything that touches
  the org layer, build twice with no `VITE_ORG` and confirm the
  `[sw-precache]` hash is stable. The deploy cron rebuilds hourly; a
  nondeterministic SW toasts every open tab.
- **`OrgConfig` does no partial merging.** A new field means editing all
  three files in `config/orgs/`, or the missing key is a build-time hole.
- **Demo people are fictional.** AS publishes real musician, board, and
  staff pages. None of it goes into seed data.
- **Money is integer cents**, and the field name says `Cents`.
- **Builds cannot run in a Linux agent sandbox** — `node_modules` holds
  darwin-arm64 bindings only. Run them on the Mac via osascript
  (`PATH=/opt/homebrew/bin:$PATH`), not in the sandbox.

---

## Step 1 — Firestore rules for the paid roster

**First, not fourth.** Every later step writes data, and the wrong rule
here publishes pay rates. Write these fresh; do not copy the `students`
block.

Three collections, three sensitivity tiers:

| Collection | Who reads | Notes |
|---|---|---|
| `personnel` | any allowlisted role | roster-ish; name, instrument, section, seat |
| `personnelContacts` | director/owner | address, phone, `w9Status` |
| `contracts` | director/owner | pay. The tightest thing in the app. |

Requirements:

- **No public mirror for any of them.** Unlike `students`, nothing here
  gets a `*Public` projection. The public site must not be able to read a
  contract at all, and `scripts/generate-feeds.mjs` must never touch these.
- Every check requires `email_verified`, per the existing `verifiedSelf()`
  posture. Never gate on bare `signedIn()`.
- `isKnownRole()` is a closed set. If personnel work needs a new role
  (a Personnel Manager who is not a full director is plausible), that is a
  deliberate edit to the helper plus its own rules — not a widening.
- Extend the *Deploy Firestore & Storage rules* workflow to a third
  project, following the `ASYO_SERVICE_ACCOUNT_JSON` pattern that skips
  cleanly when the secret is absent.

**Done when:** rules deploy to `nwsa-hub` unchanged, a `contracts` read
from an unauthenticated client is denied, and a `teacher`-role read of
`contracts` is denied.

**Landed 2026-08-23 (PR #83, merged; deploy-rules ran green).** All three
done-when criteria verified against the Firestore emulator with a 34-case
suite. Two deliberate divergences from the sketch above, both on the
strict side:

- `personnel` reads are **Owner/Director only**, not "any allowlisted
  role" — the plan's table predates the rules design, and nothing a
  teacher or attendance assistant does needs the adult roster. Widen it
  deliberately (isKnownRole-style) when a real role needs it, per the
  closed-set posture.
- The contract LIFECYCLE is also enforced in rules (terms freeze once
  Signed, Void is terminal, only a Draft may be deleted), and
  `personnelContacts` is pinned to an exact key allowlist so a taxpayer-id
  field is structurally unwritable.

The third-project extension of the *Deploy Firestore & Storage rules*
workflow ships with this doc (same PR), on the `AS_SERVICE_ACCOUNT_JSON`
skip-when-absent pattern — it stays dormant until Step 7 creates the
project and secret.

---

## Step 2 — Hooks: `usePersonnel`, `useContracts`

Mirror `useStudents` / `useRosterOverrides`. Two things differ:

- **No public-mirror batching.** `useStudents` batches a mirror doc with
  every write. These hooks do not, and `src/director/publicMirror.ts` gains
  nothing. If a future reason appears to publish a roster (concert program
  credits), that is a new, separately reviewed projection with its own key
  allowlist — never a copy of the student one.
- **The query must match the rule** written in Step 1. If contracts end up
  role-scoped, the hook issues the matching `where(...)`.

**Done when:** a director can round-trip a `Personnel` and a `Contract`
against the live demo project, and a `teacher` session gets a clean denial
rather than a crashed listener.

---

## Step 3 — Personnel screens

**Decision: build a parallel `PersonnelManager`, not feature-flagged roster
screens.**

The student roster screens are saturated with grade, guardian, and
school-ID assumptions. Flagging each field leaves both versions worse, and
one missed flag renders a pay rate on a student screen. Separate screens
make that structurally impossible. The cost is duplicated table and form
scaffolding, which is the cheaper mistake.

Gate the whole surface on `ORG.features.personnel`, the way `campusMap`
and `calendarSeed` already gate theirs — nav entry, route, and the
director tab all check the flag.

**Done when:** an `as` build shows Personnel and no Roster; an `nwsa` build
shows Roster and no Personnel; and no personnel string appears in the NWSA
bundle.

**Implemented 2026-08-23 (PR #87, draft, stacked on the Step 2 hooks
PR #86 — its diff is Step 3 only).** `src/director/personnel/`:
PersonnelManager (roster grouped by section in score order, seats inside;
Sub list / Missing paperwork / Archived views), PersonnelDetail (contact +
W-9 status + the person's contracts rendered read-only, per the
"contracts read-only at first" slice), PersonnelForm (adult fields,
self-contact, archive-over-delete once contracts point at someone), and
contractMoney.ts (integer-cents formatting/totals, reusable by Step 4).
Gating follows the campusMap pattern in all three places — nav entry,
VALID_TABS segment, tab render — and the manager is code-split behind a
build-time `ORG.features.personnel` ternary + `lazy()`, so a school
bundle should not even reference the chunk.

**Done-when verified 2026-08-23, in the Linux agent sandbox** — a fresh
`npm ci` there installs linux bindings, so builds run after all; the
"Mac-only" constraint was an artifact of a node_modules that held
darwin-arm64 binaries, and the deploy workflows build on Linux runners
anyway. Results:

- The bundler did NOT fold `ORG.features.personnel` (the risk called out
  above): the first `nwsa` build emitted the personnel chunk. Fixed as
  predicted with a define-level constant — `__ORG_PERSONNEL__`, a bare
  boolean in vite.config.ts `define` (mirrored in
  scripts/vite-defines-shim.mjs); every personnel gate in DirectorApp
  uses it. Member reads off `__ORG_CONFIG__` do not fold; bare literals
  do. Remember this for the next flag-gated chunk.
- After the fix, the `nwsa` dist emits no PersonnelManager chunk and
  greps clean for every personnel-feature string (cartage, W-9,
  personnelContacts, the tab hint, …), and stays clean for
  asyo/Alpharetta. Two consecutive builds were **byte-identical**
  (`[sw-precache]` a9afd88b twice; differs from the pre-change 5d90d75b
  because the code changed, not because determinism broke).
- The `VITE_ORG=as` build emits the personnel chunk and its strings, and
  the DirectorApp chunk carries the Personnel (not Roster) nav branch.
  ("New World School" appears twice in the `as` index chunk — that is
  CampusMap, statically imported for every org and runtime-flagged off,
  the same pre-existing pattern ASYO builds ship with.)

Still owed: nothing build-side. No live round-trip until Step 7 creates
`as-hub-demo`.

---

## Step 4 — Contract surfaces

- A `ContractTemplate` editor holding the generic agreement text. Ship
  neutral placeholder language; real AS wording drops in later without a
  schema change, which is the whole reason `termsText` is separate from the
  structured fields.
- Issue → sign → countersign, writing `termsText`, `templateId`, and
  `templateVersion` frozen onto the contract at issue.
- Print/export: **reuse the sign-up module's path** — typed-name signature,
  `printViaPopup` over an off-screen host, no PDF dependency. Note that
  `.dir-signup-print-host` is positioned off-screen rather than
  `display: none` on purpose; copy that, do not "fix" it.

**Done when:** a contract carrying a base rate and a cartage line item
prints as a coherent one-page agreement with correct arithmetic in cents.

**Implemented 2026-08-23 (PR #91, draft, stacked on the Step 7 seed PR
#88 — its diff is Step 4 only).** What shipped, in
`src/director/personnel/` unless noted:

- `contractTerms.ts` — the `{{token}}` vocabulary, the resolver that
  fills tokens from a Contract's STRUCTURED fields, and three neutral
  starter templates (chair/podium/staff), each saying in its own closing
  line that it is placeholder language. The prose never carries a
  number: a template's `bodyText` holds tokens; issue copies that text
  verbatim onto the contract (`termsText` + `templateId`/
  `templateVersion` — editing a template never reaches an issued
  contract); and rates/dates substitute at render/print time from the
  same structured fields the rules freeze at signing. Internal imports
  carry explicit `.ts` extensions because `seed-as-org.mjs` imports the
  module (the generate-feeds Node-strips-types pattern), so the seeded
  demo templates ARE the in-app starters rather than a second copy.
- `useContractTemplates` (`hooks/`) — the usePersonnel pattern behind
  the same Owner/Director `usePersonnelGate`; saving a `bodyText` change
  bumps `version`, the number stamped onto contracts at issue.
- `contractTemplates` rules — the collection leaves the default deny in
  the SAME change as the screens, as the Step 1 notes scheduled:
  `isStaff()` + exact key allowlist mirroring the type, category and
  `version` (`is int`, ≥ 1) checked, `bodyText` bounded at 20k. Plain
  staff CRUD, no lifecycle of its own — issued contracts hold frozen
  copies.
- ContractTemplatesView (a drawer off the Personnel screen — no new
  tab/route/gate, so the `__ORG_PERSONNEL__` folding story is
  untouched), ContractForm (Draft/Sent editor: dollars typed, integer
  cents stored via the new `parseCentsInput` in `contractMoney.ts` —
  string arithmetic, fractional cents rejected before Firestore's
  `is int` does; line items incl. Cartage; "Insert from template" is the
  issue-time freeze), and ContractSheet (Mark sent, typed-name Record
  signature per the SignupResponse pattern — signing is the write that
  freezes terms server-side — Countersign, Void, Draft-only delete,
  notes alive in every state; renders the frozen `termsText` with
  tokens resolved).
- Print: the sign-up path wholesale — `printViaPopup` over
  `.dir-signup-print-host` itself (positioned off-screen, NEVER
  `display: none`; print engines skip display:none) and the
  `signup-sheet-*` styles, which are always loaded (SignupsView is a
  static DirectorApp import). No PDF dependency.
- Seed: `seed-as-org.mjs` also seeds the three starters as
  `contractTemplates` (79 docs). The 13 contracts keep inline
  `termsText` and no `templateId` on purpose — optional provenance, and
  the demo should show both shapes.

No divergence from the sketch beyond that drawer-not-tab layout call.

**Verified 2026-08-23, Linux agent sandbox** (no live project exists —
nothing round-tripped real infrastructure):

- Emulator rules: a 29-case suite for `contractTemplates` —
  owner/director/legacy-no-role read+write+delete allowed with the exact
  allowlist; unauthenticated, teacher, assistant, unverified-email, and
  non-allowlisted accounts denied; unknown key (`tin`), bad category,
  empty name, non-string and oversized `bodyText`, version 0, and float
  version all rejected. The extended seed runs end to end, and each
  seeded template REPLAYED through an enforced create passes the
  predicates (Admin SDK bypasses rules; shapes checked on their own,
  the Step 7 discipline).
- Done-when: `ContractPrintSheet` rendered headlessly
  (react-dom/server) for a Substitute bass contract carrying
  $150.00/service × 4 plus a one-time $75.00 Cartage line — base row
  $600.00, cartage $75.00, estimated total $675.00, cents-exact via
  `contractMoney`, every `{{token}}` resolved, both signature blocks,
  one coherent sheet. On-screen printing goes through the same
  component.
- NWSA gate: two no-`VITE_ORG` builds, `[sw-precache]` **a9afd88b
  twice — identical to the pre-change stack hash**, i.e. the school
  bundle is byte-unchanged by this entire step; `asyo`/`alpharetta`
  greps empty; no cartage/W-9/contractTemplates/Countersign string and
  no personnel chunk in the nwsa dist. The `VITE_ORG=as` build carries
  all the new surfaces in the PersonnelManager chunk.
- Lint at the 64-error baseline (none in new files); `tsc -b` clean.

What's New: an AS-staff entry ("Contracts: issue, sign, and print from
Personnel"), added at rebase time on Grant's ask — spread into
`WHATS_NEW` behind `__ORG_PERSONNEL__` (the build-time constant, NOT a
runtime `ORG` read) so the school bundles carry none of its strings.
The `ORG.features.contactForm` spread was the precedent; the build-time
fold is the difference, and the NWSA-gate greps below prove it out.

**Rebased onto `main` 2026-08-24** after the rest of the stack (Steps
1–3, 7 and the org-setup automation) merged and the AS demo went live.
One conflict, doc-only (`as-demo-plan.md` "Not started" — both sides'
facts kept); the code applied clean. Re-verified in the Linux sandbox
after the rebase: the done-when print check re-run headlessly against
the SEEDED Substitute bass contract (as-c06: $95.00/service × 2 plus
Cartage $40.00/service × 2 → base $190.00, cartage $80.00, estimated
total $270.00, every token resolved, both signature blocks) as well as
the $675.00 case above, plus the unknown-token-stays-verbatim and
missing-quantity-stays-em-dash guards; lint still exactly the 64-error
baseline; `tsc -b` clean; NWSA gate green (two no-`VITE_ORG` builds,
`[sw-precache]` **62b4f9cf twice** — differs from a9afd88b only because
the What's New define-fold is new code — `asyo`/`alpharetta`/cartage/
W-9/Countersign greps all empty, no personnel chunk); `VITE_ORG=as`
build carries the surfaces. The emulator rules suite was not re-run — the
rebase left `firestore.rules` byte-identical to the reviewed diff.

---

## Step 5 — Attendance subject

The only open modeling call. Attendance itself is settled: keep the word,
track per service, no schema change needed (`AttendanceRecord` already has
`eventId`, and a service *is* a `CalendarEvent`).

What is open is that `AttendanceRecord.studentId` names the wrong entity.

- **Option A:** add optional `personnelId`. Less code; risks a record that
  is neither or both.
- **Option B (leaning):** a parallel `ServiceAttendance` keyed by
  `personnelId` + `eventId`. Keeps the privacy split clean and lets the
  rules differ.

Cheap to defer until a screen needs it. Decide with Step 3, not before.

**Decided with Step 3 (2026-08-23): Option B** — a parallel
`ServiceAttendance` keyed by `personnelId` + `eventId`, with its own
Firestore rules, when a screen needs it. The deciding fact: Step 1
deliberately gave the paid-roster collections a stricter tier
(Owner/Director only) than `attendance` (which assistants write), so an
optional `personnelId` on `AttendanceRecord` would put paid-roster data
under student-attendance rules — the exact privacy-split leak Option B
avoids. NOTHING is built yet: the Step 3 screens don't render attendance
(there is no data model for it), so per the "only what a screen needs"
rule the collection, rules, and hook land together when the first
attendance-at-services surface does.

---

## Step 6 — Repertoire audit

Grep the repertoire module for student-specific assumptions before assuming
it is reusable as-is. Probably close to free; "probably" is why it is a
task and not an assumption.

**Done when:** either it is confirmed clean, or the leaks are listed.

**Audited 2026-08-23 (PR #93, stacked on the Step 7 seed PR #88 —
docs-only diff; this is an audit, nothing was fixed).** Verdict: the
module's data model and logic are reusable for AS as-is — every read and
write is keyed to ensembles and events, never to students — with **one
copy-string leak** and a cluster of known degradations where repertoire
meets roster-shaped surfaces. Full file list and greps in the PR body.

The leak:

- `src/director/repertoire/RepertoireManager.tsx:634` — empty-state copy
  "No per-instrument links yet. **Students** see their own part
  automatically when added," rendered verbatim in the AS director UI.
  Remedy when convenient: org-neutral wording ("Musicians see their own
  part…"); a one-line copy edit, deliberately not made in this PR.
  **Fixed in PR #92** (branched off `main`, independent of this stack):
  the string now says "Musicians", org-neutral for every deployment.

Degradations to know about (structural, not fixable from inside the
repertoire module — all trace to the paid roster having no public
projection, which Step 1 chose on purpose):

- **"My part" personalization is dead for AS.** `PublicRepertoire.tsx:54`,
  `PublicPiece.tsx:29`, and `PracticeCard` (via `PublicSchedule.tsx:221`)
  resolve the viewer with `primaryStudent()` (`src/shared/identity.ts`),
  which only the "Find My Schedule" lookup over `studentsPublic` ever
  populates. AS has no `studentsPublic`, so no visitor can acquire an
  identity and the ⭐ per-instrument part links simply never show
  (degrades silently). An adult "my part" needs its own identity story —
  per Step 2's note, never a casual pointer at a personnel projection.
- **Seating on public pages resolves names via `studentsPublic`.**
  `PublicPiece.tsx:215` (and `PublicEnsemble`'s SeatingSection) render the
  applied chart gated on `PUBLIC_STUDENT_INFO` — a codebase-global const
  (`src/public/publicStudentInfo.ts:6`), not org config. Today AS renders
  nothing (no charts, empty roster → no section). But `seatingCharts` is
  world-readable and staff-writable (`firestore.rules:255`), so if AS
  staff ever publish a chart, every `seat.studentId` resolves to '—' and
  the public piece page shows a chart of dashes. Flag before any AS
  seating work.
- **The printed program has no personnel page.** `PublicProgram.tsx`
  builds roster pages (lines 272–290) exclusively from `studentsPublic` +
  seating charts, so an AS program prints with no performer credits —
  silently. The cover page is fully `ORG.program.*`-driven and clean.
  Crediting the paid roster on a program is exactly the "new, separately
  reviewed projection" Step 2 reserved; until someone asks for it, this
  is a known gap, not a bug.

Confirmed org-neutral: the `RepertoirePiece` type (no student fields;
soloist is free text), `useRepertoire` (reads only `repertoire`, which is
world-readable / staff-write in `firestore.rules:251` — correct for AS,
piece docs carry no PII), `PiecePicker`, the `PubRepertoire` list, the
`rep.*` translation strings, repertoire nav wiring in both apps
(unconditional — present for AS, as wanted), `src/shared/ics.ts`'s
repertoire → DESCRIPTION path (`icsLesson`'s `studentName` is the
lessons feed, outside repertoire and disabled in feeds), and
`scripts/generate-feeds.mjs`'s pieces → calendar-notes path. Seed
compatibility confirmed: `seed-as-org.mjs` writes `RepertoirePiece`-shaped
docs into `repertoire` keyed to the seeded `as-orchestra`/`as-chamber`
ensembles, and no repertoire read path requires student-shaped data.

Cosmetic, adjacent (noted, not Step 6's to fix):
`.cursor/rules/repertoire-ai.mdc` describes itself as the "NWSA
repertoire" fill workflow though its substance is org-neutral; and
`src/director/components/DirectorSearch.tsx:398` — the search box
repertoire flows through — says "Find students, events, repertoire…" to
an AS director (Step 3 territory).

NOT verified: nothing was run — read-only audit (full reads of the
module and its consumers, plus the greps in the PR body). No live-data
check until `as-hub-demo` exists.

---

## Step 7 — Seed and infrastructure

Mirror `docs/demo-asyo-setup.md` — roughly 45 minutes of console clickwork
that only Grant can do.

- Firebase project `as-hub-demo`, Pages repo `as-music-hub`,
  `deploy-as.yml`, the `AS_*` secrets.
- `scripts/seed-as-org.mjs`, following `seed-demo-org.mjs` — including its
  hard abort against writing to the wrong project.
- Fictional musicians and generic contracts spanning every position type:
  chair (Concertmaster, Principal, Assistant Principal, Section,
  Substitute), podium (Conductor), and staff (Librarian, Personnel Manager,
  Operations Manager, Executive Assistant, Bookkeeper). At least one
  contract carrying a cartage line item, since that is the case the model
  was designed around.
- Real 2026-27 season dates are in `as-demo-plan.md` if you want the
  calendar to look alive.

**Agent half landed 2026-08-23 (PR #88, draft, stacked on the Step 3
screens PR #87 — its diff is Step 7 only).** Everything code can do
shipped: `scripts/seed-as-org.mjs` (follows `seed-demo-org.mjs`,
including the hard abort — pinned to `as-hub-demo`, refuses `nwsa-hub`
and `asyo-hub-demo` by test), `deploy-as.yml` (mirrors `deploy-demo.yml`:
`VITE_ORG=as`, `AS_*` secrets, `as-music-hub` Pages repo, hourly cron at
:30), `seed-as.yml` (mirrors `seed-demo.yml`, so seeding needs no laptop
key), an `as` alias in `.firebaserc`, and `docs/demo-as-setup.md` — the
~45 min of console clickwork written up for Grant, mirroring
`docs/demo-asyo-setup.md`. The seed covers every position type above,
all four rate bases, the full contract lifecycle (Draft → Void), a
Cartage line item on the Substitute bass contract (plus a Doubling line
on Principal Flute), the real 2026-27 concert dates, and rehearsals
pinned to "today". All people fictional; no attendance data (Step 5's
`ServiceAttendance` is decided, not built); `contractTemplates` not
seeded (default-deny until Step 4).

Verified in the Firestore emulator, since no live project exists: the
seed runs end to end (76 docs, idempotent on re-run) and every doc was
checked against the exact `firestore.rules` `#personnel` predicates —
key allowlists, `baseRateCents is int`, enums, and id references —
because Admin SDK writes bypass rules and the shapes have to be right on
their own. NOT verified: anything against real infrastructure — the two
workflows are untested until the project, repo, and secrets exist.

**Still owed (Grant, console):** the clickwork in `docs/demo-as-setup.md`
— Firebase project `as-hub-demo`, Pages repo `as-music-hub`, the seven
`AS_*` secrets — then run **Seed AS demo data** and **Deploy AS demo**
and do the doc's smoke test.

---

## Recommended slice

If the goal is showing AS something rather than finishing the product:
**1 → 2 → 3 → 7**, with contracts read-only at first. A personnel roster
that looks right beats a half-built signing flow. Steps 4–6 follow once
someone has seen it and reacted.

---

## Risks

- **A second session writes to this repo.** On 2026-08-22 a concurrent
  Claude session checked out a branch mid-work, swept a commit of this
  work into its own PR (#82), and pushed. Nothing was lost, but the branch
  changed underneath an agent that believed it was on `main`. Before a
  long build session, confirm no other session is open on this repo.
- **`origin` may be unreliable.** `Bottega/PENDENZE.md` records that
  GitHub was killed and origin was 403 on at least one repo. Origin
  answered fine here on 2026-08-22, but check before depending on a push.
- **Rules and query drift** is the failure mode most likely to reach
  production quietly, because it only errors for the role nobody tests as.
