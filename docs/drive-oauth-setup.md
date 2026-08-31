# Drive sync: signing in as the folder owner

*Written 2026-08-31, after the concert-photo sync hit this wall.*

## Why this exists

The photo sync files check-in selfies into the directors' **Concert
Attendance** folder and keeps `concert-attendance.csv` beside them. It used
to talk to Drive as the Firebase service account, and that can never work
here:

> A service account **owns** every file it creates and has **no Drive storage
> of its own**. Creating a file in a personal My Drive folder therefore fails
> with `storageQuotaExceeded`, however the folder is shared. Editor access is
> not the problem and cannot be the fix.

Google's own remedy is a **Shared Drive**, where files are owned by the drive
rather than the uploader. Shared Drives are a Google Workspace feature, and
the Hub's Google account is a consumer one — so that door is closed.

What works instead: the sync signs in as **the person who owns the folder**,
using a long-lived OAuth refresh token. Files land in that account's own
storage, owned by them, exactly as if they had dragged them in. Firestore and
Firebase Storage keep using the service account; only Drive changes.

If the project ever moves to Workspace, delete the three secrets below and put
the folder in a Shared Drive with the service account as Content Manager — the
code already falls back to that when the secrets are absent.

## Setup, once

**1. Create an OAuth client.** In the Google Cloud console for the
`nwsa-hub` project: *APIs & Services → Credentials → Create credentials →
OAuth client ID*, application type **Desktop app**. Note the client id and
client secret.

If the consent screen has never been configured, do that first (*APIs &
Services → OAuth consent screen*), **External**, and add the folder-owning
account as a **Test user**. A test-user token on an unverified app is fine
here — it is one account granting access to its own Drive.

**2. Get a refresh token.** On your own machine, signed in to the browser as
the account that owns the Concert Attendance folder:

```bash
node scripts/drive-oauth-token.mjs <client-id> <client-secret>
```

It prints a URL, waits for the consent screen, and prints the refresh token.
Zero dependencies — it needs nothing installed.

**3. Store all three as repository secrets.** *Settings → Secrets and
variables → Actions*:

| Secret | Value |
| --- | --- |
| `DRIVE_OAUTH_CLIENT_ID` | from step 1 |
| `DRIVE_OAUTH_CLIENT_SECRET` | from step 1 |
| `DRIVE_OAUTH_REFRESH_TOKEN` | from step 2 |

Set **all three or none**. Half-set is a hard failure naming the missing one,
never a silent fall back to the account that cannot write
(`scripts/drive-auth.selfcheck.mjs` pins that).

**4. Run it.**

```bash
gh workflow run "Sync concert photos to Drive"
```

The log's second line says which credentials are in play. It should read
*"signed in as the folder owner (OAuth)"*.

## Handling the token

The refresh token is Drive access to that account: treat it like a password.
It is printed to your terminal and nowhere else — never written to a file,
never committed, never logged by the sync. Workflow logs on this repo are
public, which is why nothing prints any part of it.

To revoke: [myaccount.google.com/permissions](https://myaccount.google.com/permissions),
remove the client, and run step 2 again for a new one.

## When it breaks

The sync's errors name the wall rather than passing on Google's wording:

| Log line says | What to do |
| --- | --- |
| *missing OR not shared — if you can open the folder yourself, it is sharing* | Share the folder as Editor with the account in the message |
| *found the folder but cannot write to it* | Access is Viewer/Commenter; change it to Editor |
| *storage quota … account that owns the folder is out of Drive storage* | Free space in that Google account (this is its 15 GB, not the service account's zero) |
| *Drive OAuth is half-configured* | One of the three secrets is missing or blank |
| *not a folder id or a Drive link* | Re-paste it in Concert Check-In → Settings |

Nothing is ever at risk while this is broken: the photos live in Firebase
Storage and stay visible in the Hub. Drive is the archive, not the live view.
