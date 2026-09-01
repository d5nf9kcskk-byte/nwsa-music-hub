# Sign-up confirmation email (#signups)

When a student sends a sign-up, they get an email that names the time they
booked and carries that time as a calendar attachment.

The code is deployed. **The extension is not installed yet** — until you do
the one-time setup below, `signupConfirmation` writes its `mail` docs and
nothing sends them. Nothing else breaks in the meantime: sign-ups, slots, the
confirmation screen and the schedule page all work exactly as before, and the
queued docs will send as soon as the extension is installed.

## How it fits together

```
student sends a sign-up
   └─ signupResponses/{id} created            (public, unauthenticated write)
       └─ signupConfirmation  (Cloud Function, functions/src/index.ts)
           ├─ reads the form, resolves which slot they picked
           └─ writes mail/{id}                (Admin SDK)
               └─ Trigger Email extension  →  SMTP  →  the student
```

**Why the function is in the middle.** The extension sends whatever lands in
`mail`, as the school, to whatever address the doc names. A sign-up is an
unauthenticated public write, so if the browser wrote that doc, anyone on the
internet would have the school's SMTP account: any recipient, any body, sent
as NWSA. `mail` is therefore denied to every client in `firestore.rules` and
written only server-side, from the response that already passed the rules'
shape checks. **Never add a client write rule to `mail`.**

## One-time setup

You need to do this part — it involves an SMTP password, which must not go in
the repo and which I can't enter for you.

### 1. Pick the sending account

The Hub's contact address is `nwsaorchestras@gmail.com`. Gmail needs an **App
Password**, not the account password:

1. The account must have 2-Step Verification on.
2. Go to <https://myaccount.google.com/apppasswords>.
3. Create one named `NWSA Hub mail`. Copy the 16-character password.

Gmail's free tier sends roughly **500 messages a day**, which is far above
what sign-ups generate. If you ever outgrow it, or want mail to come from a
school domain, swap the SMTP URI in step 2 — nothing in the code changes.

### 2. Install the extension

```bash
firebase ext:install firebase/firestore-send-email --project nwsa-hub
```

Answer its prompts:

| Prompt | Answer |
|---|---|
| Cloud Functions location | `us-central1` (same region as the other functions) |
| SMTP connection URI | `smtps://nwsaorchestras@gmail.com@smtp.gmail.com:465` |
| SMTP password | the App Password from step 1 |
| Email documents collection | `mail` |
| Default FROM address | `NWSA Music Hub <nwsaorchestras@gmail.com>` |
| Default REPLY-TO address | `nwsaorchestras@gmail.com` |
| Users collection | *(leave blank)* |
| Templates collection | *(leave blank)* |

Notes:

- The **URI has the username in it and the password entered separately** —
  that is what the extension expects. If the password contains `@` or `:`,
  URL-encode it.
- `mail` must match exactly; the function writes there and nowhere else.
- Leave templates blank. The email body is built in
  `functions/src/signupConfirmation.ts` so it can be self-checked in CI;
  a template collection would move it somewhere nothing tests.

`ext:install` also writes an `extensions/` folder and an `extensions` block in
`firebase.json`. Commit those — they record which extension version is
installed. The SMTP password is NOT in them; it goes to Secret Manager.

### 3. Confirm it works

Send yourself a test sign-up from the public page, with your own address in the
email field, then:

```bash
firebase firestore:get mail --project nwsa-hub --limit 1
```

The extension writes its result back onto the doc as a `delivery` field:

- `delivery.state: "SUCCESS"` — sent.
- `delivery.state: "ERROR"` — read `delivery.error`. Almost always the SMTP
  credential (wrong App Password, or 2-Step Verification not on).
- No `delivery` field at all — the extension isn't installed, or is watching a
  different collection than `mail`.

## What the email contains

- Subject names the time when exactly one was picked:
  `Your time for Senior Recital Hearings: Sep 8 · 3:30 PM`
- Body: greeting by first name, the form title, the time(s), and the contact
  address to reply to.
- A `signup-time.ics` attachment, so the time can be added to a calendar
  straight from the email.

**Slots typed by hand get no attachment.** Only slots built with the slot
picker carry a real date; a free-text label like "Monday after school" has no
date in it, and guessing one would put an audition on the wrong day. The text
still names whatever the student picked. This is the same rule the in-app
"Add to my calendar" button follows.

## Who gets it

Both addresses on the response — the student's and the guardian's — deduped,
so one address in both fields is mailed once. Both were typed on that form by
the person submitting it. A form that collects no email sends nothing.

There is deliberately **no per-form on/off switch**. This is a transactional
confirmation of something the student just did, which is the one kind of email
nobody has to opt into. If a director ever needs to suppress it, that is a new
field on `SignupForm` and a check in `buildConfirmation()` — not a change to
who can write `mail`.

## Cost

Cloud Functions invocations for this are negligible (one per sign-up) and the
project is already on Blaze for the other three functions. The extension itself
is free; the SMTP account is whatever you already pay for it, which for Gmail
is nothing. See `docs/firebase-blaze-cost-analysis.md`.

## Guards

`functions/src/signupConfirmation.selfcheck.ts` runs in `deploy-functions.yml`
before any credential is written. It pins: recipients only ever come off the
response and malformed ones are dropped; no address means no mail doc at all;
a hand-typed slot produces no calendar attachment; and student free text is
HTML-escaped on the way into the email body.
