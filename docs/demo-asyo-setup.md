# ASYO demo — one-time setup

The ASYO (Alpharetta Symphony Youth Orchestra) demo is a second deployment
of this codebase (see "Org config / white-label" in CLAUDE.md): same source,
`VITE_ORG=asyo`, its own Firebase project, its own GitHub Pages site. This
doc is the console clickwork that code can't do. Total ~45 minutes.

Demo URL once live: **https://d5nf9kcskk-byte.github.io/asyo-music-hub/**

## 1. Firebase project (~15 min)

1. [console.firebase.google.com](https://console.firebase.google.com) →
   Add project → name **`asyo-hub-demo`** (exact id matters: the seed
   script refuses to run against anything else). Spark plan, Analytics off.
2. **Build → Firestore Database** → Create database (production mode,
   `nam5`/us-east region is fine).
3. **Build → Authentication → Get started → Google** → enable. Support
   email: your account.
4. **Project settings → General → Your apps → Web app** (</> icon) →
   register `asyo-hub-demo-web`, no hosting. Copy the six config values.
5. **Project settings → Service accounts → Generate new private key** —
   save the JSON locally (NOT in the repo). This is for the seed script.
6. Authentication → Settings → **Authorized domains** → add
   `d5nf9kcskk-byte.github.io` (sign-in popup won't work without it).

## 2. Firestore rules — automatic (no action)

`deploy-rules.yml` deploys `firestore.rules` to **both** projects on every
push to main that touches them: `nwsa-hub` first, then `asyo-hub-demo`. The
demo half is skipped cleanly until the `ASYO_SERVICE_ACCOUNT_JSON` secret
exists (step 4 below), so set that secret and the drift problem is gone.

Storage rules go to `nwsa-hub` only — the demo is on Spark and has no
bucket. Add a step if it ever moves to Blaze.

To deploy the demo's rules by hand anyway:

```bash
npx firebase-tools login
npx firebase-tools deploy --only firestore:rules --project demo
```

(`demo` is the `.firebaserc` alias for `asyo-hub-demo`.)

## 3. Pages target repo (~10 min)

1. Create repo **`d5nf9kcskk-byte/asyo-music-hub`**, public, README only
   ("Built output of the ASYO demo — source lives in nwsa-music-hub").
2. Generate a deploy key pair locally:
   `ssh-keygen -t ed25519 -C "asyo-demo-deploy" -f asyo_deploy_key -N ""`
3. `asyo-music-hub` → Settings → **Deploy keys** → add the PUBLIC half
   (`asyo_deploy_key.pub`), check **Allow write access**.
4. `nwsa-music-hub` → Settings → Secrets and variables → Actions → add
   secret **`ASYO_DEPLOY_KEY`** = the PRIVATE half (entire file).
5. After the first demo deploy runs: `asyo-music-hub` → Settings → Pages →
   Source: **Deploy from a branch** → `gh-pages` / root.

## 4. GitHub secrets for the demo build (~5 min)

In `nwsa-music-hub` → Settings → Secrets and variables → Actions, add the
six values from step 1.4:

| Secret | Value |
|---|---|
| `ASYO_FIREBASE_API_KEY` | apiKey |
| `ASYO_FIREBASE_AUTH_DOMAIN` | `asyo-hub-demo.firebaseapp.com` |
| `ASYO_FIREBASE_PROJECT_ID` | `asyo-hub-demo` |
| `ASYO_FIREBASE_STORAGE_BUCKET` | storageBucket |
| `ASYO_FIREBASE_MESSAGING_SENDER_ID` | messagingSenderId |
| `ASYO_FIREBASE_APP_ID` | appId |

Plus one more, from the service-account JSON downloaded in step 1.5:

| Secret | Value |
|---|---|
| `ASYO_SERVICE_ACCOUNT_JSON` | the ENTIRE contents of the `.json` file |

That one secret powers both the automatic demo rules deploy (step 2) and
the **Seed ASYO demo data** workflow (step 5). It is a master key to the
demo database — GitHub secrets are the right place for it; a laptop
Downloads folder is not.

## 5. Seed the demo data (~2 min)

With `ASYO_SERVICE_ACCOUNT_JSON` set, no local checkout is needed: Actions →
**Seed ASYO demo data** → Run workflow.

Or locally, if you'd rather:

```bash
FIREBASE_SERVICE_ACCOUNT_JSON="$(cat /path/to/asyo-hub-demo-key.json)" \
  node scripts/seed-demo-org.mjs
```

Idempotent either way — run it again anytime to reset the sandbox to a clean
demo state (it uses fixed doc ids). It seeds fictional students only, plus
ensembles, a fall/winter season, repertoire with program notes, sample
announcements, documents, planned absences, and parent messages. Events are
pinned relative to "today" so the Today view is always alive in a demo.

The seed makes **nwsaorchestras@gmail.com the owner** — override it with the
workflow's `owner_email` input (or `DEMO_OWNER_EMAIL` locally) to seed a
different one.

**It must be an address that can complete a GOOGLE sign-in.** Google is the
only provider the app offers, and the owner is the only role that can add
directors — so seeding an address nobody can sign in with locks everyone out
of the demo's director side with no way back in from the app. (This is not
hypothetical: the demo first shipped owned by a Yahoo address and had to be
re-seeded.) The recovery, if it happens again, is exactly that: re-run the
seeder with the right `owner_email`.

After first sign-in, add the ASYO administrator and music director from
Directors (owner menu) — give both the `director` role so they can try
everything. A stale owner row from an earlier seed can be deleted from that
same screen.

## 6. First deploy + smoke test

1. Actions → **Deploy ASYO demo** → Run workflow. (Also runs on a 4-hour
   cron for feed freshness, offset from NWSA's.)
2. Then do step 3.5 (turn on Pages) and re-run the workflow once so Pages
   picks up the branch.
3. Smoke test on the live URL: public site shows ASYO branding; Contact Us
   sends a message; sign in at `/director` → Messages inbox shows it with
   an unread badge; take roll on today's rehearsal; `feeds/all.ics`
   downloads with `PRODID:-//ASYO Music Hub//asyo//EN`.

## Demo → pilot go-live (same URL, same accounts, zero migration)

The demo instance IS the future production instance — the transition is a
data operation, not a deployment. Three phases:

**Demo period (limited time, fictional data).**
- Only the administrator + music director get director accounts; do NOT
  circulate the public URL to families yet.
- The seed includes a pinned "Demo sandbox" announcement so the fictional
  data labels itself.
- Reset the sandbox to pristine any time:
  `node scripts/reset-demo-org.mjs --to-demo --yes` then re-run
  `seed-demo-org.mjs`.
- Access control is the time limit: revoking the demo just means removing
  their two entries in Directors (owner menu) — revocation takes effect
  live, mid-session. No code needed to "expire" the demo.

**Go-live (starts the pilot term).**
```bash
FIREBASE_SERVICE_ACCOUNT_JSON="$(cat asyo-hub-demo-key.json)" \
  node scripts/reset-demo-org.mjs --go-live --yes
```
Wipes every collection EXCEPT `directors` — the admin and conductor sign
in exactly as before, into an empty org. Then, in-app:
1. Create the real ensembles (Ensembles screen).
2. Roster → Import CSV with the real roster (get the spreadsheet from the
   admin; never commit it).
3. Build the real season calendar — or collect the admin's dates and seed
   them via a one-shot script like the NWSA ones.
4. Swap in real logo/colors if their artwork has arrived
   (`config/orgs/asyo.json` + `public/asyo-*.png`, redeploy).
5. ICS feeds regenerate with real data on the next deploy-demo cron (≤4 h)
   — same feed URLs, so anything subscribed during the demo just updates.
6. NOW share the public URL/QR with families. Pilot term starts here.

**During the pilot** nothing changes technically — same project, same
deploy. The project id `asyo-hub-demo` is cosmetic and invisible to users
(the public URL is the Pages address); don't churn Firebase projects just
to rename it. If ASYO converts to paid later and wants a custom domain,
that's a Pages custom-domain setting, not a migration.

## Notes / gotchas

- **Local ASYO build**: `VITE_ORG=asyo npm run build && npx vite preview`
  (add a `.env.local` with the ASYO `VITE_FIREBASE_*` values to hit the
  demo backend locally, or none to get the graceful "setup required" gate).
- **Rules drift**: fixed. `deploy-rules.yml` now ships `firestore.rules` to
  both projects (step 2). If you ever see the demo behaving as though it's on
  old rules, check that the `ASYO_SERVICE_ACCOUNT_JSON` secret still exists —
  without it the demo half of that workflow silently skips.
- **Logo/colors**: `public/asyo-logo.png` + `public/asyo-mark.png` are
  typeset placeholders. When ASYO sends real artwork, drop in files with
  the same names and adjust `brand`/`themeColor` in `config/orgs/asyo.json`.
- **Real season data**: when the administrator sends actual rehearsal
  dates/programs, edit the arrays at the top of `scripts/seed-demo-org.mjs`
  and re-run it. Never add real student names — fictional roster only.
- **PWA icons**: the demo currently reuses the shared `icon-*.png` set. If
  ASYO wants their own install icon, replace those files in a follow-up
  (they're org-neutral filenames, so it means a per-org icon pipeline —
  deliberately out of scope for the first demo).
