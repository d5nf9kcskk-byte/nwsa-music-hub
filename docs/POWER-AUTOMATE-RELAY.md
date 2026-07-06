# Notification relay — Power Automate setup (#21)

The Hub can't push notifications from a static site, but it WRITES everything
that should be pushed into one Firestore collection: **`notifyQueue`**.
A scheduled Power Automate flow reads that queue and delivers to Teams/email.

## What the app writes
Every document has: `kind` (`urgent-announcement` | `cancellation` | `change`),
`title`, optional `body`, `ensembleIds` (empty = school-wide), `createdAt` (ms),
`processedAt` (null until your flow marks it).

Written automatically when a director: posts an **Urgent** announcement, or uses
**Quick change** (delay / room change / cancel) on the Today dashboard.

## Flow outline (every 5–10 minutes)
1. **HTTP** — GET unprocessed items via Firestore REST `runQuery`:
   `POST https://firestore.googleapis.com/v1/projects/<PROJECT_ID>/databases/(default)/documents:runQuery`
   body: structuredQuery on `notifyQueue` where `processedAt == null`.
   Auth: a Google service-account (same one as the lesson-request flow) with
   an OAuth token.
2. **For each item** → post to the right **Teams channel** (map ensembleIds →
   channel) and/or append to the weekly **parent-email digest** table.
3. **HTTP PATCH** the doc: set `processedAt` to now so it's never re-sent.

## Weekly digest (optional)
A second flow, Sunday 6 pm: query `events` for the coming week + unprocessed
`digest` items, format one email, send via Outlook connector to the opted-in
parent list you maintain in Teams/Excel.
