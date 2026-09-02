# Weekly review — design

**Date:** 2026-09-02
**Status:** approved in chat 2026-09-02 (host, tier, and bug-scan retirement
decided by the director); built the same day.

## The ask

From the director:

> An agent that weekly reviews the Hub: errors, code drift, things that are
> not working, and ideas to implement, take out, or rework. Saturday morning
> so the weekend is free to work the bugs out. Security, backend, frontend
> UI and UX. More than one set of AI eyes, from different perspectives.
> Structured, and reported from that structure every single week.
> Automated. As efficient as possible, with a model and effort level per
> stage.

## Decisions taken

- **Host: a private repo (`nwsa-hub-review`) calling a reusable workflow
  that lives in this repo.** `nwsa-music-hub` is public, so a job log, an
  artifact, or an issue here is world-readable. Findings (security ones
  especially) must not be. A reusable workflow's logs, artifacts, and
  `GITHUB_TOKEN` belong to the *caller*, so the review logic stays here
  beside the code and CLAUDE.md it checks, and everything the run produces
  lands in the private repo.
- **Tier: lean.** Sonnet 5 on every lens; Opus 5 only where a wrong answer
  costs the most — the refute-first verifier and the report writer.
  Roughly $15–25/week API-equivalent; every job prints its real
  `total_cost_usd`, so week one calibrates.
- **The Monday bug scan (`claude-bug-scan.yml`) is retired after the
  Saturday review has run green twice.** It is a shallow subset (last run:
  171 commits, 13 turns, under a dollar, no findings) and posts to a public
  issue.
- **Saturday 10:00 UTC** (`0 10 * * 6`): 6 AM Eastern in summer, 5 AM in
  winter. GitHub cron is UTC-only; the hour was chosen so the report is
  waiting by breakfast either way.

## What already exists (do not rebuild)

- 40 self-checks run in `deploy.yml` on every push and hourly; the
  functions self-checks in `deploy-functions.yml`. The review does NOT
  re-run these — it reads their CI conclusions.
- `docs/audit-2026-08.md` is the one-time full audit; its section order
  (UX, security, architecture, roadmap) informed the report structure.
- `claude-code-action@v1` with `CLAUDE_CODE_OAUTH_TOKEN` is already the
  proven way to run Claude in this repo's Actions (`claude-bug-scan.yml`).
  `claude_args` accepts `--model` and `--effort`.

## The constraint that decides the architecture

Two things must both be true: the review must read a public repo, and its
output must stay private. A reusable workflow (`on: workflow_call`) is the
one GitHub feature where the code being run and the place its output lands
are different repos. Nothing produced by the run — job logs, uploaded
artifacts, the `reviews/` files, the issue — ever touches the public repo.

## Stages

Deterministic first, models second, cheapest model that can do the job,
strongest model where being wrong is expensive.

### 1. Packet (`scripts/weekly-review/packet.sh`, no tokens)

One markdown file every later stage reads first, so no reviewer spends
turns re-deriving facts a script can print:

- commits and diffstat for the review range (default: 8 days);
- CI: every non-success run across all workflows in the range;
- live probes: the Pages site, `feeds/index.json`, `all.ics` VEVENT count,
  `sw.js`, the three Cloud Functions (a bad token must 404);
- `npm run lint` / `tsc -b` / `npm audit` — counts, and the lint delta
  against last week (lint is NOT in CI and has ~80 pre-existing problems,
  so a dump would be noise; the delta is signal);
- two builds, comparing `dist/sw.js` hashes (the determinism contract) and
  `grep -ri asyo dist/` (the white-label contract);
- `scripts/weekly-review/drift.mjs`: the invariants CLAUDE.md says must
  change together — the three `lessonsPublic` allowlists, the
  `rosterOverridesPublic` keys vs `publicOverrideFields()`, self-check files
  referenced by no workflow or package script, paths named in CLAUDE.md
  that no longer exist, `whatsNew.ts` staleness vs product commits;
- last week's open findings (`reviews/open.json` from the caller repo).

### 2. Lenses (five parallel jobs, Sonnet 5)

Security · backend & data · frontend UI/UX · drift & hygiene · product.
Each is a separate process — a genuinely independent set of eyes, not a
subagent sharing the parent's framing. Each reads the packet, reviews the
week's diff in full, plus **one rotating deep-dive area** (ISO week mod 5:
rules + hooks; functions + scripts; public site; director screens;
shared + PWA + workflows + docs), so the whole repo gets a full read every
five weeks without paying for a whole-repo read every week. Output is
`findings/<lens>.json` against `findings.schema.json`.

### 3. Verify (one job per lens, Opus 5, effort high)

Refute-first: for every finding, try to disprove it by tracing the code;
a finding survives only with a concrete trace or reproduction. The same
pass re-checks last week's open items against today's code and marks each
fixed / open / dropped. Output: `verified/<lens>.json`.

### 4. Critic (one job, Sonnet 5, effort medium)

Reads the packet and everything that survived and answers one question:
what did nobody look at? Its answer is stored as next week's extra focus
(`reviews/focus.md`) — the cheapest way to widen coverage over time.

### 5. Report (one job, Opus 5, effort high)

Dedupes across lenses, ranks, and writes the SAME structure every week:

1. Health (CI, probes, build, lint/audit deltas)
2. Broken (confirmed, `file:line`, how to see it, fix size S/M/L)
3. Security
4. Drift (invariant or doc vs code)
5. UX / UI
6. Implement / Remove / Rework (each with why, effort, what it touches)
7. Carry-forward (last week's items: fixed / still open / dropped)
8. Stats (commits reviewed, deep-dive area, cost and turns per stage)

Written to `reviews/YYYY-MM-DD.md` and `reviews/open.json` in the caller
repo and opened as an issue there (label `weekly-review`), which GitHub
emails the owner.

## Where the pieces live

In this repo: `.github/workflows/weekly-review.yml` (`workflow_call`),
`scripts/weekly-review/` (packet, drift check, schema, prompts),
`docs/weekly-review.md` (operations).

In `nwsa-hub-review` (private): `.github/workflows/weekly.yml` (the cron
caller, ~20 lines), the `CLAUDE_CODE_OAUTH_TOKEN` secret, `reviews/`.

## Drawbacks, accepted

- Two repos. The alternative (everything public) leaks findings.
- One manual step: the OAuth token must be pasted into the private repo;
  secret values cannot be copied between repos.
- Lint delta needs last week's count; week one reports the raw count.
- Cost is an estimate until week one prints the real numbers.

## Rejected approaches

- **Claude cloud routine.** Private and zero-infrastructure, but the docs
  do not enumerate a routine's tools, there is no week-to-week memory, and
  parallel reviewers on different models are not guaranteed.
- **Extend `claude-bug-scan.yml` in place.** Simplest; findings public.
- **One Claude session orchestrating subagents.** Cheaper setup, but the
  subagents share the parent's framing, and one context holding five
  reviews is exactly the "one set of eyes" the director asked to avoid.

## What is verified, and what is not

Verified at build time: the packet script runs locally against this
worktree; the workflow YAML parses; the caller workflow dispatches and the
packet job completes. NOT verified until the token is in the private repo:
the five lens jobs, verify, critic, and report end to end. Week one is the
proof, and it is also when cost figures become real.
