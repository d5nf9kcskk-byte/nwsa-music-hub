# Ask · Today · Me: what it costs to run (estimate v1)

**Date:** 2026-09-04
**Status:** estimate, built on the design spec's ops facts and prices read from the providers' own pages on 2026-09-04
**Branch:** `claude/nwsa-music-hub-prototype-f2mplw`
**Companion:** the interactive cost explorer and the tappable Riverside sandbox are private artifacts linked from the session that produced this file. Every number below comes from the same formulas the explorer runs.

## Short answer

| Question | Answer |
|---|---|
| What do I spend now | Your Claude plan, and nothing else that shows on a bill. Firebase runs on the $300 trial credit until 2026-11-13. Actions and Pages are free on a public repo. |
| What the model tier adds at today's usage | About $3.48 a month on Opus 5, $1.39 on Sonnet 5, plus about $2.25 of write-time enrichment |
| If every music student and most parents ask weekly | About $21 a month all-in per org on Opus 5, $9.61 on Sonnet 5 |
| If the whole school piles in | About $371 a month on Opus 5, $182 on Sonnet 5, with a daily cap raised to fit |
| A bot on an uncapped public endpoint | $156,838 a month. With the day-one caps it is $364. With the kill switch it is $0. |
| What a paying org costs me after Phase 0 | $14 to $42 a month, most of it model tokens; $9.36 with Ask for staff only |
| Breakeven | At $1,000 a year per org, 2 paying orgs cover a Max 5x plan, Sentry Team and a domain |

Plain reading: the tokens are cheap, the bill is dominated by my own subscription until there are customers, and the only number that can hurt is an uncapped public endpoint. The caps are a day of work.

## 1. What I spend now (quiet, today's numbers)

| Line | Monthly | Verified or assumed |
|---|---|---|
| Firebase (nwsa-hub, Blaze) | $0 charged; the $300 trial credit absorbs a few cents | verified: docs/firebase-blaze-cost-analysis.md, trial expires 2026-11-13 |
| GitHub Actions and Pages | $0 (public repo) | verified: docs.github.com billing |
| Domain | $0 (github.io) | verified |
| Email | $0 (Gmail SMTP through the Trigger Email extension, about 500 a day) | verified: docs/signup-confirmation-email.md |
| Error reporting, uptime | $0 (none exist) | verified: no Sentry, no uptime checks in the repo |
| Your Claude plan | $20 Pro, $100 Max 5x, or the Max 20x price (not on the fetched page) | verified: claude.com/pricing, read 2026-09-04. Tell me which plan you are on. |
| Weekly review runs | $0 extra; each run is about $26 API-equivalent charged as subscription usage | verified: docs/weekly-review.md |

Assumed roster for "today": 100 music students, 120 parents, 10 staff. The repo names no enrollment; 80 and 94 students appear in the UI study as roster sizes. Change the sliders if you know better.

## 2. What the model tier adds

The planner profile from the spec: two rounds, about 1,900 cached prefix tokens, 1,000 uncached input tokens, 200 output tokens per question. Prices read from platform.claude.com on 2026-09-04.

| Model | Input / output per MTok | Cache read | 5-minute cache write | Per question, 0% hits | 50% hits | 90% hits |
|---|---|---|---|---|---|---|
| Claude Opus 5 | $5 / $25 | $0.50 | $6.25 | 2.2¢ | 1.6¢ | 1.2¢ |
| Claude Sonnet 5 | $2 / $10 | $0.20 | $2.50 | 0.9¢ | 0.7¢ | 0.5¢ |
| Claude Haiku 4.5 | $1 / $5 | $0.10 | $1.25 | 0.4¢ | 0.4¢ | 0.4¢ |

Two things the table hides:

- The cache lives 5 minutes. At quiet traffic (about 7 model calls a day) most calls arrive more than 5 minutes apart, so plan on the 0% to 50% columns, not 90%. The 1-hour TTL doubles the write price and only pays off when calls are under an hour apart. The explorer has both.
- Haiku 4.5 cannot cache a 1,900-token prefix (its minimum is 4,096), so it is a flat 0.4¢ a question. It is cheaper than Opus only until the cache warms.

