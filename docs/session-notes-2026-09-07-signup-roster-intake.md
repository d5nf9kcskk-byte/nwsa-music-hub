# Session notes — sign-up → roster intake (2026-09-07, PRs #143 + #145)

Record of the session that put the College Student Information responses into
the roster. Written so a future session can reconstruct what changed and why
without replaying the conversation.

## What was asked

"The signup College Student Information needs to be fed directly into the main
roster, all of those students as college students. All of them need to be added
to Symphony and CCO. Other classes will need them as well but this is enough for
now." Then, in order: carry **all** the information they gave, not just the
name; offer a **merge** when a name already exists; add **every** guardian, not
one; and record the **college year** each of them gave.

## Why this is not a one-off script

The obvious reading was a migration script run once with a service account. It
was the wrong shape twice over. The director runs this, not an operator with
`FIREBASE_SERVICE_ACCOUNT_JSON`; and "other classes will need them as well"
means the same job recurs every term with different groups. So it shipped as a
panel on the Sign-ups screen — **Add to the roster**, under the responses —
that any staff member can run, repeatedly, without help.

The corollary decision: **groups are picked in the UI, never derived from the
form**. `symphony-orchestra` and `college-chamber-orchestra` are NWSA's ids, and
hardcoding them in `src/` would violate the white-label rule for a fixed
one-term answer. The director ticks them; next term they tick a theory section.

## The shape

- `src/shared/signupRosterIntake.ts` — the ONE definition of the plan. Pure and
  Firebase-free on purpose, so the director's screen and any future Admin-SDK
  script would plan the same import, and so a self-check can pin it.
- `src/shared/signupRosterIntake.selfcheck.ts` — runs in the deploy workflow.
- `src/director/signups/SignupRosterIntake.tsx` — the panel. Gated on
  `isStaffMember`: a Student Assistant may read sign-ups but firestore.rules
  bars them from `contacts`, so neither the panel nor its listener mounts.
- Writes go through `useStudents` / `useContacts`, never direct Firestore, so
  the `studentsPublic` mirror stays batched with its source doc (#privacy).

## Decisions worth keeping

**Split by sensitivity, not convenience.** Name, instrument, grade and
ensembles go on the `students` doc; email, phone, guardians and every remaining
answer go to `contacts` (answers under `contacts.extra`, the bucket that
already exists to lose nothing). The student doc is mirrored to the
world-readable `studentsPublic`, so an address typed into a public form must
never ride along. The self-check asserts no contact key ever reaches a student
write.

**A typed name is the only anchor an open response has**, so the whole plan is
shown before any write, row by row. Where the roster and the form disagree the
director picks per field, with the *longer* value pre-selected — on this form
it is nearly always the more complete one ("(305) 555-0134" over "5550134") —
so the exceptions are one tap and the rest need nothing. An **ambiguous** name
(two roster students reducing to the same key) resolves to NOBODY and proposes
a new record instead. That is the one place this could have overwritten a real
student.

**A guardian is a person, not a value.** An existing parent is never replaced by
whoever signed the form: `mergeGuardian()` matches by address or name and
updates in place, appends otherwise. And since the signature block holds exactly
one guardian, the others arrive as questions the director wrote —
`guardianQuestion()` reads a label naming both a person (mother / father /
guardian / parent 2 / emergency contact) and a detail (name / email / phone /
relation) into its own `contacts.guardians` entry. `StudentContact.guardians`
was already unlimited, so this reads the questions rather than adding a field.
It under-claims deliberately: one half only, or anything resembling a consent
line, stays an ordinary answer.

**A college student has a YEAR** (#145, and this was a miss in #143 — Grant
caught it). `grade` is the app's one answer to "what year is this person in",
and a college freshman differs from a college senior as much as a 9th grader
from a 12th. The import points at the question that asks (preselected via
`looksLikeYearQuestion`) and reads each student's own answer into
`College Freshman` / `Sophomore` / `Junior` / `Senior`. The strings all start
with "College" so the roster's substring search still returns the cohort in one
go, and none of them match the high-school branches (`startsWith('12')` for the
seniors view, `startsWith('9')` for theory placement) — correct, since a college
senior is not a graduating 12th grader. An unrecognised answer falls back to the
plain grade rather than guessing, and the raw text stays in `extra` either way.

## What was NOT done, deliberately

- No student-id / school-id import. `schoolId` is staff work and an
  unauthenticated form cannot be trusted with it (#privacy).
- No `status` writes on existing students, and no renaming of a matched student.
- No second collection for any of this. Everything lands in `students` and
  `contacts` as they already are.
- The audience/eligibility model is untouched; this reads responses, it does not
  change who a sign-up reaches.

## State at the end of the session

Both PRs merged and deployed green (`deploy.yml` runs 893 and 894; the new
self-check passes on `main`). **Grant ran the import.** Nothing here needs
re-running.

## Open / worth a look

1. **No automated review saw #143.** Cursor Bugbot hit a usage limit and
   skipped; the Cursor Security Agent was still running when the PR was merged
   at Grant's instruction, and never reported. #145 was merged straight from
   draft, so no agent ran on it either. If Bugbot's limit is raised later, this
   diff is worth a retrospective look — it writes student PII.
2. **Spot-check the imported cohort**: grades (four different college years, not
   a flat "College"), guardians (nobody replaced, second parents present), and
   that nothing unexpected appears on the public student pages.
3. **The guardian and year parsers read director-written labels**, so they are
   heuristics. Both fail toward "leave it as an ordinary answer" rather than
   guessing, but a question worded unusually will simply not be picked up — the
   plan preview is where that shows.
4. Re-running the import is safe and idempotent, so late responses just need
   another press.

## Commits

- `0a9427e` Sign-up responses go straight into the roster. (PR #143)
- `18c2c94` The import carries everything on the response, and merges by field.
- `2373052` A family is not one parent — read every guardian the form names.
- `c077acb` A college student has a year, and the year is their grade. (PR #145)
