# Attendance Bulletin → Hub roll

**Reads the bulletin PDF straight out of Apple Mail** on Grant's Mac via
launchd (`com.nwsa.hub.bulletin`, weekdays 12:45 and 15:15). Nothing in the
live path touches Outlook, Power Automate, OneDrive Online, or Microsoft
Graph.

```
Mail.app INBOX ("Attendance Bulletin" + PDF attachment)
  → launchd → save attachment to a temp dir → pdftotext → Firestore
```

## Why it moved off OneDrive (2026-08-22)

The OneDrive drop **silently broke every scheduled run.** The log pattern was
unmistakable: manual runs read the PDF and wrote attendance fine, while every
12:45 and 15:15 cron run died with

```
Need pdftotext (poppler) or pymupdf to read PDF.
apply-attendance-bulletin exited 1
```

`pdftotext` was installed the whole time. `~/Library/CloudStorage` is
TCC-protected in a way that denied the *scheduled* job the file itself, and
that denial surfaces as a missing-dependency error — so the pipeline looked
like a broken install rather than a permissions problem, and failed quietly
from 2026-08-21 onward. Bulletins arrive in Mail as attachments anyway;
saving them to an ordinary temp directory removes the whole class of problem.

The OneDrive folder survives only as a fallback, consulted when Mail yields
nothing. It is fine for it to be empty forever.

## Setup

1. Mail permission — do this deliberately rather than during a silent cron:
   ```bash
   node scripts/bulletin-local.mjs --grant
   ```
   Approve the dialog. macOS asks per *responsible process*, so `--grant`
   also kickstarts one real background run to settle that context too.
2. Narrow to the MDC account so the job never reads personal mail. Set this
   **before** `--install` — it is baked into the agent's plist:
   ```bash
   export MDC_MAIL_ACCOUNT_NAME='exact name from Mail ▸ Settings ▸ Accounts'
   node scripts/bulletin-local.mjs --install
   ```
3. Check what the *installed agent* actually does:
   ```bash
   node scripts/bulletin-local.mjs --status
   ```

`--status` reads the installed plist, not this script's constants — so the
`mode:` line reflects what the scheduled job really does.

## DRY_RUN is now safe to reinstall over

`DRY_RUN=false` used to be hand-added to the plist after `--install`. Since
`--install` regenerates that file, running it again silently wiped the flag
and reverted the **live** pipeline to dry run — no error, attendance just
stopped appearing. `--install` now carries the installed value forward.

To pause writes: set `DRY_RUN=true` and re-run `--install`.

Backfilled 2026-08-14 through 2026-08-20 on go-live: 84 office docs, 0
ambiguous. Director-entered marks are never overwritten.

The Azure / Microsoft Graph / GitHub Actions plan below is **not in use** and
is kept for reference only.

---


Daily school-wide **Attendance Bulletin** email (MDC Outlook, PDF attachment)
feeds office marks onto music Take Roll. Other departments are ignored.

GitHub gets the PDF (or a OneDrive drop) and runs `pdftotext -layout`. That is
more accurate than AI Builder OCR on this two-column district report.

Do **not** add an HTTP action. HTTP is a Premium connector. The flow stays on
standard Outlook + OneDrive (plus AI Builder if you already connected it).

## Architecture

```
Outlook (ggilman@mdc.edu)
  → GitHub Action cron (Graph Mail.Read) → pdftotext → apply script → Firestore

Holding (until Graph login is done):
  Power Automate saves OCR text (or the PDF) to OneDrive
  /Hub/attendance-bulletins
  → same GitHub cron reads that folder via Graph Files.Read
```

Default is **dry run** until you set the GitHub variable
`ATTENDANCE_BULLETIN_DRY_RUN` to `false`.

## Right now: finish the Power Automate flow (no HTTP)

You already have: Outlook trigger → For each → Get Attachment (V2) → Recognize
text. Stay in that designer.

### OneDrive folder (once)

