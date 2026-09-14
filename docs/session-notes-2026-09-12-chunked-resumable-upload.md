# Session notes — Video upload reliability Phase 2: chunked resumable upload (2026-09-12)

Record of the session that produced branch
`video-upload-reliability-3-chunked-upload`, opened as a draft PR against
`main` — not merged by this session. Item 3 (the largest) of a three-part
video-upload reliability plan; item 1 (`storage.rules` fix) is #166, item 2
(submission receipts) is #167. Phase 0 of the plan already merged as #165.

## What was asked

An interrupted upload — tab closed, app backgrounded and suspended, browser
killed — should resume without re-uploading from byte zero, for both ways a
student submits: picking an existing file, and recording in-browser.

## What was built

- **`src/shared/submissionChunks.ts`** — the shared, isomorphic shape both
  the client and the Cloud Function agree on: `CHUNK_SIZE_BYTES` (16 MiB),
  `MAX_COMPOSE_SOURCES` (32, GCS's real compose limit), `chunkPartPath()`
  (zero-padded so a plain Storage listing already sorts in upload order),
  `parseChunkIndex()`, and `submissionDocIdForSession()` (a pure function of
  the session id — the server-side analogue of Phase 0's
  `newSubmissionId()`/`setDoc` idempotency fix).
- **`src/public/uploadResumeDb.ts`** — a dedicated IndexedDB database
  (`nwsa-upload-resume`, separate from anything Firestore touches), storing
  one `sessions` record per upload attempt. A `'file'` session is keyed by a
  fingerprint (name+size+lastModified) for the "pick a file" path, since a
  browser won't hand back a `File` across a reload — resuming depends on the
  student re-picking the same file, recognized by that fingerprint. A
  `'recording'` session persists the actual `Blob` the moment MediaRecorder
  produces it, since there's no file on disk to re-slice otherwise. Every
  exported function is wrapped to never throw — a private-browsing block, a
  quota surprise, anything — so a caller only ever sees `null`/no-op and
  falls back to today's direct-upload behavior.
- **`src/public/chunkedUpload.ts`** — `sessionForFile()` /
  `sessionForRecording()` (get-or-create / claim-for-the-now-known-student),
  `uploadChunks()` (slices the blob, retries each chunk via the extracted
  `src/shared/withRetry.ts`, marks progress in IndexedDB as it goes), and
  `finalizeChunkedSubmission()` (POSTs to the new Cloud Function, same
  fetch/error-handling shape as `src/public/checkinSubmit.ts`).
- **`functions/src/composeSubmission.ts`** — the finalize step: validate the
  request (every bound the direct-write Firestore rule would have enforced,
  reimplemented here since this write goes through the Admin SDK and
  bypasses that rule entirely) → idempotent short-circuit if this session's
  submission doc already exists → verify the REAL uploaded chunks against
  what the client claims (count, a contiguous index sequence, and the
  combined size against the assignment's actual `maxVideoSizeMB` — storage
  rules can only ever bound one chunk, never the sum) → fold-compose via
  `Bucket#combine()` (GCS's real 32-source-per-call limit, chained through
  an accumulator unconditionally for anything larger — never a
  fits-in-one-call assumption) → delete the temp chunks → write the
  `assignmentSubmissions` doc under a session-derived id via `.set()`.
- **`functions/src/composeSubmission.selfcheck.ts`** — the most thorough
  self-check in this plan: fake in-memory Firestore/Storage doubles exercise
  every validation failure, the real-chunk-vs-claim mismatches, a >32-chunk
  fold's exact call sequence (ending at the real destination, in numeric
  order, cleaning up every accumulator), and both idempotent short-circuits.
