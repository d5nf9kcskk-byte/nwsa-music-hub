# Hub tools: changing the calendar and announcements from the Actions tab

Two `workflow_dispatch` workflows change the Hub without a signed-in browser,
for when the director is away from a computer and asks an assistant (or does
it from a phone) through GitHub:

| Workflow | Script | Does |
|---|---|---|
| *Hub Calendar* | `scripts/hub-calendar.mjs` | add (with weekly repeats), edit, move, cancel, restore ("Back to normal"), delete |
| *Hub Announcement* | `scripts/hub-announcement.mjs` | post (with "publish at"), edit, archive, restore, delete, urgent alert |

Both write the same Firestore docs the Director Panel writes, through the
`FIREBASE_SERVICE_ACCOUNT_JSON` secret. Nothing in `src/` changed to add them,
and the app does not know or care that a doc came from here.

## How to run one

1. Actions → the workflow → Run workflow.
2. Paste ONE request as JSON into **request**. Leave **apply** unticked.
3. Read the run log. It prints every write it would make, with before → after.
4. Run it again with the same request and **apply** ticked.

A preview needs no secret (every collection it reads is world-readable), so
it can also be run locally: `TZ=America/New_York HUB_REQUEST='{…}' node
scripts/hub-calendar.mjs`.

**The repo is public, and so are the input box and the log.** Never put a
student's name, or anything else about a student, in a request. Neither tool
touches students: no pull-outs, performers, audience lists or lessons.

## Hub Calendar

Every op except `add` names the event by `id` and by what you believe about it
(`expect.date`, optionally `expect.title` / `expect.ensembleIds`). If the live
event disagrees, nothing is written. Event ids are visible in the public
Firestore REST API (`events` is world-readable).

```json
{"op":"add","event":{"type":"Sectional","date":"2026-11-02","startTime":"15:30","endTime":"16:30","ensembleIds":["symphony-orchestra"],"location":"Room 211","title":"Violin sectional"},"repeat":{"days":["Mon","Wed"],"until":"2026-11-11"}}
{"op":"edit","id":"<id>","expect":{"date":"2026-11-03"},"set":{"repertoire":"Brahms 2, mvt 1, letters A to F"}}
{"op":"move","id":"<id>","expect":{"date":"2026-11-03"},"startTime":"16:00","endTime":"18:00","location":"Chapman"}
{"op":"cancel","id":"<id>","expect":{"date":"2026-11-03"}}
{"op":"restore","id":"<id>","expect":{"date":"2026-11-03"}}
{"op":"delete","id":"<id>","expect":{"date":"2026-11-03"}}
```

- Event fields: `type`, `date`, `startTime`, `endTime`, `sharedBlock`, `title`,
  `location`, `repertoire` (the rehearsal plan), `unitInfo`, `notes`,
  `callTime`, `dress`, `venueAddress`, `pickupTime`, `ensembleIds`, `pieceIds`,
  `attendanceEnsembleIds`. Times are 24-hour school time.
- `move` and `cancel` work exactly like the Schedule screen: the original
  schedule is captured once so `restore` puts it back, one red banner per
  event is posted or rewritten, and the Teams / family alert is queued.
  `"notify": false` skips the banner and alert. `edit` is always quiet.
- A `move` the app's review sheet would warn about (onto an occupied block,
  outside a lesson pull-out window) is refused until the request says
  `"acknowledge": true`.
- `delete` refuses an event with roll taken or a roster move pointing at it.
  Cancel those instead. `status` cannot be set by `edit`.
- A whole-day cancel that should take that day's private lessons stays in the
  app (lessons are staff-only and student data).

## Hub Announcement

```json
{"op":"post","title":"Sectionals tomorrow","body":"Bring **pencils**.","priority":"important","ensembleId":"symphony-orchestra","pinned":true,"expiresOn":"2026-11-05","links":[{"label":"Schedule","url":"/schedule"}]}
{"op":"post","title":"Dress rehearsal moved","priority":"urgent","publishAt":"2026-11-03 07:00"}
{"op":"edit","id":"<id>","expect":{"title":"Sectionals tomorrow"},"set":{"expiresOn":"2026-11-06"},"clear":["pinned"]}
{"op":"archive","id":"<id>","expect":{"title":"Sectionals tomorrow"}}
{"op":"restore","id":"<id>","expect":{"title":"Sectionals tomorrow"}}
{"op":"delete","id":"<id>","expect":{"title":"Sectionals tomorrow"}}
```

- `ensembleId: null` (or left out) posts school-wide. `publishAt` is
  "YYYY-MM-DD HH:MM" school time. Links are `https://` or an in-app `/path`,
  six at most. Pictures and files are not supported; a post that has them
  must be deleted in the Hub, which also removes them from Storage.
- **The urgent alert follows the Hub's own rules** (`urgentRelay.ts`,
  `AnnouncementManager`): an urgent post made now queues
  `notifyQueue/ann-<id>` at once; a scheduled one is queued by the Hub's own
  sweep when it goes live (the next time a director has the Hub open); an
  edit never re-sends one that already went out; the queue entry is created,
  never overwritten.
- `"alert": false` posts the red banner without the outside alert. It stamps
  `relayQueuedAt` so the Hub's sweep never sends it later either. This has no
  equivalent in the app's form; it exists so a test post can stay a test.

## Keeping them honest

`hub-calendar.mjs` imports `changePlan.ts` and `changeOps.ts` through
`scripts/lib/hubTool.mjs` instead of copying them, so a cancel here and a
cancel in the Hub cannot drift. If either module's exports are renamed, the
tool fails loudly on its next run rather than writing something different.
`hub-announcement.mjs` mirrors `queueUrgentRelay()`'s body text by calling the
same `richTextToPlain`. If the relay's queue entry changes shape, change it
here in the same commit.
