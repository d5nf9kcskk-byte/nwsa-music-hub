# Lesson-log family email (#applied)

An Applied Teacher finishes a High School Lesson Log line and presses **Email
the family**. The student and their guardians get that lesson: the date, the
grade out of 100, the repertoire, and the technique/comments.

**Sending is never automatic** (director's call, 2026-09-03 — it may become
automatic later). Saving a finished line only *offers*; nothing leaves until
the teacher presses. Every finished row keeps an envelope button, and the row
reads "Emailed Sep 3" or "Not emailed" so nobody has to guess whether a
family already had it.

## How it fits together

```
teacher presses "Email the family"
   └─ lessonLogMailQueue/{id} created         (signed-in staff write)
       └─ lessonLogMailSend  (Cloud Function, functions/src/index.ts)
           ├─ reads lessons/{lessonId}        — the CONTENT
           ├─ reads contacts/{studentId}      — the ADDRESSES
           └─ writes mail/{id}                (Admin SDK)
               └─ Trigger Email extension  →  SMTP  →  the family
```

It replaced a Power Automate flow that was specified but never built. The Hub
already had this pipeline for sign-up confirmations, so there was no reason
for a second system, a service-account key, or a polling loop.

**Why the function is in the middle.** The extension sends whatever lands in
`mail`, as the school, to whatever address the doc names. `mail` is denied to
every client in `firestore.rules` and must stay that way.

**Why the queue doc is not trusted.** Unlike a sign-up response, this request
is written by a signed-in teacher who controls every field on it — including
`recipients`. So the queue doc is a *request*: the only field read out of it
is `lessonId`, the content comes from the stored lesson, and the addresses
come from the student's own contact record. `queueRequestOk()` requires the
stored lesson's `studentId` to match the one `firestore.rules` already bound
the request to, which is what stops a teacher mailing another teacher's
student's family. Guards are pinned by `functions/src/lessonLogMail.selfcheck.ts`,
which runs in `deploy-functions.yml` before any credential is written.

**No duplicates.** The mail doc's id IS the queue doc's id and it is
`create()`d, not `add()`ed — Cloud Functions deliver a trigger at least once,
and a retry must not mail a family the same lesson twice.

## Setup

Nothing new. This uses the **same** Trigger Email extension as the sign-up
confirmation, so if that is installed and sending, this sends too.

If it is not installed yet, the one-time setup — including the SMTP app
password, the one part that cannot live in the repo — is in
**[docs/signup-confirmation-email.md](signup-confirmation-email.md)**. Until
then `lessonLogMailSend` writes its `mail` docs and nothing delivers them;
nothing else breaks, and the queued docs send as soon as the extension is in.

Check whether it is installed:

```bash
firebase ext:list --project nwsa-hub
```

The function itself deploys with everything else on a push to `main` that
touches `functions/` (*Deploy Cloud Functions*). Confirm it arrived:

```bash
firebase functions:list --project nwsa-hub
```

`lessonLogMailSend` should be in that list. A function present in this repo
and absent from that output has not been deployed — the symptom is silence,
not an error. It has now happened twice: `concertCheckin` in August, and this
function on its own first deploy. Both times the cause was the same, and it
is not the code:

> `deploy-functions.yml` deploys `--only functions:<a>,<b>,…`, an explicit
> list. **A function added to `index.ts` must be added to that list too, or
> it does not exist.** The deploy still reports green, because deploying the
> other six succeeded.

Anything the function bundles must also be in the workflow's `paths:` filter
(`src/director/lessonLog.ts`, `lessonGrades.ts`, `types.ts`), or editing the
email's own wording redeploys nothing.

## When a family reports getting nothing

In order, because each rules out the one below it:

1. **Was it sent?** The row says "Not emailed" if nobody pressed the button.
2. **Is there an address on file?** No `contacts/{studentId}` record, or no
   address on it, means nothing is sent — deliberately, rather than sent
   nowhere. The teacher sees "No family email on file".
3. **Is the extension installed?** `firebase ext:list`. If not, the `mail`
   docs are piling up and will all send once it is.
4. **Did the send fail?** The extension writes a `delivery` field onto each
   `mail` doc with its state and any SMTP error. Read that doc in the Firebase
   console.
