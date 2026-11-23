# AISO — one-time setup

AISO (the Atlanta International Symphony Orchestra) is the fourth deployment
of this codebase: `VITE_ORG=aiso`, its own Firebase project, its own Pages
site at **https://d5nf9kcskk-byte.github.io/aiso-music-hub/**. The steps are
the ones in `docs/new-org-setup.md` (the script) and `docs/demo-as-setup.md`
(the same by hand). This page is only what is different.

## What is different from the AS demo

- **It is a real orchestra, not a demo.** No fictional people and no "reset
  the sandbox". `scripts/seed-aiso-org.mjs` writes three docs: the owner's
  sign-in entry, one ensemble ("Orchestra") and the New Year's Concert on
  2027-01-03. The concert has no time or venue yet: it is an all-day event
  whose note says they are to be announced, to be filled in from the Hub.
  Re-running is safe: an existing owner is left alone, an address listed
  with another role is promoted to owner in place (its name and roles kept),
  and the ensemble and the concert go only into a Hub that has neither.
- **The project id is `aisymphony-hub`**, not a `-demo` id. People see it, as
  `aisymphony-hub.firebaseapp.com` in Google's sign-in window and in account
  emails, and a project id can never be changed. It is pinned in
  `REAL_PROJECT_IDS` in `scripts/setup-new-org.mjs`, in the seeder, in
  `deploy-rules.yml` and as the `.firebaserc` alias `aiso`.
- **The owner email is required and has no default.** Google is the only way
  in and the owner is the only role that can add anyone else, so a wrong
  address locks everyone out. The fix is to run **Seed AISO** again with the
  right address; the wrong one stays listed as an owner until the real owner
  removes it in Directors.
- **The Hub 2.0 look is on for everyone** (`hub2.forEveryone: true` in
  `config/orgs/aiso.json`, which also holds its colors). Nobody sees the
  stock look on screen, and the owner has no preview toggle.
- Secrets are `AISO_*`; the workflows are **Deploy AISO** (hourly at :50) and
  **Seed AISO**. The seven `ics` strings in the config freeze the first time
  a player subscribes to a calendar.

## Setup

```bash
node scripts/setup-new-org.mjs aiso --dry-run --owner-email <address>
node scripts/setup-new-org.mjs aiso --owner-email <address>
```

The script stops once for the console step (enable the Google provider),
then seeds and deploys. Afterwards run **Deploy Firestore & Storage rules**
once from the Actions tab: until its rules arrive the new database denies
everything, and `/director` says "Couldn't verify your access".

Until `AISO_DEPLOY_KEY` exists, the hourly **Deploy AISO** run skips itself
with a warning ("AISO is not provisioned yet"). A run started by hand (the
setup script's) still goes red at the publish step, on purpose.

## Before launch

- [ ] **Contact email.** `contactEmail` in `config/orgs/aiso.json` is the
      placeholder `contact@example.org`; error messages and the Start guide
      print it.
- [ ] **The owner's sign-in address**, one that can complete a Google
      sign-in, for `--owner-email`.
- [ ] **Final logo files.** The nine `public/aiso-*` files (logo, mark,
      favicon, icon.svg, icon-192, icon-512, icon-maskable-192,
      icon-maskable-512, apple-touch-icon) are placeholders: regenerate them
      under the same names. Keep the logo a PNG no taller than 1.43 times
      its width (a taller one fails `scripts/qrkit-flyer.selfcheck.mjs` in
      the school's deploy), and the maskable art in the middle two thirds.
- [ ] **Enable the Google provider** in the Firebase console
      (Authentication, Sign-in method). The script waits for this.
- [ ] **Player sign-in, uploads and Hub email need Blaze and three
      functions** (#member-sign-in in CLAUDE.md): a Storage bucket in
      `us-central1`; Email/Password on (email link off, enumeration
      protection on); App Check with its key in `AISO_RECAPTCHA_SITE_KEY`;
      the Trigger Email extension with an
      `extensions/firestore-send-email.env.aisymphony-hub` of AISO's own sender;
      then `firebase deploy --config firebase.aiso.json --project aisymphony-hub
      --only functions` (never the default firebase.json, whose predeploy
      builds the school's functions); then `features.googleConfirm: true` in
      `config/orgs/aiso.json`. Phone alerts are still the school's only.
