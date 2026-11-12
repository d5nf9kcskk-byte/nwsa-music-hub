# Email and password sign-in for staff: how to turn it on

Built November 2026 (Hub 2.0 plan, section 10) and left **off**. While it is off the sign-in screen is exactly as it was, and the server function behind it answers nothing.

It sits on top of the Google tie (`docs/google-binding.md`). Both ways of signing in go through one test: is this the one sign-in account the Hub's server made for this listed person. **Turn this on only after that work's last step (the switch is on), and not on a concert day.**

## What it does

Staff get a second way in beside "Sign in with Google": their email and a password of their own, in an ordinary form the phone's password manager can save and fill.

- **Who gets in does not change.** The Directors screen is still the one list. The owner adds an email there, exactly as today. Nothing else happens when someone is listed.
- **Google works exactly as it does once the Google tie is in place**, with the exceptions under "What the Hub does not control" below.
- **The Hub's way to a password is a link it emails.** "Set up or reset my password" emails a one-time link (good for an hour). It opens the Hub's own "Choose your password" screen. Whoever can open that inbox chooses the password. Setting one up and resetting one are the same path. Asking again retires the earlier link, so only the newest email's link works, and a link is used up the first time it is tried, whether or not that try succeeds.
- **Asking for a link changes nothing about anyone's account.** Anyone can ask for anyone's link. It only sends an email, and it says the same thing, in the same time, whether or not the address is on the list. Nobody is signed out by someone else asking. Two things someone else's asking CAN do, both small: a newer link retires the older ones, so a person who then taps an older email finds it no longer works and asks again; and one inbox is sent only 3 links an hour and 6 a day, so someone asking over and over in a person's name can use those up. That is what the Owner's button below is for.
- **The Owner can send one person a link.** Directors screen, under the person: **Email them a password link**. It is the same link to the same inbox, and it does not count against that inbox's 3 an hour and 6 a day.
- **A password counts only on the account the Hub's server made.** When the link is used, the server makes a fresh sign-in account for that person, puts the chosen password on it, and records it on their Directors entry. The rules (Firestore, Storage, and the server functions that check a sign-in) honour a password sign-in only on that account.
- **Choosing a password signs you out everywhere once.** The fresh account replaces whatever was on the address, so every older sign-in ends. If you are confirmed with Google, your Google account is attached to the fresh one, so "Sign in with Google" keeps working and your entry still reads "Google account confirmed".
- **The person is told.** After a password is set, the Hub emails that address to say so.
- **The Owner can see it and take it away.** The Directors screen shows "Has a password" and **Remove password**. Removing it leaves Google alone.
- **The Hub's own link wants at least 10 characters**, and refuses the email address as its own password.

### What the Hub does not control

Once Email/Password is enabled in the Firebase console (step 4 below), **Google's sign-in service has a password-reset email of its own**, separate from the Hub's. The Hub cannot switch it off. Two things follow, and both are safe but worth knowing:

- That reset also needs the person's inbox, so it does not let in anyone who cannot read their mail. But it does not apply the Hub's 10-character rule: the service's own minimum is 6. A person can end up with a shorter password that way.
- Anyone who knows the site's public web key can make the service send that reset email to any address that has an account. It is only an email; nothing changes unless the person uses it. Tell staff: the only password email to use is the one from the Hub.

### Two things that rest on how Google's sign-in service behaves

These are how the service is documented and how the test setup behaves. Neither has been tried on the live project, so treat them as "expected" until the Owner has seen them once.

- **A person who has only ever used a password, and then taps "Sign in with Google".** The Hub does not accept that Google sign-in by itself: their record was made with their own inbox, and a Google sign-in does not get to replace it. They see "ask the Owner". **To add Google for them:** Directors screen → **Reset** beside their name; then they sign in with Google and confirm. That gives them a fresh sign-in, so **the password they chose stops working** and they set it again by link. Until the Owner resets them, their password keeps working as before.
- **A sign-in account on a listed address that the Hub did not make.** It opens nothing in the Hub: the rules refuse it, and the person's link or Google confirm replaces it. But until one of those happens, the service may refuse that person's first "Sign in with Google" with an "account already exists" message. **How the Owner clears it:** Directors screen → **Email them a password link** (using the link replaces that account), or Firebase console → Authentication → Users → search for the address → the three dots → Delete account, after which Google sign-in works for them. *Audit Sign-in Accounts* reports such an account as `REVIEW NEEDED` and the Directors screen names it. This is the main reason to have every listed person sign in with Google and confirm BEFORE turning this on (step 0).

## Turning it on

0. **First finish the Google tie**, all four steps in `docs/google-binding.md`, and check the top of the Directors screen says "Only confirmed Google accounts can sign in: On" and "Last account check: OK".
1. **Merge.** That deploys the rules (Firestore and Storage) and the `passwordSetup` function. Then check, because a green deploy is not proof:
   - Google sign-in still works for you and for one other role (for example a student assistant).
   - In GitHub → Actions → *Deploy Firestore & Storage rules*, the run for this merge has a green "Deploy Storage rules" step. (Opening a staff-only file proves nothing: the rules before this allow it too.)
   - `npx --no-install firebase functions:list --project nwsa-hub` shows `passwordSetup`.
