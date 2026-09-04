# Ask · Today · Me: the read side rebuilt as answers (design v2)

**Date:** 2026-09-04
**Status:** design, verified by adversarial review; nothing built yet
**Branch:** `claude/nwsa-music-hub-architecture-gxhkjg`

## What this is

The owner asked for four things: a consistency review of both surfaces, an
interpretive search, deep roster indexing, and a conversational "ask" layer
that avoids per-question model cost. Then the bar was raised: a product that
answers any question about the organization from its own data, anticipates
the next question, collapses the family side to three things (Ask, Today, Me)
and the staff side to "just add", and is sellable to other schools and
orchestras.

Plan v1 was written, then attacked by six independent reviewers (engineering
risk, search and NLP architecture, privacy and education compliance, product
and sales, phone UX research, ops and cost at scale). Their 33 most
load-bearing claims were then verified refute-first against the code and the
GitHub Actions history. Three critic claims were overturned; the rest held.
This document is what survived. The full critiques and the verification
reports are held privately by the owner, not in this public repo (security
findings never go in a world-readable place; see `docs/weekly-review.md`).

## Verdict on a ground-up rebuild

Keep the write side: rules, projections, feed contracts, the deterministic
service worker, the self-checks. Rebuild the read side, but not as a store
that replaces the screens' listeners (that was v1, and it lost on three
independent grounds below). The read side becomes: one derived index, one
typed query contract, one deterministic executor with real answer types, a
rules registry for anticipation, and a model tier that plans over typed
queries and never states a fact.

## What changed between v1 and v2, and why

1. **Zero tokens is tier zero, not the promise.** A deterministic grammar
   handled 8 of 15 realistic questions in the review. It cannot do negation,
   comparison, aggregation, "why", or an honest "I can't see that". The core
   becomes a typed `AskQuery` plus a deterministic executor with answer
   types (list, entity, field, yes/no, count, compare, none). A hosted model
   is a first-class planner that chooses which typed queries to run and
   returns record ids plus an answer type. It never writes prose carrying a
   name, a number, or a time. The owner's non-goal about tokens is a billing
   rule (whose key, whose bill), not an architecture rule.
2. **The Hub Graph does not replace per-screen listeners.** Public devices
   run a memory-only cache (Sept 2026), so a shell-level graph would cost
   every cold visit roughly 2,500 to 4,500 reads against 700 to 1,000
   today, reversing a documented quota fix. The August audit rejected a
   central store on the record. And computing expectation for all students
   the way the student page does it for one is minutes on a phone. The
   graph survives as a pure, Node-loadable derived index mounted by the
   Find/Ask overlay, built from the arrays the existing hooks return, with an
   inverted expectation builder (resolve each event once, then per student).
   That builder also replaces the feed generator's hand-copied version, which
   disagrees with the student page today for academic classes.
3. **Four tabs, not three; Ask is an overlay, not the landing screen.** Tap
   counts for the top fifteen tasks showed Ask slower for the safety tasks
   ("is rehearsal cancelled today" is zero taps on Home now). The concert
   check-in window is ten minutes. The prior design study recorded three
   reviewers blocking removal of the tab bar on the route QR codes land on.
   Today lands with the zero-tap strips; Ask sits on it as an overlay.
4. **Selling is blocked by paper and plumbing, not by UX.** Every Cloud
   Function bakes in the NWSA org config and the function deploy targets only
   the NWSA project, so a second org has no check-in, no tally, no
   confirmation email, no staff calendars. Onboarding an org is four
   hand-written files, about eight repository secrets, and nine to sixteen
   hours. The "hourly" feed cron measures a median gap of 4.3 hours. A
   district's privacy review has day-one asks this repo cannot yet answer
   (opt-out, deletion, export, retention, notice).
5. **Segment honesty.** Ask lands for youth orchestras and K-12 directors
   paying from their own budget. District administrators buy compliance and
   integration. Professional orchestras have no "Me" (the paid roster has no
   public projection, by design) and their pain is availability, confirmation
   and service counts. The demo closer is not Ask; it is two phones and a live
   schedule change.

## Verdict on every v1 suggestion

