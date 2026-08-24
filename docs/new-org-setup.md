# New demo org — one-command setup

`scripts/setup-new-org.mjs` automates the per-org console clickwork that
`docs/demo-asyo-setup.md` (and `docs/demo-as-setup.md`, once the AS seed
branch lands) walk through by hand — the Firebase project, Firestore, the
web app, the service-account key, the Pages repo with its deploy key, the
`<ORG>_*` Actions secrets, and the first seed + deploy. What took ~45
minutes of clicking per org becomes one command plus one ~2-minute console
step that Google gives us no API for (see "The one manual step" below).

Those per-org docs remain the manual fallback and the reference for what
each step means; this script is just their automation. Everything after
setup (owner sign-in, adding directors, demo → go-live) is still in them.

## One-time credential setup (once per Mac, ever)

The script drives three CLIs and assumes they are installed and logged in.
It hard-fails with a message naming the missing tool otherwise.

```bash
# Google Cloud CLI
brew install google-cloud-sdk
gcloud auth login

# firebase-tools (a global install, or any install npx can find)
npm install -g firebase-tools
firebase login

# GitHub CLI
brew install gh
gh auth login
```

For `gh`, the default scopes from `gh auth login` (`repo`, `workflow`)
cover everything the script does — creating the public Pages repo, adding
its deploy key, setting Actions secrets, and dispatching workflows all ride
on the `repo` scope. (`admin:public_key` is *not* needed: that scope is for
account-level SSH keys; repo deploy keys use `repo`.) If `gh` ever reports
a missing scope, refresh with:

```bash
gh auth refresh -h github.com -s repo,workflow
```

All three logins must be the account that owns the `d5nf9kcskk-byte`
repos and the Firebase projects.

## Per-org code first (in this repo, before running the script)

The script provisions **infrastructure**; the org's **code** must already
be merged to main, or it refuses to start and lists what's missing:

- `config/orgs/<org>.json` — the org config (see CLAUDE.md "Org config /
  white-label"; `OrgConfig` does no partial merging, so every key matters)
- `.github/workflows/deploy-<org>.yml` and `seed-<org>.yml` — copy the AS
  pair (or ASYO's `deploy-demo.yml` / `seed-demo.yml`) and swap the org id,
  secret prefix, and cron offset
- `scripts/seed-<org>-org.mjs` — the seeder, which **must hard-abort unless
  its service account's `project_id` is exactly `<org>-hub-demo`**, and must
  seed fictional people only
- a per-org step in `deploy-rules.yml`, following the existing
  `ASYO_SERVICE_ACCOUNT_JSON` / `AS_SERVICE_ACCOUNT_JSON` skip-when-absent
  pattern, so the org's Firestore rules never drift

(The first two orgs predate the naming convention: for `asyo` the script
knows the files are `deploy-demo.yml` / `seed-demo.yml` /
`seed-demo-org.mjs`.)

## The per-org command

```bash
node scripts/setup-new-org.mjs <org> --owner-email someone@gmail.com
```

Preview everything first (changes nothing anywhere — recommended):

```bash
node scripts/setup-new-org.mjs <org> --dry-run
```

`--owner-email` is passed to the seed workflow and **must be an address
that can complete a Google sign-in** — Google is the only provider the app
offers, and seeding an owner who can't sign in locks everyone out of the
demo's director side (this happened to ASYO; the fix is re-running the
seeder). Omitted, the seed workflow's default owner applies.

What it does, in order (each step skips itself if already done, so a
failed run is fixed by re-running):

1. Creates Firebase project `<org>-hub-demo` (Spark, no Analytics)
2. Creates the `(default)` Firestore database (`nam5`; `--location` to
   change), production mode
3. Registers web app `<org>-hub-demo-web` and reads its six SDK config
   values
4. Mints a key for the project's Firebase Admin SDK service account — the
   same account the console's "Generate new private key" button uses. The
   key exists only in a `chmod 700` temp dir until it's uploaded as a
   secret, then the file is deleted; nothing lands in Downloads
5. Creates the public Pages repo `<org>-music-hub` (README only),
   generates an ed25519 deploy key, installs the public half with write
   access
6. Sets the nine secrets on `nwsa-music-hub`:
   `<ORG>_FIREBASE_{API_KEY,AUTH_DOMAIN,PROJECT_ID,STORAGE_BUCKET,MESSAGING_SENDER_ID,APP_ID}`,
   `<ORG>_SERVICE_ACCOUNT_JSON`, `<ORG>_DEPLOY_KEY`
7. **Pauses for the one manual step** (below), then adds
   `d5nf9kcskk-byte.github.io` to the project's Auth authorized domains
   via the Identity Toolkit admin API
8. Dispatches the seed workflow, waits for it, dispatches the deploy
   workflow, waits for it, then enables GitHub Pages on the target repo
   (gh-pages / root) and kicks a Pages build

At the end it prints the demo URL and the smoke-test list. If the org's
`deploy-rules.yml` step already exists (it does for `asyo` and `as`),
dispatch that workflow once after setup so the Firestore rules ship
immediately instead of on the next rules edit.

## The one manual step (and why)

**Enabling the Google sign-in provider** (Authentication → Sign-in method →
Google → Enable, plus its support email) must be done in the Firebase
console; the script pauses at exactly that point with the direct URL.

This was investigated, not assumed: the public Identity Toolkit admin API
can only enable `google.com` as a provider
(`defaultSupportedIdpConfigs`) when handed an **existing** OAuth client
id/secret — and there is no public API that creates the OAuth consent
screen ("brand") or OAuth client for an external-facing app. (The IAP API
can create brands, but only *internal-only* ones restricted to a Workspace
org, which would break sign-in for everyone else.) The console's Google
toggle works because it provisions that OAuth client through a private
endpoint. Until Google exposes that, the toggle is ~2 minutes of clicking
per org.

Everything *around* it is automated: if you Ctrl-C at the pause, finish
the console toggle later and run

```bash
node scripts/setup-new-org.mjs <org> --finish-auth
```

which does just the authorized-domains addition (the easy-to-forget bit
that otherwise breaks the sign-in popup on the live site).

## Safety properties

- **Never touches production.** Hard-refuses org id `nwsa`, project
  `nwsa-hub`, and repo `nwsa-music-hub`; every identifier is derived from
  the org id, so there is no flag that could point it elsewhere.
- **Create-only.** Nothing in the script deletes or modifies an existing
  project, repo, key, or secret value (re-setting a secret to the same
  pipeline's fresh value is the one overwrite). Existing things are
  detected and skipped, which is also what makes re-running safe.
- **Key hygiene.** The service-account key and the deploy key's private
  half are passed to `gh secret set` via stdin (never argv), live only in
  a private temp dir, and are deleted before exit. If the
  `<ORG>_SERVICE_ACCOUNT_JSON` secret already exists, no new key is minted
  unless you pass `--rotate-key` (revoke the old one in IAM afterwards).
- **Seeding stays fenced.** The script only *dispatches* the org's seed
  workflow; the seeder itself is what hard-aborts against any project
  other than its own `<org>-hub-demo`, exactly as before.