1. [office.com](https://www.office.com) with **ggilman@mdc.edu** → the **OneDrive** app
2. **My files** → **New** → **Folder** → `Hub`
3. Open `Hub` → **New** → **Folder** → `attendance-bulletins`

### Create file step (in the flow)

1. Inside **For each**, **after** Recognize text, click **+ New step**
2. Search **OneDrive for Business** → **Create file**
3. Folder path: `/Hub/attendance-bulletins`
4. File name:

```
@{formatDateTime(utcNow(),'yyyy-MM-dd')}.txt
```

5. File content: pick **Full text of the document** (the OCR output) from
   dynamic content
6. **Save** the flow. You should only have standard connectors, plus AI Builder
   if it was already connected. No HTTP.

Optional later: skip OCR and save the PDF instead (same Create file action,
file name `yyyy-MM-dd.pdf`, file content = attachment from Get Attachment).
GitHub prefers a real PDF.

Forward today’s bulletin to yourself (or wait for the next school day) and
confirm a file lands in that OneDrive folder.

## GitHub picks it up (no HTTP)

The Action **Apply Attendance Bulletin** runs on weekdays at about 12:30 PM and
3:00 PM Eastern. It:

1. Looks in Outlook for a recent **Attendance Bulletin** PDF (best), or
2. Reads `/Hub/attendance-bulletins` on your OneDrive (holding path), then
3. Parses with `pdftotext -layout` (PDF) or the saved `.txt`, dry-run by default

Until Graph secrets exist, the cron still runs and quietly skips. Manual test:
Actions → **Apply Attendance Bulletin** → Run workflow → paste `pdftotext
-layout` text into `bulletin_text`.

### Graph login (lasting path, your mailbox only)

This is a delegated app: it can read **your** mail and OneDrive, not the
school’s. No Premium. About 10 minutes.

1. Open [portal.azure.com](https://portal.azure.com) as **ggilman@mdc.edu**
2. Search **App registrations** → **New registration**
3. Name: `NWSA Hub attendance bulletin`
4. Accounts in this organizational directory only
5. Redirect URI: leave blank → **Register**
6. Copy **Application (client) ID** and **Directory (tenant) ID**
7. **Authentication** → Advanced settings → **Allow public client flows** → Yes → Save
8. **API permissions** → **Add a permission** → **Microsoft Graph** →
   **Delegated**:
   - `Mail.Read`
   - `Files.Read`
   - `User.Read`
   (offline_access comes with the login)
9. Do **not** add Application permissions. If **Grant admin consent** is greyed
   out, skip it. You consent for yourself at login.

If **New registration** is blocked, stop. Files can still pile up in OneDrive
until MDC IT allows this app (delegated Mail.Read + Files.Read for
`ggilman@mdc.edu` only).

Then in this repo:

```bash
export MS_GRAPH_TENANT_ID='(Directory tenant ID)'
export MS_GRAPH_CLIENT_ID='(Application client ID)'
node scripts/fetch-attendance-bulletin.mjs --login
```

Sign in as ggilman@mdc.edu, enter the device code, copy the refresh token.

GitHub → this repo → **Settings** → **Secrets and variables** → **Actions** →
**New repository secret**:

| Secret | Value |
|---|---|
| `MS_GRAPH_TENANT_ID` | Directory (tenant) ID |
| `MS_GRAPH_CLIENT_ID` | Application (client) ID |
| `MS_GRAPH_REFRESH_TOKEN` | token from `--login` |

After that, the cron can pull the Outlook PDF directly. Power Automate becomes
optional. If a run says 401, re-run `--login` and update `MS_GRAPH_REFRESH_TOKEN`.

### Soft launch

1. Leave dry run on for a few school days (default).
2. Read **Actions → Apply Attendance Bulletin**: match counts, ignored other depts.
   Public repo: the Action does not print student names.
3. When it looks right: **Settings** → **Secrets and variables** → **Actions** →
   **Variables** → `ATTENDANCE_BULLETIN_DRY_RUN` = `false`

## What gets written

| Bulletin section | Hub mark |
|------------------|----------|
| No shows / Absent | Absent + Office badge |
| Tardy | Late + Office |
| Excused early | Excused + time in reason |
| Suspension / Special note | Excused + Office |

Only **Active** Hub students (music roster). Ambiguous names appear under
**Who’s Out → Office bulletin — needs a name check**. Director taps on Take
Roll always win over a later bulletin update.

## Deploy rules once

After this ships, deploy Firestore rules so directors can read `bulletinQueue`:

```bash
firebase deploy --only firestore:rules
```
