# AS demo — one-time setup

The AS (Alpharetta Symphony — the adult, semi-professional orchestra; never
"ASO", that's Atlanta) demo is a third deployment of this codebase (see "Org
config / white-label" in CLAUDE.md and `docs/fair-copy/as-demo-plan.md`):
same source, `VITE_ORG=as`, its own Firebase project, its own GitHub Pages
site. This doc is the console clickwork that code can't do, mirroring
`docs/demo-asyo-setup.md`. Total ~45 minutes.

What's different from the ASYO demo: AS carries the **paid roster** —
`personnel`, `personnelContacts`, and `contracts` (pay data, the app's
strictest rules tier) instead of students. The seed is fictional musicians,
staff, and generic contracts; the real 2026-27 season concert dates make
the calendar look alive. **Never seed real people**: the real Alpharetta
Symphony publishes its musician/board/staff pages, and none of that goes
into demo data.

Demo URL once live: **https://d5nf9kcskk-byte.github.io/as-music-hub/**

## 1. Firebase project (~15 min)

1. [console.firebase.google.com](https://console.firebase.google.com) →
   Add project → name **`as-hub-demo`** (exact id matters: the seed script
   refuses to run against anything else). Spark plan, Analytics off.
2. **Build → Firestore Database** → Create database (production mode,
   `nam5`/us-east region is fine).
3. **Build → Authentication → Get started → Google** → enable. Support
   email: your account.
4. **Project settings → General → Your apps → Web app** (</> icon) →
   register `as-hub-demo-web`, no hosting. Copy the six config values.
5. **Project settings → Service accounts → Generate new private key** —
   save the JSON locally (NOT in the repo). This is for the seed script.
6. Authentication → Settings → **Authorized domains** → add
   `d5nf9kcskk-byte.github.io` (sign-in popup won't work without it).

## 2. Firestore rules — automatic (no action)

`deploy-rules.yml` already carries the third project: on every push to main
that touches the rules it deploys to `nwsa-hub`, then `asyo-hub-demo`, then
**`as-hub-demo`**. The AS step has been in the workflow since the
paid-roster rules landed (PR #83) and is skipped cleanly until the
`AS_SERVICE_ACCOUNT_JSON` secret exists (step 4 below) — so set that secret
and rules drift never starts. This matters more for AS than for ASYO:
`contracts` is the one collection in the app that holds pay.

Storage rules go to `nwsa-hub` only — the demo is on Spark and has no
bucket. Add a step if it ever moves to Blaze.

To deploy the demo's rules by hand anyway:

```bash
npx firebase-tools login
npx firebase-tools deploy --only firestore:rules --project as
```

(`as` is the `.firebaserc` alias for `as-hub-demo`.)

## 3. Pages target repo (~10 min)

1. Create repo **`d5nf9kcskk-byte/as-music-hub`**, public, README only
   ("Built output of the AS demo — source lives in nwsa-music-hub").
2. Generate a deploy key pair locally:
   `ssh-keygen -t ed25519 -C "as-demo-deploy" -f as_deploy_key -N ""`
3. `as-music-hub` → Settings → **Deploy keys** → add the PUBLIC half
   (`as_deploy_key.pub`), check **Allow write access**.
4. `nwsa-music-hub` → Settings → Secrets and variables → Actions → add
   secret **`AS_DEPLOY_KEY`** = the PRIVATE half (entire file).
5. After the first demo deploy runs: `as-music-hub` → Settings → Pages →
   Source: **Deploy from a branch** → `gh-pages` / root.

## 4. GitHub secrets for the demo build (~5 min)

In `nwsa-music-hub` → Settings → Secrets and variables → Actions, add the
six values from step 1.4:

| Secret | Value |
|---|---|
| `AS_FIREBASE_API_KEY` | apiKey |
| `AS_FIREBASE_AUTH_DOMAIN` | `as-hub-demo.firebaseapp.com` |
| `AS_FIREBASE_PROJECT_ID` | `as-hub-demo` |
| `AS_FIREBASE_STORAGE_BUCKET` | storageBucket |
| `AS_FIREBASE_MESSAGING_SENDER_ID` | messagingSenderId |
| `AS_FIREBASE_APP_ID` | appId |

Plus one more, from the service-account JSON downloaded in step 1.5:

| Secret | Value |
|---|---|
| `AS_SERVICE_ACCOUNT_JSON` | the ENTIRE contents of the `.json` file |

That one secret powers both the automatic demo rules deploy (step 2) and
the **Seed AS demo data** workflow (step 5). It is a master key to the demo
database — and this database holds (fictional) pay data, so the same rule
applies with more force: GitHub secrets are the right place for it; a
laptop Downloads folder is not.

## 5. Seed the demo data (~2 min)

With `AS_SERVICE_ACCOUNT_JSON` set, no local checkout is needed: Actions →
**Seed AS demo data** → Run workflow.

Or locally, if you'd rather:

```bash
FIREBASE_SERVICE_ACCOUNT_JSON="$(cat /path/to/as-hub-demo-key.json)" \
  node scripts/seed-as-org.mjs
```

Idempotent either way — run it again anytime to reset the sandbox to a
clean demo state (it uses fixed doc ids). It seeds fictional personnel only
— every position category from the plan (Concertmaster, Principal,
Assistant Principal, Section, Substitute; Conductor; Librarian, Personnel
Manager, Operations Manager, Executive Assistant, Bookkeeper) — plus their
contact records, contracts in every lifecycle state (including one carrying
a **cartage** line item, the case the contract model was designed around),
the real 2026-27 season concert dates, weekly services, repertoire, and
announcements. Rehearsals are pinned relative to "today" so the Today view
is always alive in a demo. It does NOT seed students (adult org), public
mirrors (the paid roster has none, by design), or attendance records (the
`ServiceAttendance` model is decided but not yet built).

The seed makes **nwsaorchestras@gmail.com the owner** — override it with
the workflow's `owner_email` input (or `DEMO_OWNER_EMAIL` locally) to seed
a different one.

**It must be an address that can complete a GOOGLE sign-in.** Google is the
only provider the app offers, and the owner is the only role that can add
directors — so seeding an address nobody can sign in with locks everyone
out of the demo's director side with no way back in from the app. (This is
not hypothetical: the ASYO demo first shipped owned by a Yahoo address and
had to be re-seeded.) The recovery, if it happens again, is exactly that:
re-run the seeder with the right `owner_email`.

After first sign-in, add the AS music director and personnel manager from
Directors (owner menu) — give both the `director` role. Note that
Owner/Director are the ONLY roles that can see personnel, contacts, or
contracts: the `teacher` and `assistant` roles get a clean denial by
design, so don't hand those out expecting a read-only demo view.

## 6. First deploy + smoke test

1. Actions → **Deploy AS demo** → Run workflow. (Also runs on an hourly
   cron for feed freshness, offset from NWSA's and ASYO's.)
2. Then do step 3.5 (turn on Pages) and re-run the workflow once so Pages
   picks up the branch.
3. Smoke test on the live URL: public site shows Alpharetta Symphony
   branding and NO Roster/Students surface; sign in at `/director` →
   **Personnel** lists 12 people; open a contract — the Substitute bass
   contract shows a Cartage line item and totals in whole cents; the
   2026-27 concerts (Music from the Silver Screen 9/18/26 through Let
   Freedom Ring! 5/31/27) appear on the calendar; `feeds/all.ics` downloads
   with `PRODID:-//Alpharetta Symphony Hub//as//EN`.

## Demo → pilot go-live

Same story as ASYO (`docs/demo-asyo-setup.md`): the demo instance IS the
future production instance, the transition is a data operation, and access
control (the Directors list) is the time limit on the demo. One difference
to know about: `scripts/reset-demo-org.mjs` is hard-pinned to
`asyo-hub-demo` and will refuse to touch this project — an AS variant (or a
project-aware generalization) is deliberate future work for when a go-live
is actually scheduled. Until then, re-running the seeder is the reset: fixed
doc ids mean it restores the clean demo state over itself.

## Notes / gotchas

- **Local AS build**: `VITE_ORG=as npm run build && npx vite preview`
  (add a `.env.local` with the AS `VITE_FIREBASE_*` values to hit the
  demo backend locally, or none to get the graceful "setup required" gate).
- **Rules drift**: solved structurally — the AS deploy step already exists
  in `deploy-rules.yml`. If the demo ever behaves as though it's on old
  rules, check that the `AS_SERVICE_ACCOUNT_JSON` secret still exists —
  without it the AS step of that workflow silently skips.
- **Logo/colors**: AS deliberately shares the `asyo-*` brand assets —
  `asyo-logo.png` is the parent **Alpharetta Symphony** wordmark, so it is
  more correct for this org than for ASYO. The filename prefix is
  historical (ASYO shipped first), not ownership; don't rename the files,
  it would churn a live deployment (`as-demo-plan.md`, Step 2 notes). Brand
  overrides live in `config/orgs/as.json`.
- **Real season data**: the 2026-27 concert dates in the seed are the real
  published season. When AS sends rehearsal schedules or program changes,
  edit the arrays at the top of `scripts/seed-as-org.mjs` and re-run it.
  Never add real people — fictional roster only, always.
- **No attendance yet**: the seed deliberately writes no attendance
  records. Service attendance for the paid roster (`ServiceAttendance`,
  Option B in `docs/fair-copy/as-build-plan.md` Step 5) has no schema,
  rules, or screens yet.