- **`storage.rules`**: `submissions-parts/{assignmentId}/{studentId}/
  {sessionId}/{index}` — `allow create` (same anchors as `/submissions`,
  bounding one chunk's size only) and **no read/update/delete for anyone,
  staff included** — composeSubmission and the cleanup sweep both use the
  Admin SDK, which bypasses this file entirely, and a lone chunk isn't a
  usable video anyway.
- **`scripts/cleanup-abandoned-chunks.mjs`** + selfcheck — an hourly step in
  `deploy.yml` (same cadence as the ICS feed refresh) deleting
  `submissions-parts/` objects older than 48 hours: normal chunks are
  deleted by `composeSubmission` itself right after a successful compose, so
  anything still there after two days was abandoned. Never fails the deploy
  job — every path logs and exits 0.
- **`SubmissionForm.tsx`**: `handleSubmit` now tries `submitChunked()` first
  (get/claim a session → upload chunks → finalize) and falls back to the
  ORIGINAL `submitDirect()` (today's Phase 0 path, byte-for-byte unchanged)
  only when no session could be obtained at all. Once a session exists, a
  real failure surfaces normally — it never silently retries under the
  other mechanism too. `handleRecordedVideo` persists the recording's blob
  to IndexedDB the instant it exists; a mount-time check offers to resume an
  abandoned one ("We found a recording that did not finish sending") by
  rebuilding the staged review screen from the recovered blob.

## A real bug this surfaced in already-shipped code, and how it was fixed

While ad-hoc strict-typechecking `functions/src/index.ts` against the
REAL installed `@google-cloud/storage` types (this repo has no official
typecheck for `functions/` — esbuild strips types, `--experimental-strip-types`
strips types — so nothing catches a type mismatch short of doing this by
hand), two things turned up:

1. **A real API mistake in my own draft**: `Bucket#compose()` does not
   exist in the installed `@google-cloud/storage` 7.x. The real method is
   `Bucket#combine(sources, destination, options)` — confirmed by reading
   the installed package's own `.d.ts`/`.js` source, not assumed. Also
   found: `combine()` reads content type off the destination `File`
   instance's own `.metadata.contentType` (or guesses from the filename
   extension) rather than accepting it as a call option, and a `File` has
   private class fields that make it impossible for any structural
   stand-in to satisfy — so `composeSubmission.ts` was redesigned to pass
   destinations as plain strings through `combine()` and set the real
   content type (plus the download token) in one explicit `setMetadata()`
   call afterward, rather than trying to thread it through `combine()`
   itself.
2. **A genuine type bug in item 2's ALREADY-PUSHED code** (PR #167):
   `buildSubmissionReceipt()`'s parameter type was a `Pick<>` of
   named-but-`unknown` fields, which a real Firestore `DocumentSnapshot
   .data()` (a bare index-signature `DocumentData`) does not structurally
   satisfy. Fixed by switching to a plain `Record<string, unknown>`
   parameter — pushed as a follow-up commit to `video-upload-reliability-
   2-submission-receipts` (PR #167), NOT included in this PR, since it's
   item 2's code and item 2's branch, not item 3's.

## A process mistake, caught and corrected before pushing anything wrong

All of item 3's work was initially done as uncommitted changes on TOP of
the already-pushed `video-upload-reliability-2-submission-receipts` branch,
instead of its own branch from `origin/main` — a sequencing error, not
deliberate stacking. Caught before committing: none of item 3's work had
been pushed anywhere yet. Fixed by:

1. Snapshotting everything as a temporary commit (so nothing was at risk of
   being lost) while separating out the one genuine item-2 fix.
2. Applying that fix as an isolated patch back onto item 2's actual branch,
   verifying and pushing it there (see above).
3. Starting a fresh branch from `origin/main` for item 3, restoring item
   3's brand-new files directly from the snapshot (no base-state conflict
   for entirely new files), and manually reconstructing item 3's specific
   hunks in every file item 2 ALSO touched (`functions/src/index.ts`,
   `functions/package.json`, `.github/workflows/deploy-functions.yml`,
   `src/public/components/SubmissionForm.tsx`, `src/public/uiUpdates.css`,
   `src/shared/translations.ts`) on top of the clean `origin/main` version
   of each — confirmed by diffing the result against `origin/main` and
   checking for zero item-2 identifiers (`rememberStudent`, `primaryStudent`,
   `usePublicSubmissionReceipts`, `existingReceipt`) anywhere in the result.

The three files item 2 never touched at all (`storage.rules`, `deploy.yml`,
`.github/actions/self-checks/action.yml`) were restored directly from the
snapshot with no reconstruction needed, then verified the same way.

## Deliberate scoping decisions

- The chunked path is attempted for EVERY submission when IndexedDB is
  available, regardless of file size — even a single-chunk upload benefits
  from surviving a killed app between "chunk uploaded" and "Firestore
  write," which `uploadBytesResumable` alone does not provide across a full
  reload.
- Chunks upload sequentially, not in parallel — simpler progress reporting
  and more predictable on the mobile connections this is built for.
- A recovered **recording** gets a real on-screen Resume/Discard prompt
  (there's no other way back to that blob). A recovered **file** session
  resumes silently and automatically the moment the student re-picks the
  identical file — no prompt needed, since fingerprint matching already
  disambiguates it, and there's no blob to show a preview of before that.
- The Phase 0 `submitAssignmentVideo`/`newSubmissionId` direct-write path is
  untouched and kept as `submitDirect()`'s implementation, exactly as the
  task described — it's the fallback, not removed.

## Verification

- `npm run build` (Node 24, matching CI — see the Node-version note in the
  item 1/2 session notes; same mismatch reproduces here and isn't new).
- `npm --prefix functions run build` (esbuild bundle) and
  `npm --prefix functions run selfcheck` (9 checks, including the new
  `composeSubmission.selfcheck.ts`) — both clean.
- All 49 checks in `.github/actions/self-checks/action.yml` (47 existing +
  2 new: `submissionChunks.selfcheck.ts`,
  `cleanup-abandoned-chunks.selfcheck.mjs`), plus the CSP self-check, the
  demo-org string grep, and the two-build `dist/sw.js` determinism check.
- Confirmed the CSP needs NO changes: `connect-src` already allows the
  Cloud Functions origin at the ORIGIN level (not per-function-name), and
  `firebasestorage.googleapis.com` is already allowed for uploads — both
  from the existing CSP hardening this repo's history describes. Read
  `vite.config.ts` and `scripts/csp.selfcheck.mjs` to confirm this rather
  than assume it, given how quietly this exact area has broken before.
- `src/public/uploadResumeDb.ts` was verified against a REAL Chromium
  IndexedDB (Playwright, pre-installed in this sandbox) with a 17-assertion
  ad-hoc test covering fingerprint lookup, chunk-marking idempotency,
  finalized-session exclusion, and recording recovery (including that the
  actual `Blob` — not just its metadata — survives the round-trip). That
  test caught a real bug in an early draft (an `IDBTransaction` cast to
  `IDBRequest`, which would have hung forever — transactions and requests
  fire different completion events) before it ever reached this PR. The
  test itself is NOT part of this repo (Playwright/fake-IndexedDB aren't
  existing dependencies here, and adding a browser-test dependency for one
  module wasn't judged worth it this session) — flagging that as a gap
  rather than silently skipping verification.
- **Not verified, and said so explicitly rather than claimed**: the actual
  GCS `Bucket#combine()` call, `File#exists()`, and `File#setMetadata()`
  against a real bucket — this sandbox has no live or emulated GCP project.
  The types and call shapes were checked against the real installed
  `@google-cloud/storage` source (see above), and the fold/idempotency
  LOGIC around those calls is thoroughly pinned by the selfcheck's fakes,
  but the actual network calls are unverified. Also unverified: the
  record-path Blob persistence on a real iOS device (Safari's IndexedDB
  implementation has its own history of quirks, especially around large
  Blobs and Safari's storage eviction policy for site data).

## Called out explicitly in the PR (per the task's own instructions)

1. **App Check should be enabled in the Firebase console before this
   ships.** The new chunk-upload path is a SIXTH unauthenticated write
   surface (joining the five `plannedAbsences`/`parentMessages`/
   `assignmentSubmissions`/`calendarViews`/`signupResponses` writes and
   `composeSubmission` itself) — flagged, not attempted; it needs a human
   with console access (`docs/security-recommendations.md` #1 already
   tracks the site key as the blocker).
2. **The record-path Blob persistence needs verification on a real iOS
   device** before being trusted — noted as a manual test item, not claimed
   as confirmed working from CI alone.

## Open follow-ups

- Both items above, plus the CI Node-version mismatch already noted on
  items 1/2 (informational, not a regression).
- A full interactive browser run of the actual upload flow against a live
  Firebase project (this environment has neither).
