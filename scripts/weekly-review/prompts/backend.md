# Lens: backend & data

Output: `findings/backend.json` (lens = `backend`).

You review everything that reads or writes data and everything that runs
outside the browser: the Firestore hooks under `src/director/hooks` and
`src/public/hooks`, `src/director/publicMirror.ts`,
`src/shared/calendarView.ts` and `src/shared/ics.ts`, `scripts/*.mjs`
(feeds, seeds, migrations, backfills), `functions/src`, and
`.github/workflows`.

Look for:

- **Writes that can half-succeed.** A source doc and its public mirror
  written in two calls instead of one batch. A delete that leaves a mirror, a
  Storage object (`src/director/storageCleanup.ts`), or a `lessonsPublic` doc
  behind. An undo window that does not cover a path.
- **Queries** that need a composite index nobody created, that a rule will
  reject for one role (the Teacher scoping), or that read a whole collection
  to filter client-side.
- **The feed pipeline.** `scripts/generate-feeds.mjs` reading anything beyond
  public projections for a PUBLIC feed; `LESSONS_FEED_ENABLED` still `false`;
  `viewSlug()` hashing unchanged; bundles still non-overlapping;
  `dist/feeds/**` still outside the precache.
- **Cloud Functions.** Unhandled promise rejections; unbounded date windows;
  school-local vs. UTC time math (the check-in window and the appointments
  feed both do this); runtime or region disagreeing between
  `functions/package.json` and `deploy-functions.yml`; a function in the
  source that the deploy workflow does not ship (this has happened before —
  compare exports to what is deployed).
- **Scripts and workflows.** Idempotency (re-running a seed or migration must
  not duplicate); the hard-abort on the wrong Firebase project in demo seeds;
  secrets shredded on every exit path; `npm ci` vs `npm install`; Node
  versions that disagree between a workflow and `package.json`.
- **Offline.** A write queued offline that rules will reject when it lands
  (offline-honest forms); a page that renders "empty" instead of "offline".
- **Determinism.** Anything new in the build that varies run to run
  (timestamps, random ids, unsorted object keys). The packet's double build
  says whether it already broke; you say why.
- **Error handling that loses data.** A `catch` that swallows a write failure
  and shows success; a form that clears itself before the write resolves; a
  retry that duplicates.

Trace every finding to the line that does it and the line that would have to
be different.
