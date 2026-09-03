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

## Lesson-log family email (`lessonLogMailQueue`)

**Sending is a deliberate press, not a save side effect** (director's call,
2026-09-03 — it may become automatic later). Once an Applied Teacher has a
**complete** High School Lesson Log line (a 0–100 grade + student initials
typed in person), the Hub *offers* to send it: saving shows an "Email the
family" button, and every finished row keeps one in its actions. Only that
press writes a doc to **`lessonLogMailQueue`**, and the lesson is stamped
`logMailedAt` so the row reads "Emailed Sep 3" rather than leaving the
teacher guessing whether a family already had it.

Recipients (student + guardian emails) are denormalized onto the queue doc at
write time so the flow does not need a second Firestore lookup.

### Doc fields
`lessonId`, `teacherEmail`, `teacherName`, `studentId`, `studentName`,
`date`, `grade`, `repertoire`, `technique`, `teacherInitials`,
`studentInitials`, `payrollMinutes`, `recipients` (string array), `subject`,
`createdAt` (ms), `processedAt` (`null` until sent).

### Flow outline (every 5–10 minutes)
1. Query `lessonLogMailQueue` where `processedAt == null` (same Firestore
   REST + service-account pattern as `notifyQueue`).
2. For each item → Outlook / SMTP: `To` = `recipients`, `Subject` = `subject`,
   body = a short plain-text summary (date, teacher, grade, repertoire,
   technique, payroll length, initials). The Hub also offers an **Open in
   Mail** mailto fallback if this flow is not wired yet.
3. PATCH the doc: set `processedAt` to now.

Do not send when `recipients` is empty (no contact on file). Incomplete log
rows never enqueue.
