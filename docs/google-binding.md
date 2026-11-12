# Each listed person is tied to their own Google account

Added November 2026. It goes live in three moves, because of how the Hub updates on people's phones: two changes to merge, then one switch.

## What it is

The Directors screen lists people by email. This adds a record, kept by the Hub's server, of which Google account and which Hub sign-in belongs to each listed person, and then lets in only that one.

- The Hub's server makes the record by itself, the first time each person opens the Hub after this is live. Nobody types anything.
- **Each person is asked to sign in with Google once more, one time on each device.** When the server confirms a person, it gives them a fresh Hub sign-in, so they sign in again to be on it. The screen says "One more step" and has the usual Google button.
- No browser can write that record. The Owner can clear one person's record (Directors screen, **Reset**) when that person starts using a different Google account; the Hub makes it again the next time they open it.
- It is still "Sign in with Google". Nothing about anyone's Google account changes.

## Move 1 (can merge any time, but pick a quiet day): the server step and the app's call

What people see: the next time each person opens an up-to-date copy of the Hub, a "One more step" screen asks them to sign in with Google once more. That happens once per device. Do not merge this on a concert day.

What the Owner sees: on the Directors screen, a line under each person, **Google account confirmed** or **Google account not confirmed yet**, and a count at the top.

One small rule change rides with this move: the Directors rule now refuses any browser that tries to write that record. It changes nothing for anyone, because no screen writes it.

After merging, check that `bindGoogle` shows in `npx --no-install firebase functions:list --project nwsa-hub`. A green deploy is not proof. Then open the Hub yourself: you should get "One more step", sign in again, and your own entry should read "Google account confirmed".

Then wait. A phone holds a new version of the Hub until the person taps **Refresh**, so this takes as long as it takes for everyone to open the Hub and refresh.

## Before move 2: three checks

1. **Directors screen: every active person reads "Google account confirmed".** The Owner's own entry MUST be confirmed.
2. **GitHub → Actions → *Audit Sign-in Accounts* → Run workflow.** It prints one word. `OK` means every sign-in account is what the Hub expects. `REVIEW NEEDED` means at least one is not; find out which (run the script on a private machine with `DETAILS=1`, never in Actions) before going on.
3. Someone "not confirmed yet" who has definitely opened the Hub since move 1 is worth a look: the server declined to confirm them. Their own screen shows a note at the bottom saying so.

## Move 2 (after those checks): the rules, with the requirement still switched off

Merging deploys the rules by themselves. Two things happen at that moment:

- **Anything kept in file storage needs the confirmed sign-in straight away.** For a person who is not confirmed, that means: no uploading (documents, attachments, announcement files), and no opening or listing of the staff-only files (check-in photos, signed permission forms, lesson attachments, absence excuse photos, the list of video submissions). The "send a test alert" button too. The Hub confirms them by itself when they open an up-to-date copy, and then all of it works. In practice this is someone still on an old copy of the Hub, or someone the server declined to confirm.
- **Everything else works exactly as before**, because the requirement itself is behind a switch that starts off.

After merging, check that Google sign-in still works for you and for one other role, and that you can open a staff-only file (for example a signed permission form).

## Move 3: the switch

GitHub → Actions → ***Require Google Ties*** → Run workflow. Its log says nothing about the result, on purpose: this repository's logs are public. **The result is on the Directors screen**, at the top, for the Owner.

- **on** requires the confirmed sign-in. It refuses if anyone listed is not confirmed. (Tick the box to turn it on anyway; those people are confirmed the next time they open the Hub.)
- **off** stops requiring it. It takes effect at once. This is the undo, and it needs no code change.
- **clear-owner** clears the Owner's own record (see "If someone is stuck").

Once it is on:

- A person who is confirmed notices nothing. Their Hub keeps working offline as before.
- A newly listed person: their first sign-in gets the "One more step" screen, once.
- A person who is not confirmed, on an up-to-date copy: the Hub confirms them on the spot, with "One more step".
- A person on an old copy who was never confirmed: "Couldn't verify your access" until they refresh.
- A person the server will not confirm for that address: a plain screen telling them to ask the Owner.

The switch is never turned on for the demo sites. They have no server step, so nobody there could ever be confirmed; the workflow refuses to run against them.

## If someone is stuck

- **They changed Google accounts:** Directors screen, **Reset** beside their name, then they sign in again.
- **The Owner is stuck** (for example the Owner's own Google account changed): the Owner's record cannot be reset from the screen, on purpose. Run *Require Google Ties* with **clear-owner**. It clears the record on the Owner's entry and nothing else, and its log names nobody. The Hub confirms the Owner again at the next sign-in. If the switch is on, turn it **off** first so the Owner can get in to check, then on again.
- **Something is wrong for everyone:** *Require Google Ties* → **off**. Reading and writing the Hub's data is as it was before move 3, at once. File storage has no switch: if that is what is wrong, revert move 2.
- **"Couldn't finish confirming your account":** the Hub asked that person to sign in again twice and still could not finish. Have them close the Hub and open it again; if it repeats, look at their entry.

## Adding and re-adding people

Adding an address that is already listed keeps that person's record; it does not make them confirm again. Removing a person and adding them back does clear it, and the Hub confirms them again by itself.

## Where things live

(The rules for signing in, the switch and the emulator scripts arrive with move 2.)

- `functions/src/googleBinding.ts` (the rule for tying), `freshAccount.ts` (the fresh sign-in account), `googleBindingStore.ts`, `bindGoogle` in `functions/src/index.ts`. Self-check: `googleBinding.selfcheck.ts`, which also reads the Directors rule.
- `firestore.rules`: `bindingGuard()` on the Directors entry. With move 2: `honouredSignIn()` there and in `storage.rules`, and `functions/src/staffToken.ts`, the same test for the functions. Self-check: `staffToken.selfcheck.ts`.
- `scripts/require-google-ties.mjs` and the *Require Google Ties* workflow: the switch (`serverConfig/signIn.googleTieRequired`).
- `src/director/components/AuthGate.tsx` and `src/director/googleBindingClient.ts`: the app's call and the "One more step" screen.
- `src/director/directors/DirectorsManager.tsx`: the Owner's view and Reset.
- `scripts/sign-in-accounts-audit.mjs` and the *Audit Sign-in Accounts* workflow.
- `.github/workflows/rules-checks.yml`: the checks that run before every rules deploy.
- `scripts/google-binding.emulator-proof.mjs`: real sign-ins on the emulators against the real rules. `scripts/rules-verdicts.emulator-check.mjs`: records every role's answers so a rules change can be compared with `main`.
