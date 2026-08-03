# Handoff — directors' presentation

Notes for picking this up in a new session. Written 2026-07-28; **rebuilt
2026-08-03** against the Hub as it exists after the Aug 2026 privacy-model
change. See "2026-08-03 rebuild" at the bottom for what changed and why —
read that section before trusting anything below it as still current, since
most of sections 2–7 below predate that pass and several facts they cite have
since moved (the claim map in §4 is now the *superseded* version; the current
one lives only in git history of this rebuild's commits and the corrected
deck itself).

---

## 1. Where everything is

- **Branch:** `claude/nwsa-hub-presentation-rebuild-rjqe9f` (this rebuild).
  Prior round: `claude/nwsa-music-hub-presentation-dxdw1e`, PR #37 (open,
  draft, unmerged as of this rebuild — check its current state before
  assuming it's still open).
- **All files:** `docs/presentation/`

| File | What |
|---|---|
| `00-PRESENTER-OUTLINE.md` | Presenter-only: run of show w/ timings, pre-meeting checklist, exact demo taps, 15-min + Dean-only cut lists, likely Q&A, **assumptions register A1–A10** |
| `01-AUDIENCE-OUTLINE.md` | One-page handout for the room |
| `02-SCRIPT.md` | Speakable script, slide by slide, `[DO]` / `[LIVE]` / `[PAUSE]` / `⚠ FILL IN` markers |
| `03-SPEAKER-NOTES.md` | Cue-card notes — **must stay identical to the deck's notes area** |
| `NWSA-Music-Hub-Directors.pptx` | 23 slides, notes in every slide's notes pane |
| `NWSA-Music-Hub-Directors.pdf` | Render of the same deck |
| `build-deck.cjs` | **The source of truth.** pptxgenjs generator — edit and re-run; never hand-edit the .pptx |
| `README.md` | Index of the above |

---

## 2. Audience and purpose (unchanged)

The **Dean**, plus the **Wind Ensemble**, **Jazz Ensemble** and **High School
Choir** directors. Three jobs, in order: (1) why the Hub exists, (2) how to do
their job in it — shown, not described, (3) why it beats the old way,
structurally.

Original constraints from the requester, still binding:

- Simply put, thoroughly explained and shown
- **Do not invent data. Flag every assumption.**
- Only include what serves the purpose directly
- Room for questions and explanation built in (three pause points)
- Deliverables: outline for the presenter, outline for the audience, an
  alterable script following the deck, and a deck of thin but poignant points
- Notes both **separate** and **in each slide's notes area**

---

## 3. Deck structure — 23 slides

| # | Slide | Layout |
|---|---|---|
| 1 | Title — NWSA Music Hub | dark, logo on white tile |
| 2 | Three things, then you decide | 3 cards |
| 3 | The same fact, entered four times | 2-col + callout |
| 4 | One place. Two doors. | 2 big cards |
| 5 | **You set it once. Everyone sees it.** | dark, huge type |
| 6 | What a family sees | rows + dark card |
| 7 | Your day starts here | mock Today card |
| 8 | You mark the exceptions. Nothing else. | status pills + 3 cards |
| 9 | Why that's faster — **4 taps** | dark stat |
| 10 | Four things you get for free | 2×2 grid + pause banner |
| 11 | When the day changes | action pills + outcomes + revert |
| 12 | Borrow a student. Keep your roster. | 2 cards contrast |
| 13 | Three levels — and one rule | stacked levels + chips |
| 14 | The program prints itself | in → chevron → out |
| 15 | Three more, when you want them | 3 cards |
| 16 | Getting families in | 3 numbered steps |
| 17 | Who can see what | **the Dean's slide** |
| 18 | Who can do what | 4 role rows |
| 19 | Where it lives, what it costs | 4 tiles |
| 20 | Old way → new way | comparison table |
| 21 | What I'm asking of you this week | 4 numbered asks |
| 22 | When you're stuck | 3 cards |
| 23 | Questions / what I'm NOT claiming | dark |

Pause points: after **10**, after **16**, and at **23**.

---

## 4. Claim → source map

**This is the table to re-verify against current code when the Hub changes.**
Every factual claim in the materials traced to one of these when written:

