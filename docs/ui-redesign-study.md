# UI Redesign Study — Spotify + Six SaaS References

**Status:** study only — no application code changed.
**Branch:** `claude/ui-redesign-spotify-study-3buf5v`
**Date:** July 2026

The owner asked what it would take to redesign NWSA Music Hub's UI and layout
using Spotify as the primary layout/flow/wireframe reference, with Basecamp,
Airbnb, Asana, Slack, HubSpot, and QuickBooks Online as additional examples —
and to surface any significant usability roadblocks *before* implementing
anything.

## 1. Method

A 25-agent study, run in five phases:

1. **Audit** — four parallel readers mapped the public surface, director
   surface, design system/CSS, and data model of the actual codebase.
2. **Reference teardowns** — eight researchers produced wireframe-grade
   anatomies of Spotify (desktop + mobile, including its documented usability
   criticisms), Basecamp, Airbnb, Asana, Slack, HubSpot, and QuickBooks Online.
3. **Concepts** — four independent designers produced competing redesigns:
   full Spotify adoption ("Encore"), Spotify-structure/NWSA-skin hybrid
   ("Front of House / Backstage"), a utility-SaaS shell ("Desk & Door"), and a
   conservative refresh ("Same Stage, New Lighting").
4. **Judging** — three judges scored all concepts on family usability,
   director efficiency, value-per-effort, accessibility, and brand fit, each
   weighting a different priority (families / director / engineering realism).
5. **Adversarial critique** — six critics attacked the winning concept from
   the lenses: non-technical parent via QR code, hurried student, director
   mid-rehearsal, accessibility + EN/ES, content/artwork reality, and
   engineering migration risk. Their findings are the roadblock register in §7.

## 2. The app today (audit digest)

Both surfaces are **phone-first hamburger apps**; there is no desktop layout
anywhere in ~5,900 lines of plain CSS (only a 640px overlay tweak). That is
simultaneously the largest gap versus every reference product and the largest
opportunity: desktop is a blank canvas, so a sidebar shell can ship without
disturbing the phone experience families already know.

- **Public ("the Door")** — 16 screens, no login. Sticky teal header
  (EN/ES toggle, "Aa" text-size control, search, hamburger), slide-in menu,
  4-tab bottom bar (Home / Calendar / My Schedule / Concerts), full-screen
  fuzzy search. Identity is device-local localStorage (saved student, parent
  mode with multiple kids) — no accounts. Exactly one public Firestore write:
  planned-absence reports.
- **Director ("the Desk")** — 12 views behind auth, tab-in-URL
  (`/director/<tab>?ensemble=…`). Three views (Who's Out, Subs & Pull-outs,
  Ensemble hub) are unreachable from the menu today — real nav debt.
- **Load-bearing constraints** a redesign must not break:
  four **printed** surfaces (concert program, season "fridge copy", start
  guide, QR kit); QR/vanity short links on paper posters (`/so /we /wind /jazz
  /cam /choir /opera /cco`); static ICS feed URLs; EN/ES i18n; the "Aa"
  text-size control (implemented as CSS `zoom` on `.pub-app`); offline PWA
  service worker (`nwsa-hub-v1`); the code-split boundary (public users never
  download director code); deep links (`?ensemble=`, `?focus=`, `#anchors`).
- **Latent bugs the audit surfaced en passant:** the top ~727 lines of
  `src/index.css` are a dead dark-purple theme from an earlier app iteration
  (`.app`, `.bottom-nav`, `.exercise-*`); print styles force white backgrounds
  but not text colors (a dark-mode-print "invisible ink" risk); the z-index
  ladder is ad hoc (30–400).

## 3. What each reference contributes

| Reference | Contribution to the design |
|---|---|
| **Basecamp** | The one-page **ensemble hub** (tool tiles: announcements, schedule, repertoire, seating, roster) and the anti-sprawl rule: public nav is five destinations and never grows. Calm-notification philosophy. |
| **Airbnb** | The event page as a listing: sectioned content + a **sticky day-sheet action card** (call time · dress · venue · Add to calendar) that never scrolls away; mobile bottom action bar; "Show all N" progressive disclosure; click-to-activate maps with exact pins. |
| **Asana** | **Slide-in record panes** (open a student without losing roster scroll; Esc closes; URL deep-links) and fixed multi-view tabs over one dataset for the director ensemble page. Fixed home widget grid. |
| **Slack** | Ensembles-as-channels sidebar rows with color dots and quiet "changed since you last looked" indicators; Cmd+K quick switcher; the isomorphism rule (sidebar and tab bar hold the same items). |
| **HubSpot** | **Saved-view index tables** for the roster (All / per-ensemble / Seniors / Missing info), bulk-action bar, and record anatomy (identity card + timeline + associations). Educational empty states. |
| **QuickBooks Online** | The director shell: grouped collapsible left rail (≤6 groups, click-not-hover), the universal **"+ New"** create menu with return-to-context, the money-bar reborn as the Take-Roll status strip, review-queue framing for follow-ups, settings split behind a gear. |
| **Spotify** | The piece/album page (movements = tracklist, program notes = liner notes), the deterministic gradient "cover art" system seeded from `ensembleColor`, the happening-now mini-bar in the mini-player slot — plus its documented failures used as an **anti-pattern checklist** (dark low-contrast chrome, hover-only affordances, carousels that hide data, unstable layouts, weak information scent for goal-directed lookup). |

