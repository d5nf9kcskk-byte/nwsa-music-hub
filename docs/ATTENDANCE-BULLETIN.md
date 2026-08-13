# Attendance Bulletin → Hub roll (cloud)

Daily school-wide **Attendance Bulletin** email (MDC Outlook, PDF attachment)
feeds office marks onto music Take Roll. Other departments are ignored.

## Architecture

```
Outlook (ggilman@mdc.edu)
  → Power Automate (cloud, Mac not required)
  → GitHub repository_dispatch (attendance-bulletin)
  → scripts/apply-attendance-bulletin.mjs
  → Firestore attendance (source: office) + bulletinQueue
```

Same idea as the lesson-request flow. Default is **dry run** until you flip
`dry_run: "false"`.

## One-time: GitHub token for Power Automate

You likely already have a PAT for lesson-request. If not:

1. GitHub → Settings → Developer settings → Personal access tokens
2. Classic token with scope `repo` (or a fine-grained token that can
   create workflow dispatches on `nwsa-music-hub`)
3. Copy it; you will paste it into the Power Automate HTTP action

Repo secret already used by the Action: `FIREBASE_SERVICE_ACCOUNT_JSON`.

## Power Automate flow (click-through)

Do this once in [make.powerautomate.com](https://make.powerautomate.com)
signed in with your **MDC** account.

1. **Create** → Automated cloud flow  
   Name: `Hub — Attendance Bulletin`  
   Trigger: **When a new email arrives (V3)** (Office 365 Outlook)
2. Trigger settings:
   - Folder: Inbox (or the folder the bulletin lands in)
   - Subject filter: `Attendance Bulletin`
   - Only with attachments: Yes
3. **Get Attachment (V2)** — pick the PDF attachment from the trigger
4. **Compose** (optional) — convert attachment content to text if you have
   an “Extract text from PDF” / AI Builder action available.  
   **Preferred payload:** plain text (layout). GitHub dispatch bodies are
   size-limited; do **not** send a full base64 PDF if it is large.
5. **HTTP** action:
   - Method: `POST`
   - URI: `https://api.github.com/repos/d5nf9kcskk-byte/nwsa-music-hub/dispatches`
   - Headers:
     - `Accept`: `application/vnd.github+json`
     - `Authorization`: `Bearer YOUR_GITHUB_PAT`
     - `X-GitHub-Api-Version`: `2022-11-28`
   - Body:

```json
{
  "event_type": "attendance-bulletin",
  "client_payload": {
    "text": "@{outputs('Extract_text_or_Compose')}",
    "dry_run": "true"
  }
}
```

6. Save. Send yourself a test forward of today’s bulletin (or wait for
   tomorrow’s). Check **Actions → Apply Attendance Bulletin** for a dry-run log.

### Soft launch

1. Leave `dry_run: "true"` for a few school days.
2. Read the Action log: which music students would be marked, what was ignored.
3. When it looks right, change the flow body to `"dry_run": "false"`.

### If you cannot extract text in Power Automate

Manual path while we wire a better handoff:

1. Download the PDF
2. On a Mac with poppler: `pdftotext -layout "Attendance Bulletin ….pdf" -`
3. GitHub → Actions → **Apply Attendance Bulletin** → Run workflow → paste
   the text into `bulletin_text`, keep dry_run true

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
