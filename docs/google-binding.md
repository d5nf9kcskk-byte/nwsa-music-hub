# Each listed person is tied to their own Google account

Added November 2026. It goes live in steps, because of how the Hub updates on people's phones: one person first (signed in as the Hub's founding address), then everyone, then the rules, then one switch. **Do none of these steps on a concert day.**

## What it is

The Directors screen lists people by email. This adds a record, kept by the Hub's server, of which Google account and which Hub sign-in belongs to each listed person, and then lets in only that one.

- A person confirms with **one tap**. A note at the bottom of the Hub says "One quick step" with **Confirm now** and **Later**. Confirm now opens the usual Google window once. A person who is signing in anyway is confirmed by that same sign-in, with nothing extra to tap.
- The server makes the record only from what Google itself says at that sign-in: who the person is, and that Google has checked their address.
- When it confirms a person, the server gives them a fresh Hub sign-in. **Their other phones and computers are signed out** (within the hour) and each asks them to sign in again.
- No browser can write the record. The Owner can clear one person's record (Directors screen, **Reset**) when that person starts using a different Google account.
- It is still "Sign in with Google". Nothing about anyone's Google account changes.

Tell staff, before each step that asks them to confirm:

- Confirm when you are not in the middle of something. **If you have taken roll, let it finish saving first** (unsaved changes belong to the sign-in they were made on).
- Afterwards, open the Hub on each of your other devices and sign in again. **Do every device before your next concert.**

## Step 1: the founding address alone

Merging the first change turns the server step on, but exactly one sign-in is asked to use it: the Hub's **founding address**, the one address listed under `breakGlassEmails` in `config/orgs/nwsa.json`. **Do this step signed in as that address.**

- Signed in as any other address, the person who holds the Owner role included, the Hub shows **nothing new at all**: no note, nothing to tap, and nothing changes for them. That is expected, not a fault.
- The server refuses to record anyone else too, whoever asks.

This is on purpose: the server step replaces a sign-in account, and it has only ever run on a test setup. One person tries it on the real project before anyone else is exposed to it.

After merging:

1. **Check the server step is there.** Open `https://us-central1-nwsa-hub.cloudfunctions.net/bindGoogle` in a browser. A short line that begins "The Hub sign-in helper is here" means it is live. Google's own "Error: Page not found" page means it is not there yet; wait a few minutes and look again.
2. **Open the Hub, signed in as the founding address, and refresh.** Go to the Today screen (anything half-typed in an open form is lost in the next step). At the bottom you should see "One quick step". Tap **Confirm now** and choose that same Google account.

**It worked if:** the button reads "Confirming…" for a few seconds, the screen blinks to "Checking access…" and comes back with no note, you are still in the Hub, and that address's entry on the Directors screen reads "Google account confirmed". Then open the Hub on your other devices; within the hour each asks you to sign in once, and then works.

**It did not work if** any of these happens. None of them locks you out, because nothing requires the record yet:

- The note stays, or comes back after you confirm. Tap **Later** and carry on. It stops asking after two tries and asks again the next time you open the Hub.
- The note says "Couldn't reach the Hub's server". The server step is not there yet, or it failed on its side. Wait a minute and try once more (one cause clears itself after a minute).
- **Some time in the next hour you are dropped to the sign-in screen.** Sign in; it works, and the note is offered again. That is a failure late in the server step, after the old sign-in had been removed and before the new one was finished. Nothing is lost, but say so.
- You are sent to the sign-in screen with "One more step: sign in with Google once more". Sign in. If the Directors screen then says "confirmed", it worked the slow way; say so, because everyone else would get that too.
- A note says the Hub "could not confirm this Google account as yours". See "If someone is stuck".

If it did not work, **stop here** and use the stop button below. Do not go on to step 2.

### The stop button