| Claim in the deck | Source |
|---|---|
| Two surfaces: public site `/`, Director Panel `/director` | `src/main.tsx`, `README.md` |
| Google sign-in; allowlist is the `directors` Firestore collection; unauthorized message; Owner adds from Directors screen | `src/director/components/AuthGate.tsx`, `src/director/directors/DirectorsManager.tsx` |
| Four roles: owner / director / teacher / assistant (Personnel Assistant) | `src/director/types.ts` (`StaffRole`), `firestore.rules` header |
| Personnel Assistant = attendance only, assigned ensembles, marks stamped with name+role | `src/director/assistant/AssistantApp.tsx`, `AttendanceRecord.updatedByRole` |
| Exception-only attendance: Absent / Late / Excused / Lesson; Present derived | `src/director/attendance/StudentCard.tsx`, `AttendanceView.tsx`, `README.md` |
| Lesson pull-out = time window + reason, not an absence | `AttendanceView.saveLesson`, `RosterOverride.kind === 'lesson'` |
| Count chips filter the list; list never reflows under a pending tap | `AttendanceView` (`statusFilter`, `dir-roll-dim`) |
| Minutes-late recorded silently; last-5-rehearsal dots; section-gap warning; parent-reported absences on the row | `AttendanceView` (`handleToggle`, `history5`, `gapWarning`), `StudentCard` |
| Roll receipt: when + by whom + absent count | `CalendarEvent.rollTaken`, `stampReceipt()` |
| Follow-up queue — unexcused, last 7 days, Excuse / Contacted / Dismiss | `src/director/today/TodayView.tsx` (`followUps`, `FollowUpSheet`) |
| Attendance CSV export | `src/director/attendance/attendanceCsv.ts` |
| Today screen: expected counts, receipts, changes, lessons, ensemble filter remembered | `TodayView.tsx` |
| Schedule Change: swap / shift / room / cancel → change note → red public banner → optional urgent announcement; **Revert to normal** restores a pre-change snapshot | `src/director/schedule/ScheduleSwapView.tsx`, `CalendarEvent.changeFrom` / `changeNote` |
| Close a day cancels everything on a date + one urgent announcement | `TodayView.closeSchoolFor` |
| Temporary roster changes: add/remove, event or date range, reason, `destEnsembleId`; base roster untouched | `RosterOverride` in `types.ts`, `rosterResolver.ts` |
| Announcements: info / important / urgent, pin, `expiresOn`, `publishAt`, `titleEs`/`bodyEs` | `Announcement` in `types.ts`, `AnnouncementManager.tsx` |
| Urgent → site-wide banner + **queued** relay | `announcements/urgentRelay.ts`, `notifyQueue`, `docs/POWER-AUTOMATE-RELAY.md` |
| Repertoire metadata, movements, per-instrument parts, multi-ensemble pieces | `RepertoirePiece` in `types.ts`, `RepertoireManager.tsx` |
| Printed program in director-set order, masthead "New World School of the Arts", runtime total | `src/public/PublicProgram.tsx` |
| "My part" matched to instrument | `PublicPiece.tsx` / `PublicSchedule.tsx`, `StartGuide.tsx` |
| Documents, Assignments (+ Google Form for playing exams), Seating (seat 1 = principal), chair-view roll | `documents/DocumentsView.tsx`, `assignments/AssignmentsView.tsx`, `seating/SeatingManager.tsx`, `AttendanceView` chart view |
| QR kit (posters + folder slips) and vanity slugs `/we` `/jazz` `/choir` | `src/director/qr/QrKitView.tsx`, `src/shared/vanity.ts` |
| Subscribable `.ics` feeds, refreshed on a 4-hour cron | `scripts/generate-feeds.mjs`, `.github/workflows/deploy.yml` |
| No accounts for families; device-local identity; parent mode | `src/shared/identity.ts`, `PublicLookup.tsx` |
| Public vs staff-only data split, enforced by rules | `firestore.rules` — public: `ensembles`, `students`, `events`, `rosterOverrides`, `announcements`, `repertoire`; private: `contacts`, `attendance`, `progressNotes`, `lessons` |
| Student names/instrument/grade/ensemble are world-readable | `students` collection is public — required by the name lookup |
| Free hosting (GitHub Pages + Firebase Spark) | `README.md` setup section |
| PWA install + offline shell + update toast | `public/manifest.json`, `public/sw.js`, `src/main.tsx` |
| Start Here page + glossary + `nwsaorchestras@gmail.com` | `src/public/StartGuide.tsx` |
| Live site responds | `https://d5nf9kcskk-byte.github.io/nwsa-music-hub/` → HTTP 200 on 2026-07-28 |