| Suggestion | Verdict | What the challenge established |
|---|---|---|
| Deterministic grammar as the core | Demoted | 8 of 15 real questions. Tier zero. |
| On-device model tier | Dropped | Chrome's built-in model is desktop only (22 GB free disk, GPU); not on Android or iOS. |
| Model tier parse-only, off by default | Changed | Planner over typed queries, client-side loop, ids and enums only, staff first. |
| Hub Graph as the read path for screens | Changed | Pure derived index mounted by the overlay. Screens keep listeners. |
| Expectation edges cached on device | Changed | Only in the inverted form. Also fixes the feed divergence. |
| One card kit with a staff mode | Kept, adjusted | Cards take action slots as props; staff code stays under `src/director`. |
| Answers become addresses | Kept, adjusted | Address is a canonical query object, never the sentence. Additive namespace; never a new top-level slug (vanity slugs are printed). Calendar answers are `CalendarViewSpec`s, so they are already feeds. |
| One vocabulary module EN/ES | Doubled down | Must also be the lexicon's concept layer. |
| Resources and Office split (director menu) | Doubled down | Organize by who can see it. |
| One staff sign-in link | Doubled down | Four links mount one app. |
| View As via session storage | Guard changed | A lint rule is not a boundary. View As runs on a second, unauthenticated Firebase app instance so the rules refuse staff data. Writes disabled while active. |
| Door consolidation | Moved later | Highest regression surface (revert/combine semantics), no component tests. |
| One attachment picker, one Subscribe sheet | Doubled down | No dissent. |
| Find index with MiniSearch | Conditional | Only if it replaces the four existing matchers. Justify on typo tolerance. Incremental updates, embargo filtered at query time. |
| Lexicon in org config and director-editable | Changed | Mutually exclusive. Defaults in code; edits in a staff-write Firestore collection. |
| Follow-up chips as anticipation | Changed | Anticipation goes inside the card (the concert day sheet pattern). Chips only for slot changes, three at most. |
| Slot inheritance as conversation engine | Kept, with rules | Explicit handling for negation, topic switch, siblings, chained dates, past tense; each pinned. |
| Name-ask inside the answer | Kept, adjusted | Renders the same lookup component (confirm card, parent mode). "Remember" off by default in parent mode. |
| Unanswered questions logged as text | Changed | Shape only (intent id, matched concepts, answered flag). Never a child's typed text. |
| Home is the remembered person's answer | Changed | Home keeps everything, cancellations included. |
| Three-item public nav | Changed | Four tabs plus More. |
| One staff Add, sentence first | Adjusted | One grouped Add door. Sentence-first only for events and student moves (already built). Every act lands in the existing review sheet. |
| Ask can act for staff | Kept, with a rule | Prefilled forms the human submits. Never a model-callable write. |
| Folder-slip QR as identity | Doubled down | Fine while identity gates nothing. Pin that no function accepts it as proof. |
| PWA push | Adjusted | Topic-based only, never per person. Gate behind ten paying orgs. |
| SMS door | Dropped | Carrier registration per org, consent for minors, a texting operator districts already have. |
| Voice | Deferred | Hallway social cost, names aloud. Revisit when the log shows long typed questions. |
| Kiosk | Deferred | A different identity model. |
| Answers inside ICS descriptions | Bounded | Projection facts only. |
| Concert day mode | Doubled down | Half built, demo gold. |
| Morning brief through the relay | Bounded | Public facts and counts only; needs a product email channel first. |
| Stop printing anything that is not a QR | Dropped | Paper is load-bearing for parents. |
| Fold Start Guide into the index | Later | It is hardcoded JSX and one of 23 questions is in Spanish. Must become data first. |

Corrections the verification pass made to the critics: the lookup page is
translated (thirteen `t()` calls; the real Spanish gap is sign-ups, the Start
Guide and the alert strips); a student can already see their concert tally
by school email through the tally function; the college-class meetings came
from the college seeder in late August, and the generator now yields 1,070.

## Plan v2

### Phase 0: sell-ready. Nothing ships to a second customer before this.

Privacy and paper (design-level; the detailed findings are held privately):

- An opt-out flag on the staff-only student record whose effect is to delete
  that student's public mirrors, so feeds, the index and the expander cannot
  see them. Enforced in the mirror write and the backfill script; pinned by
  a self-check.
- A per-org public tier setting: `open` (NWSA today, byte-identical), `link`
  (a family magic link exchanged for a scoped token; per-student feed behind
  a function), `account` (guardian sign-in). A rules difference, never a
  client filter.
- A privacy page from org config; a retention schedule (photos, check-in
  rows, logs); a per-student deletion routine that walks every collection
  and bucket; a per-student export; a subprocessor list; a breach
  commitment. Districts ask for these on day one.
- Review of what the projections and Storage rules expose, against the
  private findings list.
- Written sign-off from NWSA administration on the open roster (audit S2).

Plumbing:

- Functions read the org at deploy time instead of importing the NWSA file.
  Deploys become a matrix over `config/orgs/*.json` with zero per-org
  secrets (workload identity federation). Rules and functions deploy in
  parallel with a read-back drift check.
- Firebase Hosting for every org after NWSA. NWSA stays on Pages: its feed
  URLs are frozen contracts and its cron is free.
