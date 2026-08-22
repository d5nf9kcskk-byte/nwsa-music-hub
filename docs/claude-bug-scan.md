# Claude weekly bug scan

The repo's automated bug review is the *Claude weekly bug scan* workflow
(`.github/workflows/claude-bug-scan.yml`). It replaced Cursor Bugbot in
Aug 2026.

## What it does

- Every Monday at 10:00 UTC (and on demand via **Actions → Claude weekly
  bug scan → Run workflow**), it looks at what landed on `main` in the
  past week.
- If nothing landed, it exits before Claude ever starts — zero token cost.
- Otherwise Claude reviews just that week's diff, checking for real bugs
  and regressions of the CLAUDE.md invariants (privacy projections,
  rules/query agreement, SW determinism, frozen ICS contracts).
- Findings go to one rolling GitHub issue labeled `claude-bug-scan`. No
  findings → no issue, no comment, no email.

## One-time setup

1. On a machine with Claude Code logged in, run:
   ```
   claude setup-token
   ```
   and copy the long-lived OAuth token it prints. This runs on your Claude
   subscription — no separate API bill.
2. In GitHub: repo **Settings → Secrets and variables → Actions → New
   repository secret**, name `CLAUDE_CODE_OAUTH_TOKEN`, paste the token.

(Alternative: set an `ANTHROPIC_API_KEY` secret instead and change the
`claude_code_oauth_token:` input to `anthropic_api_key:` — pay-per-token.)

## Keeping cost down

- The weekly cadence + diff-only scope is the main lever; a typical week's
  scan is one modest review, not a repo audit.
- If you want it even cheaper, add `--model claude-haiku-4-5-20251001` to
  `claude_args` in the workflow (less thorough, much cheaper).
- Don't switch the schedule to per-PR unless you actually want a review on
  every push — that's what made Bugbot burn through its limits.

## Removing Cursor Bugbot (the "usage limit reached" spam)

Those comments and emails come from the **Cursor** GitHub App, which is
independent of this repo's code — nothing in the repo enables it, so
nothing in the repo can disable it. To stop it:

1. GitHub → **Settings** (your account or org that owns the repo) →
   **Integrations → GitHub Apps** (or *Applications → Installed GitHub
   Apps*) → **Cursor** → **Configure**.
2. Either **Uninstall** the app entirely, or remove `nwsa-music-hub` from
   its repository access list.
3. Optionally also turn Bugbot off in the Cursor dashboard
   (cursor.com → Dashboard → Bugbot) if you keep the app installed
   anywhere else.

Uninstalling stops both the PR comments and the failure emails.
