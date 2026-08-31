# Rich text everywhere + linking to things — design

**Date:** 2026-08-31
**Status:** shipped 2026-08-31 (phases 1-4), less the two contract-text fields — see Out of scope

## The ask

Two things, from the director:

1. **Link to things when posting announcements** — concerts, rehearsals,
   events, classes, documents, sign-ups. Both shapes: a link inline in the
   message text, *and* a general link attached at the end of the message
   (including a "search filter" link — a calendar view narrowed to an
   ensemble and event type).
2. **A full slate of text-editing options every time someone is inputting
   text** — bold, underline, italics, size, font (a limited number), bullets,
   dashes, numbers, linking.

## What already exists (do not rebuild)

- `src/shared/richTextParse.ts` — the marker parser: `**bold**`, `*italic*`,
  `__underline__`, `~~strike~~`, `` `code` ``, `# / ## / ### / -#` sizes,
  `> quote`, `- bullet`, `1. numbered`. Multi-line spans work; unpaired
  delimiters stay literal; URLs are opaque so a Drive link's underscores
  survive. **No link syntax, no font.**
- `src/shared/richText.tsx` — the one renderer for that markup.
- `src/shared/richText.selfcheck.ts` — runs in `deploy.yml`. The format is a
  deploy-gated contract.
- `src/director/components/RichTextArea.tsx` — the toolbar (bold, italic,
  underline, 3 sizes, 2 list types, preview). Used in exactly **3** places:
  assignments, documents, event form. **No link button, no font.**
- `src/director/components/Linkify.tsx` — auto-links pasted URLs at render.
- `DirectorSearch.tsx` — has a working fuzzy scorer
  (`normalizeText` / `scoreMatch` / `rankMatches`) that the picker must reuse
  rather than duplicate.
- `/calendar?ensemble=a,b` is already a shareable filter URL.

23 raw `<textarea>` sites have no toolbar — including the announcement body,
which also renders through `Linkify` only, not `RichText`.

## Decisions taken

| Question | Decision |
|---|---|
| Link shape | **Both** — inline `[label](target)` and an attached links row on announcements. |
| Font | **Four**: sans, serif, Georgia, mono. (Flagged: Georgia hardcodes a face into text that renders on the public site, in printed programs, and inside white-label orgs that have their own brand font. Shipping it as asked.) |
| Which inputs get the toolbar | Staff prose fields only — not the paste-a-blob parsers, not the public parent/student forms. |
| Existing announcement bodies | Switch to rich rendering. Verified against all 7 live NWSA posts: two improve (their `- ` lists become real bullets), none break. |

## Phase 1 — the format (this commit)

### One new inline construct

```
[label](https://example.com)   → external link
[label](/event/abc123)         → in-app link
[label](font:georgia)          → font span
```

One bracket scanner, two output fields. `RichSegment` gains
`href?: string` and `font?: RichFont`.

**The whole construct is opaque to `pairDelimiters`**, exactly like the
existing bare-URL skip. Without that, a Drive link's `__` inside a target
becomes underline markup and students get a broken address — the bug the URL
skip already exists to prevent. Consequence: no emphasis *inside* a link
label. `**[label](/x)**` works; `[**label**](/x)` does not. Deliberate.

### `safeHref()` — the trust boundary

Announcements are world-readable and an assistant with the `announcements`
capability can write them, so the href allowlist is fail-closed:

- allowed: `https:`, `http:`, `mailto:`, `www.` (upgraded to https),
  and app-relative `/path`
- rejected: everything else — `javascript:`, `data:`, and **protocol-relative
  `//evil.com`**, which is the classic bypass of a naive "starts with /" check

A rejected target is **not** a link and **not** swallowed: the whole
construct stays literal text, so nothing a director typed disappears.

`safeHref` lives in `richTextParse.ts` (no JSX) so the deploy-gating
self-check can pin it.

### Plain-text output

`richTextToPlain(text, origin?)` emits `label (url)` for links so ICS
descriptions keep the address, and bare `label` for fonts. The optional
`origin` absolutizes app-relative hrefs — an ICS feed containing a bare
`/event/x` is a broken link, and the parser cannot import `ORG` without
breaking the Node self-check.

### Toolbar

`RichTextArea` gains **Link**, **Font** (Default / Sans / Serif / Georgia /
Mono), **Strike**, and **Quote**. The last two are already in the parser and
cost two array entries. `code` is deliberately skipped — no director wants a
monospace span in a concert notice.