**Ensembles in the codebase:** Symphony Orchestra, Wind Ensemble, Camerata String
Orchestra, Jazz Ensemble, Chamber Winds, College Chamber Orchestra, High School
Choir, Opera Orchestra (`seedData.ts`), plus Philharmonic (`baseline2526.ts`).

---

## 5. Assumptions register (A1–A10) — carry forward

Full text is in `00-PRESENTER-OUTLINE.md`. Summary:

| # | Assumption |
|---|---|
| A1 | Names of the Dean and the three directors unknown → placeholders |
| A2 | ~40 minutes, in a room, with a screen and Wi-Fi |
| A3 | The presenter holds the **Owner** account |
| A4 | The choir director may already have an account (`seed-directors.mjs` lists a second founding email) — unverified against live data |
| A5 | **Teams/email relay unverified.** App queues to `notifyQueue`; delivery is an external Power Automate flow |
| A6 | **No time-savings numbers anywhere.** Slide 9's arithmetic is design math (taps = absences), not a study |
| A7 | Live enrollment unknown (repo has seed + baseline only) → "about eighty" |
| A8 | The "before" story: documented fact is only that it replaced a **Notion** workflow whose mobile UX couldn't do fast tap-to-mark roll. Everything else is the presenter's memory |
| A9 | Cost: "free tiers as configured today," never "free forever" |
| A10 | Site confirmed live 2026-07-28 |

---

## 6. Build and QA — environment gotchas

```bash
npm install pptxgenjs                      # not in package.json
node docs/presentation/build-deck.cjs      # writes the .pptx + notes
```

- **`.cjs` is required.** Root `package.json` has `"type": "module"`, so a `.js`
  generator using `require()` fails.
- **LibreOffice needs installing before visual QA.** Only `libreoffice-core` ships
  in the container; conversion fails with `Error: source file could not be loaded`
  until: `apt-get update && apt-get install -y libreoffice-impress poppler-utils`
  (the `apt-get update` is required first — without it the fetches 404).
- Render for review:
  ```bash
  python3 /root/.claude/skills/pptx/scripts/office/soffice.py --headless --convert-to pdf deck.pptx
  pdftoppm -jpeg -r 100 deck.pdf slide
  ```
- Validate: `python3 /root/.claude/skills/pptx/scripts/office/validate.py deck.pptx`
  (needs `pip install defusedxml lxml "markitdown[pptx]" Pillow`).

### Layout rules learned the hard way

- **Slide titles must fit one line: ≤ ~40 characters** at 36pt Cambria bold across
  the 11.93" content width. Longer titles wrap and collide with the content
  block at y≈1.9. Three slides had to be retitled for this.
- Content should occupy **y ≈ 1.9 → 6.6**. Earlier drafts stopped at 5.5 and left
  a dead band across the bottom of every slide.
- Check cumulative card heights against any footer line (slide 18's footer
  overlapped the last card before it was tightened).
- Helpers in the generator: `light(title, kicker)`, `dark(kicker)`,
  `badge()`, `card()`, `row()`. Reuse them — they're what makes the deck read as
  one system.
- Palette is derived from the app itself: teal `0D7E8E` (the PWA `theme-color`),
  deep `0A5560`, dark bg `0C272E`, gold `B8862B`, ink `17272B`, card `F1F6F7`.
  Fonts: Cambria headings / Calibri body (both render true-to-width in QA).
- `public/nwsa-logo.png` is 140×200 with a teal wordmark — on dark slides it must
  sit on a white tile or the "NWSA" letters disappear.
- Notes are attached in one pass at the end:
  `pres.slides.forEach((s, i) => s.addNotes(notes[i]))`.

---

## 7. What a redo needs to check

When the Hub's setup changes, these are the parts most likely to go stale:

1. **Nav and screen names** — the deck names Today, Take Roll, Who's Out,
   Schedule Change, Temporary Roster Changes, Roster, Progress Notes,
   Repertoire, Documents, Assignments, Announcements, Ensembles, QR Kit,
   Directors. Any rename ripples into all four documents.
2. **Roles** — slide 18 and the handout both enumerate four.
3. **The privacy split** — slide 17 is the Dean's slide; if `firestore.rules`
   moves anything between public and private, that slide is wrong in the worst
   possible way.
4. **The relay** (A5) — if Power Automate is now confirmed delivering, slide 13
   and its notes change from "won't promise it" to a plain statement.
