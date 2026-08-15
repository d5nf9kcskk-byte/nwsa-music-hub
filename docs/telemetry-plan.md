# Usage telemetry — implementation plan (#telemetry)

Status: **planned, not yet built.** This is the design for the pilot-program
analytics layer promised in the ASYO pilot agreement (Section 4: "Usage
Analytics" — de-identified, aggregated measurements of how the Service is
used). Build it as its own PR after the demo ships.

## Why (and why so little)

The pilot deal is a free year in exchange for feedback + usage data that
improves the product and its agent-assisted features. That requires knowing
*what gets used, how long tasks take, and where friction is* — it does NOT
require identities, and collecting identities would poison the deal's
privacy story (the users include children under 13). So the design rule is:

> **Telemetry may record that "a director took roll in 84 seconds" —
> never who, never for whom.**

For a single pilot org, qualitative feedback (monthly admin call, the
Suggest-a-change form, parent messages) will carry most of the product
insight; telemetry earns its keep as the quantified sales evidence
("roll for 40 students in under 2 minutes") and becomes genuinely valuable
at customer #3 when orgs can be compared. Build it thin.

## What already exists (don't duplicate)

- `loginEvents` — staff sign-ins, owner-read, append-only.
- `activityLog` — staff actions, owner-read, append-only.
- `DIRECTOR_FEEDBACK_FORM_URL` ("Suggest a change") + `parentMessages` —
  qualitative channels.

## Signals to collect, and why each earns its place

| Signal | Fields | Why |
|---|---|---|
| Screen view | `screen`, `role` | Feature adoption — what to invest in / kill |
| Task timing | `task` (`takeRoll`, `createEvent`, `postAnnouncement`, `scheduleSwap`), `durationMs`, `role` | The efficiency claim, quantified from real use — sales collateral and regression detector |
| Friction | `kind: 'error'`, `where`, `code` (no message text) | Bug priority from reality |
| Public engagement (aggregate only) | daily counters: `lookups`, `calendarViews`, `icsClicks`, `contactSubmits` | Proves family adoption to the org — adoption drives conversion to paid |
| Data-shape stats (computed, not events) | % pieces with parts links, overrides/week, schedule changes/week | Designs the library/personnel agents: shows where hours are lost |

**Never collected:** student/parent/staff names or ids, message or note
content, per-user identifiers or cookies on the public site, IPs. Role only
(`director` / `assistant` / `teacher` / `public`).

## Data model

```
usageEvents/{autoId}       // raw, short-lived (pruned after 30 days)
  orgId: string            // build-time ORG.orgId
  role: 'director' | 'assistant' | 'teacher' | 'public'
  kind: 'screen' | 'task' | 'error'
  name: string             // screen/task slug from a CLOSED allowlist
  durationMs?: number
  day: string              // YYYY-MM-DD (local) — rollup key
  ts: number

usageDaily/{YYYY-MM-DD}    // rollup, kept forever (contains nothing personal)
  counters: { [role.kind.name]: count }
  timings:  { [task]: { n, p50, p90 } }
  publicCounters: { lookups, calendarViews, icsClicks, contactSubmits }
```

## Client implementation

- `src/shared/telemetry.ts`: `track(kind, name, durationMs?)` — buffers in
  memory, flushes a batched write every 60 s / on `visibilitychange`
  (mirrors the WriteTray batching idiom). Drops silently when `db` is null
  or the org has telemetry off.
- Org-gated like every org feature: `features.telemetry` in
  `config/orgs/*.json` — **`false` for NWSA initially** (flip after the
  director is told), `true` for ASYO (covered by the pilot agreement).
- Staff side: instrument `DirectorApp.go()` (screen views), Take Roll
  open→save, EventForm save, AnnouncementManager post, ScheduleSwap apply.
- Public side: NO per-event writes. A single daily-counter increment doc
  per surface, written at most once per session per counter via
  `sessionStorage` de-dup — no identifiers, COPPA-safe. (Firestore
  `increment()` on `usageDaily/{today}.publicCounters.*`.)
- Visible disclosure: one line in StartGuide + site footer — "We collect
  anonymous usage statistics to improve the Hub." (org-gated with the flag).

## Rules sketch

```
match /usageEvents/{doc} {
  // Staff-only creates, exact shape, closed enums, no free text beyond slug.
  allow create: if isStaff() || isAssistantRole() || isTeacherRole()
    && request.resource.data.keys().hasOnly(['orgId','role','kind','name','durationMs','day','ts'])
    && request.resource.data.kind in ['screen','task','error']
    && request.resource.data.name.size() <= 40;
  allow read: if isOwner();
  allow update, delete: if false;
}
match /usageDaily/{day} {
  // Public counter increments constrained to the publicCounters map;
  // owner reads. (Exact diff-constrained rule to be worked out in the PR —
  // if it can't be locked down tightly, public counters move to a
  // GitHub-Action-computed estimate instead and the public write is dropped.)
}
```

The `usageDaily` public-increment rule is the one genuinely tricky bit —
an unauthenticated `increment()` needs a rule that allows ONLY +1 deltas to
allowlisted keys. If that proves fragile, fall back: public counters get
computed server-side by the rollup Action from proxies (feed fetch counts
are already in Pages logs? No — GitHub Pages has no logs; then drop the
public counters entirely rather than add tracking). Decide in the PR.

## Rollup + retention (Spark-plan friendly, no Cloud Functions)

`.github/workflows/telemetry-rollup.yml` — nightly cron, Admin SDK (same
pattern as `backfill-public-projections.yml`):
1. Aggregate yesterday's `usageEvents` into `usageDaily/{day}` (counts +
   p50/p90 timings).
2. Delete `usageEvents` older than 30 days.
3. Recompute data-shape stats (parts-link coverage, override rate) into the
   same doc.
4. Optionally append a CSV row to a private gist/sheet for trend viewing —
   or just read `usageDaily` from a small owner-only view in the app later.

## Cadence

- Collection: continuous, passive.
- You: skim the rollup monthly; before each quarterly ASYO summary, pull
  the headline numbers (adoption %, median roll time, family lookups/week).
- ASYO: 15-min feedback call monthly for the first quarter, then quarterly
  written "what we improved from your usage" summary (pilot agreement §5).

## Phasing

1. **P1 (with pilot launch):** staff screen views + take-roll timing +
   disclosure line + rollup Action. ~1 day.
2. **P2:** remaining task timings, error events. ~0.5 day.
3. **P3 (only if needed):** public daily counters, pending the rules
   question above. ~0.5 day.

## Invariants

- NWSA build stays behavior-identical while `features.telemetry` is false —
  same verification as #org-config (double-build hash, no new listeners).
- Nothing in `usageEvents`/`usageDaily` may ever contain a name, id, or
  free-text field beyond the closed slug allowlist — enforce in rules, not
  convention.
- Public site: no cookies, no localStorage identifiers, no per-user events.
  If a proposed metric needs any of those, the metric is wrong.
