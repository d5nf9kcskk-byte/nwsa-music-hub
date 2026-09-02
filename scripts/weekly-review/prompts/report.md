# Stage: report

Input: `packet/packet.md`, `packet/metrics.json`, every `verified/*.json`,
every `*.cost.json` under `findings/`, `verified/` and `focus/`,
`focus/focus.md`, and `_review/reviews/open.json` (previous open findings;
may be empty or absent). The date is in the environment variable
`REVIEW_DATE` and in the job prompt.
Output: exactly two files — `_review/reviews/<REVIEW_DATE>.md` and
`_review/reviews/open.json`. Nothing else.

You write the one document the director reads on Saturday morning. Same
structure every week, so it can be worked top to bottom over a weekend and
compared with last week's.

Rules:

- Only `verdict: confirmed` findings appear as findings. `unclear` ones go
  in a short "Needs a look with live data" list at the end of their section.
  `refuted` ones never appear.
- Dedupe across lenses: the same file and the same problem is one item; note
  which lenses saw it. Keep the best evidence and the smallest fix.
- Rank within each section by severity, then effort (small first).
- Every item: `**Title** — file:line · severity · effort`, then two to four
  lines: what happens, how to see it, the fix. No paragraphs. Never quote
  student data. Do not repeat the packet; say "see Health".
- Ids: carried items keep their id. New items get `wr-<YYYYMMDD>-<nn>` (two
  digits, in document order).
- Keep the whole report under about 2,500 words. If a section is empty,
  write "Nothing this week." An honest empty section is the point.

Structure — use these exact headings:

```
# Weekly review — <REVIEW_DATE>

One paragraph, three sentences: how much changed, the one thing to do first,
and the overall state (green / watch / act).

## 1. Health
From the packet: CI failures, probe warnings, build determinism, lint / type
/ audit with their deltas, VEVENT count. One bullet per signal, ✓ or ⚠.

## 2. Broken
Confirmed `broken` and `health` findings.

## 3. Security
Confirmed `security` findings, high first. Reachable `npm audit` items here.

## 4. Drift
Confirmed `drift` findings, plus the deterministic drift checks the packet
flagged ⚠.

## 5. UX / UI
Confirmed `ux` findings.

## 6. Implement / Remove / Rework
### Implement
### Remove
### Rework
At most eight items across the three lists, each with why, effort, and what
it touches. Mark anything that changes rules, public projections, or roles,
or adds a dependency, with **decision needed**.

## 7. Carry-forward
Table: id · title · status (fixed / open / dropped) · note. Every item from
the previous open.json appears exactly once; status comes from the verify
stages' carry_forward entries (if two lenses disagree, open beats fixed).

## 8. Next week's focus
The critic's bullets from focus/focus.md, verbatim.

## 9. Stats
Commits reviewed, range, deep-dive area, findings per lens (found →
confirmed), and a cost table from the *.cost.json files: stage · turns ·
cost USD · minutes, with a total.
```

Then write `_review/reviews/open.json`: an array of every finding that is
open after this week — previous items whose status is `open`, plus every new
confirmed item from sections 2–5 (ideas in section 6 are NOT carried; they
are re-proposed if still relevant) — each as
`{ "id", "title", "file", "line", "category", "severity", "effort",
"first_seen", "last_seen": "<REVIEW_DATE>", "status": "open" }`. Items marked
fixed or dropped are removed. Budget: about 40 tool calls.
