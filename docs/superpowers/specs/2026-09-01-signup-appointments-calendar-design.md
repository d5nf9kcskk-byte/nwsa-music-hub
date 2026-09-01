# Sign-up appointments on a director's calendar — design

**Date:** 2026-09-01
**Status:** built 2026-09-01 — all four phases, on branch
`worktree-signup-appointments-calendar`. Not yet merged or deployed.

Two things changed during the build:

- **The owner is a name AND an email**, not just an email. The decision to
  show the owner publicly split the field: `signupForms.ownerName` is
  world-readable, `signupOwners/{formId}.email` is not, and the two are
  written together.
- **A live slot-index bug turned up and was fixed here** — see "Deleting a
  slot" below. It was in scope because this feature reads `slotIndex` to
  decide what time an appointment is.
- **Rebased onto four commits that landed the same afternoon**, two of them
  in this exact area ("Show a student the time slot they signed up for",
  "Email a student the sign-up time they booked"). Those introduced
  `src/shared/signupBooking.ts`, which already owns the booking → `slotDef`
  join (`slotDefAt`) and the minutes → `"HH:MM"` conversion
  (`formatClock24`). This module had grown its own spelling of both;
  they were deleted and it now imports theirs. `signupAppointments.ts` is
  the join of a booking to a RESPONSE (who booked, what they wrote, is the
  paperwork in) and nothing more.

## The ask

From the director:

1. **A sign-up has an owner.** "If I was going to create a sign-up for Mr.
   Munger, then I need to be able to put his name on it so that he's the one
   that is receiving it."
2. **Filled time slots land on that owner's calendar in the Hub**, as they
   get filled.
3. **And on a calendar they subscribe to in Apple Calendar / Fantastical** —
   individual appointments, carrying the sign-up title, who signed up, and
   whatever else they wrote, "so that I have a complete picture of why that's
   showing up in my calendar."

## Decisions taken

| Question | Decision |
|---|---|
| Feed scope | **Per-director.** Each owner creates their own link; the feed carries only sign-ups they own. |
| "The director's calendar" | **Both** — the Hub's Schedule screen *and* the subscribed calendar. |
| Owner name on the public sign-up page | **Yes** — students see whose time they are booking. |
| Freshness | **Calendar-app poll interval is fine.** No Google Calendar API sync, no per-booking email. |

## What already exists (do not rebuild)

- **The structured time data.** `SignupSlotDef` (`src/director/types.ts`)
  already stores `{ date: 'YYYY-MM-DD', startMin, endMin, grades? }` on the
  timeslot question, and `SignupSlotBooking` stores `slotIndex` into it.
  Booking → real calendar times is a lookup. The `slotLabel` string is
  display only and **must never be parsed back into a time**.
- **The delivery pattern, live in production.** `functions/src/lessonsFeed.ts`
  + `functions/src/index.ts` serve a staff-only collection as ICS from a v1
  Cloud Function, guarded by an unguessable token in the path, compared with
  `timingSafeEqual`, answering every failure with the same 404.
- **The panel.** `src/director/lessons/LessonsFeedPanel.tsx` — create link,
  blunt warning, `useFeedReady` probe, copy, confirm-reset.
- **The token store.** `feedSecrets/{doc}`, staff-only, and
  `src/director/hooks/useLessonsFeed.ts` (128-bit hex, `crypto.getRandomValues`).
- **ICS building blocks.** `src/shared/ics.ts` — `icsCalendar`, `icsEscape`,
  `icsFold`, `icsDateTime`, and the org branding shape.
- **The staff-only sibling-doc pattern.** `signupAudiences/{formId}` exists
  precisely because `signupForms` is world-readable. Phase A copies it.
- **The public-mirror write pattern.** `src/director/publicMirror.ts` and
  `useStudents` batch a public projection doc alongside the private source
  doc. Phase A's split owner write is the same shape.

## The constraint that decides the architecture

The calendar must carry the student's answers. Answers live in
`signupResponses.answersJson`, which is **staff-only**.

Therefore this calendar **cannot be a file under `dist/feeds/`**. GitHub Pages
*is* the workflow artifact (`actions/upload-pages-artifact` takes the whole
`dist/` tree) on a public repo — anyone could download the run and take both
the schedule and the token. That is why `LESSONS_FEED_ENABLED = false` in
`scripts/generate-feeds.mjs` is permanent. It must be a Cloud Function.

