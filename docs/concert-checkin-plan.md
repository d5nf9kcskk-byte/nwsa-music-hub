# Concert Check-In & Check-Out — build plan

Status: **built and pushed** (branch `claude/concert-checkin-system-4ze065`)
for steps 1-5, 7 and 8. Shipped since: the student's own tally card (#119)
and the Google Drive photo sync (this change). Still not built: the calendar
Required/Optional filter and its two bundle feeds (step 6).

Settled since this was written:
- Accepted email domains are `students.dadeschools.net`, `mymdc.net`, and
  `mdc.edu` — college and high school check in at the same door.
- The CSV's photo cell is a link INTO the Hub (staff sign-in), not a
  Firebase download URL. `getDownloadURL` mints a permanent bearer token on
  a photograph of a student, readable by anyone the spreadsheet reached.
  The Drive column beside it fills in when the sync ships.
- The venue fallback is built: a per-concert switch that accepts a check-in
  without a photo, so a camera or wifi failure costs you the picture rather
  than stranding a student at the door.
- Still open, and NOT built: the student-facing tally (privacy decision (a)
  below).

Requested by the director (Aug 2026): a per-concert check-in / check-out
station for students, selfie-verified and time-stamped, with a cumulative CSV
any director can download, concerts markable Required or Optional, calendar
filters for both, and a per-student per-semester tally.

---

## 1. What a student actually does

Three taps, no account, on their own phone.