Reverting the change does not remove a server step that is already deployed, and phones that already took the new copy keep calling it. To stop it for certain: Google Cloud console → project **nwsa-hub** → Cloud Functions → **bindGoogle** → Delete. With it gone, the Hub carries on exactly as before for everyone.

## Step 2: everyone

This step is its own small change. It makes every person's Hub offer the note: it takes the founding-address condition out of the app and out of the server together, and adds the What's New note for staff. Merge it only when step 1 worked, and not in the days before a concert: people confirm whenever their phone next takes the new copy, which is not a moment you choose.

After merging, check the server step again the same way as in step 1 (the address in the browser), then ask one other person to open the Hub, refresh, and tap **Confirm now**. Their entry on the Directors screen should read "Google account confirmed".

Then wait. A phone holds a new version of the Hub until the person taps **Refresh**. Watch the count at the top of the Directors screen.

Right after this, run GitHub → Actions → *Audit Sign-in Accounts* once (see "Before step 3").

## Before step 3: three checks

1. **Directors screen: everyone listed reads "Google account confirmed".** The Owner's own entry MUST be confirmed. Step 4 counts **everyone on the list**, not only people who are active. A new hire who has not signed in, or an entry nobody uses, will make it refuse. Remove entries nobody uses rather than working around them.
2. **GitHub → Actions → *Audit Sign-in Accounts* → Run workflow.** It prints one word. `OK` means every sign-in account is what the Hub expects. `REVIEW NEEDED` means at least one is not: **stop**, and do not go on until it says `OK`. The log never says which. The top of the Directors screen does, for the Owner: "Last account check", with the sign-in accounts it wants looked at and the listed people who have never signed in. For each account it names: Firebase console → Authentication → Users → search for the address → the three dots → Delete account. That deletes a Hub sign-in and nothing else (not a Google account, nothing in the Hub); the person signs in with Google again and gets a clean one. Then run the check again. If it names **"(an account with no address)"**, a sign-in account was left half-made and there is no address to search for: in that same Users list, sort by Created with the newest first, and delete any row with nothing in the Identifier column.
3. Someone "not confirmed yet" who says they tapped Confirm: the server declined them. See "If someone is stuck".

## The account check, as a habit

Run *Audit Sign-in Accounts* **once a week**, and the day after anyone is added to or removed from the Directors list. Then read "Last account check" at the top of the Directors screen. It only sees what is there on the day it runs, which is why it is worth running often. If anyone tells you they were asked to sign in again on a device they had not signed out of, run it that day.

## Step 3: the rules, with the requirement still switched off

Merging deploys the rules by themselves, after their checks pass. Two things happen at that moment:

- **Anything kept in file storage needs the confirmed sign-in straight away**, on every device. For a person who is not confirmed, or a confirmed person on a device that has not signed in again since: no uploading (documents, attachments, announcement files), and no opening or listing of the staff-only files (check-in photos, signed permission forms, lesson attachments, absence excuse photos, the list of video submissions). The "send a test alert" button too. Signing in again on that device fixes it.
- **Everything else works exactly as before**, because the requirement itself is behind a switch that starts off.

After merging, check that Google sign-in still works for you and for one other role. To see that the new rules really deployed, look at the run in GitHub → Actions → *Deploy Firestore & Storage rules*: its "Deploy Storage rules" step must be green. (Opening a staff file proves nothing; the old rules allow it too.)

## Step 4: the switch

GitHub → Actions → ***Require Google Ties*** → Run workflow. Its log says nothing about the result, on purpose: this repository's logs are public. **The result is on the Directors screen**, at the top, for the Owner. Read it after every run.

- **on** requires the confirmed sign-in. It refuses if anyone on the list is not confirmed.
- **The box ("turn it on even if...")**: do not tick it while anyone might still be on an old copy of the Hub. A phone with an old copy cached opens as normal and then **every save is refused with nothing on the screen**. Tick it only for someone you have decided to leave unconfirmed, knowing that.
- **off** stops requiring it, at once. This is the undo, and it needs no code change. Do not leave it off.
- **clear-owner** clears the Owner's own record (see "If someone is stuck").

