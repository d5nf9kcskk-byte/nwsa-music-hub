# Parent absence emails → Who's Out

**Live as of 2026-08-26 (`DRY_RUN=false`).** Runs locally on a director's
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
   bulletin pipeline. Check first — if this prints a path, skip to step 3:
   ```bash
   ls -l ~/.config/nwsa-hub/service-account.json
   ```
   If it's missing, see **Getting the service account key** below.
3. Narrow the watch to just the MDC account, so the pipeline never reads a
   director's personal mail. **Do this before step 4** — the value is baked
   into the LaunchAgent at install time (see below).
   ```bash
   export MDC_MAIL_ACCOUNT_NAME='exactly the account name shown in Mail ▸ Settings ▸ Accounts'
   ```
   Also put that `export` in `~/.zshrc` so manual runs match the scheduled
   job. Once Mail permission is granted (step 5) you can print the exact
   account names to copy from:
   ```bash
   osascript -l JavaScript -e 'Application("Mail").accounts().map(a => a.name()).join("\n")'
   ```

   > **`launchd` does not read your shell profile.** An `export` in
   > `~/.zshrc` reaches a run you type by hand, but never the scheduled job.
   > So `--install` copies the current value of `MDC_MAIL_ACCOUNT_NAME` into
   > the agent's own plist. The consequence: **changing it means re-running
   > `--install`**, or the agent keeps the value it was installed with. If
   > it was never set at install time, the scheduled job reads *every* Mail
   > account on the Mac. `--status` prints what the installed agent actually
   > uses and warns when your shell disagrees with it.
4. Install the LaunchAgent:
   ```bash
   node scripts/absence-email-local.mjs --install
   ```
5. Settle the Mail permission **now**, on purpose, instead of during an
   unattended run you'd never see:
   ```bash
   node scripts/absence-email-local.mjs --grant
   ```
   Approve the dialog when it appears. See **The Mail permission** below for
   why this can't be scripted and what `--grant` is actually doing.
6. Check it:
   ```bash
   node scripts/absence-email-local.mjs --status
   ```

## Getting the service account key

Only needed once per Mac, and shared with the attendance-bulletin pipeline.

1. Open the [Firebase console](https://console.firebase.google.com) and pick
   the **nwsa-hub** project.
2. Gear icon (top left, next to *Project Overview*) → **Project settings**.
3. **Service accounts** tab → **Generate new private key** → confirm
   **Generate key**. A `.json` file downloads to `~/Downloads`.
4. Move it into place and lock it down — the filename Firebase gives it is
   random, so let the shell find it:
   ```bash
   mkdir -p ~/.config/nwsa-hub
   mv ~/Downloads/nwsa-hub-firebase-adminsdk-*.json ~/.config/nwsa-hub/service-account.json
   chmod 600 ~/.config/nwsa-hub/service-account.json
   ```
5. Confirm it landed and is readable only by you (`-rw-------`):
   ```bash
   ls -l ~/.config/nwsa-hub/service-account.json
   ```

**This key is not a password — it's broader than your own login.** It uses
the Admin SDK, which bypasses `firestore.rules` entirely: anything holding
it can read and write every student contact, attendance mark, grade, and
private note in the project. So:

- It lives **only** on this Mac, at that path, `chmod 600`.
- Never commit it, never paste it into a chat or an issue, never email it
  to yourself, never put it in the repo — not even in a gitignored file.
- If it's ever exposed, revoke it: same **Service accounts** page → manage
  the service account in Google Cloud → **Keys** → delete the leaked key,
  then generate a fresh one.

## The Mail permission

**It cannot be granted by a script, and that is the point.** `tccutil` can
only *reset* permissions, never grant them, and the permission database
itself is SIP-protected. If any script could approve its own access to Mail,
malware could silently read and send your mail. So macOS requires a human
click.

There are exactly two ways to avoid being surprised by that prompt:

1. **`--grant`** (what you want): triggers the prompt deliberately, in the
   foreground, at a moment you're sitting there. Once approved, the grant is
   permanent — the hourly job never prompts again.
2. **An MDM PPPC profile**, pushed by whoever manages the Mac. This is the
   only true no-prompt path, and it needs MDC IT to deploy it. Realistic
   only if the Mac is already enrolled in their management.

### Why `--grant` does two things

macOS attributes automation to the *responsible process*, and a LaunchAgent
run is a different responsible process than a Terminal run. Approving it in
Terminal does not necessarily cover the background job. So `--grant` first
pokes Mail in the foreground (Terminal → Mail), then `launchctl kickstart`s
one real background run — so if macOS wants a second approval for that
context, it asks while you're still there to click it.

To check or change it later:
```
System Settings → Privacy & Security → Automation
```

Note: Mail.app must be running for the pipeline to read current mail. If
it's quit, the job launches it.

## Pausing writes

Set the `DRY_RUN` constant near the top of `scripts/absence-email-local.mjs`
to `'true'` and re-run `--install` so the LaunchAgent's plist picks up the
change. Set it back to `'false'` to resume.

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
