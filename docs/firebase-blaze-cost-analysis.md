# Firebase upgrade — what it costs to host files and student exam videos

Written 2026-08-04 in response to: *"how much would it cost to upgrade
Firebase so documents can be saved in the hub itself, not just readable
documents, and so singing exams can be given with students uploading video
directly to the hub app?"*

This is a costing document, not a plan of record. Nothing here has been
built. Prices are August 2026 list prices for `us-central1` and are quoted
per unit — see [Sources](#sources).

## Short answer

| | |
|---|---|
| **Plan you need** | **Blaze** (pay-as-you-go). It is the only paid Firebase plan. |
| **Subscription fee** | **$0.** Blaze has no monthly minimum — it is metered usage on top of a free allowance. |
| **Document repository** (the existing feature) | **$0/month.** Comfortably inside the free allowance. |
| **Singing exam videos**, realistic | **~$1–20/month**, depending almost entirely on video length and how many times each is watched. |
| **Singing exam videos**, no size limits | **$60–80/month.** This is the case worth engineering against. |
| **Real cost** | Not the bill. It's student authentication and the privacy rules — see [What actually costs you](#what-actually-costs-you-and-it-isnt-money). |

Money is not the obstacle here. For a department-sized roster the bill lands
somewhere between a coffee and a streaming subscription. The obstacle is that
students have no accounts and Storage is currently world-readable.

## Why an upgrade is required at all

Two separate reasons, and only the first is about video.

**1. There is no bucket today.** `src/director/components/FileUpload.tsx:48`
already carries the comment:

> Firebase Storage requires the paid Blaze plan; on the free plan there's no
> bucket, so every upload fails with a `storage/*` code

That is current. Since **3 February 2026**, Cloud Storage for Firebase follows
standard Google Cloud Storage rules and a bucket cannot be created without a
linked billing account. The Spark plan no longer includes a storage bucket at
all. So the document-repository upload path — already written, already wired
through `DocumentsView.tsx` and `AssignmentsView.tsx` — is dead code on Spark,
which is why every upload surface offers "paste a Google Drive link instead" as
a fallback.

**Flipping to Blaze turns that existing feature on, at no cost.** That is the
cheap half of the request and it needs no new code.

**2. Video is new construction.** Student-uploaded exams need student accounts,
new Storage paths, new rules, and a submission model in Firestore. None of that
exists. See below.

## What Blaze gives you before you pay anything

The default `*.firebasestorage.app` bucket keeps a monthly no-cost allowance in
`us-central1` / `us-east1` / `us-west1`:

| Resource | Free each month |
|---|---|
| Stored data | 5 GB-months |
| Downloads (egress) | 100 GB |
| Upload operations | 5,000 |
| Download operations | 50,000 |

Firestore, Hosting, and Auth keep their existing free tiers — 1 GiB stored,
50K reads/day, 20K writes/day, and **50,000 monthly active users on Firebase
Authentication**. Student sign-in adds no authentication cost at any roster
size this school will ever have.

## Rates above the allowance

| Meter | Rate |
|---|---|
| Standard storage | $0.020 / GB / month |
| Nearline (30-day min) | $0.010 / GB / month |
| Coldline (90-day min) | $0.004 / GB / month |
| Archive (365-day min) | $0.0012 / GB / month |
| **Download / egress** | **$0.12 / GB** |
| Class A ops (upload, list) | $0.05 / 10,000 |
| Class B ops (download, read) | $0.004 / 10,000 |

Operations are noise at this scale and are ignored in the scenarios below —
a 300-student exam round is a few thousand operations against a 5,000/month
free allowance, and even at full rate it would be under a nickel.

**Egress is the meter that matters**, at 6× the storage rate. Storing a video
for a year costs less than letting three people watch it once.

## How big is a singing exam video?

Everything downstream depends on this one number, so it is worth being
concrete. Typical phone capture, H.264:

| Capture setting | Per minute | 3-minute exam |
|---|---|---|
| 720p | ~30 MB | ~90 MB |
| 1080p30 | ~60 MB | **~200 MB** |
| 4K | ~350 MB | ~1 GB |

The scenarios use **200 MB** as the baseline 3-minute clip. Note the 5× jump
if a student's phone happens to be set to 4K — that setting alone is the
difference between the cheap column and the expensive one, and the student
will not know or think about it.

## The scenarios

### A. Documents only — turn on what's already built

Syllabi, handbooks, forms, assignment attachments. Call it 500 files
averaging 2 MB: **1 GB stored**, well under the 5 GB free. Egress from a
public school site reading PDFs is a rounding error against 100 GB.

> **$0.00/month.** Indefinitely.

### B. One juried exam round — 150 students, 200 MB each

- Uploaded: 150 × 0.2 GB = **30 GB**
- Storage: 30 − 5 free = 25 GB × $0.020 = **$0.50**
- Egress: graded once, student rewatches once → 60 GB, under the 100 GB free = **$0**

> **~$0.50 for the month.**

### C. Quarterly exams, kept for the year — 150 students

Four rounds of 30 GB, accumulating to 120 GB by June. Average balance over
the school year is roughly 65 GB.

- Storage: (65 − 5) × $0.020 = **$1.20/month**
- Egress: 60 GB in each grading month, still under the free 100 GB = **$0**

> **~$12–15 for the school year.**

### D. Heavy but plausible — 300 students, 500 MB clips, 4 rounds, 3 views each

Longer exams, higher bitrate, a second grader reviewing, students rewatching.

- Per round: 300 × 0.5 GB = 150 GB uploaded
- Storage: ~325 GB average × $0.020 ≈ **$6.50/month → ~$65/year**
- Egress in each grading month: 450 GB − 100 free = 350 GB × $0.12 = **$42**, four times a year = **~$168/year**

> **~$230/year, about $19/month averaged.**

### E. No size cap, 4K phones — the number to engineer against

300 students × 1.5 GB, three views each.

- Egress in a grading month: 1.35 TB − 100 GB free = 1.25 TB × $0.12 ≈ **$150**
- Storage by year end: 1.8 TB × $0.020 ≈ **$36/month**

> **$800–1,000/year**, and it arrives as a surprise in whichever month you
> happen to grade.

The spread between C and E is entirely video size and view count. Both are
controllable, and controlling them is cheaper than paying for not doing so.

## The levers, in order of effect

1. **Cap upload size in `storage.rules`, not in the UI.** A client-side check
   is a courtesy; `request.resource.size < 250 * 1024 * 1024` is the only cap
   that actually holds. This single rule is the difference between scenario C
   and scenario E.
2. **Constrain the capture.** A 2-minute limit and a "record at 720p" line in
   the exam instructions cut the bill ~4× versus unmanaged 1080p, and more
   against 4K.
3. **Lifecycle old exams to Coldline or Archive.** Last year's juries are
   never watched. An age-based lifecycle rule moves Standard → Coldline at
   90 days ($0.020 → $0.004, an 80% cut) and Archive at a year. Retrieval
   costs $0.02–0.05/GB if you ever do need one — cheap insurance against a
   grade dispute.
4. **Delete after grading.** If the exam's purpose ends when the grade is
   entered, a retention window drops the storage line to near zero. This is
   also the best privacy answer — see below.
5. **Don't autoplay.** Every incidental view is billed egress. A poster
   thumbnail with click-to-play is worth real money at scale.

## What actually costs you (and it isn't money)

Three things in the current codebase stand between here and student uploads.
These are the reason to treat this as a project rather than a billing change.

### Students have no accounts

Every authenticated path in the app is staff-only: `AuthGate` gates on the
`directors/{email}` allowlist, and `firestore.rules` closes the role set to
owner / director / teacher / assistant via `isKnownRole()`. The public site
has exactly **one** unauthenticated write in the entire codebase —
`plannedAbsences`, created from `src/public/components/PlannedAbsence.tsx`.

Student sign-in is a new subsystem: an identity source (school Google
Workspace accounts are the obvious candidate — the Google provider is already
enabled), a student ↔ Firebase-UID mapping, and a fifth role deliberately
added to `isKnownRole()`. Per CLAUDE.md, until that helper is updated a new
role can access nothing, which is the correct default and also means this
cannot be done halfway.

Cost in dollars: **$0** — 50K MAU free. Cost in engineering: this is the
bulk of the work.

### Storage is world-readable today, and exam videos must not be

`storage.rules` currently reads:

```
match /assignments/{allPaths=**} { allow read; allow write: if isStaff(); }
match /documents/{allPaths=**}   { allow read; allow write: if isStaff(); }
```

`allow read` is unconditional, and `getDownloadURL()` mints a permanent
token URL that works for anyone who has it, forever, with no sign-in. That is
correct and deliberate for syllabi. It is categorically wrong for video of
minors singing.

Exam submissions need their own prefix with a genuinely restrictive rule —
readable by staff and by the owning student only, never by path-guess or
leaked link:

```
match /examSubmissions/{studentId}/{allPaths=**} {
  allow read:  if isStaff() || isSelf(studentId);
  allow write: if isSelf(studentId)
               && request.resource.size < 250 * 1024 * 1024
               && request.resource.contentType.matches('video/.*');
}
```

This also has to be reconciled with the projection model in CLAUDE.md.
That model works because public data lives in separate world-readable
mirror collections (`studentsPublic`, `rosterOverridesPublic`) while the
source collections are staff-only. Exam video is the most sensitive artifact
the app would ever hold — it belongs firmly on the staff-only side, must never
gain a public mirror, and its Firestore submission records must not leak into
`publicMirror.ts`.

Worth confirming the school's FERPA position and parental consent posture for
recordings of minors before building this, not after. That is a conversation,
not a code change, and it is the real long pole.

### Blaze has no hard spending cap

Metered billing with no ceiling by default. Before the first student uploads
anything:

- Set a **budget alert** in Cloud Billing (email at 50/90/100% of, say, $25/month).
- Enforce the size and content-type caps **in the rules**, as above.
- Be aware that the one existing anonymous write path (`plannedAbsences`) is
  rate-limited only by pricing — deferred item #1 in
  `docs/security-recommendations.md` proposes App Check for exactly this, and
  it becomes more compelling once a card is attached to the project.

The genuine hard-stop pattern is a billing-alert Pub/Sub topic triggering a
Cloud Function that disables billing. Cloud Functions themselves require
Blaze and carry a small Artifact Registry / Cloud Build cost — a few cents a
month at this deployment's scale.

## Recommendation

**Split it in two.** They are different-sized decisions wearing the same
question.

**Now, if you want:** enable Blaze. The document repository starts working
immediately with zero code changes and a $0 bill, and it retires the "paste a
Google Drive link" workaround across every upload surface. Set a $25 budget
alert the same day. This is a ten-minute console change with an honest
expected cost of nothing.

**Separately, as a project:** student exam uploads. The billing question is
effectively answered — budget **$15–25/month** and cap uploads so it stays
there. The open questions are student authentication, the privacy rules, and
the school's consent posture for recording minors. Those want a decision
before they want code.

## Sources

- [Firebase pricing](https://firebase.google.com/pricing) — plan comparison and no-cost allowances
- [Cloud Storage pricing](https://cloud.google.com/storage/pricing) — storage classes, operations, egress
- [Firebase Pricing in 2026: What You Actually Pay](https://www.budgetforge.dev/tools/firebase-pricing-2026) — the 3 Feb 2026 Spark/Storage change
- [Google Cloud Egress Pricing: Premium vs Standard Tier (2026)](https://egresscost.com/gcp/) — $0.12/GB internet egress
- [Google Cloud Storage Pricing guide (CloudZero, 2026)](https://www.cloudzero.com/blog/gcp-storage-pricing/) — per-class rates

Prices are list rates for `us-central1` as of August 2026 and change without
much announcement. Re-check before committing to a budget line.