This is not a preference. Do not revisit it.

---

## Phase A — ownership

An owner is **two facts stored in two places, written in one batch.**

### Public: `signupForms.ownerName?: string`

Display only, on the world-readable form. Students see "Book a time with
Mr. Munger." Staff names are already public in this app (`Ensemble.conductor`
prints on concert programs).

### Staff-only: `signupOwners/{formId} = { email }`

Routing. This is what the feed and the Hub screen filter on.

**Why the email is not on the form.** `signupForms` is world-readable. An
`ownerEmail` field there would publish the staff sign-in allowlist as a
machine-readable list — exactly the list worth phishing. This is the same
reasoning that put the invite list in `signupAudiences/{formId}` instead of
on the form.

The owner's *display name* is resolved from `directors/{email}` in the
editor at pick time and written to `ownerName`; nothing else is
denormalized.

### Rules

```
match /signupOwners/{formId} {
  allow read: if isStaff() || assistantHas('signups');
  allow create, update: if (isStaff() || assistantHas('signups'))
    && request.resource.data.keys().hasOnly(['email'])
    && request.resource.data.email is string
    && exists(/databases/$(database)/documents/directors/$(request.resource.data.email));
  allow delete: if isStaff() || assistantHas('signups');
}
```

`ownerName` needs no rules change — `signupForms` is already
`allow write: if isStaff() || assistantHas('signups')` on the whole doc.

### Editor

A "Who is this for?" picker in `SignupsView.tsx`'s form editor, listing the
`directors` collection with `STAFF_ROLE_LABEL` role words, defaulting to the
signed-in director. Saving writes `ownerName` on the form and the
`signupOwners` doc **in the same batch** — a form whose name and email
disagree is the failure mode this pattern exists to prevent.

Deleting a form must delete `signupOwners/{formId}` too, alongside the
existing `signupAudiences` delete in `useSignupForms.deleteForm`.

---

## Phase B — one definition of "an appointment"

`src/shared/signupAppointments.ts`. The **only** place a booking becomes a
calendar item, read by the Hub screen (Phase C) and the Cloud Function
(Phase D) alike — the same posture as `calendarView.ts`,
`signupEligibility.ts`, and `calendarBundles.ts`.

```ts
export interface SignupAppointment {
  /** Stable across rebuilds — the booking's own doc id. */
  id: string;
  formId: string;
  formTitle: string;
  date: string;        // YYYY-MM-DD
  startMin: number;
  endMin: number;
  studentName: string;
  grade?: string;
  instrument?: string;
  email?: string;
  phone?: string;
  /** Question label → the student's answer, in the form's own order. */
  answers: { label: string; value: string }[];
  /** False when the form asks for a signature or guardian co-sign
   *  that has not arrived. */
  complete: boolean;
}

export function appointmentsFor(
  form: SignupForm,
  bookings: SignupSlotBooking[],
  responses: SignupResponse[],
): SignupAppointment[];
```

Rules it enforces:

- A booking whose question has **no `slotDefs`** yields **no appointment**.
  Hand-typed slot lists (`slotManualDraft` → bare `options[]`) carry no date
  or time and cannot be calendar events.
- A booking whose `slotIndex` is out of range for `slotDefs` yields none.
- The response is matched by `(formId, studentId)`, taking the newest —
  reusing `latestPerStudent()`'s rule, because there is no unauthenticated
  update and a student who comes back creates a second doc. A booking with
  no matching response still yields an appointment (name and time are on the
  booking itself); it simply has no answers.
- `audienceMode: 'open'` responses carry no `studentId` — but that mode
  already forbids timeslot questions, so there is nothing to reconcile.

Imports use explicit `.ts` extensions: Node's type-stripping loader (the
self-check, and the function's esbuild input) cannot resolve extensionless
relative imports.

### `src/shared/signupAppointments.selfcheck.ts`

Pins, and runs in both `deploy.yml` and `functions`' `selfcheck` script:

1. A dateless manual slot produces zero appointments.
2. A booking with no matching response still produces one, with empty answers.
3. Two responses from the same student produce one appointment, from the newer.
4. The appointment id equals the booking doc id — the UID contract below
   depends on it.
5. An out-of-range `slotIndex` produces none rather than throwing.

---

## Phase C — the Hub's Schedule screen

