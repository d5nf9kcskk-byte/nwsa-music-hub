# NWSA Music Hub — Presenter's Outline
### Your copy. Not for the room.

**Audience:** the Dean; the Wind Ensemble director; the Jazz Ensemble director;
the High School Choir director. Four people, one table.

**Your three jobs, in order of importance:**
1. **Why this exists.** Not "here's an app" — "here's the problem it removes."
2. **How to do their job in it.** Six things, shown live, not described.
3. **Why it beats the old way.** Structural reasons, not sales numbers.

**Format:** ~30 minutes of content, ~10 minutes of questions, three built-in
pause points so questions land *inside* the talk instead of piling up at the end.
23 slides. Most are one headline and three lines — you carry the content, the
slide holds the point still.

---

## ⚠ Read this first — every assumption I made

I built these materials from the **code and documentation in this repository**,
not from your calendar, your enrollment, or your meeting. Everything below is a
place where I had to assume. Fix any that are wrong before you present — each
one is marked in the script too.

| # | Assumption | Where it shows up | What to do |
|---|---|---|---|
| A1 | **Names.** I don't know the Dean's or the directors' names. | Slides 1, 21; script throughout | Replace `[Dean]`, `[WE director]`, `[Jazz director]`, `[Choir director]` |
| A2 | **40 minutes, in a room, with a screen and Wi-Fi.** | Whole plan | If it's 15 min, use the cut list below. If there's no screen, use the printed handout + your phone passed around |
| A3 | **You are the Owner account.** Code seeds `nwsaorchestras@gmail.com` as a founding director, and the Owner role is the only one that can add people. | Slides 18, 21 | Confirm you can open **Directors** in the app. If you can't, you can't grant access live |
| A4 | **The choir director may already have an account.** The seed script lists a second founding email (`g.elgarresta@gmail.com`, noted in code as the chorus director). I can't see live data to confirm it's still there. | Slide 21 | Check the Directors screen *before* the meeting so you don't promise access you have to go fix |
| A5 | **Teams / email delivery is NOT verified.** The app *queues* an outbound notification for urgent posts (`notifyQueue`). Actual delivery needs a Power Automate flow running outside the app (`docs/POWER-AUTOMATE-RELAY.md`). I could not verify it is switched on. | Slide 13 | Either confirm it's live and say so, or say "in-app banner today, Teams relay is the next step." **Do not promise a text/Teams blast you haven't tested.** |
| A6 | **No time-savings numbers.** I have no measurement of how long the old way took. Nothing in these materials claims minutes saved. | Slides 9, 20 | The arithmetic on slide 9 is design math (taps = absences), not a study. Keep it that way |
| A7 | **Live student counts.** The repo holds a seed roster and a 2025-26 baseline import; live enrollment lives in Firestore, which I can't read. | Slide 9 | Say "an ensemble of *about* eighty" or open the real roster on screen and read the number off it |
| A8 | **The "before" story.** The one documented fact is that this replaced a **Notion-based workflow** whose mobile interface couldn't do fast tap-to-mark attendance; the first roster was imported from that Notion workspace and from a spreadsheet export. Anything else about the old way — paper, group texts, whiteboards — is **your** memory, not mine. | Slide 3, 20 | Fill in the blanks on slide 3 with what actually happened. Say it in first person: "here's what my week looked like" |
| A9 | **Cost.** The setup documentation uses GitHub Pages and Firebase's free plan. Free tiers depend on usage and vendor terms. | Slide 19 | Say "no license, free tiers as configured" — don't say "free forever" |
| A10 | **The site is live.** I confirmed `https://d5nf9kcskk-byte.github.io/nwsa-music-hub/` responds today. | Slide 6 | Load it once before you walk in |

---

## Before you walk in — 10-minute checklist