Monthly token cost by scenario, with 35% of questions reaching the model (the spec's "tier zero handles the common questions, divide by three"):

| Scenario | Questions a month | Model calls | Opus 5 | Sonnet 5 | Enrichment (batch) |
|---|---|---|---|---|---|
| Quiet (today) | 607 | 212 | $3.48 | $1.39 | $2.25 |
| Adopted | 3,207 | 1,122 | $15 | $5.90 | $4.50 |
| Viral | 71,500 | 25,025 | $301 | $121 | $15 |

The spec ships the planner to staff first. Staff only, at adopted usage: $4.48 a month on Opus 5. At today's usage: $0.75.

Enrichment is the write-time pass that generates bilingual synonyms and tags per record. It runs once per edit at the Batch API's 50% price. The line assumes 1,500 input and 300 output tokens per edit and 300 to 2,000 edits a month. It is an assumption.

## 3. Four scenarios

What each one assumes:

| Scenario | Students | Parents | Staff | Family questions a week | Staff questions a week | Cold visits a person a week | Video per student a year | Daily cap |
|---|---|---|---|---|---|---|---|---|
| Quiet (today) | 100 | 120 | 10 | 0.5 | 3 | 1 | 50 MB | 1,000 |
| Adopted | 100 | 180 | 12 | 2 | 15 | 3 | 800 MB | 1,000 |
| Viral | 1,000 | 1,500 | 60 | 3 | 150 | 5 | 1000 MB | none |
| Abused | 100 | 120 | 10 | 0.5 | 3 | 1 | 50 MB | none |

Viral means the whole school: the dance, theatre and visual arts divisions already sit in the calendar bundles, so "the whole school" is a slider move, not a code change. The 1,000 students and 1,500 parents are an assumption; the repo carries no enrollment figure. Abused means a bot at 5 requests a second on a public model endpoint (432,000 calls a day) and 50,000 page loads a day against Firestore, with no cap.

What each one costs a month, Opus 5 as the planner:

| Line | Quiet | Adopted | Viral | Abused, no cap |
|---|---|---|---|---|
| Model tokens | $3.48 | $15 | $301 | $156,073 |
| Enrichment | $2.25 | $4.50 | $15 | $2.25 |
| Firestore reads | $0 | $1.22 | $28 | $765 |
| Storage and egress | $0 | $0.69 | $27 | $0 |
| Cloud Functions | $0 | $0 | $0 | $36 |
| Email | $0 | $0 | $0 | $0 |
| Per org | **$5.73** | **$21** | **$371** | **$156,876** |
| Shared: Max 5x plan, Sentry, domain | $101 | $101 | $101 | $127 |
| Monthly total | **$107** | **$122** | **$473** | **$157,003** |
| Yearly | $1,283 | $1,468 | $5,671 | $1,884,040 |
| All-in per question | 0.9¢ | 0.7¢ | 0.5¢ | $258.59 |
| Same on Sonnet 5, monthly | $103 | $111 | $283 | $63,358 |

Reads per cold visit are 850 (the spec's 700 to 1,000). Every public visit is cold because public devices run the memory cache, a deliberate choice from September 2026 that fixed a worse bug. Firestore in nam5 bills $0.06 per 100,000 reads, twice the single-region rate the August doc used as a floor.

What the spec's caps and App Check do to the abused case:

| Control in place | Monthly | What changed |
|---|---|---|
| Nothing | $157,003 | 12.96M model calls and 1.28 billion reads |
| Per-org daily hard cap of 1,000 model calls | $1,255 | tokens fall to $361; bot reads still cost $765 |
| Cap plus App Check enforced on Firestore | $465 | headless scrapers lose the REST door; $361 of tokens is the ceiling |
| Kill switch flipped | $103 | the endpoint answers 503; tier zero keeps working on the device |

App Check is not a wall. A real browser with a valid token still counts, so the daily cap and the per-device bucket are the controls that bound the bill. App Check removes the cheap attack (curl in a loop) and the read scraping.

## 4. Everything besides tokens that costs money as usage grows

| Meter | Free each month | Rate after | Quiet | Adopted | Viral | Verified or assumed |
|---|---|---|---|---|---|---|
| Firestore reads (nam5) | 50,000 a day | $0.06 per 100k | 39,289 a day, $0 | 117,867 a day, $1.22 | 1,608,389 a day, $28 | verified rate; reads per visit assumed |
| Firestore writes | 20,000 a day | $0.18 per 100k | inside free | inside free | inside free | verified; five public writes are bounded by rules, not by rate |
| Storage (videos, photos) | 5 GB | $0.020 per GB-month | 3.0 GB | 39.6 GB | 491 GB | verified rate; volume assumed |
| Egress (video views) | 100 GB | $0.12 per GB | 1 GB | 20 GB | 244 GB, $27 with storage | verified |
| Check-in photos | in the 5 GB | same | 0.6 GB a year, never deleted | 0.6 GB a year | 2.3 GB a year | verified: no retention anywhere in the repo |
| Cloud Functions | 2M invocations, 400k GB-s | $0.40 per M, $0.0000025 per GB-s | 7,712 invocations | 10,062 | 69,425 | verified; stays $0 until about 300,000 planner calls a month |
| Email | Gmail about 500 a day; Resend 3,000 a month | Resend $20 for 50k, $0.90 per extra 1k | 4 a day | 11 a day | 343 a day, $0 | verified rates; the morning brief is the only thing that reaches these volumes |
| Error reporting | Sentry 5,000 events | Team $26 | $0 | $0 | $0 to $26 | verified |
| Uptime checks | 1M executions | $0.30 per 1,000 | $0 | $0 | $0 | verified; one check a minute in three regions is 130k a month |
| Domain | none | about $14 a year at cost | $0 today | $1.17 | $1.17 | assumed |
| GitHub Actions if private | 2,000 minutes | $0.006 a minute | see below | | | verified |
| Blaze trial converting | $300 credit until 2026-11-13 | the real bill | $0 to $2 | $2 to $6 | $50 to $70 | verified date; lapse detaches Storage |

GitHub Actions if the repo goes private: three hourly deploy crons exist today (NWSA, the ASYO demo, the AS demo). Written as hourly they would be 720 runs a month each, 1.3 minutes a run, about 2,800 minutes, which is past the 2,000 free and costs about $5 a month. As observed (median gap 260 minutes, about 165 runs a month each) they use about 650 minutes and stay free. Phase 0 retires the crons for every org after NWSA.

The Blaze trial: on 2026-11-13 the credit ends. Converting is adding a card. If it lapses, billing detaches and Storage stops, which takes the document repository down mid-semester. The bill after conversion at today's usage is a few cents to $2 a month.

My own Claude usage to build this: the weekly review already costs about $26 API-equivalent a run on the subscription. Phases 0 to 5 of the spec are, at a guess, 40 to 80 Claude Code sessions of the size of this one. On Pro that will hit the limit most days; on Max 5x it fits with headroom; on Max 20x it is not a constraint. Tell me which plan you are on and I will put a number on it. This is an assumption, not a measurement.

## 5. What a paying org costs me after Phase 0

After Phase 0 an org runs on its own Firebase project, on Firebase Hosting, with function-built feeds and no cron. Onboarding drops from 9 to 16 hours of my attention to about 90 minutes. Per month, for a 300-student program:

| Line | Quiet org | Adopted org, Opus 5 | Adopted org, Sonnet 5 | Adopted org, Ask for staff only |
|---|---|---|---|---|
| Model tokens | $7.37 | $32 | $13 | $0 |
| Enrichment | $4.50 | $4.50 | $1.80 | $4.50 |
| Firestore reads | $0.87 | $4.07 | $4.07 | $4.07 |
| Storage and egress | $0.79 | $0.79 | $0.79 | $0.79 |
| Functions, email, hosting | $0 | $0 | $0 | $0 |
| **Per org, monthly** | **$14** | **$42** | **$20** | **$9.36** |
| Per org, yearly | $162 | $501 | $235 | $112 |

Whose card pays the org's Firebase project is an open decision in the spec. The table assumes mine. If the org's project sits on its own billing account, the per-org line for me is the model tokens only, because the API key is mine.

Breakeven against the pricing strawman. The spec gives no number, only "a flat yearly price under typical procurement thresholds" for K-12 and "family-band pricing plus setup" for youth orchestras. Fixed cost for me: Max 5x $100, Sentry Team $26, domain $1.17, together $127 a month ($21 on Pro without Sentry).

| Price per org per year | Margin per org a month at $42 cost | Orgs to cover $127 a month | Net a year with 5 orgs | Net a year with 10 orgs |
|---|---|---|---|---|
| $500 | $0.07 | never | $1,530 | $1,534 |
| $1,000 | $42 | 4 | $970 | $3,466 |
| $1,500 | $83 | 2 | $3,470 | $8,466 |
| $2,500 | $167 | 1 | $8,470 | $18,466 |
| $5,000 | $375 | 1 | $20,970 | $43,466 |

The margin barely moves with the price of tokens. What moves it is the price you can charge, and whether the org's Firebase bill is yours or theirs.

## 6. Hard caps and kill switches for day one

Each one is small. Build cost is my time with Claude Code, plus an API-equivalent guess at the session cost. None of them needs a new dependency.

| Control | What it bounds | Where it lives | Build | Session cost, API-equivalent |
|---|---|---|---|---|
| App Check enforced (site key, monitor, then enforce) | headless scraping of Firestore and Storage, curl loops on the model endpoint | code is in, dormant: src/director/firebase.ts, docs/security-recommendations.md #1 | 2 to 4 hours, mostly console and watching metrics | $10 to $20 |
| Per-org daily hard cap on model calls | worst-case token spend per org per day | a counter doc per org and day, incremented in a Firestore transaction by the function before it calls the model; the cap in org config | 3 to 4 hours | $20 to $30 |
| Per-device token bucket | one device asking all day | hash of the App Check token or device id, sliding window in a Firestore doc with TTL | 3 to 4 hours | $20 to $30 |
| Kill switch per org | everything | `settings/ask` flag read by the function and the client; the function answers 503 and tier zero keeps working | 1 to 2 hours | $10 |
| Planner limits in the request | runaway output and rounds | max_tokens 400, at most 3 rounds, strict tool schemas, enum-bound ids | part of the planner build | $0 extra |
| Video upload cap in storage.rules and the default | the storage and egress meters | the default is 500 MB today (src/director/types.ts); lower it to 250 and add a 90-day Coldline lifecycle rule | 1 hour | $5 |
| Check-in photo retention | storage growing forever | a scheduled delete after the concert's tally is closed, or move to Coldline at 30 days | 2 hours | $10 |
| Budget alert to billing disable | a runaway bill of any kind | Cloud Billing budget, Pub/Sub topic, a small function that detaches billing; it takes the site down, so it is the backstop, not the throttle | 2 to 3 hours | $15 |
| Read alert | a scraping wave the caps do not see | Cloud Monitoring alert on Firestore reads above 500,000 a day | 1 hour | $5 |
| Email daily counter | Gmail's 500 a day and a runaway loop | a counter doc checked by the two functions that write `mail` | 1 to 2 hours | $10 |
| No PII in logs | a privacy incident, which costs more than money | a self-check that fails the deploy if a log line carries a name or a typed question | 1 to 2 hours | $10 |

Total: roughly two working days and under $200 of API-equivalent usage, all of it on the subscription.

## 7. Verified, assumed, and what could surprise me

Verified on 2026-09-04 from the provider's own page or the repo:

- Claude Opus 5 $5 / $25, Sonnet 5 $2 / $10, Haiku 4.5 $1 / $5 per MTok; cache read 0.1x, 5-minute write 1.25x, 1-hour write 2x; Batch 50%; Opus 5 minimum cacheable prefix 512, Sonnet 5 1,024, Haiku 4.5 4,096. Sonnet 5's introductory price is now permanent.
- Firestore nam5: $0.06 per 100k reads, $0.18 per 100k writes; free 50k reads and 20k writes a day. Cloud Functions 1st gen: $0.40 per million invocations after 2M free. Storage $0.020 per GB-month after 5 GB, egress $0.12 per GB after 100 GB. Hosting free to 360 MB a day. Uptime checks free to 1M executions. Sentry free to 5,000 events, Team $26. Resend free to 3,000 a month, Pro $20. GitHub Actions free on public repos, 2,000 free minutes private, $0.006 a Linux minute.
- Claude plans: Pro $20 ($17 annual), Max 5x $100, Team $25 / $125 a seat. The Max 20x price was not in the fetched page.
- Repo facts: 25 workflows, three hourly deploy crons, deploy run 1.3 minutes, observed cadence about 165 runs a month; 7 Cloud Functions on the v1 API; email through Gmail SMTP at about 500 a day; App Check implemented but dormant; no rate limiting on the five public writes; no error reporting and no uptime checks; video default cap 500 MB; check-in photos about 200 KB with a 2 MB ceiling and no deletion; the Blaze trial ends 2026-11-13; public devices use the memory cache.

Assumed:

- Roster sizes (100 students, 120 to 180 parents, 10 to 12 staff for NWSA music; 1,000 and 1,500 for the whole school; 300 for a customer org). The repo has no enrollment number.
- Questions a week, the 35% model share, cache hit rates, cold visits a week, 850 reads a visit, video volume, views a video, emails a person, edits a month, 4 seconds at 256 MB per planner call, $14 a year for a domain, 40 to 80 sessions to build.
- The per-question profile itself (1.9k / 1.0k / 0.2k, two rounds). It is the spec's estimate, not a measurement. The first hundred real calls will replace it.

What could surprise me:

- The tokenizer. Models from 4.7 onward produce about 30% more tokens for the same text. If the profile was counted with an older tokenizer, every token line is 30% low.
- Cache misses at low traffic. A 5-minute cache and 7 calls a day means almost every call pays the 1.25x write. At quiet usage the real per-question cost on Opus is closer to 2.2¢ than 1.2¢. It is still $5 a month.
- Reads, not tokens, in the viral case. $28 a month of Firestore is the same order as the tokens, and the memory-cache decision cannot be reversed for students. Server-side queries and a smaller public window are the levers.
- Video. The default upload cap is 500 MB, not the 250 MB the August doc recommended. One 4K phone per student per round is the difference between the adopted and viral storage lines.
- A cap that is too low. A 1,000-call daily cap is about 25 questions a person a week in the adopted case. Fine for NWSA, tight for a 1,000-student school.
- November 13. If nobody adds a card, Storage detaches and the document repository goes dark.
- The morning brief. It is the only feature in the spec that reaches email volumes with a price, and the spec bounds it to public facts and counts.
- Whose card. If customers' Firebase projects sit on my billing account, a customer's video habit is my bill and their check-in photos are my retention problem.