`useSignupAppointments()` reads `signupForms`, `signupSlotBookings`,
`signupOwners`, and `signupResponses` — all four already have listeners or
trivially get one — and feeds them through `appointmentsFor()`. Default
filter: forms owned by the signed-in director.

`ScheduleView.tsx` renders them as **their own row style, in their own
overlay layer.**

**They must never be merged into `events[]`.** `viewSlug()` and the bundle
slugs are frozen subscription contracts; a synthetic event in that array
would change what every already-published feed contains and what
`eventMatchesView()` returns. Appointments are a separate layer that the view
filter never sees.

---

## Phase D — the subscribed calendar

### The endpoint

New v1 function `appointmentsFeed` in `functions/src/`, cloned from
`lessonsFeed`:

```
https://us-central1-<project>.cloudfunctions.net/appointmentsFeed/<email>/<token>.ics
```

v1 deliberately, for the same reason `lessonsFeed` is v1: a v1 URL is
derivable from the project id alone, so the panel can show a director their
own link. A v2 URL carries a project hash unknown until after first deploy.

**The email is in the path so the token check stays a direct `get()` plus
`timingSafeEqual`** — identical to `lessonsFeed`, with no "find the doc whose
token equals this" query, which would be a lookup keyed by a secret. A wrong
email and a wrong token produce the same 404, and so does a read failure
distinction (503 for a Firestore error, exactly as `lessonsFeed` does).

Token doc: `feedSecrets/appointments__<email>`, 128-bit hex, same
`TOKEN_RE = /^[0-9a-f]{32}$/`.

### Rules tightening

`feedSecrets/{doc}` is currently `allow read, write: if isStaff()` — every
staff member can read every other's token. Narrow it so a director reaches
only their own appointments token (the `lessons` doc stays staff-wide, and
the Owner keeps full access for revocation):

```
match /feedSecrets/{doc} {
  allow read, write: if isStaff()
    && (doc == 'lessons'
        || doc == 'appointments__' + request.auth.token.email
        || isOwner());
}
```

### The event

| Field | Value |
|---|---|
| `UID` | `signup-slot-<bookingId>@<uidDomain>` — stable, so a rebuild updates rather than duplicates |
| `SUMMARY` | `Maria Sanchez — All-State auditions` |
| `DTSTART` / `DTEND` | from the `slotDef`, floating local time, via `icsDateTime()` |
| `DESCRIPTION` | sign-up title · grade + instrument · email/phone when collected · every question label → answer · `Paperwork complete` or `Signature missing` |
| `STATUS` | `CONFIRMED` |

**Person first, title second**, deviating from the order the ask listed them
in. Month view and Fantastical's compact list truncate, and every slot on a
given day shares the sign-up's title — title-first renders six identical
rows. The title is still in `DESCRIPTION` and in the calendar's own name.

**No `ATTENDEE` or `ORGANIZER`.** Some clients try to email invitations off
those fields, to addresses belonging to students.

Freeing a slot deletes the booking, so the event vanishes on the next fetch.
That is a direct consequence of building per request rather than caching —
the same property that makes resetting the token instant revocation.

### Bounds

- `DAYS_BACK = 60`, `DAYS_AHEAD = 400`, matching `lessonsFeed` — one request
  can never walk the collection as it grows year on year.
- The owned-form id list drives two `where('formId', 'in', …)` queries
  (bookings, responses) and one `where(documentId(), 'in', …)` (the forms
  themselves). Firestore caps `in` at 30 values, and a director accumulates
  more than 30 sign-ups over a few seasons — so all three must chunk. Getting
  this wrong fails silently on the 31st form, which is the worst shape of
  bug for a calendar nobody is watching.

### The panel

`SignupAppointmentsFeedPanel`, on the Sign-ups screen, reusing
`LessonsFeedPanel`'s shape verbatim: create link, blunt warning, `useFeedReady`
probe (`'unknown'` counts as not-live — the endpoint is cross-origin and an
undeployed function's 404 comes from Google's frontend with no CORS header),
Add-to-Apple / Add-to-Google buttons, copy, confirm-reset.

The warning copy must be **stronger** than the lessons one: this feed carries
student free-text answers and contact details, not just names and rooms.

### Deploy — the part that has bitten this repo before

Both are required, or the feature does not exist in production:

1. Add `functions:appointmentsFeed` to the `--only` list in
   `.github/workflows/deploy-functions.yml`. `concertCheckin` and
   `concertTally` were exported from `index.ts`, guarded by a self-check that
   ran on every push, and **never deployed** — found at 2:55pm on 2026-08-31,
   three hours before the concert that needed it.
