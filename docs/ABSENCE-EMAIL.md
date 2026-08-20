# Parent absence emails → Who's Out

**Off by default (`DRY_RUN=true` in the code).** Runs locally on a director's
Mac via launchd — no Gmail/Yahoo/Graph API, MDC mail is read straight out of
Apple Mail.app, the same move already noted as the plan for the attendance
bulletin (`docs/ATTENDANCE-BULLETIN.md`).

```
Mail.app INBOX (all accounts, or one you name)
  → launchd (hourly, 7am–6pm) → osascript/JXA fetch new messages
  → scripts/apply-absence-email.mjs → Firestore
```

A confident match — exactly one roster name, exactly one date, both found in
the same email — writes straight to `plannedAbsences`, the SAME collection
the public "Report a planned absence" button writes to, so it shows up in
**Who's Out → Reported ahead of time** exactly like a parent used the app.
Anything less certain (no name found, more than one name, an unclear date)
goes to **Who's Out → Absence email — needs a look** for a director to read
the actual email and act by hand — nothing is ever guessed into attendance
data.

## Setup (once, on the Mac that has the MDC mailbox in Mail.app)

1. Confirm the mailbox is set up in Mail.app (Mail ▸ Settings ▸ Accounts) and
   receiving mail normally.
2. Service account credentials: this reuses the SAME key as the attendance
   bulletin pipeline — if that's already set up at
   `~/.config/nwsa-hub/service-account.json`, skip to step 3. Otherwise:
   Firebase console → Project settings → Service accounts → Generate new
   private key, save it to that path, `chmod 600` it.
3. Optional but recommended: narrow the watch to just the MDC account so the
   pipeline never reads a director's personal mail:
   ```bash
   export MDC_MAIL_ACCOUNT_NAME='exactly the account name shown in Mail ▸ Settings ▸ Accounts'
   ```
   Put that `export` in `~/.zshrc` (or wherever the installing shell reads
   its environment) so it's set every time, not just this session.
4. Install the LaunchAgent:
   ```bash
   node scripts/absence-email-local.mjs --install
   ```
5. **The first run asks macOS for permission to let this control Mail —
   approve it.** If you miss the prompt or it's denied later, `--status` and
   the log (`~/Library/Logs/nwsa-absence-email.log`) explain exactly which
   Privacy & Security setting to flip:
   ```
   System Settings → Privacy & Security → Automation → Terminal (or node) → allow "Mail"
   ```
6. Check it:
   ```bash
   node scripts/absence-email-local.mjs --status
   ```

## Soft launch

Leave dry run on for a few school days first:

```bash
DRY_RUN=true node scripts/absence-email-local.mjs
```

Read the log — matched students, dates, and anything that would have been
queued. Public repo: it does not print names outside your own terminal.

When it looks right, flip the switch the same way the bulletin pipeline
does — edit the `DRY_RUN` constant near the top of
`scripts/absence-email-local.mjs` to `'false'`, then re-run `--install` so
the LaunchAgent's plist picks up the change. Set it back to `'true'` any
time to pause writes without uninstalling anything.

## Catch-up

Every run remembers a watermark (`~/.config/nwsa-hub/absence-email-state.json`)
and asks Mail for everything received since then, with a couple hours of
built-in overlap for IMAP sync lag. If the Mac was asleep, off, or the job
failed when an email came in, the next run picks it up — nothing is lost to
a closed laptop. A small list of already-handled message ids keeps that
overlap from creating duplicates.

## What counts as an absence email

The parser looks for phrases like "won't be at school," "not going to be
there," "out sick," "will be absent" — see `ABSENCE_PHRASES` in
`scripts/lib/absenceEmailParse.mjs`. It reads the whole inbox rather than a
dedicated folder, so unrelated email (concert questions, newsletters, etc.)
is normal and simply ignored — nothing is written or queued for those.

Dates are read relative to when Mail.app says the email was **received**
(not when the pipeline happens to run), in the school's own timezone:
"tomorrow," "today," a weekday name, or an explicit `M/D` date.

## What gets written

| Parse result | Where it lands |
|---|---|
| One roster name + one date | `plannedAbsences` (pending) — Who's Out, same as a parent's own submission |
| No roster name recognized | `absenceEmailQueue` — Who's Out, "needs a look" |
| More than one roster name | `absenceEmailQueue` |
| Name found, date unclear/missing | `absenceEmailQueue` |
| Not absence-shaped at all | Ignored, nothing written |

Only **Active** students on the music roster are ever matched.

## Deploy rules once

After this ships, deploy Firestore rules so directors can read
`absenceEmailQueue`:

```bash
firebase deploy --only firestore:rules
```
