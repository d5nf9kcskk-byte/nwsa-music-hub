# Each listed person is tied to their own Google account

Added November 2026. It goes live in three moves, because of how the Hub updates on people's phones: two changes to merge, then one switch.

## What it is

Today the Hub lets a person in when their sign-in carries an email that is on the Directors screen. This makes it stricter: the Hub also records WHICH Google account belongs to each listed person, and then lets in only that one.

- The Hub's server does the recording, by itself, the first time each person opens the Hub after this is live. It checks that Google's own address for their account is the address on the Directors screen, and only then records Google's id for them on their entry. Nobody types anything.
- No browser can write that record. The Owner can clear one person's record (Directors screen, **Reset**) when that person starts using a different Google account; the Hub records the new one the next time they open it.
- Nothing else about signing in changes. It is still "Sign in with Google".

## Move 1 (can merge any time): the server step and the app's call

Nothing anyone can see changes, except that the Directors screen now shows, for the Owner, a line under each person: **Google account confirmed** or **Google account not confirmed yet**, and a count at the top.

After merging, check that `bindGoogle` shows in `npx --no-install firebase functions:list --project nwsa-hub`. A green deploy is not proof.

Then wait. Each person is confirmed the next time they open an up-to-date copy of the Hub. A phone holds a new version of the Hub until the person taps **Refresh**, so this takes as long as it takes for everyone to open the Hub and refresh.

## Before move 2: three checks

1. **Directors screen: every active person reads "Google account confirmed".** The Owner's own entry MUST be confirmed.
2. **GitHub → Actions → *Audit Sign-in Accounts* → Run workflow.** It prints one word. `OK` means every sign-in account is Google's own account for its address. `REVIEW NEEDED` means at least one is not; find out which (run the script on a private machine with `DETAILS=1`, never in Actions) before going on.
3. Someone "not confirmed yet" who has definitely opened the Hub since move 1 is worth a look: the server declined to confirm them.

## Move 2 (after those checks): the rules, with the requirement still switched off

Merging deploys the rules by themselves. Two things happen at that moment:

- **Uploading files and the "send a test alert" button need the tie straight away.** A person who is not confirmed cannot upload a document or an attachment until the Hub has confirmed them, which it does by itself when they open it. Reading and writing everything else is unchanged.
- **Everything else works exactly as before**, because the requirement itself is behind a switch that starts off. This was checked by asking the same 4,760 questions of the old rules and the new ones, as every role: not one answer changed.

After merging, check that Google sign-in still works for you and for one other role.

## Move 3: the switch

GitHub → Actions → ***Require Google Ties*** → Run workflow.

- **status** just reports: how many people are listed, how many are confirmed, and whether the tie is required now.
- **on** requires the tie. It refuses if anyone listed is not confirmed, and says how many. (Tick the box to turn it on anyway; those people sign in again.)
- **off** stops requiring it. It takes effect at once. This is the undo, and it needs no code change.

Once it is on:

- A person who is confirmed notices nothing. Their Hub keeps working offline as before.
- A newly listed person: their first sign-in takes a second longer, because the Hub confirms them and then lets them in.
- A person who is not confirmed, on an up-to-date copy: the Hub confirms them on the spot and lets them in.
- A person on an old copy who was never confirmed: "Couldn't verify your access" until they refresh.
- A person whose Google account is not the one for their address: a plain screen telling them to ask the Owner.

The switch is never turned on for the demo sites. They have no server step, so nobody there could ever be confirmed; the workflow refuses to run against them.

## If someone is stuck

- **They changed Google accounts:** Directors screen, **Reset** beside their name, then they sign in again.
- **The Owner is stuck** (for example the Owner's own Google account changed): the Owner's record cannot be reset from the screen, on purpose. Blank it with the *Fix One Field* workflow instead: collection `directors`, document the Owner's email, field `googleSub`, value left empty. A blank record counts as "not confirmed yet", and the Hub confirms the Owner again at the next sign-in. (That workflow prints the old value in its public log. It is an account id number, not a password, and it opens nothing by itself.)
- **Something is wrong for everyone:** *Require Google Ties* → **off**. Everything is as it was before move 3, at once.

## Where things live

- `functions/src/googleBinding.ts` (the rule for tying), `googleBindingStore.ts`, `bindGoogle` in `functions/src/index.ts`. Self-check: `googleBinding.selfcheck.ts`.
- `firestore.rules`, `storage.rules`: `honouredSignIn()`. `functions/src/staffToken.ts`: the same test for the functions. Self-check: `staffToken.selfcheck.ts`, which reads both rules files.
- `scripts/require-google-ties.mjs` and the *Require Google Ties* workflow: the switch (`serverConfig/signIn.googleTieRequired`).
- `src/director/components/AuthGate.tsx` and `src/director/googleBindingClient.ts`: the app's call.
- `src/director/directors/DirectorsManager.tsx`: the Owner's view and Reset.
- `scripts/sign-in-accounts-audit.mjs` and the *Audit Sign-in Accounts* workflow.
- `scripts/google-binding.emulator-proof.mjs`: real sign-ins on the emulators against the real rules. `scripts/rules-verdicts.emulator-check.mjs`: records every role's answers so a rules change can be compared with `main`. Both need Java, so neither is in CI. The commands are at the top of each file.
