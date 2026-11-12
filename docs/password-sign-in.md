# Email and password sign-in for staff: how to turn it on

Built November 2026 (Hub 2.0 plan, section 10) and left **off**. While it is off the sign-in screen and the Directors screen are exactly as they were, and the server function behind it answers nothing.

## What it does

Staff get a second way in beside "Sign in with Google": their email and a password of their own, in an ordinary form the phone's password manager can save and fill.

- **Who gets in does not change.** The Directors screen is still the one list. The owner adds an email there, exactly as today. Nothing else happens when someone is listed.
- **Google works exactly as it does now**, for everyone, whether or not they ever choose a password.
- **One way to a password: a link the Hub emails.** "Set up or reset my password" emails a one-time link (good for an hour). It opens the Hub's own "Choose your password" screen. Whoever can open that inbox chooses the password. Setting one up and resetting one are the same path.
- **Asking for a link changes nothing.** Anyone can ask for anyone's link. It only sends an email, and it says the same thing whether or not the address is on the list. Nobody is signed out or locked out by someone else asking.
- **A password counts only for the account the Hub's server set up.** When the link is used, the server makes a fresh sign-in account for that person, puts the chosen password on it, and records on their Directors entry which account that is and when. The rules (Firestore, Storage, and the server functions that check a sign-in) honour a password sign-in only for that account, and only for a sign-in made after it was set up. A person who has not been through the link can only ever get in with Google.
- **Choosing a password signs you out everywhere once.** The fresh account replaces whatever was on the address, so every older sign-in ends. Your own Google sign-in is carried over to the fresh account, so "Sign in with Google" keeps working for you.
- **At least 10 characters**, enforced by the Hub itself.

## Turning it on

Nothing in steps 1 to 3 changes what anyone sees.

1. **Merge.** That deploys the new rules (Firestore and Storage) and the `passwordSetup` function. Then check two things, because a green deploy is not proof:
   - Google sign-in still works for you and for one other role (for example a student assistant). The new rules treat Google exactly as before; this is the check that they really do.
   - `npx --no-install firebase functions:list --project nwsa-hub` shows `passwordSetup`.
2. **App Check must be on for the site.** The function refuses any request that does not carry an App Check token, so the `VITE_RECAPTCHA_SITE_KEY` secret has to be set (see `docs/security-recommendations.md`). If it is not, nothing breaks, but "Email me the link" will always say it did not reach the Hub.
3. **The Hub's own email must be working**, because the link is sent by the Hub's mail (the same one that sends sign-up confirmations), not by the sign-in service.
4. **Firebase console:** Authentication → Sign-in method → Email/Password → Enable. Leave "Email link (passwordless sign-in)" off. This is safe to do at this point whatever else has or has not happened: with the new rules live, a password account nobody set up through the Hub's link is honoured nowhere.
5. **Flip the flag.** In `config/orgs/nwsa.json`, set `features.passwordSignIn` to `true`, with a What's New entry. Pushing that rebuilds the site and redeploys the functions (the function reads the same flag).
6. **Try it yourself first.** "Set up or reset my password", type your email, open the link in the email, choose a password, and you should land in the Hub. Then sign out and sign back in with it. Then check "Sign in with Google" still opens your account.

**Do steps 4 and 5 only after step 1 is live.** The rules in this change are what make Email/Password safe to enable. Enabling it on a project still running the old rules is not safe.

## Turning it off again

Set `features.passwordSignIn` back to `false`: the form disappears and the function goes quiet. To close the door itself, disable Email/Password in the console. Bound accounts stay as they are and Google keeps opening them.

## Known edges

- The link emails can land in junk.
- A link opens in whatever browser the mail app uses, which on an iPhone may not be the Home Screen app. The password is set there; signing in with it then works anywhere.
- If the Owner re-adds a person who is already listed (which overwrites their entry), their password stops being accepted until they set it up again by link. Google is unaffected.
- "Connect Google Drive" on an assignment opens a Google pop-up. For someone whose account has no Google on it, that pop-up runs on a separate, throwaway sign-in so it cannot change who is signed in to the Hub.
- Future rules tests: a made-up test token must say it signed in with Google (`firebase: { sign_in_provider: 'google.com' }`) or the rules will refuse it.

## Where things live

- `firestore.rules`, `storage.rules`: `honouredSignIn()` and `boundPasswordSignIn()`, the same test in both. The Directors block lets no browser set or alter the binding.
- `functions/src/staffToken.ts`: the same test for the functions that check a caller's sign-in. Self-check: `staffToken.selfcheck.ts`, which also reads both rules files.
- `functions/src/passwordSetup.ts` (the rules of setting a password), `passwordSetupStore.ts` (where it keeps things), `passwordSetup` in `functions/src/index.ts` (the function). Self-check: `passwordSetup.selfcheck.ts`.
- `src/shared/passwordSetupLink.ts`: the shape of the link, shared by the function and the screen.
- `src/director/components/AuthGate.tsx`, `src/director/passwordSetupClient.ts`: the form and the screens. `src/director/hooks/useGoogleDrive.ts`: the Drive pop-up guard.
- `scripts/password-sign-in.emulator-proof.mjs`: real sign-ins on the emulators against the real rules. `scripts/rules-verdicts.emulator-check.mjs`: records every role's answers so a rules change can be compared with `main`. Both need Java, so neither is in CI. Run them by hand after touching any of the above; the commands are at the top of each file.
