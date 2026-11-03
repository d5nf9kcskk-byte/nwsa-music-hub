# Spanish banner drafter: how to turn it on

Built November 2026 (Hub 2.0, Phase 3 item 14) and left **off**. While it is off nobody sees anything new and nothing is sent anywhere.

## What it does

When a director writes a schedule change note ("Rehearsal moved to 3:30 in the Recital Hall"), a **Draft Spanish** button under the note asks Claude (Anthropic) for a Spanish version. The draft lands in a "Spanish" box. The director reads it, fixes it, and saves. Families reading the Hub in Spanish then see the Spanish note; everyone else sees the English one, same as today.

- It shows up in the Event form and in Change a Day's review sheet.
- Only the note text is sent. No event, no names from the roster, no email, no ids.
- Nothing is saved until the director presses Save or Confirm. The drafter never writes.
- If the English note changes later and nobody confirms new Spanish, the Spanish note is cleared, so the two can never disagree.
- Calendar feeds (.ics) and phone alerts stay English.

## Turning it on

Do these in order. Steps 1 and 2 can happen any time; nothing changes for anyone until step 4.

1. **Paper first.** In `docs/vendors.md`, change the Anthropic drafter row from OFF to ON and add the date. Update `docs/privacy-notice.md` and `docs/privacy-notice.es.md` (the "Spanish banner drafter" line) to say it is on. Same commit as step 3 or 4.
2. **Create the secret.** With an Anthropic API key in hand:
   ```
   firebase functions:secrets:set ANTHROPIC_API_KEY --project nwsa-hub
   ```
   (or Google Cloud console → Secret Manager → Create secret, name `ANTHROPIC_API_KEY`). Then give the functions runtime account read access: Secret Manager → `ANTHROPIC_API_KEY` → Permissions → add `nwsa-hub@appspot.gserviceaccount.com` with **Secret Manager Secret Accessor**. The deploy tries to grant this itself, but the CI deploy account may not be allowed to change secret permissions, and then the deploy fails.
3. **Deploy the function.** In `.github/workflows/deploy-functions.yml`, add `functions:draftChangeNoteEs` to the `--only` list. In `functions/src/deployList.selfcheck.ts`, delete the `draftChangeNoteEs` entry from `NOT_DEPLOYED`. In `functions/src/bannerDrafter.selfcheck.ts`, flip the "Not deployed" section to assert it IS in the list. Push to `main`; the *Deploy Functions* workflow ships it. Order matters: the secret must exist before this deploy.
4. **Flip the flag.** In `config/orgs/nwsa.json`, set `features.bannerDrafter` to `true`, and change the matching check at the bottom of `src/director/schedule/changeNoteEs.selfcheck.ts` so it expects `true` for NWSA. Push; the site rebuilds.
5. **Try it.** Open an event, write a change note, press **Draft Spanish**, fix the draft, save. On the public site, switch to ES and check the note reads in Spanish.

## Turning it off again

Set `features.bannerDrafter` back to `false`. The box disappears and no new Spanish is saved. Spanish notes already saved keep showing to Spanish readers until their English note changes or is cleared, which clears them too. To stop calls entirely, also take the function back out of the deploy list and delete it (`firebase functions:delete draftChangeNoteEs`).

## Where things live

- `src/shared/changeNoteEs.ts`: which note a reader sees (`changeNoteFor`) and the stale-note guard (`reconcileChangeNoteEs`).
- `functions/src/bannerDrafter.ts` and `draftChangeNoteEs` in `functions/src/index.ts`: the function.
- `src/director/schedule/ChangeNoteEsField.tsx`: the box and the button.
- Self-checks: `src/director/schedule/changeNoteEs.selfcheck.ts`, `functions/src/bannerDrafter.selfcheck.ts`.