Once it is on:

- A person who is confirmed, on a device that has signed in since: notices nothing. Their Hub keeps working offline as before.
- A confirmed person on another device, or a newly listed person: a "One more step" screen with one button, once.
- A person on an old copy who was never confirmed: "Couldn't verify your access" until they refresh.
- A person the server will not confirm for that address: a plain screen telling them to ask the Owner.

The switch is never turned on for the demo sites. They have no server step, so nobody there could ever be confirmed; the workflow refuses to run against them.

## If someone is stuck

- **They changed Google accounts:** Directors screen, **Reset** beside their name, then they confirm again.
- **The Hub says it "could not confirm this Google account as yours" / "does not match".** Two usual causes:
  - *Their Google account's address is not the listed one any more* (it was renamed). Remove them from the Directors screen and add them under the address their Google account shows.
  - *Their sign-in account is not one the Hub can confirm.* Firebase console → Authentication → Users → search for the address → the three dots → Delete account. (That deletes a Hub sign-in, never a Google account.) Then they sign in again.
- **"A different Google account is on file":** that person has two Google accounts for one address, or changed accounts. Decide which is right. If it is the new one, Reset.
- **The Owner is stuck** (for example the Owner's own Google account changed): the Owner's record cannot be reset from the screen, on purpose. Run *Require Google Ties* with **clear-owner**. It clears the record on the Owner's entry and nothing else, and its log names nobody. Then the Owner signs in and confirms again. Leave the switch as it is: this works with it on.
- **"Couldn't finish confirming your account":** the Hub tried twice and could not finish. Have them close the Hub and open it again; if it repeats, look at their entry, and at the two causes above.
- **Something is wrong for everyone:** *Require Google Ties* → **off**. Reading and writing the Hub's data is as it was before step 4, at once. File storage has no switch: if that is what is wrong, revert step 3.

## Adding and re-adding people

Adding an address that is already listed keeps that person's record; it does not make them confirm again. Removing a person and adding them back does clear it, and they confirm again.

Have a newly listed person sign in the day they are added. Until they have, their entry counts as not confirmed.

## Where things live

(The sign-in rules, the switch and the emulator scripts arrive with step 3.)

- `functions/src/googleBinding.ts` (the rule for recording), `googleIdToken.ts` (reading Google's own token), `freshAccount.ts` (the fresh sign-in account), `entryLock.ts` (one request at a time per person), `googleBindingStore.ts`, `bindGoogle` in `functions/src/index.ts`. Self-check: `googleBinding.selfcheck.ts`, which also reads the Directors rule.
- `firestore.rules`: `bindingGuard()` on the Directors entry. With step 3: `honouredSignIn()` there and in `storage.rules`, and `functions/src/staffToken.ts`, the same test for the functions. Self-check: `staffToken.selfcheck.ts`.
- `scripts/require-google-ties.mjs` and the *Require Google Ties* workflow: the switch (`serverConfig/signIn.googleTieRequired`).
- `src/director/components/AuthGate.tsx` and `src/director/googleBindingClient.ts`: the note, the "One more step" screen, and the app's one call to the server. The Hub offers to confirm only where the server step exists (`features.googleConfirm` in `config/orgs/*.json`: true for NWSA, false for the demo sites, which have no server step).
- `src/director/directors/DirectorsManager.tsx`: the Owner's view and Reset.
- `scripts/sign-in-accounts-audit.mjs` and the *Audit Sign-in Accounts* workflow.
- `.github/workflows/rules-checks.yml`: the checks that run before every rules deploy and every functions deploy.
- `scripts/google-binding.emulator-proof.mjs`: real sign-ins on the emulators against the real rules. `scripts/rules-verdicts.emulator-check.mjs`: records every role's answers so a rules change can be compared with `main`.
