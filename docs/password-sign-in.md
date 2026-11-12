# Email and password sign-in for staff: how to turn it on

Built November 2026 (Hub 2.0 plan, section 10) and left **off**. While it is off the sign-in screen and the Directors screen are exactly as they were.

## What it does

Staff get a second way in beside "Sign in with Google": their email and a password of their own, in an ordinary form the phone's password manager can save and fill.

- **Who gets in does not change.** The Directors screen is still the one list. The owner adds an email there, exactly as today.
- **The Hub makes the account, not the person.** The moment an email is listed, a server function makes an empty sign-in account for it. Nobody else can make an account on a listed address.
- **One way to a password: the emailed link.** "Set up or reset my password" emails a link. Whoever opens that inbox chooses the password. The Hub's screen never creates an account and never sets a password.
- **A password never survives being listed.** If an address already had an account with a password on it when it was listed, that account is replaced by an empty one, because nothing shows who chose that password. Accounts with no password (everyone who only uses Google) are left exactly as they are.
- **One person, either way.** Google and the password open the same account.
- **No rules change.** Every staff rule already requires a verified email.

## Turning it on: the only safe order

**Do not enable Email/Password in the Firebase console until steps 1 to 3 are done.** The switch in step 6 only shows the form. The console setting in step 4 is what opens the door, and it must not open before every listed email has an account the Hub made. Enabling it earlier is unsafe.

1. **Merge, and confirm the function is live.** Merging to `main` runs *Deploy Functions*, which ships `staffAccountOnListing`. A green deploy is not proof. Check it is there:
   ```
   npx --no-install firebase functions:list --project nwsa-hub
   ```
   `staffAccountOnListing` must be in the list.
2. **Run the backfill.** GitHub → Actions → *Ensure Staff Accounts* → Run workflow. Leave both boxes unticked the first time: it only counts. Then run it again with **apply** ticked: it makes the missing accounts. The log shows counts, never an address.
3. **Confirm every listed email has an account.** Run it once more, unticked. The last line must read `Every listed email has an account (N of N)` and the line `account carrying a password, left as it is` must be `0`. Then check the function itself: add a made-up address on the Directors screen, run the workflow unticked again, see N go up by one with nothing missing, and remove the made-up address.
4. **Only now, the console.** Firebase console → Authentication → Sign-in method → Email/Password → Enable. Leave "Email link (passwordless sign-in)" off. Then Authentication → Settings → Password policy → minimum length 10. (If the console says the password policy needs an upgrade, stop there and ask; nothing else depends on it.)
5. **Recommended second lock.** Authentication → Settings → User actions → untick **Enable create (sign-up)**. This stops anyone but the Hub from making an account at all. One thing could not be checked ahead of time: whether a newly listed person's first Google sign-in still works with it off. So test it right away: list a new Google address, have that person sign in with Google. If they cannot, tick the box back on and tell whoever maintains the Hub.
6. **Flip the flag.** In `config/orgs/nwsa.json`, set `features.passwordSignIn` to `true`. Push; the site rebuilds. Add a What's New entry in the same commit.
7. **Try it yourself first.** On the sign-in screen: "Set up or reset my password", type your email, tap the link in the email, choose a password, come back and sign in. The phone should offer to save it.

If step 3 ever shows `account carrying a password` above zero **before** step 6, Email/Password was enabled too early. Run *Ensure Staff Accounts* with both **apply** and **replace** ticked, then start again from step 3.

After it is live, do not tick **replace** again: it takes away every password staff have chosen (they would each set a new one by link).

## Turning it off again

Set `features.passwordSignIn` back to `false`: the form disappears. To close the door itself, disable Email/Password in the console. The accounts the Hub made stay; they are empty and harmless, and Google sign-in keeps using them.

## Known edges

- The password is chosen on the sign-in service's own page (the link opens it), so the phone may not offer to save it there. It offers when the person types it once on the Hub's own form.
- The link emails come from the sign-in service, not the Hub's own mail, and can land in junk.
- "Connect Google Drive" on an assignment opens a Google pop-up. For someone whose account has no Google on it, that pop-up now runs on a separate, throwaway sign-in so it cannot change who is signed in to the Hub. With the second lock on (step 5), it only works if the Google account they pick already has a Hub account.
- If a listed person is removed and listed again, any password on their account is cleared and they set a new one by link.

## Where things live

- `functions/src/staffAccount.ts`: the rule. `staffAccountOnListing` in `functions/src/index.ts` runs it when a `directors` doc is created. Self-check: `functions/src/staffAccount.selfcheck.ts`.
- `scripts/ensure-staff-accounts.mjs` and the *Ensure Staff Accounts* workflow: the same rule over the current list.
- `src/director/components/AuthGate.tsx`: the form, the link flow, the "confirm your email" step, the Home Screen line.
- `src/director/hooks/useGoogleDrive.ts`: the Drive pop-up guard.
- `scripts/password-sign-in.emulator-proof.mjs` with `firebase.emulators.json`: real sign-ins on the emulators against the real rules. Not part of CI (it needs Java). Run it by hand before step 6 and after any change to the files above.
