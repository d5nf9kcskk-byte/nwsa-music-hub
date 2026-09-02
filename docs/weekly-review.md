# Weekly review

Every Saturday at 10:00 UTC (6 AM Eastern in summer, 5 AM in winter) the Hub
is reviewed by five independent Claude reviewers, each finding is
adversarially verified by a second model, and one fixed-structure report is
filed as an issue in the **private** repo
[`nwsa-hub-review`](https://github.com/d5nf9kcskk-byte/nwsa-hub-review).
GitHub emails the issue to the owner, so the weekend's list is in the inbox
by 7 AM.

Why it is built this way — and what was rejected — is in
`docs/superpowers/specs/2026-09-02-weekly-review-design.md`. This page is
the operations manual.

## The two repos

| | Lives in | Why |
|---|---|---|
| Review logic: `.github/workflows/weekly-review.yml`, `scripts/weekly-review/` | **this repo** (public) | versioned beside the code and CLAUDE.md it checks; nothing here is sensitive |
| Schedule, secret, logs, artifacts, reports, issues | **`nwsa-hub-review`** (private) | findings — security findings especially — must never be world-readable |

The public repo's workflow has only a `workflow_call` trigger. **Never add
`schedule:` or `workflow_dispatch:` to it** — a run started in the public repo
puts its logs, artifacts, and issue in public view.

## What a run does

1. **Packet** (`scripts/weekly-review/packet.sh`, no tokens): commits and
   diffstat for the range; CI runs that failed; live probes of the site,
   feeds, service worker, and the three Cloud Functions; lint / type / audit
   with deltas against last week; two builds compared for the service-worker
   hash (the determinism contract); the deterministic drift checks in
   `drift.mjs` (the allowlists CLAUDE.md says change together, orphan
   self-checks, dead doc paths, What's New staleness, debt markers); last
   week's open findings; the critic's focus. Every later stage reads this
   first so no model re-derives it.
2. **Lenses** (five parallel jobs, Sonnet 5): security, backend & data,
   frontend UI/UX, drift & hygiene, product. Separate processes, separate
   prompts (`scripts/weekly-review/prompts/`). Each reviews the week's diff in
   full plus one rotating deep-dive area (ISO week mod 5), so the whole repo
   gets a full read every five weeks. Output: `findings/<lens>.json`.
3. **Verify** (one job per lens, Opus 5): refute-first. A finding survives
   only with a concrete trace. Also re-checks last week's open items.
4. **Critic** (Sonnet 5): what did nobody look at? Becomes next week's
   extra focus (`reviews/focus.md`).
5. **Report** (Opus 5): dedupes, ranks, writes `reviews/YYYY-MM-DD.md` and
   `reviews/open.json` in the private repo, commits them, opens the issue.

The report always has the same nine sections: Health · Broken · Security ·
Drift · UX/UI · Implement/Remove/Rework · Carry-forward · Next week's focus
· Stats. An empty section says "Nothing this week." Work it top to bottom.

## One-time setup (done once, 2026-09-02, except the secret)

1. Private repo `nwsa-hub-review` exists with the caller workflow
   (`weekly.yml` under its `.github/workflows`), `reviews/open.json`, and a
   README.
2. **The secret** — the only manual step. On a machine where Claude Code is
   logged in:
   ```bash
   claude setup-token
   ```
   Copy the token it prints, then in GitHub: **nwsa-hub-review → Settings →
   Secrets and variables → Actions → New repository secret**, name
   `CLAUDE_CODE_OAUTH_TOKEN`, paste. (The same token already exists in this
   repo for the Monday scan, but secret values cannot be copied between
   repos — generate or paste it again.) Until it exists, a run produces the
   packet only and warns.
3. Optional: watch the private repo so issue emails arrive.

## Running it on demand

```bash
gh workflow run weekly.yml -R d5nf9kcskk-byte/nwsa-hub-review
```

Add `-f tier=full` for Opus 5 on every lens, or `-f days=14` to widen the
range. Then:

```bash
gh run watch -R d5nf9kcskk-byte/nwsa-hub-review
```

To debug a stage, open the run in the private repo: each lens, verify, and
report job uploads its files as artifacts (`packet`, `findings-<lens>`,
`verified-<lens>`, `focus`).

## Tuning

- **Models and effort** are in `weekly-review.yml`: the lens matrix
  (`effort` per lens; the model follows the `tier` input), and the verify /
  critic / report jobs. Effort levels: `low` · `medium` · `high` · `xhigh` ·
  `max`.
- **Cost bounds:** every Claude job has `--max-turns` and a job
  `timeout-minutes`. Raise `--max-turns` before raising effort if a lens
  reports it ran out of budget in `reviewed.notes`.
- **Prompts** live in `scripts/weekly-review/prompts/`. `common.md` is the
  shared contract (scope, what counts, privacy, JSON shape); each lens file
  is its checklist. Edit the checklist, not the workflow, to change what a
  lens looks for.
- **Deep-dive rotation** is the `AREAS` array in `packet.sh`.
- **Deterministic checks** — add a check to `drift.mjs` when a new "must
  change together" rule lands in CLAUDE.md. That is cheaper and more reliable
  than asking a model to notice.

Measured cost at the lean tier: the first full run (2026-09-02, a 164-commit
week) cost $26 API-equivalent across 12 model jobs and took 45 minutes; the
frontend lens alone was $7.30. Charged as subscription usage. Each job's
real `total_cost_usd` is in the report's Stats section. A quiet week should
be well under that.

## Retiring the Monday bug scan

`claude-bug-scan.yml` (Mondays, diff-only, public issue) is a shallow subset
of this review. **After the Saturday review has run green twice**, delete
`.github/workflows/claude-bug-scan.yml` and `docs/claude-bug-scan.md`, and
close the `claude-bug-scan` issue if one exists. Decided 2026-09-02.