1. **Finds the concert.** Three doors, all landing on the same page:
   - a banner on Home and Calendar that appears automatically while a
     check-in-enabled concert is in its window ("Camerata Fall Concert —
     tap to check in");
   - a **Check in** button on the concert card itself (`/event/<id>`), which
     is what you asked for — go to the concert, get the check-in there;
   - a QR code you can project or tape to the door (the Hub already has a QR
     screen — `src/director/qr/` — so this is a poster, not new plumbing).
2. **Says who they are.** Name search over `studentsPublic` — the exact same
   forgiving search the "Find My Schedule" page already uses (nicknames,
   accents, last-name-first all work). If the device already remembers them
   (`src/shared/identity.ts`), their name is pre-filled and this is one tap.
3. **Types their school email**, then **takes a selfie with the stage
   behind them.** Front or rear camera, retake as many times as they want,
   one Submit.

At the end of the night the same three doors say **Check out** instead, and
the flow is identical. The page always shows their current state ("Checked in
at 6:52 PM — check out when the concert ends"), so nobody has to wonder.

Instructions live on the page in plain language, in English and Spanish (the
Hub is already bilingual — `src/shared/translations.ts`), plus a printable
half-page for the lobby table.

### What stops the obvious games

| Trick | What stops it |
|---|---|
| Checking in from home | The photo. A director can see the stage in the background, and the CSV links every photo. |
| Checking in as someone else | Their school email is on the row, and their face is in the photo. |
| Checking in twice / spamming rows | The record ID is `<eventId>_<studentId>_in`. A second check-in for the same student at the same concert is refused by the database, not by the UI. |
| Faking the time | **The timestamp is written by the server, never by the phone.** This is the single most important reason the write goes through a Cloud Function (§3). |
| Checking out at 6:53 | Optional minimum-stay guard per concert (e.g. "check-out opens 45 minutes after the downbeat"); you set it, or leave it off. |

---

## 2. What you mark on a concert (director side)

Two new switches on the existing event editor, both optional and both absent
by default — every concert that exists today behaves exactly as it does now:

- **Attendance:** `Not tracked` (default) · **Required** · **Optional**
- **Check-in station:** off (default) / on, with a check-in window
  (defaults to 60 min before start → 60 min after end) and the optional
  minimum-stay above.

"Required" and "Optional" are independent of the check-in station on purpose:
you can mark a concert Required for planning and only switch the station on
for the ones you want to photograph. Marking it also drives the calendar
filters and the tallies.

The concert card shows a badge either way — **Required concert** or
**Optional concert** — so a student reading the card knows before they ask.

---

## 3. How it's built (technical)

Nothing here is a new pattern for this codebase; each piece copies something
already shipped and pinned.

### Data

**`events`** — three new optional fields on `CalendarEvent`
(`src/director/types.ts`). Absent = today's behavior, exactly like
`Ensemble.kind` did:

```ts
concertAttendance?: 'required' | 'optional';   // absent = not tracked
checkin?: {
  enabled: boolean;
  opensMinutesBefore?: number;   // default 60
  closesMinutesAfter?: number;   // default 60
  minStayMinutes?: number;       // optional check-out guard
};
```

**`concertCheckins`** — one document per scan, **staff-only**, never
mirrored publicly:

```
id: `${eventId}_${studentId}_in`  |  `..._out`
{ eventId, eventTitle, eventDate, studentId, studentName, grade, instrument,
  email, kind: 'in'|'out', at: <server timestamp>, termId,
  photoPath, photoDriveId?, photoDriveLink?, ua, source: 'web' }
```

Deterministic IDs are the whole anti-duplicate story, and they are why a
student who taps twice gets "you're already checked in" instead of two rows.

**`settings/concertAttendance`** — staff-editable, so you never need me to
change a number: accepted school-email domains, and per-semester goals
(how many Required and how many Optional each student owes).

**Semesters** — the Hub has no term concept yet, so I add one to
`config/orgs/*.json` (`terms: [{ id, name, start, end }]`), which is where org
facts belong per the repo's org-config rule. Fall 2026 and Spring 2027 for
NWSA; every tally and every CSV row carries its `termId`.

### The write path — a Cloud Function, not a direct write

The check-in posts to a new HTTPS function (`functions/src/concertCheckin.ts`,
alongside the existing `lessonsFeed`). It:

1. confirms the event exists, has `checkin.enabled`, and is inside its window;
2. confirms the student exists and the email matches the accepted domain;
3. **stamps the time itself** — the phone's clock never touches the record;
4. writes the (already downscaled, ~200 KB) selfie to Firebase Storage;
5. writes the `concertCheckins` doc;
6. refuses a second identical scan.

Two reasons this is a function rather than a sixth unauthenticated Firestore
write. First, a client-supplied timestamp on an attendance record is not
worth having. Second, `firestore.rules` states in writing that the app's five
public writes "stay the only five" — this route keeps that invariant intact
and gives us server-side rate limiting for free.

### Where the photos live

Storage is the **intake**; your Google Drive is the **archive of record**.

- Upload lands at `checkins/<eventId>/<studentId>-<in|out>-<ts>.jpg`.
- `storage.rules` grants **no public read** on that path — unlike the video
  submissions, these are pictures of minors and no bearer link exists for
  them. Directors read them signed in; the CSV export resolves the links at
  download time.
- A cron (`scripts/sync-drive-photos.mjs`, a near-copy of the video sync you
  already run every 15 minutes) copies each new photo into a
  **"Concert Attendance"** folder in your NWSA Orchestra Drive, one subfolder
  per concert (`Concert Attendance/2026-11-14 Fall Concert/`), and writes the
  Drive link back onto the record. Access is then plain Drive sharing —
  whoever you share the folder with, and nobody else.
- The same cron keeps `Concert Attendance/concert-attendance.csv` up to date
  in that folder, so the file is sitting there whether or not anyone opens
  the Hub.

### The CSV

One cumulative file, one row per student per concert, growing forever —
every new concert appends, nothing is ever a separate download:

```
Concert, Date, Ensemble(s), Requirement, Term,
Student, Grade, Instrument, School email,
Checked in, Check-in time, Check-in photo,
Checked out, Check-out time, Check-out photo,
Minutes present, Complete
```

Two ways to get it, same data:

- **In the Hub** — a new *Concert Check-In* screen on the director side
  (under Attendance) with a Download CSV button, filters by concert / term /
  requirement, a live "37 in, 12 out" count during the concert, and a photo
  wall for spot-checking. Any signed-in director or owner, any time.
- **In Drive** — the file the cron maintains, above.

Photo cells are Drive links once the sync has run (usually within 15
minutes), and time-limited signed links before that, so a CSV pulled mid-
concert still works.

### Calendar filters

`src/shared/calendarView.ts` is the one definition of a filtered calendar, so
the filter goes there and the Schedule screen, the public calendar, and the
ICS generator all pick it up at once. The view spec gains an optional
`attendance?: 'required' | 'optional'`.

**The published slug hashes are a subscription contract**, so the new field is
appended to the canonical string *only when it is set* — every existing
`feeds/view-<slug>.ics` URL hashes to exactly the same value it does today,
and `scripts/calendar-view.selfcheck.mjs` gets new cases pinning that.

For subscribable feeds I add two named **bundles** rather than new hash-views,
because a bundle keeps a stable address while its membership re-resolves every
build — a concert you mark Required next March joins
`feeds/bundle-required-concerts.ics` with nobody re-subscribing:

- **Required concerts** → `feeds/bundle-required-concerts.ics`
- **Optional concerts** → `feeds/bundle-optional-concerts.ics`

### The student's own tally

On "Find My Schedule", once a student is identified, a card:

> **Fall 2026** — Required: 2 of 3 · Optional: 1 of 2
> Spring 2027 starts January 6.

Counted from completed pairs (checked in *and* out) in that term, split by the
concert's Required/Optional mark, with the goals from
`settings/concertAttendance`.

---

## 4. What you need to set up

Most of it is already in place from the video-submission feature.

**Already done, nothing to do:** Firebase project on Blaze, Cloud Functions
deploying from `deploy-functions.yml`, Storage bucket and rules
auto-deploying, `FIREBASE_SERVICE_ACCOUNT_JSON` in GitHub, Drive API enabled
on the project.

**You do, once (about ten minutes):**

1. In the **NWSA Orchestra Gmail/Drive**, create a folder named
   **Concert Attendance**.
2. Share it as **Editor** with the service-account address (the
   `client_email` in the Firebase service-account key — I'll paste the exact
   address when we get there), and as **Viewer or Editor** with Mr. Munger
   and any other director who should pull the file.
3. Copy the folder ID out of its URL and paste it into the new *Concert
   Check-In → Settings* screen in the Hub. (No secret, no redeploy — it's
   just a folder ID.)
4. In the same settings screen, set the **accepted school email domain(s)**
   (e.g. `@students.dadeschools.net`) and the **per-semester goals** —
   Required: 3, Optional: 2, or whatever the real numbers are, per semester.

**Then, per concert:** open the event, set Required or Optional, flip
**Check-in station** on, done. Nothing else per concert — the banner, the
button on the card, the QR poster, the CSV rows, and the filters all follow
from that one switch.

---

## 5. Two things I need you to decide

**(a) Who can see a student's attendance count.** The Hub's privacy model
(CLAUDE.md, decided 2026-08-03) says attendance is staff-only, and names are
public. "Type your name and see your count" would cross those two — anyone
could type any student's name and read their attendance record.

My recommendation: **the student types their school email as well as their
name**, and the count comes back only if the email matches the one on their
check-ins. It stays one extra field for the student and it stops the page
from being a lookup table of everyone's attendance. Say the word if you'd
rather it be name-only and I'll build that instead — it's your call, I just
don't want to make it silently.

**(b) Photos of minors.** These are pictures of students, stored in Google
Drive and linked from a spreadsheet. Technically that's handled: no public
read, no public projection, never in any ICS feed, never in the printed
program. But it's worth a check with the school on media/photo consent
before the first concert, and I'd like your OK to put one plain line on the
check-in page — *"Your photo is used only to confirm concert attendance and
is visible only to your directors."* Confirm and I'll include it.

---

## 6. Order of work

1. Types, org-config `terms`, `settings/concertAttendance`, `firestore.rules`
   + `storage.rules` (rules auto-deploy on merge).
2. `functions/src/concertCheckin.ts` + a self-check pinning its guards, wired
   into `deploy-functions.yml` **before** any credential is written — the
   `lessonsFeed` pattern.
3. Public check-in page, banner, and the button on the concert card.
4. Director editor switches (Required / Optional / station) and the badge on
   the card.
5. Director *Concert Check-In* screen, live counts, photo wall, CSV.
6. `calendarView` attendance filter + the two bundles + selfcheck cases.
7. `sync-drive-photos.mjs` cron and the Drive CSV.
8. Student tally card.
9. `src/shared/whatsNew.ts` entry, docs, release-checklist note.

Steps 1–5 are the working feature; a concert could run on them alone.

Ship gates, per this repo's rules: NWSA build stays byte-identical where it
should (stable `[sw-precache]` hash, `grep -ri asyo dist/` empty), every
existing calendar feed URL unchanged, no student photo or attendance value
in any public projection or feed, and no real student data anywhere in the
repo.
