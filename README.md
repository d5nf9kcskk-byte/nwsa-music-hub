# NWSA Music Hub

A purpose-built web app for managing a school music program — roster, attendance,
rehearsals, concerts, repertoire, and announcements — with a mobile-first director
tool and a public-facing site for students and parents.

It replaces a Notion-based workflow whose mobile UX couldn't support quick
tap-to-mark attendance. Hosted free on GitHub Pages; data lives in Firebase
Firestore with Google sign-in for the director.

## Two surfaces, one app

| Surface | Route | Who | What |
|---|---|---|---|
| **Public site** | `/` | Students, parents, public | Today's schedule, full calendar, ensemble hubs, per-student schedules, repertoire & printable concert programs, subscribable calendar feeds |
| **Director tool** | `/director` | Signed-in director (PWA) | Take roll, manage roster & ensembles, schedule/concerts, progress notes, repertoire library, announcements, rehearsal generator, ICS import |

## Features

- **Exception-only attendance** — students default to present; tap Absent / Late /
  Excused to log an exception. No typing, full name list always visible.
- **Roster & ensembles** — students grouped by ensemble, with temporary roster
  moves (subs & pulls) that don't disturb the base roster.
- **Unified calendar** — rehearsals, concerts, sectionals, and events on one
  calendar, per-ensemble colors, cancellations, expected-attendance counts.
- **Repertoire library** — full work metadata (formal title, composer dates,
  catalog number, instrumentation, duration, movements, program notes, IMSLP /
  video / audio links), per-instrument parts plus a shared folder link.
- **Piece ↔ event linking** — attach pieces to concerts/rehearsals; students see
  the pieces (and *their* instrument's part) on each event; concerts get a
  **printable program** in director-set order.
- **Announcements** — school-wide or per-ensemble, pinnable, with expiry.
- **Subscribable calendar feeds** — per-ensemble and all-events `.ics` feeds
  (`webcal://` one-tap subscribe), refreshed on a schedule.
- **ICS import** — pull district/school calendars in by URL or paste.
- **PWA** — installable to the iOS/iPadOS home screen, standalone display.

## Tech stack

- **React 19 + TypeScript + Vite**
- **React Router** (public routes + `/director` app, basename `/nwsa-music-hub`)
- **Firebase Firestore** (real-time listeners) + **Firebase Auth** (Google)
- **GitHub Pages** via GitHub Actions

## Project structure

```
src/
├── main.tsx                 # Router: public routes + /director
├── director/                # Director PWA
│   ├── DirectorApp.tsx      # Menu shell: Roll · Roster · Schedule · Notes …
│   ├── firebase.ts          # Firebase init from VITE_* env vars
│   ├── types.ts             # Data models
│   ├── utils.ts             # Date / color / repertoire helpers
│   ├── rosterResolver.ts    # Effective-roster logic (base + overrides)
│   ├── hooks/               # One real-time Firestore listener per collection
│   ├── attendance/ roster/ schedule/ notes/ announcements/ repertoire/
│   └── director.css
└── public/                  # Public site (PublicHome, Calendar, Ensemble,
    │                        #  Schedule, Piece, Program, Lookup, …)
    └── public.css
scripts/
├── generate-feeds.mjs       # Build step: writes .ics feeds into dist/feeds
└── migrate.js               # One-time: seed ensembles + roster into Firestore
firestore.rules              # Security rules (public read / director write)
firebase.json                # Points the Firebase CLI at firestore.rules
.github/workflows/
├── deploy.yml               # Build + ICS feeds + deploy to Pages (push + 4h cron)
```

## Firestore collections

Public (world-readable, director-write): `ensembles`, `students`, `events`,
`rosterOverrides`, `announcements`, `repertoire`.
Private (director only): `contacts`, `attendance`, `progressNotes`.

## Local development

```bash
npm install
cp .env.local.template .env.local   # then fill in your Firebase web config
npm run dev
```

Open the dev URL; the public site is at `/`, the director tool at `/director`.

## Setup (one-time)

### 1. Firebase

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com) (free Spark plan).
2. **Firestore Database** → create (production mode).
3. **Authentication** → enable **Google** provider. (Only people you let sign in can write.)
4. **Project Settings → Your apps → Web app** → copy the config values into
   `.env.local` (see `.env.local.template`).

### 2. Security rules

Deploy the rules in `firestore.rules` (or paste them into the Firebase console →
Firestore → Rules):

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules --project YOUR_PROJECT_ID
```

### Who can sign in (directors)

The director allowlist lives in **data**, in the `directors` Firestore
collection (one doc per director, id = their lowercased Google email). Add or
remove a director from inside the app: sign in and open **Directors** (rail or
menu). Changes take effect immediately — **no code change and no rules
redeploy.** This is deliberate: the list used to live in `firestore.rules` and
had to be hand-deployed, so a newly-added director could open the app but have
every save silently rejected until someone ran `firebase deploy` — the recurring
"it hangs in the middle of updating" bug. Data-driven means that can't happen.

Because writing to `directors` requires already being a director, the **first**
director(s) are seeded out-of-band. Run the **Seed Directors** GitHub Action
(Actions tab → Seed Directors → Run workflow), or locally:

```bash
FIREBASE_SERVICE_ACCOUNT_JSON="$(cat serviceAccount.json)" node scripts/seed-directors.mjs
```

It's bootstrap-only (does nothing if the collection already has entries).

> **One-time migration order** (only when moving an existing site to this
> data-driven model): **seed the directors first**, **then** deploy the updated
> `firestore.rules`, **then** deploy the app. Seeding before deploying the new
> rules means the current director is never locked out. (If they get done out of
> order, the app shows "Checking access… / Couldn't verify" with a retry — never
> a permanent lockout — and resolves once the rules are live and the seed has
> run.)

### 3. Seed the roster (optional)

```bash
export FIREBASE_PROJECT_ID=your-project-id
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccountKey.json
node scripts/migrate.js
```

(You can also tap **Import NWSA roster** in the empty Roster view.)

### 4. GitHub Pages deploy

1. Repo **Settings → Pages → Source: GitHub Actions**.
2. Repo **Settings → Secrets and variables → Actions** → add the Firebase web
   config as secrets so the build can read them:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
3. Push to `main` → the **Deploy to GitHub Pages** workflow builds the app,
   generates the `.ics` feeds, and publishes. Live at
   `https://<owner>.github.io/nwsa-music-hub/`.

> The deploy workflow also runs on a 4-hour cron to keep calendar feeds current.


## Custom domain (future)

Add `public/CNAME` with your domain, change `base` in `vite.config.ts` and
`start_url` in `public/manifest.json` to `'/'`, then configure DNS and the
GitHub Pages custom-domain setting.

## Scripts

| Command | What |
|---|---|
| `npm run dev` | Local dev server |
| `npm run build` | Type-check + production build into `dist/` |
| `npm run lint` | ESLint |
| `npm run preview` | Preview the production build |
| `node scripts/generate-feeds.mjs` | Regenerate `.ics` feeds (needs `VITE_FIREBASE_PROJECT_ID`) |
| `node scripts/migrate.js` | Seed ensembles + roster |
