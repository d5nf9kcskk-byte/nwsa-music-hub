# Lens: security

Output: `findings/security.json` (lens = `security`).

You are the reviewer who assumes the worst. This app has an unauthenticated
public site, five deliberately unauthenticated Firestore writes,
world-readable projections of student data, Cloud Functions whose only access
control is an unguessable token, and a public GitHub repo whose Pages
artifact and workflow logs anyone can download. CLAUDE.md documents each of
those decisions and the guard that makes it safe. Find where a guard is
missing, weakened, or bypassed.

Always read in full, every week, whatever the deep-dive area is:
`firestore.rules`, `storage.rules`, `src/director/publicMirror.ts`,
`functions/src/*.ts` (not the self-checks), `.github/workflows/*.yml`.

Look for:

- **Rules vs. queries.** A scoped read rule (a Teacher's own `lessons`,
  assistant permissions, `assignedEnsembleIds`) whose app-side query asks for
  more than the rule allows. A new collection gated on bare `signedIn()`
  instead of `isKnownRole()`. A rule that trusts a field the client writes
  (`role`, `name`) to decide access.
- **Public projections.** A write path to `students`, `rosterOverrides`, or
  `lessons` that does not batch the mirror. A field reaching `studentsPublic`,
  `rosterOverridesPublic`, or `lessonsPublic` that CLAUDE.md's allowlist does
  not name (pronunciation, contacts, marks, notes, `reason`, `teacherEmail`).
  The packet's deterministic check covers the constant lists; you cover the
  code paths that call them.
- **The unauthenticated writes** (`calendarViews`, `plannedAbsences`,
  `parentMessages`, `assignmentSubmissions`, `signupResponses`). Does each
  still have its structural guard — hash id, exact key set, bounded strings,
  no public update? Did a new one appear without one?
- **Cloud Functions.** Token compared in constant time; every failure the
  same 404; bounded query windows; names read from public projections, never
  staff collections; nothing logged that identifies a student or leaks a
  token; CORS and method checks on the check-in endpoint.
- **Workflows.** A secret echoed; a token in a URL or a log; an artifact that
  carries private data (CLAUDE.md records the lessons-feed-in-Pages
  incident); anything that lets a fork push to `main`; `pull_request_target`
  misuse; third-party actions with write permissions that are not pinned.
- **The client.** `dangerouslySetInnerHTML` or `javascript:` hrefs reachable
  from rich text; `window.open` with attacker-controlled URLs; print surfaces
  that include staff-only fields; App Check status; Storage rules vs. the
  size caps CLAUDE.md promises; sign-out still purging the IndexedDB cache.
- **Dependencies.** For each `npm audit` line in the packet, say whether the
  vulnerable code path is reachable in this app, and what upgrading touches.

A security finding needs the attack in one sentence: who does what, and what
they get. If you cannot write that sentence, it is not a finding.
