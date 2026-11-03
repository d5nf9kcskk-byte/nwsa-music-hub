# Session notes 2026-11-02 to 11-03: NWSA Music Hub 2.0

The director asked for a redesign plan and then for the Hub 2.0 plan (the
cross-examined spec, which is not in this repo) to be built in full, phase
by phase, without check-ins, asking only about choices that change what
people see. This is the record of what shipped, what is
switched off on purpose, and what is left for the director.

## The director's decisions

- **The look:** the hybrid. Studio Bright everywhere, Concert Hall serif
  titles on concert, event and program pages, and the dark Spotlight look
  only on concert night (the Tonight banner and check-in). It ships behind
  an on-device preview that only the owner can turn on, and goes to
  everyone only when the director says so.
- **Push:** yes, as a staff trial first. Families stay off until App Check is
  enforced and the trial shows alerts keep arriving on iPhones.
- **Domain:** not now. `public/404.html` still hardcodes `/nwsa-music-hub/`,
  so a domain move needs that file changed in the same commit.
- **Lesson attachments travel in the family email** (spec question 9).
- **Spring, not now:** accounts (Phase 5), a native app, and any AI chat or
  staff assistant (Phase 6).
- **Testing:** the director is the only tester and checks the site weekly on
  Sundays.

## What shipped

Phase 1, the public door:

- #198 Absence report in Spanish. CSP ready for App Check (reCAPTCHA
  Enterprise / Fraud Defense), running in watch-only mode with the site key
  in the `VITE_RECAPTCHA_SITE_KEY` secret.
- #199 Forms and Concert Check-In in Spanish. #200 alert strips and check-in
  banners in Spanish. #203 the rest of the Spanish leftovers, plus staff
  screens always formatting dates in English and lowercase Spanish weekdays
  mid-sentence.
- #201 the student page shows the next assignment due under Now / Next.
- #202 "Send to my other phone": a link that carries the students saved on
  one phone to another, and only ever adds.

Phase 0, the paperwork:

- #204 `docs/privacy-notice.md` (+ `.es.md`), `docs/vendors.md`, and the
  *Usage counts* workflow. Its first run is below.

Phase 2, push:

- #207 same-day change alerts for staff phones (`pushOnEventChange`,
  `pushTestAlert`), the push handler joined to the service worker through
  `importScripts`, and Add to Home Screen as step one of /start and the QR
  kit. Family subscriptions are built and refused by the rules until
  `pushSettings/global.familiesOpen` is true. That doc does not exist.

Phase 3, director tools:

- #205 "Type what changed" on Change a Day (no model call), the `roomClash`
  warning, and receipts on Event form edits and `hub-calendar.mjs` edits.
- #212 the Today screen's "School closed" leaves a receipt too, so Back to
  normal can undo the day.

Phase 4, lessons:

- #209 attachments on a lesson line (teacher and directors only), a 30-day
  signed link per file in the family email, and "This week: N lessons, M to
  log" on My Lessons.

The look:

- #206 the owner-only preview switch, the tokens in `config/orgs/nwsa.json`
  (`hub2`) and the self-hosted fonts, loaded only while the preview is on.
- #211 the public site under the preview.

Found and fixed on the way:

- #208 the video submissions read rule: anyone can still fetch a known
  object (the upload flow needs it), and only staff can list a folder.
- #210 the QR kit's launch flyer was printing with its bottom cut off. It
  was already about an inch too tall, and the Home Screen step made it two.
  `scripts/qrkit-flyer.selfcheck.mjs` now adds the flyer up.

## Usage counts, Fall 2026 through Nov 3

From the *Usage counts* workflow (numbers only). "Expected" is listed
performers plus audience, with pull-outs not subtracted.

| Date | Concert | Arrivals | Both scans | Expected |
|---|---|---|---|---|
| Aug 31 | NWSA Music Faculty Recital | 118 | 69 | 141 |
| Sep 28 | NWSA Pops Concert | 0 | 0 | 134 |
| Sep 29 | College Chamber Orchestra Concert | 43 | 40 | 78 |
| Oct 3 | Festival I, The Nutcracker Project | 0 | 0 | 78 |
| Oct 4 | Freedom Tower Concert | 0 | 0 | 78 |
| Oct 6 | Midnight Ball | 0 | 0 | 78 |
| Oct 19 | High School Voice Concert | 1 | 0 | 40 |
| Oct 20 | HS Wind Ensemble & Jazz Ensemble Concert | 7 | 7 | 53 |
| Oct 26 | NWSA Music Showcase Concert | 0 | 0 | 119 |
| Oct 26 | Opera Scenes | 39 | 35 | 84 |
| Oct 27 | NWSA Music Showcase Concert | 0 | 0 | 76 |

- Absence reports: 57 (47 pending, 10 approved, none declined). Requests
  (#requests) is where a pending one gets answered.
- Form responses: 138. Copy requests: 4, all done.
- A zero means no door check-in ran that night. Where one ran, arrivals were
  84% of expected at the Faculty Recital, 55% at College Chamber Orchestra
  and 46% at Opera Scenes, and both scans were rarer than arrivals.

## Switched off on purpose

- **Family push:** off until `pushSettings/global.familiesOpen` is set from
  Menu → Phone alerts, after App Check enforcement and the staff trial.
- **The Spanish banner drafter:** built and off. It needs an
  `ANTHROPIC_API_KEY` secret and `features.bannerDrafter`.
- **The new look for everyone:** off. Only the owner's own device sees it.

## For the director

1. Grant the Cloud Functions runtime service account "Service Account Token
   Creator" on itself, or lesson emails go out without file links.
2. Push trial: add the Hub to an iPhone Home Screen, open it from the icon,
   Menu → Phone alerts → turn on, then send a test alert.
3. App Check: watch the metrics, then switch Firestore, Storage and Functions
   to Enforce around Nov 20 to 23.
4. Phase 0 by hand: the two questions for the school in the spec, and hand
   the privacy notice to the school.
5. One question at the next concert door: "Did you open the Hub this week?"

## Open questions (they change what people see)

- Turn the new look on for everyone, and when.
- The live site's dark-mode "Add to my calendar" button is white on a light
  teal (about 2.7:1), and the stock teal text on the page is 4.47:1. Fixed
  under the preview; fix the live site now?
- The Today screen's "School closed" still cancels every block on the date
  on both campuses and takes no lessons, unlike Change a Day's campus-aware
  cancel. Make it open Change a Day's review sheet instead?
- Show Spanish change notes in the calendar feeds and push alerts too, once
  the drafter is on?