- Feeds built by a function: a trigger on a new `calendarViews` doc builds
  that feed in seconds; a dirty-flag schedule rebuilds the rest only when a
  source changed. The hourly cron becomes NWSA-only legacy. Public
  projections only, same as `generate-feeds.mjs`, pinned.
- The setup script finishes the job: billing link, bucket, IAM grants, API
  enablement, App Check, budget alert. Per-org attention drops from nine to
  sixteen hours to about ninety minutes.
- Lint and typecheck in a PR workflow (none exists today), feature flags per
  org (`features.find`, `features.ask`, `features.viewAs`), uptime checks on
  the site and functions, a browser error intake, the feed verify step made
  fatal.
- Billing: convert the NWSA Blaze trial before 2026-11-13; decide whose card
  pays for each customer project.
- Tenancy decision, written into CLAUDE.md: a project per org for data, a
  shared control plane, workload identity for deploys, a single-region
  default for new projects.

### The Ask machine

One typed query object is the contract for everything.

```
utterance (EN / ES / mixed) + device identity + prior AskQuery
   |
   v
TIER 0 (device): question-tuned chrono config; ONE bilingual lexicon
scored per token; ONE entity matcher (nickname table lifted to shared);
answer-type detection
   |  miss / low confidence / compare-count-negation
   v
TIER 1 (hosted planner, org-keyed): tools = the same typed queries,
strict schemas, enum-constrained ids, <=3 rounds, client-side loop,
returns {answerType, recordIds, chips}; never prose with facts
   |
   v
AskQuery (typed, canonical, serializable = the URL)
   |
   v
EXECUTOR (device): derived index over role-fed hook arrays; on-demand
date-slice fetch outside the public window; answer types incl. honest none
   |                      |
   v                      v
NOTICINGS registry    FOLLOW-UP table (<=3 chips, slot changes only)
(pure rules, severity-ranked, fixture-tested)
   |
   v
cards + basis line + "as of" + link to the page
```

- Noticings consolidate the four rule sets that already exist inline
  (`today/SeasonChecklist.tsx`, `today/TodayView.tsx` nudges and follow-ups,
  `lessonConflicts.ts`, `shared/concertToday.ts`) plus "what changed since
  you last looked" (most records carry `updatedAt`).
- Enrichment at write time: a build step over public projections generates
  synonyms in both languages and tags per record, keyed by content hash,
  outside the service-worker precache. Tokens once per edit, never per
  question. Batch pricing applies.
- The model contract: names replaced by placeholders before the request; no
  user-generated free text in context (parent messages, absence reasons,
  sign-up answers, announcement bodies); no write tools; output validated
  against a closed schema; staff first behind an ID token; public only after
  App Check enforcement plus per-device and per-org caps and a kill switch;
  zero data retention and no training as contract terms; per-org flag,
  default off.
- Evaluation corpus checked in and gated in `deploy.yml` like the existing
  self-checks: paraphrase families EN/ES, conversation sequences, privacy
  negatives per role, honesty negatives (expected answer `none`), address
  round-trips, a time-shift run. False confidence must be zero.