## 4. Four concepts, three judges

| Concept | Angle | Family judge | Director judge | Engineering judge |
|---|---|---|---|---|
| Encore | Full Spotify shell, dark theme | 21 | 24 | 31 |
| Front of House / Backstage | Spotify structure, NWSA skin | 2nd | 2nd | 41 |
| **Desk & Door** ★ | Utility-SaaS shells + Spotify moments | **win** | **win** | 40 |
| Same Stage, New Lighting | Conservative refresh | 3rd | 3rd | **42 (win)** |

The family-usability and director-efficiency judges both picked **Desk & Door**.
The engineering judge narrowly preferred the conservative refresh on blast-radius
grounds; its de-risking release plan was grafted into Desk & Door as Phase 0,
along with ~30 other graft ideas voted in from the losing concepts (deterministic
cover-art component, director session bar, mounting all new fixed chrome outside
the text-zoom subtree, luminance-aware text color over ensemble gradients, etc.).

Why the losers lost, in one line each: **Encore** put times and rooms into
exactly the low-contrast dark register Spotify is criticized for, for the users
least able to tolerate it; **Front of House** was strong but second everywhere —
a structure transplant that still inherits browsing-first assumptions;
**Same Stage** is the best value-per-effort but leaves the director console's
nav debt and desktop absence unaddressed.

## 5. Recommended design: "Desk & Door"

### Thesis

NWSA Music Hub's two real jobs — a parent answering "where is my kid supposed to be, and did anything change?" and a director marking roll for 80 students one-handed mid-rehearsal — are utility jobs, not browsing jobs. So the shells come from the six SaaS references: the public surface (the "Door") becomes a Basecamp-calm, document-first site with a fixed five-destination nav and Airbnb-style detail pages whose one next action (Add to calendar / Get directions) is always pinned on screen; the director console (the "Desk") becomes a QuickBooks-Online-style working shell — grouped left rail, universal "+ New", dense HubSpot saved-view tables, Asana multi-view ensemble pages and slide-in record panes. Spotify is applied only where the content is literally music and its documented failures can't hurt: the piece page becomes a genuine track/album page, ensemble brand colors become Spotify-style gradient "cover art" heroes (the data model has zero images), and NowNext consolidates into a persistent "happening now" mini-bar in the now-playing slot. Spotify's audited anti-patterns — horizontal carousels that hide data, hover-only affordances, artwork-first grids without artwork, algorithmically unstable layouts, dark-only low-contrast chrome — are explicitly designed out, because every one of them attacks exactly what a schedule app must guarantee: completeness, predictability, and legibility (including in print).

### Information architecture

