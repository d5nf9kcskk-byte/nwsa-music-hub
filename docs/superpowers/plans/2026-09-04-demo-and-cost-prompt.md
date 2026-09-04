# Prompt for the demo-and-cost session

Paste everything below the line into a new Claude Code session on this repo.

---

Read `docs/superpowers/specs/2026-09-04-ask-today-me-design.md` first. It is the verified v2 design for the "Ask · Today · Me" redesign of NWSA Music Hub, with the ops and cost facts behind it. Everything below assumes you have read it. Do not modify NWSA behavior in this session; this is a sandbox and an estimate.

I want two things, in this order, and I want to use both on my phone.

## 1. A sandboxed, tappable demo of the redesign

Build a private interactive prototype I can work inside. Publish it as an artifact (private link), phone-framed, with a desktop view as well. Fictional data only: invent an org ("Riverside School of the Arts"), six groups (two performing ensembles, one class, one master class, one college ensemble, one shared block), twelve students with made-up names (two sharing a first name, one with an accent, one nickname case, one in two ensembles with a rotation, one with a lesson near a call time), a season of events, a few announcements, documents, assignments, and one sign-up titled "College Information". Never use anything from Firestore or any real NWSA name. Match the Hub's visual language: read `src/public/pubShell.css`, `src/public/public.css`, `src/public/components/PubEventCard.tsx`, `src/public/PublicHome.tsx`, and the theme color in `config/orgs/nwsa.json`, so the demo looks like the app and not like a generic template.

Screens to include. Keep them shallow: the point is to feel the navigation and the Ask flow, not to build every possibility.

Public side
- Today: the landing screen, the four-tab bar (Today · Me · Calendar · Ask), header with ES|EN, text size, and More. Zero-tap strips at the top: a "changed today" red banner, a concert check-in strip, a sign-up closing soon. Then today's cards and coming-up rows. A Noticings strip with three examples (a lesson within 90 minutes of a call time, a sign-up closing in two days with 3 of 14 responses, a piece with no part link three weeks before the concert).
- Ask: an overlay on Today, not a page. Six starter chips that change with state (nobody remembered, someone remembered, concert day), typeahead from two characters, a visible "asking for: Sofia · switch" identity chip, three recent questions, a "browse everything" row, a bilingual placeholder. Deterministic answers for at least twelve seeded questions in English and a few in Spanish: what's on my schedule today; what repertoire do I rehearse today; when is my next rehearsal; required concerts, with and without a remembered person; college information (finds the sign-up); where's my part; is rehearsal cancelled tomorrow (a real yes/no answer); what do I need to know; call time, dress and pickup for the next concert; assignments due; what changed since I last looked. Answers render as the app's cards with a basis line ("Based on Sofia G. · Camerata, Wind Ensemble · as of 3:41 pm"), an "as of" time, and a "see full page" link. When a question needs a person and nobody is remembered, the answer is the name flow: type a name (nicknames and accents tolerated), "Is this you?", remember on this device. At most three follow-up chips, only for slot changes. Show an honest "I can't see that" for one question. After submit the keyboard should drop and the answer should render full height with the tab bar visible.
- Me: the remembered student's page, with a parent mode that holds two kids and switches with chips.
- Calendar and More: stubs that show the structure. More holds Concerts, Check-In, Ensembles & Classes, Resources, Start Here, saved students, and one Staff sign-in.

Staff side, reached through the one Staff sign-in link (a fake login is fine)
- Today with roll nudges and the same Noticings, one-tap Take Roll on each card.
- The staff four-tab bar (Today · Roll · Calendar · Ask), a "+ Add" in the header that opens a grouped sheet: Event with a sentence-first Quick Add that prefills a form, Announcement, Move a Student as a fill-in-the-blanks sentence with a consequence card, Change a Day, Assignment, Sign-up, Document. Nothing saves without a review step.
- Staff Ask with act-verbs: "cancel Camerata today" opens the Change a Day review sheet with the banner text shown. It never writes directly.
- More with the daily loop, People, Resources (what families see), Office (staff-only), and View As.
- View As: pick a student, a parent of two, or an anonymous visitor. The public site renders with a banner and an exit, and a note that it never touches the device's own saved identity.

Also show, as a toggle, today's NWSA public home beside the new Today so I can feel the difference.

Keep it to one HTML artifact if you can (React from a CDN is fine), fictional data in a single JSON block at the top, all interactions client-side. Load the artifact-design skill before writing it. Tell me which parts are illustrative only.

## 2. A real cost estimate, with Opus as the model

I am paying for this myself right now. Nobody at the school is paying, and I would need approval before they could. I am spending because this becomes a product I sell to other schools and orchestras. So the estimate has to separate what I spend now, what the model tier adds, what changes if usage takes off, and what a paying customer org costs me to run.

Load the claude-api skill for every price and limit; never quote a rate from memory. Use Opus 5 as the default planner model and show Sonnet 5 beside it. Use the per-question token profile and the Firestore, Actions, Blaze, and cron facts in the spec's "Ops facts" section, and recompute anything you can verify from the repo.

Deliver:
- An interactive cost explorer as a second artifact: sliders for students, parents, staff, questions per person per week, the share of questions that reach the model versus the deterministic tier, cache hit rate, model, and number of orgs. Output monthly and yearly cost, per-question cost, and a warning line when any number crosses a cap.
- A written estimate with four scenarios: quiet (today's numbers), adopted (every music student and most parents weekly), viral (the whole school, including the other arts divisions already in the calendar bundles, and staff asking all day), and abused (a bot or a shared link hitting a public endpoint with no cap). Show what the caps and App Check design in the spec do to the abused case.
- Everything besides model tokens that costs me money as usage grows, with numbers: Firestore reads on memory-cache public devices, Storage and egress for videos and check-in photos, Cloud Functions, email sending, error reporting, uptime checks, a domain, GitHub Actions if the repo ever goes private, the Blaze trial converting in November, and my own Claude usage to build this (ask me which plan I am on).
- A per-customer-org cost line after Phase 0 of the spec, and a breakeven against the pricing strawman in the spec, so I can see at what price and how many orgs this pays for itself.
- Hard caps and kill switches to put in place on day one, with what each costs to build.

Plain language, short sentences, no em dashes. Numbers in tables, not prose. Say what is verified, what is an assumption, and what could surprise me.

Start with the demo. Publish it, give me the link, then do the cost work.
