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

---

## Lesson-log family email — NOT a Power Automate flow any more

This used to specify a flow that polled `lessonLogMailQueue`. **Don't build
it.** That flow was never written, so every summary a teacher sent sat in the
queue and no family received one; it is now a Cloud Function plus the Trigger
Email extension, exactly like the sign-up confirmation. Same SMTP account, no
service-account key, no polling.

See **[docs/lesson-log-email.md](lesson-log-email.md)**.

The one thing to carry over if you ever revisit this: `lessonLogMailQueue` is
written by a signed-in teacher who controls every field on it, `recipients`
included. Anything that turns those docs into email must re-derive the
recipients from the student's own `contacts` record rather than trusting the
queue doc, or a teacher can make the school's SMTP account mail anyone.