2. **App Check must be on for the site.** The function refuses any request that does not carry an App Check token, so the `VITE_RECAPTCHA_SITE_KEY` secret has to be set (see `docs/security-recommendations.md`). If it is not, nothing breaks, but "Email me the link" will always say it did not reach the Hub.
3. **The Hub's own email must be working**, because the link is sent by the Hub's mail (the same one that sends sign-up confirmations), not by the sign-in service.
4. **Firebase console**, Authentication. Do this only once steps 0 and 1 are done and checked: it is those rules, live in all three places, that make it safe.
   - Sign-in method → Email/Password → **Enable**.
   - In the same panel, **"Email link (passwordless sign-in)" must stay OFF.** With it on, anyone who can open a person's inbox could sign in with one tap and no password at all, and the Hub would treat that as a password sign-in.
   - Settings → User actions → **"Email enumeration protection" must be ON** (it is on by default for newer projects; look). With it off, the sign-in service will tell anyone who asks whether an address has an account.
   - Anonymous sign-in should be off (it is not used by staff sign-in either way).
   - If the console offers a "Password policy", set its minimum length to 10 and have it enforced. That makes the service's own reset follow the Hub's rule. (Not checked whether this project's plan offers it.)
5. **Flip the flag.** In `config/orgs/nwsa.json`, set `features.passwordSignIn` to `true`, with a What's New entry. Pushing that rebuilds the site and redeploys the functions (the function reads the same flag).
6. **Try it yourself first.** "Set up or reset my password", type your email, open the link in the email, choose a password, and you are taken to the ordinary sign-in form with your email filled in. Sign in with the password; the phone should offer to save it. You should also get an email saying a password was just set. Then check "Sign in with Google" still opens your account.

## The limits

- One inbox is sent at most 3 links an hour and 6 a day. Past that nothing more is sent, the answer does not change, and the links already in the inbox still work.
- The Hub's mailbox sends at most 60 of these links an hour to everyone together. On the day you tell all staff about this, expect a few people to be told "nothing arrived" if everyone asks in the same hour; they ask again later.
- One network address may ask 30 times in 15 minutes, and complete 30 times in 15 minutes, counted apart. A whole campus can sit behind one address, which is why these are generous. Over the limit the screen says to wait a few minutes; a link that was not used still works.

## Turning it off again

Set `features.passwordSignIn` back to `false`: the form disappears and the function goes quiet. To close the door itself, disable Email/Password in the console. Accounts stay as they are and Google keeps opening them.

## If someone is stuck

- **"No link arrives."** Look in junk first. Then Directors screen → **Email them a password link**: it is not held back by the inbox's own limits. If that says the Hub has sent too many this hour, wait an hour (that limit is for everyone together).
- **"My link says it did not work."** Links work once, for an hour, and a newer one retires the older ones. Have them ask again and tap the newest email.
- **"Sign in with Google says an account already exists."** See "A sign-in account on a listed address that the Hub did not make" above.
- **Someone who has only a password wants to use Google too, or the Hub tells them to ask the Owner.** Directors screen → **Reset** beside their name. Then they sign in with Google and confirm, and set their password again by link.
- **"Too many tries" when choosing a password, though they only tried once.** Another request for that person was still running. Their link has not been used; they wait a minute and open it again.
- **"This password is not set up for the Hub."** Their password sign-in is not on the account the Hub made for them (they were reset, re-added, or confirmed with Google since). They sign out and set a password again by link.
- **Someone's password should stop working now:** Directors screen → **Remove password**. Google keeps working for them.

## Known edges

- The link emails can land in junk.
- A link opens in whatever browser the mail app uses, which on an iPhone may not be the Home Screen app. The password is set there; signing in with it then works anywhere.
- Adding an address that is already listed keeps that person's password. Removing them and adding them back clears it (and their Google record, which the Hub makes again by itself).
- **Reset** on the Directors screen (for someone who changed Google accounts) removes their password too. They set it again by link.
- "Connect Google Drive" on an assignment opens a Google pop-up. For someone whose account has no Google on it, that pop-up runs on a separate, throwaway sign-in so it cannot change who is signed in to the Hub.
- If, at the moment a person is choosing their password, someone else keeps creating an account on that address, the Hub tries five times and then gives up. The link is used up and the person asks for a new one. Nobody gets in who should not; it only costs a retry.
- Future rules tests: a made-up test token must be a sign-in on the account its Directors entry names (see `docs/google-binding.md`), or the rules will refuse it.
- *Audit Sign-in Accounts* accepts a password only on the one account an entry names, and only when the entry says the server set it. Anything else makes it say `REVIEW NEEDED`.

## Where things live

- `firestore.rules`, `storage.rules`: `honouredSignIn()` (one test, a Google arm and a password arm) and `isBoundPasswordAccount()`, word for word the same in both. `bindingGuard()` lets no browser set or alter the record.
- `functions/src/staffToken.ts`: the same test for the functions that check a caller's sign-in. Self-check: `staffToken.selfcheck.ts`, which also reads both rules files.
- `functions/src/passwordSetup.ts` (the rules of setting a password, the limits, and the Owner's link), `freshAccount.ts` (the fresh account) and `entryLock.ts` (one request at a time per person), both shared with the Google tie, `passwordSetupStore.ts` (where it keeps things), `passwordSetup` in `functions/src/index.ts` (the function). Self-check: `passwordSetup.selfcheck.ts`.
- `src/shared/passwordSetupLink.ts`: the shape of the link, shared by the function and the screen.
- `src/director/components/AuthGate.tsx`, `src/director/passwordSetupClient.ts`: the form and the screens. `src/director/hooks/useGoogleDrive.ts`: the Drive pop-up guard.
- `scripts/password-sign-in.emulator-proof.mjs`: real sign-ins on the emulators against the real rules, with the Google tie required. It runs with the other rules checks (`.github/workflows/rules-checks.yml`) before every rules deploy and every functions deploy.
