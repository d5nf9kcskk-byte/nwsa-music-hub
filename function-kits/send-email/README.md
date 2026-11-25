# send-email kit (replaces the Trigger Email extension)

Firebase Extensions shuts down on 2027-03-31. Installed extensions keep running after that, but
they can no longer be reconfigured, updated or patched. No published kit exists for
`firebase/firestore-send-email`: `firebase ext:list` shows an empty "Replacement Kit" column. So
this is Firebase's **self-created kit** path, from the Firebase guide "Migrate Firebase Extensions to a
self-created function kit". It is a copy of upstream 0.2.11 (`firebase/extensions` @ `490b13b`).

- `source/`: the extension's code. Commit 1 on this branch is the unchanged upstream copy. The kit
  changes are: `src/index.ts`, which is Firebase's template for global options; `SMTP_PASSWORD`
  declared with `defineSecret` on `processQueue`; and `firebase-functions` 7 and `firebase-admin` 14,
  which brought type-only import fixes. The delivery code is untouched.
- `config-mail/.env.<project>`: per-project settings for kit instance `mail`. Its deployed function is
  `kit-mail-processQueue`. `FIREBASE_SECRET_REF_SMTP_PASSWORD` names the existing Secret Manager
  secret. These files never hold a secret value.
- Wired into `firebase.json` (school, `nwsa-hub`) and `firebase.aiso.json` (`aisymphony-hub`) as
  a second `functions` entry.

## What stays the same for the app

The `mail` docs keep the same contract: `to`, `replyTo`, `message`, and the
`delivery.{state,attempts,info,error,leaseExpireTime}` fields it writes. The kit only writes
`delivery`, so `memberMail` and the top-level `expireAt` (the hub's own TTL policy) pass through
untouched. Extension TTL stays `never`. Claiming PENDING → PROCESSING is a Firestore transaction,
so while the old extension and the kit both run, each email is sent once.

## Emulator proof

```bash
cd function-kits/send-email/source && npm ci && (cd ../../../functions && npm ci && node build-org.mjs aiso)
PATH="/opt/homebrew/opt/openjdk/bin:$PATH" npm run proof
```

`proof/mail-proof.mjs` uses a local SMTP sink that requires the password from the emulator secret.
It builds mail docs with the app's own `buildBroadcastMail` and runs AISO's `memberMailStatus`
alongside the kit. It checks three things. (1) The mail is sent: delivery SUCCESS, the right
To, Reply-To, Subject and From, `memberMail` and `expireAt` kept, and the player's row set to
`sent`. (2) A later write to a sent doc does not resend it. (3) An SMTP 550 ends in ERROR and the
row is set to `failed`. Last run on 2026-11-25: all three pass.

## Go-live checklist (each project only on Grant's explicit yes, after the 2027-01-03 concert)

Window: mid-January to mid-February 2027. Do the school first, then AISO a week later. Use
`npx firebase-tools@15.37.0` (kits need 15.32 or later). For AISO, add `--config firebase.aiso.json`
to every command and use the CLI account `aisomusicians@gmail.com`. For the school, use
`nwsaorchestras@gmail.com`.

**Until go-live day, do not merge this branch.** Once it is merged, any
`firebase deploy --config firebase.aiso.json --only functions` deploys the kit too. That is harmless
to mail but unapproved. School CI deploys named functions only, so the kit never ships from there.
It does run the kit's `npm ci` and build as a predeploy step.

1. **Rebase** this branch onto what that project deploys from, and run `npm run proof` again.
2. **Check the secret.** Run `gcloud secrets list --project <P>`. AISO should show
   `firestore-send-email-SMTP_PASSWORD`. For the school, confirm it exists. Its committed env has
   no password line. If there is no secret, stop and decide how the Gmail password is supplied.
3. **Export the live config** (this is a live step). First run
   `mv function-kits/send-email/config-mail/.env.<P> /tmp/`, because the export refuses to
   overwrite a file. Then run
   `firebase ext:export --mode functions --instance firestore-send-email --kit-instance mail --project <P>`.
   - "Upgrade it now?" → **No**. The kit is already 0.2.11 code.
   - "Automatically migrate N Secrets from Extensions to Kits?" → **Yes**. Without this,
     `ext:uninstall` deletes the SMTP password.
   - Diff the new `.env.<P>` against the one you moved aside. Keep `FUNCTION_DEFAULT_REGION=us-central1`
     and `FIREBASE_SECRET_REF_SMTP_PASSWORD`. Delete `EVENTARC_CHANNEL` and
     `ALLOWED_EVENT_TYPES`, because nothing listens for those events.
4. **Deploy the kit only:** `firebase deploy --only functions:mail --project <P>`. Read the
   first-deploy report it prints; it should create one function, `kit-mail-processQueue`. The
   extension is still running alongside it.
5. **Test during the overlap.** Send one real message to Grant only, for example a broadcast to
   himself. Check that it arrives once and that the doc shows `delivery.state: SUCCESS`. Then run
   `firebase functions:log --only kit-mail-processQueue --project <P>`.
6. **Uninstall the extension:**
   `firebase ext:uninstall firestore-send-email --project <P> --immediate`. Then run
   `gcloud secrets describe firestore-send-email-SMTP_PASSWORD --project <P>`; the secret must still exist.
7. **Clean up the repo.** Remove the `"extensions"` block from that firebase json and delete its
   `extensions/firestore-send-email.env*` file. Commit and merge.
8. **Test again** after the uninstall: one more message to Grant, and check the Sent row says `sent`.

**Rollback.**
- Before step 6: `firebase functions:delete kit-mail-processQueue --project <P>`. The extension
  never stopped.
- After step 6: restore the `extensions` block and env from git, then
  `firebase deploy --only extensions --project <P>`. That works until 2027-03-31; the secret is kept.
- Never use `functions:kits:uninstall` here. Both projects share `config-mail/`, and it would
  delete both projects' configs.
