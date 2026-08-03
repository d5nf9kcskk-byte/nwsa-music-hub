# Directors' presentation — NWSA Music Hub

Materials for a ~40-minute session with the Dean and the Wind Ensemble, Jazz
Ensemble and High School Choir directors: **why the Hub exists, how to use it,
and why it's less work than the prior workflow.**

| File | Who it's for | What it is |
|---|---|---|
| `00-PRESENTER-OUTLINE.md` | You only | Run of show with timings, pre-meeting checklist, exact demo taps, cut lists (15-min and Dean-only), likely questions with honest answers, and **the full assumptions register (A1–A10)** |
| `01-AUDIENCE-OUTLINE.md` | Handout, print ×4 | One page: what's covered, the six things they'll actually do, old→new, privacy, roles, how to sign in |
| `02-SCRIPT.md` | You | Speakable script, slide by slide, with `[DO]` / `[LIVE]` stage directions, three `[PAUSE]` points, and `⚠ FILL IN / VERIFY` markers. Edit freely |
| `03-SPEAKER-NOTES.md` | You | The cue-card version of the same thing — identical text to the deck's notes area |
| `NWSA-Music-Hub-Directors.pptx` | The room | 23 slides. **Speaker notes are in each slide's notes area** |
| `NWSA-Music-Hub-Directors.pdf` | Backup | Same deck, for a machine without PowerPoint |
| `build-deck.cjs` | Maintenance | The pptxgenjs generator that produced the deck — edit and re-run rather than hand-editing the .pptx |

## Before presenting

Read the assumptions register in `00-PRESENTER-OUTLINE.md` first. Ten things
could not be known from the codebase — names, meeting length, who is already on
the Directors list, whether the Teams/email relay is actually delivering, and
the specifics of the "before" story. Each one is also marked inline in the
script and in the slide notes.

Two claims deliberately **not** made anywhere in these materials:

- **No time-savings numbers.** Nothing was measured, so the efficiency case is
  structural (work scales with absences, not roster size; each fact is entered
  once).
- **No promise of Teams / email delivery.** The app writes urgent posts to a
  `notifyQueue` collection; delivery depends on a Power Automate flow configured
  outside the app (`docs/POWER-AUTOMATE-RELAY.md`). Verify it before promising it.

## Rebuilding the deck

```bash
npm install pptxgenjs           # if not already present
node docs/presentation/build-deck.cjs
```

Slide content, layout and speaker notes all live in that one file. Keep the
generator as the source of truth so a re-run never loses hand edits.