Font applies as a toggle: choosing Default while the selection sits inside an
existing font span unwraps it.

`.dir-rte-toolbar` needs `flex-wrap: wrap` — 13 controls will not fit a phone
in one row.

Until phase 2, the Link button inserts `[label](https://)` with `https://`
selected, so a paste replaces it. The picker swaps into that handler.

## Phase 2 — `LinkPicker`

Search-as-you-type over everything that already has a public URL:

| Kind | URL |
|---|---|
| Event (concert, rehearsal, …) | `/event/:id` |
| Ensemble / class | `/ensemble/:id` |
| Assignment | `/assignments/:id` |
| Sign-up | `/signup/:id` |
| Piece | `/piece/:id` |
| Document | its file URL |
| Fixed pages | `/calendar`, `/concerts`, `/documents`, `/signups`, `/announcements`, `/start` |
| Filter view | `/calendar?ensemble=…&type=…` from ensemble + type chips |
| Paste a URL | any `http(s)` / `mailto` |

Hoist `normalizeText` / `scoreMatch` / `rankMatches` from `DirectorSearch.tsx`
into `src/shared/fuzzy.ts`; both import it. No second scorer.

Requires one fix: `PublicCalendar` syncs `?ensemble=` to the URL but not the
type chips, so a "Symphony rehearsals" link would restore the ensemble and
drop the type. ~6 lines in the existing sync effect.

## Phase 3 — announcements

`Announcement.links?: { label: string; url: string }[]`, capped at 6.
**No `firestore.rules` change** — `/announcements` is
`allow read; allow write: if isStaff() || assistantHas('announcements')`
with no field allowlist.

- Form: a "Related links" section under the message, same `LinkPicker`.
- Render: chips under the body in `PubAnnouncements`; plain URLs in
  `PrintableUpdates` and the urgent relay text (a Teams message cannot render
  a chip).
- Body switches from `Linkify` to `NotesText`.

## Phase 4 — rollout + the display-side audit

Swap `<textarea>` → `<RichTextArea>` in 13 staff prose fields: announcement
body + Spanish body, jury notes, repertoire program notes + piece notes,
private notes, personnel notes, contract body, contract notes, contract
template body, sign-up intro + signature statement + guardian statement.

**Deliberately untouched:** ICS import, roster CSV, Quick Add, and the two
sign-up slot boxes — all machine-parsed, a toolbar there is noise. Plus the
three public parent/student boxes, per the decision above.

**The display side has to keep up.** A field that gains a toolbar but renders
raw shows students literal asterisks. Known:
`PublicSignup.tsx:255/420/432` renders intro and both statements as bare
`<p>{text}</p>`. Same audit needed for the jury, personnel, and contract
display paths.

The **signature and guardian statements are the riskiest field on the list** —
they are the text a student signs. The rendered form and the printed packet
must agree exactly, or someone signs something that displayed differently.
The self-check covers the parser; it cannot cover the print CSS. The `rt`
styles must be wired into the `printViaPopup` off-screen host and verified
visually.

## Self-check additions (phase 1, deploy-gating)

- link parses, label and href separated
- font parses
- `javascript:` rejected, construct stays literal
- protocol-relative `//evil.com` rejected
- unpaired bracket stays literal
- underscores inside a link target survive
- plain-text output carries the address; `origin` absolutizes app paths

## Out of scope

Nested emphasis inside a link label. Per-word font on the public site beyond
the four listed. Any rich text in the four machine-parsed paste boxes or the
three unauthenticated public forms.

**Left out of phase 4 on purpose: the two contract-text fields** —
`ContractForm.termsText` and `ContractTemplatesView.bodyText`. Everything else
on the phase-4 list shipped. These two are the frozen prose of a signed
agreement: the text is stamped verbatim at issue alongside a `templateVersion`,
it already carries a `{{token}}` substitution layer, and `ContractSheet`
renders it through its own paragraph splitter rather than `RichText`. Layering
a second syntax onto versioned legal text — and changing how an
already-issued, already-signed contract renders — is a decision of its own,
not a rollout sweep. Nothing is at risk today either way: `features.personnel`
is `false` for NWSA, so that surface is folded out of the build entirely.
The personnel and contract NOTES fields (ordinary private staff prose) did
get the toolbar.

**Resolved, not deferred:** the spec worried that the `rt` styles would not
reach the sign-up PDF packet. They do — `printViaPopup` copies every
stylesheet from the document, and `richText.css` is bundled into the
always-loaded `index.css`. Verified in `dist/`.
