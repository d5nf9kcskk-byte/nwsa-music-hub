# Weekly Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Saturday-morning pipeline that reviews the Hub with five independent
Claude lenses on different prompts and models, verifies every finding
adversarially, and files one fixed-structure report privately.

**Architecture:** A reusable GitHub Actions workflow (`workflow_call`) in this
public repo does all the work; a private repo (`nwsa-hub-review`) calls it on a
cron so logs, artifacts, reports and the issue stay private. Stage 1 is
deterministic shell/node; stages 2–5 are `anthropics/claude-code-action@v1`
jobs that read prompt files from `scripts/weekly-review/prompts/`.

**Tech Stack:** GitHub Actions (reusable workflow, matrix jobs, artifacts),
`anthropics/claude-code-action@v1` with `CLAUDE_CODE_OAUTH_TOKEN`, bash, node
(ESM, no new dependencies), `gh`.

**Spec:** `docs/superpowers/specs/2026-09-02-weekly-review-design.md`

## Global Constraints

- The public repo must never gain a `schedule:` or `workflow_dispatch:` trigger
  for the review — output would be public.
- No new npm dependencies. Scripts run with what `npm ci` already installs.
- No org-specific strings beyond what `.github/workflows/` already hardcodes;
  the packet derives site and function URLs from `git remote`, `.firebaserc`.
- Lean tier: lenses on `claude-sonnet-5`; verify and report on `claude-opus-5`.
- Every Claude job is bounded by `--max-turns` and a job `timeout-minutes`.
- Nothing in the review pipeline pushes to `nwsa-music-hub`; it only pushes
  `reviews/` to the caller repo.

---

### Task 1: Deterministic packet

**Files:**
- Create: `scripts/weekly-review/packet.sh` — builds `packet/packet.md`,
  `packet/metrics.json`, `packet/range.txt`. Never exits non-zero.
- Create: `scripts/weekly-review/drift.mjs` — prints the invariant checks as
  markdown (allowlist agreement, orphan self-checks, dead doc paths, What's
  New staleness, TODO deltas). Reads `REVIEW_RANGE`.

**Interfaces:**
- Consumes: hub checkout at cwd; optional `_review/reviews/{metrics.json,open.json,focus.md}`.
- Produces: `packet/packet.md` (read by every later stage), `packet/metrics.json`
  (committed by the report job as next week's baseline).

- [ ] Run `REVIEW_DIR=/nonexistent scripts/weekly-review/packet.sh` in a
      worktree with `node_modules`; expect `packet/packet.md` with every
      `##` section present and the sw.js hash line showing `stable`.
- [ ] Run `REVIEW_RANGE=HEAD~20..HEAD node scripts/weekly-review/drift.mjs`;
      expect three `✓` allowlist lines and no crash.
- [ ] Commit.

### Task 2: Findings contract + validator

**Files:**
- Create: `scripts/weekly-review/findings.schema.json`
- Create: `scripts/weekly-review/validate.mjs` — prints `::warning::` lines for
  a malformed findings file; always exits 0.
- Create: `scripts/weekly-review/cost.sh` — extracts `total_cost_usd`,
  `num_turns`, `duration_ms` from the action's execution file into
  `<stage>.cost.json`.

- [ ] `echo '{"lens":"x","findings":[{}]}' > /tmp/f.json && node scripts/weekly-review/validate.mjs /tmp/f.json` prints warnings for the missing keys.
- [ ] Commit.

### Task 3: Prompts

**Files:**
- Create: `scripts/weekly-review/prompts/{common,security,backend,frontend,drift,product,verify,critic,report}.md`

- [ ] Each prompt names its single output file and the JSON shape from Task 2.
- [ ] Commit.

### Task 4: Reusable workflow

**Files:**
- Create: `.github/workflows/weekly-review.yml` — `on: workflow_call` with
  inputs `days` (8), `tier` (lean), secret `CLAUDE_CODE_OAUTH_TOKEN`; jobs
  `packet` → `lens` (matrix ×5) → `verify` (matrix ×5) → `critic` → `report`.

- [ ] `ruby -ryaml -e 'YAML.load_file(".github/workflows/weekly-review.yml")'` parses.
- [ ] Commit; push to `main` (the caller references `@main`).

### Task 5: Private caller repo

**Files (in `d5nf9kcskk-byte/nwsa-hub-review`):**
- Create: `.github/workflows/weekly.yml` — cron `0 10 * * 6` + dispatch, calls
  the reusable workflow with explicit secret mapping.
- Create: `reviews/open.json` (`[]`), `README.md`.

- [ ] `gh workflow run weekly.yml -R d5nf9kcskk-byte/nwsa-hub-review`, then
      `gh run watch`: the `packet` job succeeds and uploads its artifact; the
      Claude jobs are skipped with a warning until the secret exists.
- [ ] Commit + push.

### Task 6: Docs

**Files:**
- Create: `docs/weekly-review.md` — operations (setup, on-demand run, tuning, cost, retirement of the Monday scan).
- Modify: `docs/claude-bug-scan.md` and the header comment of
  `.github/workflows/claude-bug-scan.yml` — retirement note.

- [ ] Commit; push.
