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

The done-when itself is HALF-verified: `tsc -b` and eslint are clean (64
pre-existing errors, unchanged) and the flag gating is confirmed in code,
but the two builds and the no-personnel-string grep of the NWSA bundle
need the Mac — run them before merging. If the personnel chunk still
appears in an `nwsa` dist, Rollup didn't fold the flag and the fix is a
define-level constant, not more lazy().

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