== GOVERNING RULES ==
(1) Basecamp anti-sprawl rule: the public nav is five destinations and never grows; new capability lands as a tile inside an ensemble hub, never as a new nav item. (2) Slack isomorphism rule: desktop sidebar items and mobile bottom tabs are the SAME items — nothing relocates conceptually between devices, only spatially. (3) Zero URL churn: router basename /nwsa-music-hub, all routes, vanity slugs (/so /we /wind /jazz /cam /choir /opera /cco), hash anchors (/ensemble/:id#repertoire, /map#anchor), query deep links (?focus=, ?ensemble=, ?staff=1), and ICS feed URLs ({origin}/nwsa-music-hub/feeds/*.ics) are contract-frozen. (4) One sticky element per screen edge per breakpoint (Airbnb discipline), with a formalized z-index scale replacing today's ad hoc 30–400 ladder.

== PUBLIC SURFACE ("the Door" — no login, mobile-first) ==
TOP-LEVEL DESTINATIONS (fixed): 1. Today (/, the bounded home feed) · 2. Calendar (/calendar) · 3. My Schedule (/student/:id via /lookup) · 4. Concerts (/concerts season page) · 5. Ensembles (/ensembles index → /ensemble/:id hubs).
SECONDARY "RESOURCES" SET (menu/sidebar section, not tabs): Announcements, Repertoire, Assignments, Start Here, Campus Map.
HIERARCHY: Today → (alerts, today's events, coming up, ensembles grid, all-caught-up end marker) → Ensemble hub (Basecamp one-page tool-tile hub: Announcements, Schedule, Repertoire, Seating, Roster, Subscribe) → detail pages: Event (Airbnb detail skeleton + sticky day-sheet action panel), Piece (Spotify track page), Program (print-sacred document — untouched layout, masthead stays exactly "New World School of the Arts").
CROSS-CUTTING LAYERS: Identity (localStorage remember-me + parent mode) surfaces as a saved-student switcher pinned at the sidebar bottom / in the mobile menu — Basecamp "My Stuff": My Schedule aggregates rehearsals, practice card, parts, planned-absence write. GlobalAlerts (urgent/cancellation/all-clear strips) stays site-wide at top of content on every page — never demoted. NEW: an optional "Updates" view (announcements + schedule changes interleaved, each row leading with ensemble name + change type, "since your last visit" divider computed from a localStorage last-seen timestamp — Slack Activity, corrected per its criticism). NEW: "Happening now" mini-bar (NowNext consolidation) docked in the Spotify now-playing slot, rendered only when a saved student has a NOW/NEXT event today.
WHAT MOVES WHERE: the hamburger menu's route list → desktop pinned sidebar; on mobile the hamburger survives but slims to Resources + ensembles accordion + identity + director login. SearchOverlay is unchanged on mobile; on desktop it gains a persistent header search field (Slack top bar) opening the same overlay as an anchored palette. Nothing else moves; the four bottom tabs are frozen (Spotify tab-churn lesson).

== DIRECTOR CONSOLE ("the Desk" — auth-gated) ==
NAV GROUPS (QBO grouped rail, ≤6 groups, click-to-expand accordion — never hover): 
1. Today (dashboard) · 2. Attendance → Take Roll, Who's Out, Tracker · 3. Schedule → Calendar, Schedule Change (swap), Subs & Pull-outs · 4. People → Roster, Progress Notes · 5. Library → Repertoire, Assignments, Announcements · 6. ENSEMBLES section: one color-dot row per ensemble (Slack sidebar), each opening the Ensemble page.
This surfaces the three currently menu-orphaned tabs (whosOut, scheduleChanges, ensembleHub) as first-class destinations while preserving the DirNavigate go()/intent-param cross-nav contract.
ENSEMBLE PAGE: Asana multi-view tabs over one data store — Overview / Roster / Attendance / Schedule / Repertoire / Seating / Program. Fixed tab set, no user-created views (Asana's clutter lesson). SeatingManager lives here.
"+ NEW" (QBO flagship): pinned pill above the rail, opening a two-column grouped create menu — SCHEDULE: Rehearsal, Concert, Event, Generate rehearsals… · PEOPLE: Student, Sub/Pull-out · COMMS: Announcement, Progress note · LIBRARY: Piece, Assignment. Selecting opens the existing form as a right slide-in (desktop) / bottom sheet (mobile); closing returns to prior context.
GEAR (QBO settings split — setup out of daily nav): Locations, ICS import, seeders, QR Kit, Season Checklist + graduate-seniors, sign-out. 
RECORDS: Student and Event get HubSpot record anatomy delivered via an Asana slide-in side pane on desktop (list stays visible; Esc closes; URL deep-links) and a full-screen sheet on mobile.
GLOBAL: DirectorSearch = Cmd+K quick switcher (already built; gains shortcut + persistent field). WriteTray (undo/retry) and the header saving/saved cue keep permanently reserved slots in the new chrome. QR kit, print outputs, notifyQueue relay, documented-reason invariant: unchanged.

### Desktop layout

== PUBLIC DESKTOP (breakpoint ≥1024px; today no desktop layout exists — this is all new) ==
FRAME: CSS grid, rows [header 56px | content 1fr | happening-now bar 48px when live], columns [sidebar 264px | main 1fr]. Header and sidebar live OUTSIDE the .pub-app text-zoom subtree (or ship after the px→rem pass) so the "Aa" control scales content only. Light theme, warm neutral background, white cards (Basecamp calm — NOT Spotify dark; print + parent legibility win).
HEADER (full-width, teal-gradient brand bar retained): left — "NWSA Music Hub" wordmark linking home; center-left — persistent search input, 320–480px, placeholder "Search events, ensembles, music…", opens the existing SearchOverlay as an anchored command palette (Slack top bar); right — EN|ES pill, "Aa" text-size menu, quiet "Director" login link.
SIDEBAR (light panel, own scroll): Section A — five primary rows (icon + label, 44px, active = filled highlight + 3px left accent, QBO active-state grammar): Today, Calendar, My Schedule, Concerts, Ensembles. Section B — "ENSEMBLES" header + one row per ensemble: 10px color dot + name; row renders bold with a small dot when that ensemble has announcements/schedule changes newer than the device's last-seen timestamp (Slack unread semantics, localStorage-driven). Section C — "RESOURCES": Announcements, Repertoire, Assignments, Start Here, Campus Map. Pinned bottom: saved-student chips (parent-mode quick switch, "Not you?" link) + "Subscribe to calendar" shortcut. Sidebar hidden under @media print.
MAIN: content column max 860px centered for list pages, 720px for reading pages (Basecamp document measure). GlobalAlerts strips render at the top of main on every route. HOME: vertical bounded sections in fixed order (date hero → schedule-change banner → announcements → today's events → find-my-schedule CTA → Coming up → ensemble tile grid) ending in an explicit "You're all caught up" row; no horizontal carousels anywhere (NN/g + the repo's own reverted swipe-strip finding).
EVENT DETAIL (Airbnb listing skeleton): H1 title row with right-aligned "Share / Save" actions → cancellation/change banner slot → two-column body: LEFT ~58% stacked sections with 1px dividers (What & who, Linked pieces with "Show all N", Notes, Where — embedded campus map with click-to-activate guard + exact pin + "Open in Google Maps"); RIGHT ~360px STICKY DAY-SHEET CARD (top: 72px; bounded stickiness ending before the map section): date/time headline, Call time / Downbeat / Dress / Pickup rows, venue + address, primary CTA "Add to calendar" (.ics), secondary "Get directions", tertiary "View program". Bottom: "Things to know" 3-column grid (Arrive by / What to wear / Pickup).
ENSEMBLE HUB: full-width hero band ~220px — gradient generated from ensembleColor (Spotify detail-page hero; the artwork substitute) containing ensemble name (large), next-event line, member count, and a "Subscribe" pill (= Follow → ICS wizard). Below: Basecamp tool-tile grid, 2-up, each tile = heading + live preview + "Show all N": Announcements, Upcoming rehearsals, Concerts, Repertoire (top 5 pieces), Seating charts, Roster.
PIECE PAGE (the Spotify moment): gradient hero from owning ensemble's color — type label "REPERTOIRE", full title 32–48px, composer + dates, duration; action row: "My part" (starred per saved identity), Listen / Watch / IMSLP buttons; body: movements as a numbered tracklist table (# / title / duration), instrumentation, program notes as an "About" reading block, "Programmed for" concert links.
HAPPENING-NOW BAR (only when live): slim full-width strip docked at viewport bottom: ensemble color dot, "NOW · Symphony Orchestra rehearsal · Room 210 · until 4:30" (or NEXT + countdown), whole bar links to the event; dismissible; hidden in print.

== DIRECTOR DESKTOP (breakpoint ≥1024px) ==
FRAME: QBO three-zone shell — rows [top bar 56px | content 1fr], columns [rail 240px, collapsible to 64px icon rail with click-opened flyouts | content well 1fr, pale-gray background, white cards].
TOP BAR: left — current page title + breadcrumb (Ensembles ▸ Jazz Band ▸ Roster); center-right — saving/saved cue (useWriteBusy), search field (Cmd+K → DirectorSearch); right — gear (setup menu), public-site link, avatar/sign-out.
RAIL: "+ New" pill (brand teal, full rail width) at very top → two-column grouped create menu overlaying content; then the six nav groups as accordion rows (one group open at a time); then ENSEMBLES color-dot list; bottom: collapse toggle (state remembered).
TODAY: Asana Home — date + greeting band; FIXED two-column widget grid (no user customization): [Today's schedule with roll receipts + expected counts | "Roll not taken" alert card] / [Unexcused follow-up queue | Announcements] / [Coming up | Quick actions + Season checklist card]. Every row deep-links via existing DirNavigate.
ROSTER (HubSpot index page): header row — "Students · 94" + Import + primary "+ Add student"; saved-view tabs (All, one per ensemble, Seniors, Missing info); toolbar — filter dropdowns (ensemble, instrument, grade, status), search-within, column gear (show/hide, compact density — Slack compact mode); TABLE: 44px rows, frozen checkbox + name columns, sortable headers, row hover reveals "Preview" (opens side pane) and per-row primary verb + caret (QBO action column: "Open · ▾ Log absence / Add note / Schedule change"); checked rows summon a bulk bar (assign ensemble, email parents, graduate).
STUDENT/EVENT RECORD (Asana side pane, HubSpot content): slide-in from right, ~480px, resizable, list remains interactive; arrow keys move selection beneath and the pane follows; Esc closes; URL updates. Pane: identity card (name, preferred name/pronunciation, instrument/section, grade, ensemble chips) + quick-action row (Log absence, Add note, Call, Email — auth-only contacts data); tabs: Timeline (attendance history + notes + planned absences, chronological, filter chips by type, "Upcoming" pinned) | Ensembles & parts | Assignments.
TAKE ROLL: full-width dense list (no cards padding-out 80 rows); sticky STATUS STRIP at top of content (QBO money bar): segmented Present / Absent / Late / Excused / Lesson / Unmarked counts, each segment tap-filters the list; keyboard: ↑/↓ row navigation + single keys A/L/E/S(lesson)/Space-present + Enter advance (Asana chord ethos, cheat-sheet overlay on ?); planned-absence hints, history dots, section-gap warnings, seating tap-roll, sticky bottom "Finish roll" bar all retained; absentee summary keeps tel:/mailto:/copy-for-Teams.
SCHEDULE: two-pane — month grid (existing, gains room) left ~60%, sticky selected-day panel right ~380px listing that day's event cards with Take Roll / Who's out / Program buttons; EventForm and all managers open as right slide-ins on desktop (bottom sheets remain on mobile); concurrent-edit guard, conflict radar, PiecePicker unchanged.
WHO'S OUT / TRACKER: read-only dense tables in the content well with date/ensemble controls in a toolbar row.
RESERVED SLOTS: WriteTray toasts bottom-center of the content well; nothing else may dock there. QR Kit and all print outputs render chrome-free.

### Mobile layout

== PUBLIC MOBILE (<744px — deliberately conservative; this surface already works and is majority-phone) ==
TOP: sticky teal header (brand link, EN|ES pill, "Aa" menu, search icon → full-screen SearchOverlay, hamburger). GlobalAlerts strips directly beneath on every page (urgent / cancellation / all-clear — unchanged semantics).
CONTENT: single column, max 720px; bounded vertical sections; no horizontal shelves. Home order identical to desktop (Slack isomorphism), ending in "all caught up".
BOTTOM: 4-tab bar frozen as-is — Home / Calendar / My Schedule (→ /student/:id or /lookup) / Concerts — 52px + safe-area. HAPPENING-NOW MINI-BAR: slim strip docked immediately above the tab bar (Spotify mini-player slot), rendered only when NowNext has content for the saved student: color dot + "NOW · Rehearsal · Room 210" + chevron; the SW update toast shares this anchor (bottom: 76px + safe-area) and wins when both would show.
DETAIL PAGES (Airbnb mobile rule — contextual action bar replaces global nav): on /event/:id the tab bar is swapped for a sticky bottom action bar: LEFT stack "Fri Dec 12 · 7:00 PM" + venue name (tap scrolls to day sheet), RIGHT primary button "Add to calendar"; back chevron top-left (history-aware navigate(-1) preserved). Ensemble hub: gradient hero (compact, ~140px) then tool tiles stacked single-column in desktop order, each with "Show all N". Piece page stacks hero → My part/Listen actions → movements tracklist → instrumentation → program notes. Program page: untouched print-first document.
MENU (hamburger, right slide-in, retained): Resources links, ensembles accordion with color dots, saved-student switcher + parent mode, Start Here, Director login. Lookup flow (A–Z rail, "Is this you?", parent mode) unchanged. PlannedAbsence modal, subscribe bottom-sheet wizard, month-swipe calendar: all unchanged.

== DIRECTOR MOBILE (phone, one-hand rehearsal use is the primary ergonomic target — do not degrade) ==
FRAME: current 100dvh flex column kept — sticky header (page title + NWSA mark, saving/saved cue, search icon, hamburger), scrolling content, safe-area insets.
NAV: hamburger menu reorganized to mirror the desktop rail groups exactly: Today · Attendance (Take Roll, Who's Out, Tracker) · Schedule (Calendar, Schedule Change, Subs & Pull-outs) · People (Roster, Progress Notes) · Library (Repertoire, Assignments, Announcements) · Ensembles color-dot list · gear items (Locations, QR Kit, Season Checklist, ICS import) · public-site link · sign-out. The three orphan tabs become reachable on phone for the first time.
CREATE: the purple FAB becomes the "+ New" surface (QBO mobile pattern): tap opens a grouped bottom sheet with the same create targets as desktop; forms remain the proven dir-drawer bottom sheets (90dvh, handle, footer Save/Cancel, focus trap).
TAKE ROLL: unchanged large-tap-target list, sticky top summary, sticky bottom "Finish roll" bar; ADDS the status-strip chips (Present/Absent/Late/Excused/Lesson/Unmarked) as a wrapping tap-to-filter row above the list — no keyboard dependency on phone.
RECORDS: what is a side pane on desktop is a full-screen pushed sheet with a back affordance here (Asana mobile rule); student sheet = identity card + quick actions + timeline tabs.
TABLES → CARDS: HubSpot/QBO tables linearize per the explicit column-priority order set by the desktop column gear (QBO lesson: columns→cards via priority, no silent column loss).
RESERVED SLOTS: WriteTray above bottom chrome; FAB bottom-right; only one of {FAB, finish-roll bar} per screen. All print surfaces (QR posters, folder slips, program) unchanged and chrome-free under @media print.

### Pattern mapping (app concept ← reference pattern)

- **Public ensemble page (/ensemble/:id)** ← Basecamp one-page project hub with live-preview tool tiles: It answers a parent's only structural question — 'where does everything for Jazz Band live?' — on one screen; tiles (Announcements, Schedule, Repertoire, Seating, Roster, Subscribe) map 1:1 to sections the page already has, and directors can conceptually toggle tiles per ensemble instead of requesting new nav items.
- **Public global navigation governance (5 fixed destinations + Resources)** ← Basecamp fixed seven-item top nav that never grows: Parents are untrained occasional users; a nav that never changes builds the muscle memory Spotify's constantly rearranged Home destroys. New features become hub tiles, not nav entries.
- **Announcement reading pages and the printed concert program** ← Basecamp Message Board document typography (~700px measure, large humanist body type, byline, category dots): These are read-top-to-bottom documents, not dashboards; Basecamp's document layout collapses to phones for free and keeps the print-sacred PublicProgram (with its exact 'New World School of the Arts' masthead) untouched.
- **Alert/notification philosophy (GlobalAlerts + any future digests)** ← Basecamp calm notifications: bundling, dot-vs-count badges, fixed reminder ladder, quiet hours: Safety-critical cancellations stay unmissable (strips on every page, all-clear state preserved) while everything else is bundled and quiet — the trust posture a school comms tool needs; no per-feature notification toggles.
- **Event detail page, desktop (/event/:id)** ← Airbnb listing detail: H1 + sectioned left column + ~372px sticky right action panel with bounded stickiness: The concert day sheet (call time, dress, venue, pickup) is this app's booking card, and 'Add to calendar' is its Reserve button — the single next action never scrolls off screen.
- **Event detail page, mobile** ← Airbnb sticky bottom action bar that replaces the global tab bar on detail screens: Date/venue left, 'Add to calendar' right — this one bar is what makes a long info page feel like an app on the phone where parents actually read it.
- **Long embedded lists (repertoire on hubs, rosters, linked pieces)** ← Airbnb progressive disclosure: show ~top-10 in-page + 'Show all 35' labeled-count button into a modal/subpage: Keeps hub pages short and scannable while guaranteeing completeness — the count in the label tells users nothing is hidden, unlike a carousel.
- **Campus map + event 'Where you'll be' section** ← Airbnb in-page map with click-to-activate scroll guard, exact pins, and pin↔row linking: The CampusMap/LocationText anchors already deep-link both ways; Airbnb's guard prevents scroll-hijack, and (inverse lesson from its radius-circle complaints) a school always shows exact pins.
- **Director ensemble page** ← Asana project header + multi-view tabs (List/Board/Calendar…) over one dataset: Overview / Roster / Attendance / Schedule / Repertoire / Seating / Program are all projections of one membership+event store already unified by rosterResolver.ts; fixed tabs (no user-created views) dodge Asana's documented clutter complaints.
- **Student & event records in the console** ← Asana slide-in task side pane carrying HubSpot 3-column record content (identity card + quick actions | timeline tabs | associations): A director triaging mid-rehearsal must open a student without losing roster scroll position; arrow-key-follows-selection and Esc-to-close come straight from Asana, the info/timeline/associations anatomy from HubSpot's contact record — structurally isomorphic to student/attendance/ensembles.
- **Director Today dashboard** ← Asana Home widget grid (fixed, not user-configurable) + QuickBooks Online 'Get things done' vs 'Overview' tab split: TodayView already has the right widgets (roll receipts, follow-ups, checklist); the fixed 2-column grid gives them desktop structure, and the QBO tab split separates 'run today' from 'season health' without building a report builder.
- **Director left navigation** ← QuickBooks Online grouped left rail: ≤6 accordion groups, collapse-to-icon-rail, click-not-hover: Solves the audit's worst nav defect — whosOut, scheduleChanges, and ensembleHub are unreachable from the menu today; grouping (Attendance/Schedule/People/Library) keeps every core object ≤2 clicks per QBO's own post-redesign lesson.
- **Universal create** ← QuickBooks Online '+ New' mega-menu (simplified to 2 columns), FAB + grouped sheet on mobile: A director posting a snow-day announcement or logging an absence should never navigate first; return-to-context on close is the load-bearing behavior, and the existing dir-drawer forms plug straight in.
- **Take Roll summary strip** ← QuickBooks Online money bar: status-segmented strip that doubles as a one-tap filter: 'Present 42 · Absent 5 · Late 3 · Unmarked 12' is both the glance metric and the fastest way to find unmarked rows in an 80-student list — cheap to build over the existing memoized StudentCard list.
- **Unmarked-roll and unexcused-absence follow-ups** ← QuickBooks Online banking review queue: count-badged 'For review / Done / Dismissed' tabs with inline-expanding row editor: Queue semantics give the follow-up workflow a goal state (empty = done) and an inline editor keeps corrections one tap deep; per QBO's auto-matching backlash, suggestions (e.g., planned-absence hints) pre-fill but never auto-commit.
- **Ensemble rows in both sidebars + 'what changed' awareness** ← Slack channel sidebar: sections, color-dot rows, unread bolding/dots (public side computed from a localStorage last-seen timestamp — no accounts): Ensembles-as-channels is a near-1:1 mapping and gives parents passive change awareness without login; per the Slack Activity criticism, every Updates-feed row leads with ensemble name + change type so it's decidable without clicking.
- **Global search / quick switcher** ← Slack Cmd+K quick switcher + persistent top-bar search field (Asana omnibox grouping): SearchOverlay and DirectorSearch already do grouped fuzzy results with keyboard nav; desktop just needs the always-visible field and the shortcut — type three letters of a student's name, jump to their record.
- **Piece page (/piece/:id) and PiecePicker program order** ← Spotify album/track detail: dominant-color gradient hero, numbered tracklist with durations, 'About' liner notes; program = ordered playlist: The one surface where the content is actually music: movements are literally a tracklist, program notes are liner notes, IMSLP/audio/video are play actions — Spotify's grammar fits without any of its utility failures (print output of the program stays sacred).
- **Ensemble 'artwork' system** ← Spotify dominant-color gradient theming, seeded from the existing ensembleColor hex (designed no-photo-first per Airbnb's card fallback rule): The data model has zero images; generated gradients + monogram glyphs give hubs and piece heroes visual identity that stays print-legible and never degrades into Spotify's identical-placeholder-tile problem.
- **Happening-now bar** ← Spotify persistent mini-player slot / Slack huddles docked bar, consolidating the existing NowNext banner + NowLine: 'Where am I supposed to be right now' is this app's now-playing; docking it above the tab bar (mobile) and viewport bottom (desktop) makes it ambient — but unlike Spotify it renders only when something is actually live, and yields to the SW update toast.
- **Roster / assignments / who's-out tables** ← HubSpot saved-view index table (view tabs, filter row, column gear, bulk-action bar) + QBO per-row primary verb with caret dropdown: 80+ row rosters need saved views ('All', per-ensemble, 'Seniors', 'Missing info'), inline edit, and bulk actions (graduate seniors, email parents); the per-row verb ('Open ▾ Log absence') is the density trick that keeps one-click actions without widening rows. Skip HubSpot's sharing/governance — one director.
- **First-run and empty states** ← HubSpot onboarding checklist + educational empty states (illustration + one sentence + primary CTA): SeasonChecklist already live-computes term setup; giving it HubSpot's persistent-checklist frame plus honest public empty states ('No upcoming events yet') costs little and covers the new-school-year cold start.

## 6. Phased build plan

- Phase 0 — Foundations, no visible change (M): unify the three token sets (retire/reclaim the dead 727-line index.css theme); px→rem migration OR architectural decision to mount new fixed chrome outside the .pub-app zoom subtree so the 'Aa' control survives; add a forced-light @media print token reset (fixes the latent dark-mode invisible-ink bug on all four print surfaces); formalize one z-index scale; write the contract-regression checklist (vanity slugs, hash anchors, query deep links, ICS URLs, SW cache, print outputs).
- Phase 1 — Public desktop shell (M): ≥1024px grid in PublicLayout.tsx with pinned left sidebar (contents = existing hamburger menu: primary five, ensemble color-dot rows, Resources, saved-student switcher), persistent header search field opening the existing SearchOverlay as a palette; mobile untouched; SW update toast slot preserved; sidebar hidden in print.
- Phase 2 — Airbnb detail patterns (M): PublicEvent two-column layout with sticky day-sheet action panel (desktop) and contextual bottom action bar replacing the tab bar (mobile); 'Show all N' progressive disclosure on hub repertoire/roster sections; click-to-activate map embeds with exact pins on event pages.
- Phase 3 — Ensemble hubs + Spotify moments (M): Basecamp tool-tile layout on PublicEnsemble under a generated color-gradient hero with Subscribe pill; PublicPiece tracklist/hero treatment; happening-now mini-bar consolidating NowNext (mobile above tab bar, desktop bottom strip), gated to only-when-live and print-hidden.
- Phase 4 — Director desktop shell (L): QBO three-zone frame in DirectorApp.tsx — grouped collapsible rail (surfacing whosOut/scheduleChanges/ensembleHub), thin top bar with save cue + Cmd+K, '+ New' create menu, gear settings split; mobile hamburger reorganized to mirror the same groups; DirNavigate intent deep links and WriteTray/FAB slots preserved; director dark tokens explicitly out of scope.
- Phase 5 — Director data surfaces (L): HubSpot saved-view tables for Roster and Assignments (view tabs, filters, column gear, bulk bar, per-row verb+caret); Asana slide-in record panes for Student and Event (full-screen sheets <768px); Schedule two-pane (month grid + sticky day panel); drawers become right slide-ins on desktop while remaining bottom sheets on mobile.
- Phase 6 — Roll & queue upgrades (M): QBO money-bar status strip on Take Roll (segments filter the list; chips on mobile); keyboard chords for desktop roll entry (arrows + A/L/E/S/Space, ? cheat-sheet overlay); review-queue framing (count-badged For-review/Done tabs) for unmarked rolls and unexcused follow-ups; optional compact-density toggle on tables.
- Phase 7 — Change-awareness layer (M): localStorage last-seen timestamps driving Slack-style bold/dot indicators on public ensemble rows; 'Updates' feed interleaving announcements + change notes with source-and-type-first rows and a 'since your last visit' divider; all-caught-up end states; verify EN/ES coverage for every new string added across phases.

Sizing is relative (S/M/L). Phases 1–3 are public-surface and additive; 4–6 are
the director console (ship over a school break, never mid-term); each phase is
revertible and gated by the Phase-0 regression checklist.

## 7. Roadblock register (six adversarial critics)

<!-- ROADBLOCKS_TBD -->

## 8. Structural risks (from the design phase)

- No desktop breakpoint exists anywhere today (only 640px overlay tweaks in 5,924 lines of CSS): both shells (Phases 1 and 4) restructure PublicLayout.tsx and DirectorApp.tsx and realistically touch ~15 of 27 CSS files / 2,000+ lines — the single largest structural risk, and why foundations ship first with zero visual change.
- Text-size 'Aa' control applies CSS zoom to .pub-app: any fixed sidebar or happening-now bar inside that subtree gets zoomed and breaks at 1.3x. Mitigations (chrome outside the subtree, or a px→rem migration) are each sizable; skipping this check regresses a required accessibility feature.
- Print is load-bearing on four surfaces (concert program, season fridge copy, start guide, QR kit): every new chrome element needs @media print hiding, and today print forces white backgrounds but not text colors — any theming work before the forced-light print block ships risks printing near-invisible ink on the physical concert program.
- Bottom-edge sticky collisions: public tab bar, happening-now bar, SW update toast, director FAB, finish-roll bar, and WriteTray all compete for the same edge. Without the one-sticky-per-edge budget and a formalized z-index scale, Phases 3/6 will produce overlapping chrome on small phones.
- Mid-year muscle memory (QuickBooks Online's force-migration backlash is the cautionary tale): parents have printed QR posters and trained habits, the director has in-term workflows. Public mobile must change almost nothing; the director shell swap should land over summer break, never mid-semester, and never reorder the 4 public tabs.
- Change-awareness without accounts rests on localStorage last-seen heuristics: shared family devices, incognito mode, and cleared storage produce wrong unread states. Indicators must degrade to neutral (no badge) rather than false-positive, and can never replace GlobalAlerts for safety-critical cancellations.
- Data-driven ensemble hex colors as gradient heroes risk WCAG contrast failures (Spotify's own documented weakness): text-on-gradient needs computed luminance handling like the existing --pub-gold-text correction, and gradients must stay print-legible on QR posters.
- SaaS-pattern scope creep: saved-view governance, customizable dashboards, notification preference matrices, and multi-level nav are exactly the criticized artifacts of the reference products at scale — this app serves roughly one director and a few hundred families; every configurable surface should ship as a fixed configuration instead.
- Offline PWA fragility: the shell restructure changes the cached app shell (sw.js 'nwsa-hub-v1'), manifest theme colors, and toast anchoring; a botched cache transition strands offline users on stale chrome — cache versioning and update-toast behavior need explicit re-verification each phase.
- Contract breakage during refactor: vanity slugs, /nwsa-music-hub basename, hash anchors, ?focus/?ensemble deep links, static ICS feed URLs, the single public PlannedAbsence write, and the code-split public/director bundles are all easy to silently break while moving shell code — the Phase 0 regression checklist must gate every phase.
- The exact school name is a shipped-bug class: any new masthead, hero, or print header must render 'New World School of the Arts' / 'NWSA' verbatim (grep before writing, per CLAUDE.md — the printed program got this wrong once already).

## 9. Decisions needed from the owner

- Theme direction: the recommendation is light-first (Basecamp/QBO calm) with dark mode remaining an automatic prefers-color-scheme variant — but do you want a Spotify-dark default anywhere (e.g., piece pages only), and should there be a manual light/dark toggle instead of OS-sync only?
- Photos and artwork: do ensemble/concert photos exist or will someone maintain them? Airbnb-style photo-led cards and hero mosaics only make sense if yes; otherwise the generated color-gradient + monogram system is the permanent design, not a fallback.
- Device reality check: can you confirm (from any analytics or lived experience) that parents/students are overwhelmingly on phones, and whether the director actually has a laptop/iPad at the podium? This decides how much Phase 1 (public desktop) and Phases 4–6 (director desktop) are actually worth.
- Nav attachment: are you attached to the current four public tabs (Home/Calendar/My Schedule/Concerts) and the hamburger? Would you swap 'Concerts' for 'Ensembles' as a tab, or is the season page the more-visited destination?
- Rollout timing: is a summer big-bang acceptable for the director shell, and are mid-year additive-only changes acceptable for the public surface — or must everything wait for the term boundary?
- Change indicators for families: do you want Slack-style 'new since last visit' dots/Updates feed at all, or is the existing GlobalAlerts + banners posture (calm, no unread mechanics) the intended ceiling?
- Brand constraints: beyond teal #0d7e8e, logo purple, and concert gold — does New World School of the Arts impose sanctioned colors, typography, or logo-usage rules the redesign must follow on public pages and printed output?
- i18n scope: many public strings are still hardcoded English and the director side is untranslated — should the redesign budget include closing the EN/ES gap (recommended for every NEW string at minimum), and does the director console need Spanish at all?
- Happening-now bar scope: personalized only (saved student's NOW/NEXT) or also a school-wide mode ('Next today at NWSA: Jazz Band 3:30') for devices with no saved identity?
- Director keyboard investment: will roll ever realistically be taken on a keyboard device, or should Phase 6's keyboard-chord work be cut in favor of more phone-roll polish (e.g., seating tap-roll improvements)?

---

*Study artifacts: the interactive wireframe version of this study is published
as a Claude artifact; the full agent outputs (reference teardowns, all four
concepts, judge scorecards, critic reports) are preserved in the session that
produced this document.*
