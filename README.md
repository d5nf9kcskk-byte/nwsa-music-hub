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
  Quick-add a title + composer, then **Fill with AI** to enrich the rest.
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
- **React Router** (public routes + `/director` app, basename `/ggmuze`)
- **Firebase Firestore** (real-time listeners) + **Firebase Auth** (Google)
- **GitHub Pages** via GitHub Actions
- **Anthropic API** for AI repertoire enrichment (GitHub Action, server-side)

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
├── enrich-repertoire.mjs    # GitHub Action: AI-fill pending repertoire pieces
└── migrate.js               # One-time: seed ensembles + roster into Firestore
firestore.rules              # Security rules (public read / director write)
firebase.json                # Points the Firebase CLI at firestore.rules
.github/workflows/
├── deploy.yml               # Build + ICS feeds + deploy to Pages (push + 4h cron)
└── enrich-repertoire.yml    # Run AI enrichment after each deploy
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
   `https://<owner>.github.io/ggmuze/`.

> The deploy workflow also runs on a 4-hour cron to keep calendar feeds current.

### 5. AI repertoire enrichment (optional)

The **Fill with AI** button marks a piece `aiStatus: 'pending'`. The
`enrich-repertoire` workflow (runs after each deploy, or manually via
*Actions → Enrich Repertoire with AI → Run workflow*) fills in the metadata.

Add two more Actions secrets:

- `ANTHROPIC_API_KEY` — from [console.anthropic.com](https://console.anthropic.com).
- `FIREBASE_SERVICE_ACCOUNT_JSON` — the full JSON of a service account key
  (Firebase Console → Project Settings → Service Accounts → Generate new private
  key). Paste the file's entire contents as the secret value.

The enrichment script uses the Admin SDK (service account), so it writes back
regardless of the Firestore rules.

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
| `node scripts/enrich-repertoire.mjs` | Run AI enrichment (needs `ANTHROPIC_API_KEY` + `FIREBASE_SERVICE_ACCOUNT_JSON`) |
| `node scripts/migrate.js` | Seed ensembles + roster |