- [ ] Open the public site on the screen: **d5nf9kcskk-byte.github.io/nwsa-music-hub**
- [ ] Open the Director Panel in a second tab: same address + **/director**, signed in
- [ ] Open **Directors** (Owner only) and note who's already on the list → fixes A3, A4
- [ ] Pick **one real rehearsal** on the calendar to use for the roll demo (today's, ideally)
- [ ] Print: the **audience outline** ×4, and one **QR kit** page (Print from the QR Kit screen) to hand around
- [ ] Decide the honest sentence about Teams/email (A5) and write it on this page: ____________________
- [ ] Phone charged — the roll demo is a phone demo, not a laptop demo
- [ ] Fallback: if Wi-Fi dies, the slide deck alone carries the talk. Say "I'll show you live afterward."

---

## Run of show

| # | Slide | Minutes | What you're actually doing |
|---|---|---|---|
| 1 | Title | 0:30 | Names, one sentence of purpose |
| 2 | Why we're here | 0:30 | Set the three promises so they know when you're done |
| 3 | The problem | 2:00 | **Your story.** The only emotional beat in the talk |
| 4 | One place, two doors | 1:30 | The single mental model everything else hangs on |
| 5 | The rule | 1:00 | "You set it once. Everyone sees it." Say it slowly |
| 6 | What families see | 2:00 | **LIVE.** Home → one concert → My Schedule |
| 7 | Your day starts here | 1:30 | **LIVE.** The Today screen |
| 8 | Take Roll | 3:00 | **LIVE, on your phone.** The centerpiece |
| 9 | Why that's faster | 1:30 | The arithmetic. Then stop talking |
| 10 | Roll answers questions later | 1:30 | Receipt, history, follow-ups, export |
| — | **PAUSE 1** | 2:00 | "Questions on roll before I move on?" |
| 11 | When the day changes | 2:00 | Schedule Change + Close a day |
| 12 | Subs & pull-outs | 1:30 | The base roster never gets damaged |
| 13 | Announcements | 2:00 | Three levels, Spanish, scheduled. **Honest about Teams (A5)** |
| 14 | Repertoire → program | 2:00 | **LIVE.** Show a printed program |
| 15 | Assignments · Documents · Seating | 1:30 | Fast. Don't linger |
| 16 | Getting families in | 1:30 | Hold up the QR page |
| — | **PAUSE 2** | 2:00 | "Anything there you'd need for your ensemble?" |
| 17 | Who can see what | 2:00 | **Dean's slide.** Be precise, not reassuring |
| 18 | Who can do what | 1:30 | Four roles. Personnel Assistant is the surprise win |
| 19 | Where it lives, what it costs | 1:00 | Dean's second question |
| 20 | Old way → new way | 2:00 | The efficiency argument, structural |
| 21 | What I'm asking of you | 1:30 | Concrete. Names. This week |
| 22 | Where to get help | 0:30 | Start Here + the glossary + your email |
| 23 | Questions / open items | 8:00+ | Read the open items out loud. Then listen |

**Content ≈ 30 min · pauses 4 min · Q&A 8–10 min.**

### If you only get 15 minutes
Keep: **1, 3, 5, 8, 9, 11, 17, 20, 21.** Cut everything else and say
"the rest is in the handout, and there's a Start Here page in the app."
Do not cut slide 8 — if they don't see roll working on a phone, nothing else lands.

### If the Dean can only stay 10 minutes
Front-load: **3, 5, 9, 17, 19, 20.** Those are the six that answer *their*
questions (problem, model, efficiency, privacy, cost, comparison). Then let them
go and run the how-to portion with the three directors.

---

## The three pause points — why they're where they are

1. **After roll (slide 10).** Roll is the thing they'll do 180 times a year. If
   there's doubt here, everything after it is noise. Expect: "what if I mark the
   wrong person," "what if I have no signal," "who else can see it."
2. **After the feature sweep (slide 16).** Each director has one thing their
   ensemble needs that the others don't — jazz combos, choir sectionals by voice
   part, a wind ensemble seating audition. Let them ask it here.
3. **At the end (slide 23).** The Dean's questions usually arrive last and are
   about risk, not features.

If nobody speaks at a pause, ask a specific person a specific question —
*"[Jazz director], where would this break for you on a combo day?"* — not
"any questions?"

---

## Live demo scripts (exact taps)

Rehearse each once. Each is under 60 seconds.

**Demo A — the family view (slide 6)**
1. Home page. Point at the date and today's events.
2. Point at where the **red "schedule change today"** strip appears (it's only
   there when something actually changed — if nothing changed today, say so:
   *"no strip means today is normal, and that's the whole point"*).
3. Tap **My Schedule** → **Lookup** → type three letters of a real student's
   name → their page. Say: *"no login, no password, no app store."*

**Demo B — the Today screen (slide 7)**
1. `/director` → **Today**.
2. Read one card out loud: ensemble, time, room, **"N expected"**, and the roll
   receipt line — *"roll not taken yet"* or *"✓ Roll taken 2:14 PM · 3 absent."*

**Demo C — taking roll (slide 8) — do this on your phone**
1. From a Today card, tap **Take Roll**.
2. Show the list. Say: *"everyone on this list is present. I don't touch them."*
3. Tap **Absent** on one student. Tap **Late** on another. Tap **Lesson** on a
   third → the time window sheet appears → point at the **required reason** field
   → save.
4. Point at the top strip: counts, and *"tap a count to filter."*
5. Tap **Finish roll — summary** → show absent/late list, the **Copy** button,
   and the phone/email links.
6. Say: *"that's the whole job. Three taps, because three people were out."*

**Demo D — the concert program (slide 14)**
1. Public site → a concert → **Program**.
2. Point at the masthead: **New World School of the Arts**, the piece order, the
   movements, the runtime total.
3. Say: *"you set the order in the app; this page is generated from it."*

---

## Questions you will get, and honest answers

**"What if I tap the wrong student?"**
Tap the same button again — it clears. The list deliberately doesn't reorder or
hide rows while you're marking, so the next tap can't land on the wrong person.

**"What if there's no signal in the room?"**
The app is installable and keeps an offline shell, so it opens. Saves need a
connection; you get a Saving…/Saved cue in the header and a retry tray if a write
fails. ⚠ Don't oversell this — if the room is a dead zone, test it there first.

**"Can students see attendance?"**
No. Attendance, progress notes, contact details and private lessons are readable
only by signed-in staff, enforced by the database's own security rules — not just
by hiding a page.

**"Can a parent see another family's information?"**
Contact details, no — those are staff-only. But be precise: student **names,
instruments, grade and ensemble membership are public**, because the public site
has a name lookup so a student can find their own schedule without an account.
That's a deliberate trade. If the Dean wants that changed, it's a real
conversation, not a checkbox. (See slide 17.)

**"Do I have to use all of it?"**
No. Roll and the calendar carry themselves. Repertoire, documents, seating and
assignments are there when you want them.

**"What happens when I leave / when someone new arrives?"**
The Owner adds or removes a Google account on the Directors screen. It takes
effect immediately — no code change, no waiting on anyone.

**"Who's fixing it when it breaks?"** ⚠ You. Say so plainly and give them the
email. Don't imply an IT department.

**"Is this replacing [existing district system]?"** ⚠ I have no information
about district systems. Don't answer this one from the slides — say what's true:
this is the music department's own working tool.

---

## Tone notes

- Say **"New World School of the Arts"** in full at least once. Never any variant.
- The app is the **NWSA Music Hub**. The old name "NWSA Director" is retired.
- Don't demo features you haven't used yourself this week.
- When you don't know, say "I don't know — I'll find out by Friday," and write it
  down in front of them. That single behavior will buy more adoption than any slide.
- Resist showing everything. Two directors will adopt from the roll demo alone.
