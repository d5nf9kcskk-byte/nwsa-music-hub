# Session notes — seating sections, chair numbers, and a chart you can link to (2026-09-08, PR #158)

Record of the session that made seating charts reorderable and addressable.
Written so a future session can reconstruct what changed and why without
replaying the conversation. Merged as `9041c79`.

## What was asked

Two rounds, in the director's words.

First: "For the roster section on the director side of the site, the sections
need to be able to be resorted. For example, I added Violin 2, but you won't let
me put it in a different spot." Then, in the same message: move the two Camerata
charts so Violin 2 follows Violin 1; let the chair number beside a name be typed
over ("click the one that is next to Kenji Wood and put 5"); post an announcement
to the group from inside the roster; and stop limiting the piece picker to the
ensemble's own repertoire — those are the defaults, not the whole list.

Second: "I also need to be able to link to these seating lists. There's no way to
link to them." A link in the editing area, and a way to link one from an
announcement. Plus: "when this opens up, it should be full screen, not a thing
shunted to the side."

## What was actually broken

A section could be ADDED by hand (`addSection`, shipped with #seating-sections)
and RENAMED, but never moved. `buildSections()` derives the initial list in
score order; anything created afterwards was appended. So a "Violin 2" added
after the fact sat at the bottom of the array, and since `SeatingChartCard`
renders `chart.sections` in stored order with no sorting of its own, that is
exactly what students read: Violin 1, Viola, Cello, Bass, Violin 2.

The link problem was the same shape one level up. Charts rendered only INSIDE
`PublicEnsemble` and `PublicPiece`. There was no `/seating/...` route at all, so
"the seating is on the Camerata page, scroll past the repertoire" was the best
anyone could do.

## The shape

- `src/director/seating/SeatingManager.tsx` — all four editor changes.
- `src/director/seating/seatingLink.ts` — `seatingChartPath()` /
  `seatingChartUrl()`. The ONE spelling of a chart's address.
- `src/public/PublicSeating.tsx` + `seating/:id` in `src/main.tsx` — the page.
- `src/director/components/LinkPicker.tsx` — a **Seating** group.
- `scripts/reorder-seating-sections.mjs` + its workflow — the charts already
  published.
- `src/director/dirShell.css` (`dir-drawer-full`), `src/director/uiUpdates.css`
  (chair-number input, share row, piece picker), `src/shared/whatsNew.ts`.

## Decisions worth keeping

**One ranking table, no second spelling list.** "Score order" sorts sections
through `scoreOrderRank()` in `src/director/scoreOrder.ts` — the same table
`buildSections()` already uses, where Violin 1 is 400, bare Violin is 401 and
Violin 2 is 402, so the hand-added section lands between Violin 1 and Viola
without anyone teaching a second module how to spell an instrument. The
migration script imports that `.ts` directly (Node strips types) for the same
reason, following the `scripts/generate-feeds.mjs` precedent.

**The chair number holds a draft while focused.** Typing "12" passes through
"1" on the way, and committing on every keystroke would fling the player to
chair 1 and then to 12, reshuffling the section twice. `seatNumDraft` holds the
text; Enter or blur commits, Escape drops it. Out-of-range numbers **clamp**
rather than dropping anyone — losing a player off the end of a roster because
of a typo is not an acceptable failure for this screen.

**Chair order inside a section is the director's audition result.** The
migration script sorts SECTIONS and never touches seats. A script does not get
to guess at who sits second stand.

**`seatingLink.ts` exists because of a lint rule, and stayed because it was
right.** It started as an exported function inside `SeatingManager.tsx` and
tripped `react-refresh/only-export-components`. Pulling it out gave the address
one home that the editor's copy button, the announcement a chart posts about
itself, and the link picker all read from — instead of three places each writing
`/seating/${id}` out by hand.

**No rules change, and that was checked rather than assumed.** `seatingCharts`
is already `allow read` in `firestore.rules`, `announcements` likewise, and
`PublicSeating` reads names from `studentsPublic` — the same projection
`PublicEnsemble` uses. The new page is a second door onto data students could
already see. Nothing was added to any mirror and no allowlist moved. (#privacy)

**Full screen is a specificity win, not an `!important`.** Drawers become a
540px right-hand pane at ≥1024px (`dirShell.css`, redesign Phase 5), which is
the right shape for confirming one thing and the wrong shape for a roster.
`.dir-drawer-overlay.dir-drawer-full .dir-drawer` outranks the bare
`.dir-drawer` inside that media query on specificity alone, so it wins at every
width regardless of source order. Content still runs in a 900px column —
full-bleed body text on a wide monitor is its own kind of unreadable. The
trade-off accepted: with no dimmed margin there is nothing to click outside, so
closing is the ×, Cancel, and Escape (the editor has `useModalA11y`).

**An unsaved chart has no id, so it has no address.** That branch says to
publish first rather than showing a dead URL, and the announce composer says the
post will not link anywhere until the chart exists.

## Gotchas hit, worth not repeating

- **`—` inside a JSX text node renders literally.** It only works inside a
  JS string. One hint line shipped it briefly and was caught before push; the
  same escape in `{cond ? '…' : '…'}` and in `whatsNew.ts` is fine because
  those are string literals.
- **`dir-signup-share-url` lives in `signups/signups.css`**, which only loads on
  the Sign-ups screen. Reusing the class name in the seating editor would have
  looked right in review and rendered unstyled. It got its own
  `dir-seat-share-url`.
- **`whatsNew.ts` conflicts every time.** Two sessions both prepend to the same
  array and the conflict boundary can fall MID-OBJECT — resolving by deleting
  the three marker lines left an entry with no closing `],\n},`. Read the result,
  do not trust the marker removal.

## Still open / worth a look

- **The Camerata charts were fixed by the workflow, not by this session** —
  there is no Firestore credential in a Claude session, so
  `scripts/reorder-seating-sections.mjs` ran from
  `.github/workflows/reorder-seating-sections.yml` on the merge. Run 1
  (`34252733198`) succeeded and reordered 2 of 2 charts, both from
  `Harp/Piano · Violin 1 · Viola · Cello · Bass · Violin 2` to
  `Harp/Piano · Violin 1 · Violin 2 · Viola · Cello · Bass`. Nothing further is
  needed; the workflow stays for the next time a chart drifts, and a re-run is
  a no-op on a chart already in order.
- **"Score order" only recognizes section names that look like instruments.** A
  section renamed to "Front stand" or "Wind machine" ranks 998/999 and sorts to
  the end. That is deliberate (the alternative is guessing), and the arrows
  always work, but it is the case where the button looks like it did nothing.
- **`PublicSeating` and the link picker both read the whole `seatingCharts`
  collection** rather than a single doc. Charts are few and the reads are public,
  so this was left alone; if charts ever number in the hundreds, `PublicSeating`
  wants a doc-get instead of a collection listener.
