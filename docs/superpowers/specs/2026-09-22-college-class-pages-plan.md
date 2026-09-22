# College class pages + one way in — PLAN (challenged)

Drafted 2026-09-22, revised after three adversarial reviews. Every claim below
was verified against the code or live Firestore, not inferred.

## The two complaints, root-caused

**1. "The exam is not listed on the class page."**
`src/public/PublicEnsemble.tsx` has no assignments section at all. The exam
(`TjSAik4MtravU9lEDOdp`) is tagged correctly to `class-college-survey-history-1`
and published. Data fine; section never existed.

**2. "More than one way into college classes."** True on BOTH sides.
- Public: nav → College → class, AND nav → Ensembles → "All ensembles" →
  `/ensembles` → a second "College Classes" heading → class.
- Director (**the first draft got this wrong**): `NAV_GROUPS` "People" carries a
  flat **College** row (`DirectorApp.tsx:115`) → tab `college`, and the College
  accordion carries **"College Hub"** (`:392`) → the *same* tab. Two
  differently-named rows, both visible in the same rail. Same for
  Ensembles/"All Ensembles" and Classes/"All Classes".

## Bug found in passing

Past-due assignments drop out of the browse lists. Exact pattern
`a.dueDate >= today && isPublished(a, now)` at `PublicHome.tsx:87`,
`PublicAssignments.tsx:48`, `PublicSchedule.tsx:153`; variants at
`PublicCalendar.tsx:162` and `components/PracticeCard.tsx:46`. Five public
surfaces.

**Severity is lower than first stated**: `PublicAssignment.tsx:86` gates on
`isPublished` only, so the exam's own page, `/assignments/:id/submit` and
`SearchOverlay` keep working. It leaves the LISTS, not the site.

---

## Phase 1 — the class page carries the class

### 1a. `isAssignmentOpen()` in `src/director/utils.ts`
Beside `isPublished`, its same-shaped sibling. **Not** a new module: the
`ensembleId` argument and an open/past split would each serve exactly one
caller.

```ts
export function isAssignmentOpen(a, today: string, now: number): boolean {
  return isPublished(a, now) && (a.dueDate >= today || !!a.acceptsQuizSubmissions);
}
```

**`acceptsQuizSubmissions` ONLY.** `acceptsVideoSubmissions` is a MODE flag, not
open/closed: set once at creation (`AssignmentsView.tsx:91,166`), never cleared,
and read as the gate by `firestore.rules:998` and
`functions/src/composeSubmission.ts:221` — so a director cannot turn it off
without breaking submission. Counting it would pin every past playing exam to
the top of the lists forever. `config/assignments/symphony-playing-exam-2.json`
is a live example.

**Sort:** on-time first, overdue-but-open last. All the lists sort `dueDate`
ascending and `PublicHome` slices 5 / `PublicAssignments` slices 4 — naive use
would let one un-closed exam squat the home page permanently.

No self-check: `isPublished`, identical blast radius, has none. Adding one here
and not there is cargo cult.

### 1b. Assignments section on `PublicEnsemble.tsx`
`AssignmentCard`, `showEnsembles={false}`. Open only — no past fold (a page with
zero assignment sections today does not need two).

**This reverses a documented decision.** `PublicEnsemble.tsx:137-139` says in
prose that a class leads with its documents. Assignments go above documents;
say so in the comment rather than silently flipping it.

### 1c. Static info — three fields, not five
`PublicEnsemble.tsx:163-170` already prints `groupKindLabel · defaultLocation ·
formatTimeRange(...)` and `PublicGroupStaffPanel:185` already prints the
teacher. Genuinely missing: **course number, meeting days, semester**. Append to
the existing hero meta array; no new block.

`meetingDays` (0=Sun…6=Sat) + `WEEKDAY_LABELS` — same convention, no off-by-one.

**Gate on `isClass || isCollegeGroup`**, not `isClass`. `college-chamber-orchestra`
and `college-vocal-ensemble` are `kind:'ensemble'` — half the College nav
section would otherwise get nothing.

### 1d. `unitInfo` on the class schedule rows
`types.ts:261`, typed in `EventForm.tsx:972`, rendered in exactly ONE place:
the .ics DESCRIPTION (`ics.ts:148`). It is the most class-specific field in the
app and never reaches the class page. Class schedule rows are bare dates today.

---

## Phase 2 — semester needs a stored field

**The derivation in the first draft was wrong three ways** (all verified):

1. `termForDate(date, terms)` — the draft called it `termForDate(ORG.terms, d)`.
2. `ORG.terms` is **MDCPS**, provably: `ORG.grading.periods` hangs all four
   district quarters off those `termId`s and `gradingPeriods.selfcheck.ts` pins
   45/46/42/47=180 against `MDCPS_NO_SCHOOL`. MDC's real year is
   `collegeSchedule.ts:13-20` — fall ends **Dec 11** (not Dec 19), spring starts
   **Jan 4** (not Jan 6). Labelling an MDC course from `ORG.terms` is exactly
   the #college-hs-calendar-deps violation.
3. It cannot work anyway: `collegeClassEventDocs()` generates every class from
   2026-08-24 to 2027-06-03 with **no term filter**, so all 16 span both
   semesters and would read identically.