- Every answer shows its basis ("Based on Sofia G. · Camerata, Wind Ensemble
  · as of 3:41 pm"), links to the full page, and shows conflicts as two
  facts, never resolved silently.

### Navigation and consistency

- Public bar: **Today · Me · Calendar · Ask**. Header keeps ES|EN, text
  size, theme and More. More: Concerts, Check-In, Ensembles & Classes,
  Resources (Announcements, Repertoire, Assignments, Documents, Sign-ups,
  Campus Map, Contact), Start Here, saved students, one Staff sign-in.
- Staff bar: **Today · Roll · Calendar · Ask**. Header: **+ Add** (grouped
  sheet) and More (daily loop, People, Resources = what families see, Office
  = staff only, View As).
- Around the Ask box: six starter chips chosen by state, typeahead from two
  characters, an identity chip, three recent questions, a browse-everything
  row, a bilingual placeholder. After submit the keyboard drops and the
  answer renders full height with the bar visible. Never autofocus on staff.
- One vocabulary module (labels + translations + lexicon concepts). Names:
  Calendar (whole school) vs My Schedule (a person); Concerts; Documents;
  Students (the list) vs Expected (an event's attendees) vs Roster (an
  ensemble's members); Pull-out (rehearsal window) vs Lessons (applied log).
- Later: door consolidation (six event doors, three student doors, four
  lesson writers, four attachment surfaces, four feed panels), one
  attachment picker, one Subscribe sheet, Locations gets a nav home.

### Deep roster indexing

The inverted expectation builder is the single implementation, imported by
the student page, the director's student panel, Today and the feed
generator, gated on the org flag for the NWSA-only academic-class branch.
Identity stays device-local and never appears in a query for non-public
data. Invite-only sign-ups are skipped by the index entirely. Embargoed
announcements and assignments are filtered at query time, never baked in.

### Order of work

| Phase | Ships | Gate |
|---|---|---|
| 0 | Sell-ready privacy and plumbing | A second org installs in ninety minutes with every function working |
| 1 | Vocabulary, nav skeletons, View As, feature flags, CI lint | NWSA behavior unchanged behind flags |
| 2 | Derived index, inverted expectation builder, feed generator on it, Noticings registry | Feed and page agree for every student |
| 3 | Find overlay with enrichment, both surfaces | Corpus passes |
| 4 | Ask tier zero with answer types, name flow, chips, Spanish lexicon | False confidence at zero |
| 5 | Model planner for staff, then public after App Check | Eval parity with tier zero on shared cases |
| 6 | Door consolidation, attachment picker, Subscribe sheet | After cards are proven |

Ship to the demo org first, then NWSA. The demo seed must exercise the
lexicon or the sales demo answers nothing.

## Ops facts (verified 2026-09-04)

| Fact | Source |
|---|---|
| Scheduled `deploy.yml` runs: 30 in 119.7 h; gap median 260 min, min 118, max 442 | Actions API, runs #771 to #864 |
| Typical deploy run 1.3 min; billable minutes 0 (public repo) | Actions API |
| Feed build reads 8 collections in full via REST, roughly 2,800 to 4,000 reads per build | `scripts/generate-feeds.mjs` |
| Public cold page load 700 to 1,000 reads; public devices use memory cache | `docs/firebase-blaze-cost-analysis.md`, `src/director/firestoreCache.ts` |
| All Cloud Functions compile with the NWSA org config; deploy targets `nwsa-hub` only | `functions/src/index.ts`, `deploy-functions.yml` |
| Per-org footprint: 1 Firebase project, 1 Pages repo, 2 workflow files, 1 seed script, 1 rules step, about 8 secrets, 1 cron | `docs/new-org-setup.md`, `scripts/setup-new-org.mjs` |
| GitHub limit: 100 secrets per repository | GitHub docs |
| Setup script default Firestore location `nam5` (multi-region price) | `scripts/setup-new-org.mjs` |
| NWSA Blaze billing is a GCP free trial expiring 2026-11-13; lapse detaches Storage | `docs/firebase-blaze-cost-analysis.md` |
| No lint step in any CI workflow; no error reporting; feed failure exits 0 and verify only annotates | `.github/workflows/*`, `src/shared/appStatus.ts` |
| Onboarding an org today: 9 to 16 h of owner attention | `docs/new-org-setup.md` walk-through |

### Model tier cost model

Per-question profile for the planner (two rounds): about 1.9k cached prefix,
about 1.0k uncached input, about 0.2k output. Rates and cache minimums must
be taken from the current API reference at estimate time, not from this
table. At the September 2026 rates (Opus 5 $5/$25 per MTok, Sonnet 5 $2/$10,
Haiku 4.5 $1/$5; cache read 0.1x; minimum cacheable prefix Opus 5 = 512,
Sonnet 5 = 1,024, Haiku 4.5 = 4,096 tokens):

| Model | Per question | 300-student school, every question to the model | Notes |
|---|---|---|---|
| Opus 5 | $0.006 to $0.023 | $21 to $79 per month | quality default |
| Sonnet 5 | $0.002 to $0.009 | $8 to $32 per month | cost option |
| Haiku 4.5 | $0.003 to $0.006 | $9 to $19 per month | cannot cache a short prefix |

If tier zero handles the common questions, divide by about three. A public
endpoint that spends money per call is the one abuse surface the app does
not have yet: App Check, per-device token bucket, per-org daily hard cap
from a counter doc, kill switch, no PII in logs, before it ships anywhere.

### Pricing strawman (from the sales review, unvalidated)

A flat yearly price for a K-12 program under typical procurement thresholds;
family-band pricing plus setup for youth orchestras; no quote for
professional orchestras until availability and service counts exist.

## Open decisions for the owner

1. Four tabs with Ask as an overlay, or three and accept the tap costs.
2. Model tier: staff first behind sign-in, then public after App Check.
   Opus 5 or Sonnet 5, decided by the eval. Whose key, whose bill. Zero data
   retention and no training are contract items with the provider.
3. "Required" means the obligation flag, the audience-required lists, or
   both.
4. The public tier for the first non-NWSA school.
5. Tenancy written into CLAUDE.md now.
6. NWSA administration sign-off on the open roster, in the repo.
7. Billing conversion before November 13; the card question for customers.
8. Whether the privately recorded exposures get fixed this month regardless.

## Next session

The owner asked for a tappable sandbox demo of the redesign and a realistic
cost estimate as a separate session. The prompt for that session is in
`docs/superpowers/plans/2026-09-04-demo-and-cost-prompt.md`.