2. Add `src/shared/signupAppointments.ts` to that workflow's `paths:` trigger
   list, next to `src/shared/ics.ts`. Otherwise a change to the appointment
   definition never redeploys the function that serves it.
3. Add the new self-check to `functions/package.json`'s `selfcheck` script,
   which runs **before** any credential is written.

---

## Drawbacks, accepted

1. **Refresh lag.** Apple Calendar polls subscriptions on its own schedule.
   macOS allows a 5-minute per-calendar refresh; iOS/iCloud-synced
   subscriptions often land nearer hourly, and Fantastical inherits the same
   subscription. A slot booked at 3:01 may not appear until 4. Nothing
   server-side fixes this. Accepted per the decision table; the alternatives
   were Google Calendar API sync or a per-booking email.
2. **Hand-typed slot lists produce nothing.** The editor must say so where
   the director types them, rather than silently omitting those bookings from
   a calendar the director believes is complete.
3. **Deleting a slot moved someone's appointment — fixed here.** Individual
   slots turned out to have no time editor at all, so the reachable version of
   this was worse: `removeSlot()` did `slotDefs.filter()`, which renumbers
   every slot after the deleted one. A booking points at a POSITION
   (`formId__questionId__slotIndex`), so deleting an empty 9:00 while someone
   held 10:00 silently moved that student to 10:15 — on the roll sheet, on the
   calendar, and in an ICS feed their phone had already subscribed to.

   The guard is positional, not per-row: `canRemoveSlot()` in
   `signupSlots.ts` freezes every index up to and including the LAST booked
   one, and only the tail past it may be deleted. The builder now takes
   `bookedIndices: Set<number>` instead of a `locked` boolean, disables those
   delete buttons with a reason, and hides the manual-entry toggle once
   anything is booked (manual lines replace `slotDefs` outright, which would
   orphan every booking). Pinned in `signupSlots.selfcheck.ts`.
4. **The link is the whole access control**, and this one is more sensitive
   than the lessons feed. Reset revokes on the next fetch.
5. **Read cost** — a few queries per poll per subscribed director. Small at
   NWSA scale; record it in `docs/firebase-blaze-cost-analysis.md`.

## Rejected approaches

- **Write real `events` docs on booking (Firestore trigger).** Would light up
  every existing surface for free — Schedule screen, view feeds, bundles. It
  would also publish "Maria Sanchez, 3:15, audition" and her notes to the
  public calendar and every student's subscribed feed. Fatal under the
  projection model.
- **Per-director static ICS under `dist/feeds/`.** Forbidden — see the
  constraint above.
- **Fold appointments into the existing `lessonsFeed`.** Cheapest possible,
  but one shared calendar, mixed with private lessons, unsplittable in Apple
  Calendar. Rejected by the per-director decision.
- **Google Calendar API sync.** Push notifications and no lag, at the cost of
  OAuth per director, refresh-token storage, and a reconciliation problem
  when a slot is freed or the director drags the event. Revisit only if the
  poll interval proves intolerable.
- **Email an `.ics` attachment on booking**, via the existing Power Automate
  relay. Instant, but one-way — freeing a slot does not retract it. A viable
  future *complement* to the feed, never a replacement.

## What was verified, and what was not

Verified: `tsc` clean; `eslint` clean on every changed file (the repo does not
gate on lint, and untouched files carry the same pre-existing warnings);
production build succeeds; the `[sw-precache]` hash is identical across two
consecutive builds and `grep -ri asyo dist/` is empty; all four function
self-checks and all seven calendar/sign-up self-checks pass; the generated ICS
was rendered and inspected by hand (CRLF endings, 75-octet folding, `;` and
`,` escaped, stable UID, 915 minutes → `T151500`).

**Not verified: the new UI in a browser.** The preview tool's dev server roots
itself at the main checkout rather than this worktree — `--root` never reaches
vite, because the tool reads the main checkout's `.claude/launch.json` — so
nothing served by it exercises this branch. Worth a look on a real device
before merge, particularly the owner picker and the appointments rows on the
Schedule screen.

## Also required in the ship commit

- `src/shared/whatsNew.ts` — this changes what staff see on two screens.
- `docs/release-checklist.md` if the `[sw-precache]` contract is touched (it
  should not be: nothing here enters `dist/`).