5. **Sign-in URL / vanity slugs / feed URLs** — slides 16, 21 and the handout.
6. **Ensemble list** — anything new (e.g. Philharmonic) may belong on slide 4/16.
7. **Anything added since** — new features need a home, but the "only what serves
   the purpose" rule applies: a feature the Dean and three directors won't touch
   does not earn a slide.

---

## 8. 2026-08-03 rebuild — what changed and why

Triggered by the Aug 2026 privacy-model change (see repo root `CLAUDE.md`).
Re-verified every row in §4 directly against the current source (not the old
deck, not this file) before touching any deliverable.

**The one correction that mattered:** slide 17 (the Dean's slide) said
`students`/`rosterOverrides` were world-readable collections and stated
outright that student **grade level** was public "by design." Both were
wrong. Since the privacy-model change: `students` and `rosterOverrides`
(with its free-text `reason` field) are staff-only; the public site reads
`studentsPublic` (name, preferredName, instrument, section, ensembleIds,
status — **never grade or pronunciation**) and `rosterOverridesPublic`
(everything except `reason`), both enforced field-by-field in
`firestore.rules`, not just by app code (`src/director/publicMirror.ts` is
the single source of truth for the field lists). Slide 17, slide 23, and
every mention of this in `00`–`03` were rewritten to say grade is staff-only,
always — not public and reversible, which is what the old materials claimed.

**Everything else in the old claim map (§4) held up:** two surfaces, four
roles (owner/director/teacher/assistant), exception-only attendance, the
Schedule Change / Temporary Roster Changes screen pair (confusingly the file
names are swapped relative to intuition — `ScheduleSwapView.tsx` is Schedule
Change, `schedule-changes/ScheduleChangeView.tsx` is Temporary Roster
Changes — unchanged, not a new problem), announcements, repertoire → program,
QR kit, all 8 vanity slugs (`/so /we /wind /jazz /cam /choir /opera /cco`),
the 4-hour `.ics` cron, and the 9-ensemble list (Symphony, Wind Ensemble,
Camerata String Orchestra, Jazz Ensemble, Chamber Winds, College Chamber
Orchestra, High School Choir, Opera Orchestra, Philharmonic) — unchanged,
though its source moved: `seedData.ts`/`baseline2526.ts` no longer exist
(real rosters were purged from files *and git history*, per CLAUDE.md);
provisioning now runs through `seedCalendar.ts` plus two admin scripts
(`add-ensembles.mjs`, `import-official-calendar.mjs`).

**One label rename:** the "Schedule" nav item is now labeled **"Calendar"**
in the director app (same screen, same `ScheduleView.tsx` component) — not
significant enough to change deck copy, but worth knowing if you're driving
the live demo.

**The Teams/email relay (A5) is still unverified** — the app still only
queues to `notifyQueue`; delivery is still an external, untested Power
Automate flow. The internal queuing logic got more robust (a scheduled sweep,
double-send protection) but that's not user-facing and doesn't change what
can honestly be promised onstage.

**New since the old deck, deliberately given no slide** (per the "only what
serves the Dean and three directors" rule): a Teacher-role private-lesson
workflow (`src/director/teacher/`); an Owner-only sign-in/activity audit log;
a more elaborate PWA update-toast. None of these are things these four people
touch directly.

**Framing shift, per explicit request this round:** several feature slides
(Schedule Change, Temporary Roster Changes, Announcements) were re-kickered
to "Live —" and their speaker notes rewritten to demo the feature live on
screen (with a second browser tab open to the public site) rather than
describe it — consistent with slides 6/7/8/14, which were already built this
way. The ask was to keep the focus on *how directors get into the app and
use it*, not on backend mechanics.

**Files touched this round:** `build-deck.cjs` (slides 6, 11, 12, 13, 17, 23
content + notes; slide 6 also had a pre-existing text-overlap bug, fixed),
`00-PRESENTER-OUTLINE.md`, `01-AUDIENCE-OUTLINE.md`, `02-SCRIPT.md`,
`03-SPEAKER-NOTES.md` (kept identical to the deck's notes area per the
standing rule), root `README.md` (its Firestore collections list was stale
and out of sync with `firestore.rules` — fixed independently of the deck).
`.pptx`/`.pdf` regenerated from `build-deck.cjs`, validated
(`scripts/office/validate.py` — all passed), and visually inspected slide by
slide at 100dpi for overflow/overlap before calling it done.
