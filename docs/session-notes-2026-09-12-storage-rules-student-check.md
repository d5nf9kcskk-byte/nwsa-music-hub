# Session notes — Storage rules: real-student check on submissions (2026-09-12, PR #166)

Record of the session that produced branch `video-upload-reliability-1-storage-rules`
(PR #166 against `main`, opened as a draft — not merged by this session). Item
1 of a three-part video-upload reliability plan; items 2 and 3 ship as their
own PRs. Phase 0 of that plan already merged as PR #165.

## What was asked

A pre-existing, unrelated gap in `storage.rules`: the
`submissions/{assignmentId}/{allPaths=**}` block checked that the assignment
in the path exists, but never checked that `studentId` — also part of the
path — names a real student. Ship the fix on its own, fast, ahead of the
larger Phase 1/2 work.

## What was found

`SubmissionForm.tsx` uploads to
`submissions/${assignment.id}/${selectedStudentId}/${Date.now()}-${fileName}`.
The Storage rule matched all of that with a single `{allPaths=**}` wildcard
after `assignmentId`, so `studentId` was never bound to a rule variable and
never checked — only the subsequent Firestore write (`assignmentSubmissions`
create) anchors `studentId` to a real `students/{id}`. An upload that never
reached that Firestore write (or was never meant to) had no such anchor at
all.

## What shipped

One commit:

- `storage.rules`: split the match pattern into
  `submissions/{assignmentId}/{studentId}/{allPaths=**}` and added
  `firestore.exists(/databases/(default)/documents/students/$(studentId))`
  to the `create` condition, alongside the existing assignment-exists and
  size/content-type checks. Checked against the staff-only `students`
  collection, not the `studentsPublic` mirror — `firestore.exists()` calls
  from Storage rules bypass Firestore rules entirely (the same cross-service
  read `isStaff()`/`directorDoc()` already rely on), so there's no reason to
  prefer the narrower projection.

No app code, Firestore rules, Cloud Functions, or types changed. No
`whatsNew.ts` entry — a legitimate upload from a real student to a real
assignment behaves identically; this only closes a path for a forged one.

## Verification

- `npm run build` (Node 24, matching CI's `actions/setup-node` version —
  the sandbox's preinstalled Node was v22.22.2, which fails several
  `--import ./scripts/vite-defines-shim.mjs` self-checks with a Node
  module-hooks error unrelated to this change; installed Node 24 via `nvm`
  to match CI and confirmed all 47 self-checks in
  `.github/actions/self-checks/action.yml` pass under it).
- `node scripts/csp.selfcheck.mjs` and the demo-org string grep (both from
  `pr-checks.yml`) pass.
- No emulator-backed rules test exists in this repo
  (`@firebase/rules-unit-testing` isn't a dependency), and `storage.rules`
  has no PR-time syntax check — it deploys straight from `main` via
  `deploy-rules.yml`. Verified by manual reading only: brace balance, and
  that the new `{studentId}` segment lines up with the path
  `SubmissionForm.tsx` actually writes to.

## Open follow-ups

- None specific to this change. Items 2 (`submissionReceiptsPublic`) and 3
  (chunked resumable upload) are separate PRs from the same plan.