→ **`Ensemble.term?: string`** (free text, e.g. "Fall 2026"), beside
`courseCode` on the same `EnsembleManager` form. Add `term` to
`CollegeClassSpec` too. It is the only thing that can separate a fall-only from
a spring-only course, and it is the field he asked for twice.

## Phase 3 — course number

`courseCode` exists in `CollegeClassSpec` with **15 of 16** catalog numbers
(`class-college-forum` has none — the UI must render its absence). It is written
to no ensemble doc; it reaches only `collegeSchedule.ts:59`'s notes string.

1. `Ensemble.courseCode?: string` + `Ensemble.term?: string` in `types.ts`.
2. Inputs in `EnsembleManager.tsx`.
3. `seedCollege.ts` + `scripts/seed-college.mjs` write both.
4. **Backfill = press the existing "Set up college program" button**, after
   fixing the real bug below. No `--groups-only` flag, no 16 workflow dispatches.

### The live clobber bug this uncovers
`scripts/seed-college.mjs:56` and `src/director/seedCollege.ts:48` write events
with a bare `b.set()` — **no merge** — so re-seeding wipes every college class
session's `status:'Cancelled'` and `changeNote`. The group writes at `:31-35`
and `:40-50` already use `{merge:true}`, and `collegeChamberRehearsalPatches`
writes the same collection WITH merge. The bare `set()` is the outlier, i.e. a
bug. `seedCollege.ts` is wired to an in-app button (`CollegeView.tsx:61`,
`ScheduleView.tsx:167`), so this is one click away from a director today.

**Fix: `{merge:true}` on both.** Then the backfill is free and a live bug dies.

---

## Phase 4 — one way in

### 4a. Public: three indexes, mirroring the director
- `/ensembles` → `highSchoolEnsembles` only.
- New `/classes` → `highSchoolClasses`. New `/college` → college ens + classes.
- `PublicEnsembles.tsx` parameterised; 2 routes in `main.tsx`.
- "All …" row per accordion, in **both** drawer and rail.
- New i18n `nav.allClasses`, `nav.allCollege` (en + es).

**Rejected the simpler "just delete the college/classes blocks from
`/ensembles`"**: `college-chamber-orchestra` (16 students) is `kind:'ensemble'`
so it HAS a seating chart, and `StartGuide.tsx:57-60` sends players to
`/ensembles` to find it. Deletion alone dead-ends them.

**Five consumers to update** (the draft missed all five):
- `LinkPicker.tsx:51` — sub-label "Every performing group" becomes wrong; add a College entry.
- `StartGuide.tsx:57-60` — seating instructions.
- `PublicSeating.tsx:43`, `PublicPiece.tsx:40` — `BackLink fallback`.
- `PublicLayout.tsx:171` — `onEnsemblesIndex` drives accordion auto-open; needs entries for the new routes or they open the wrong accordion.
- `docs/release-checklist.md:11` — route list.

Also fixes a latent bug: `PublicEnsembles.tsx:72-79` prints the "College
Ensembles" heading whenever *either* college list is non-empty.

`SearchOverlay.tsx:197` searches the unfiltered ensembles list. Left alone —
search should find everything; it is not "the menu".

### 4b. Director: delete the duplicate rows
Remove `ensembles` / `classes` / `college` from `NAV_GROUPS` "People"
(`DirectorApp.tsx:112-115`). The accordions already carry "All Ensembles" /
"All Classes" / "College Hub" to the same tabs, and also list the groups.

**Guard:** `groupAccordions` currently omits a group whose list is empty
(`hsEnsembles.length > 0 ? [...] : []`), so a fresh org with no classes would
lose every door to the Classes tab and could never create the first one. Render
the head + "All …" row always; keep only the per-group items conditional.
`DirNavGroup` still renders exactly 3 buttons, so `one-nav.selfcheck.mjs` holds.

### 4c. Director hub = the same page
`EnsembleHubView` shows Documents and Announcements as buttons
(`:236-241`) while the public page will list the real thing. He asked for the
same page. List them inline; keep the buttons for editing.

---

## Verification
- `one-nav.selfcheck.mjs` compares `t('…')` label SETS as source text. It
  cannot see that the rail's Ensembles accordion is guarded by
  `navPerforming.length > 0` (`PublicLayout.tsx:392`) while the drawer's is
  unconditional (`:257`). Adding rows to both passes regardless. **Real
  coverage is the manual pass at 375×812 and ≥1024px**, and `preview_start`
  ignores worktrees — verify the landed tree.
- `src/shared/whatsNew.ts` entry in the ship commit (CLAUDE.md).

## Not doing
- No public projection changes. `ensembles`, `documents`, `assignments`,
  `announcements` are already world-readable. Nothing widens.
- No grades/attendance on the class page — staff-only, no mirror (#privacy).
- Not genericising the NWSA-only college modules.
- Not importing `collegeClasses.ts` into the public bundle: it carries NWSA
  staff names and would ship them into ASYO's JS, and
  `PublicEnsemble.tsx` already has 2 eslint boundary errors — don't add a third.

## Open question for the director
7 of 16 college classes have **zero** enrolled students (Class Piano 3, Sight
Singing 1 & 3, Music Theory 1 & 3, MIDI 1, Diction 1). Are those sections not
running, or are the rosters just not built? It decides whether `/college` shows
seven "0 members" cards.
