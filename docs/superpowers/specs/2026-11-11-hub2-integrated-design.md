# Hub 2.0, integrated: the glass, Ask, and quiet pages

**Date:** 2026-11-11
**Status:** draft 2, after cross-examination by four reviewers (students and
families, the director's daily work, engineering, privacy and red team).
Waiting on the director's go. Nothing here is built.

**Asked for by the director, 2026-11-11:** simplified, easier to navigate,
and a search that brings each student their own information. "It should not
be dependent on AI, but it should feel like AI." Every page: fewer buttons,
less text, less of everything until it is asked for. Especially the director
side. "Solid from the nuts and bolts all the way to the user experience."

## 1. What Hub 2.0 is now

Three threads, one release.

1. **The look.** Glass panels over a drifting colour field, one liquid
   dissolve between pages. Built, owner preview only, approved 2026-11-11.
   Goes to everyone Sun Dec 13, 2026 by one word in the org config.
2. **Ask.** The search bar answers questions from the Hub's own records,
   for the person holding the phone. New.
3. **Quiet pages.** One title and one main action per page. The rest sits
   in fold-down rows and one "More" list until asked for. New, both sides,
   staff first.

Under them: what already shipped to everyone (Spanish forms, the student
page leading with now / next / due, Send to my other phone, typed changes
and receipts on Change a Day, lesson attachments, staff phone alerts), and
what is built and waiting on a date (family phone alerts Jan 3, 2027; the
Spanish banner drafter, off; accounts and a native app, spring).

## 2. Recode verdict

**No ground-up rewrite. One extraction, then edits in place.**

The engineering review tested this against the code. The write side (rules,
public projections, feed contracts, service worker, 88 self-check steps)
stays. The large files and the layered stylesheets are tolerable debt that
does not block this work; consolidating them before Dec 13 would add risk
and change nothing a person sees.

The one real recode: **the logic for "what does this student have" lives
inside the student page component** (`PublicSchedule.tsx`), with three more
hand copies (the staff search's "where are they now", the staff student
panel, and the calendar feed script, whose copy already disagrees with the
page for academic classes and for one kind of pull-out). Ask would be a
fifth copy. So:

- **`src/shared/studentDay.ts`**: one pure module that takes a student, a
  date range and the public records, and returns that student's events,
  the pieces they play on each, booked master-class slots, lessons and
  assignments due. The student page, Ask, Home's Now card and the feed
  script all call it. A self-check pins that the page and the feed agree
  for every student in the fixtures.

Everything else is edited in place. The staff shell and the Event form are
not rebuilt: self-checks pin their class names, and wrapping existing field
groups in folds is safer than rewriting them.

## 3. Ask

### 3.1 Where it lives

The search pill in the public header becomes the Ask bar, and Home's hero
carries the same field. It opens the overlay Find Anything uses today. Not a
tab, not the landing page. Home keeps its zero-tap strips (cancelled, moved,
concert tonight) and announcements stay first under the hero (the director's
Oct 16 decision).

### 3.2 Who is asking

`src/shared/identity.ts` already remembers the students saved on this phone
(on the device only; no account; nothing sent anywhere).

- **One saved:** answers are for them.
- **Several saved (a parent):** one answer per child, grouped under each
  name. No "first child": the saved order is not stable.
- **Nobody saved, a "my" question:** the answer area asks "Who is asking?"
  using the same lookup and the same "Is this you?" confirm card My
  Schedule uses. Also offered: "Which group?" chips and "Just visiting",
  for an audience member or a first visit from a QR code.
- **A general question** never asks for a name.
- The line above every answer names who it is for and carries "Not you?",
  which switches or forgets. Asking as someone else once does not save
  them.
- A saved student who is no longer active (archived, or an id that no
  longer exists) is treated as nobody saved. Never "nothing today".
- The engine never picks a student out of the typed words. Looking someone
  up stays the lookup's job, so nothing is exposed that is not exposed
  today.
- An org with public student info switched off gets general answers only.

### 3.3 How it understands, with no model

All on the device, loaded only when the overlay opens:

1. **Date words** from a small closed table, English and Spanish, with the
   spellings people actually type: today, tonight, tomorrow, tmrw, 2day,
   weekday names and short forms, this week, next week, hoy, mañana,
   manana, el viernes, esta semana. A week is a range. A date with a number
   in it ("dec 9") is read by a tiny pattern. The general-purpose date
   library the staff side uses is NOT used here: tested, it turned
   "Radetzky March" into March 1 and "Midnight Ball" into 12 am.
2. **Intent** from one word table, about fifteen: my day, what am I
   playing, next concert, call time, what to wear, what is due, my lesson,
   where, is it cancelled, is there school, forms, announcements, check in,
   seating, report an absence, contact.
3. **Named things** (a group, a piece, an event): matched against the
   words left over after the date, intent and filler words are removed,
   allowing one typo. Matching the whole sentence finds nothing, which is
   why Find Anything fails on a sentence today.
4. **Defaults:** a date alone means my day. A name alone means that
   thing's card. "When is the Nutcracker" answers about that concert, not
   the next one.

The result is one typed object: `{ intent, dateRange, who, entityIds }`.

Measured on 30 realistic questions (messy, misspelled, half Spanish): draft
1 got 12 right, 10 wrong with confidence, 8 no answer. With the four points
above: about 28 right, 0 wrong. That corpus is the self-check, and wrong
with confidence must stay at zero.

### 3.4 How it answers

`answerAsk(query, data)` is a pure function over `studentDay.ts`. It
returns:

- **One plain sentence shaped like the question**, built from a template
  and the record, never free-written: "Yes. Symphony Orchestra, tomorrow
  2:10, Room 2210."
- **Cards beneath it**, the same ones the pages use: the event (time,
  room, status exactly as stored, free-text repertoire and notes), the
  pieces this student plays, an assignment, a lesson. Every card and every
  piece is a link.
- **"Also matching your words"** underneath, so Ask is never worse than
  Find Anything.

Four states, never confused:

| State | Shows |
|---|---|
| Loading | The question, and "Looking…". Never "nothing". |
| Offline, or records not arrived | "No connection. Here is the last page you had open." Never "nothing". |
| Understood, nothing posted | "No music is listed for this rehearsal yet." Then, labelled **Preparing for**, the pieces on that group's next concert. |
| Not understood | "I do not have an answer for that", the keyword matches, the starter chips. |

The third state matters most. Live data, Oct 26 to Nov 25: **22 of 91
rehearsals have any music listed**, and of 20 coming concerts, 3 have a
call time and 2 a dress note. The director's own test sentence would
otherwise return bare cards three days in four.

Rules that do not bend:

- A cancelled or moved rehearsal shows the director's own note
  (`changeNoteFor`). The engine never words it.
- Ask reads through the same publication filters the pages use: scheduled
  announcements and assignments stay hidden until they post, invite-only
  forms are skipped, and the concert tally (which a student unlocks with a
  school email) is only ever a link.
- Nothing typed is logged, stored or sent. No recent-questions list.

### 3.5 Why it feels like AI

- It answers in a sentence, in the question's own shape.
- Starter chips chosen by the moment lead the overlay, so most people
  never type: "What am I rehearsing today?", "When is call time?" on a
  concert day, "What is due?".
- Suggestions appear while typing. The answer appears on Go, on a tapped
  suggestion, or after a short pause (answering on every keystroke
  flickers: "fri" is Friday, "frid" is nothing).
- Follow-up chips change one thing: "Tomorrow", "This week".
- It says who it is answering for, and says so when it does not know.

### 3.6 Data and cost

The overlay mounts its listeners only while open. A "my" answer reads what
My Schedule reads. At current prices that is a fraction of a cent per
thousand questions.

Home's Now card must not make every Home visit load the whole roster. It
reads two small things instead: the saved student's own public record and
the pull-outs filed for that student. The self-check pins that this short
path gives the same answer as the full one.

The shortcut of trusting the group list saved on the phone is rejected: it
is a snapshot, and it would miss pull-outs, subs, excusals and booked
master classes.

### 3.7 The boundary

- The engine is `src/shared/ask/`, pure, with no state kept between calls.
- It imports only an allowlist of public reads. A self-check greps that.
- Staff questions ("who is out today") typed on the public side return "no
  answer", and the self-check pins that too.
- No rules change. Every collection Ask reads is already world-readable.

### 3.8 Staff Ask

Deferred to after Dec 13. On Nov 3 the director put any staff assistant in
spring; this one has no model in it, but it is still a decision (section
9). When built, its intents live in `src/director/ask/` and read through
the staff's own listeners, so the rules still decide what each role sees.

## 4. Quiet pages

### 4.1 The rule

1. One title. One main action.
2. Everything else is a **Fold** (a row with a small arrow on its left;
   tapping it opens the content underneath) or sits in the page's **More**
   list (a Fold holding a plain list of actions, each with a few words
   saying what it does).
3. **A closed fold says what is inside it.** A Filter fold prints the
   values set ("Concerts, Required"), not a count. A fold with a badge
   shows the badge. A fold opens by itself when it holds an error, when the
   current page is inside it, or when its content is needed (the Concert
   day fold on a concert).
4. No help paragraph by default. Tips show for a new person until "Hide
   tips" is tapped once on that device.
5. The group picker is never folded. It already shows its value in one
   control, and links pre-set it.
6. Set-up-once tools (seed, import) leave the daily screens for one "Setup
   and tools" page.
7. **Never inside a closed fold:** cancellation and change strips, the
   concert check-in window, forms owed, consent checkboxes, "Not you?" and
   Forget, and the control that turns phone alerts off.

### 4.2 The parts

- `Fold`: the native `<details>` element, arrow on the left, one new
  stylesheet, both sides. It opens without animation, and the new
  self-check pins that (the look's own motion check does not cover it).
- `DirPageHead`: title, one main action, the More list.
- VoiceOver and print behaviour of a closed fold are checked in the iPhone
  pass.

### 4.3 The staff shells (there are four)

- **Director shell:** the dark "Director Panel" banner goes. The help
  paragraph becomes tips. Header: logo, title, Search, Menu; theme, colors
  and season move into the menu. No "+" in the header: the round button at
  the bottom right is already the main action on six screens.
- **Menu:** seven on top (Today, Take Roll, Requests, Calendar, Move a
  Student, Change a Day, Rotations). People (with Who's Out), Library,
  Groups and Setup are folds. A closed fold shows its summed badge
  (Approvals, Messages) and opens for the page you are on. One list, both
  the rail and the drawer (#one-nav), and the self-check is extended to
  cover the folds.
- **Teacher, classroom and assistant shells:** keep their short tab rows
  and one line saying what they are scoped to. They get the Fold and page
  head on their screens, nothing else.
- **Phone bottom bar:** after Dec 13 (section 8). It collides with six
  fixed things at the bottom of staff screens, Finish Roll among them.

### 4.4 The loud staff screens

| Screen | Always showing | Folds and More |
|---|---|---|
| Calendar | month arrows, group picker, the round add button | Filter (type, required, college; prints values). More: list view, subscribe, my calendar, import, Quick Add. Seeds to Setup. |
| Roster | search, group picker, the round add button | View fold (prints "Archived" when set). More: who's out, import, locations. |
| Event form | type, who, title, date, start and end, location | Folds: Repeats (closed line says "Mon, Thu until Dec 12, 14 meetings"); Individual performers; Concert day (open on a concert); Program (open on a concert); Audience and credit; Status and change note (opens itself when not Scheduled); Notes. An error inside a fold opens it. |
| Gradebook | quarter, report, as-of date, class tabs, Copy | "How this works". More: fill, add column, penalty. |
| A form's responses | state line, Copy link, "One more day" when due | More: the rest. |
| Change a Day | date, the typed box; quick options when closing a day or the day already has changes | quick options otherwise; list, month. |
| Take Roll | date, the day's blocks. **The roll itself is not touched.** | More: any group, list, tracker, move a student. |
| Move a Student | by student or by date, search, group picker | sort |
| Requests | Waiting (n), Answered | Filter (prints "My groups, All") |
| Tracker | group, range, Export | none |

The remaining staff screens take the same parts after Dec 13.

### 4.5 The public side

- **Home:** hero with the Ask bar; announcements (two); alert strips; a
  Now and next card for the saved student, or today's full list when
  nobody is saved; one "Next concert" row, always; then folds for Coming
  up, Ensembles and classes, and More. Every fold label carries its first
  item ("Coming up · Wind Ensemble, Thu 2:10").
- **A student's page:** check-in strip and forms owed stay on top; Now and
  next; Today; then folds for Lessons, Assignments, My parts, Upcoming,
  Concert tally.
- **Menu:** Resources becomes a fold.

### 4.6 The check

The contact-sheet script photographs every routed page. It gains the Ask
overlay, the event drawer, one open fold per page and the three scoped
shells, and prints a count of buttons above the first content, before and
after. The new self-check pins: no help paragraph in the shell, a Fold has
no transition, `DirPageHead` takes at most one main action.

## 5. How this fits what was already planned

| Already planned or approved | What happens to it |
|---|---|
| Glass and the one dissolve | Unchanged. The new parts are glass because they are shared parts. |
| Now card (mockups) | **Kept**, built here as Home's and the student page's first card and Ask's "today" answer. Its progress bar updates each minute with no animation. |
| Tonight card with countdown (mockups) | **Kept**, text countdown, no animation. |
| The "owed" card (mockups) | **Kept**: forms owed, never folded. |
| Week strip, concert hero, instrument badges (mockups) | **After Dec 13**, the director's call (section 9). |
| Celebrations, the eight motions | **Retired** on 2026-11-10 with the motion. Stays retired. |
| Staff bottom bar ("Alive" piece 3) | **Kept, moved to January.** |
| Cross-examination: "search is the assistant, not a chat tab" | This is that. |
| Cross-examination: seven verbs on top | This is that, with Rotations kept. |
| Cross-examination: no model writes "cancelled" | Kept. No model anywhere in Ask. |
| Sept 4 "Ask · Today · Me" | Its tier zero only. No hosted model, no shell-level store. |
| Dec 13 flip | Unchanged. Section 7 says what rides with it. |
| Family alerts Jan 3, drafter off, accounts and native in spring | Unchanged. |

## 6. Nuts and bolts found on the way

- `SearchOverlay.tsx` carries its own copy of `fuzzy.ts`, and closes when a
  text selection is released outside the panel. Both fixed with Ask.
- The feed script's hand-copied student logic disagrees with the page in
  two cases. Fixed by `studentDay.ts`. Whether any live feed is wrong today
  is checked first, read-only.
- PR #225 (upload recovery) touches the same shared files as Ask and lands
  first. #223 is 25 lines. #226 reports that 88 of 172 student ids are
  still name-shaped; if those are migrated, phones holding an old id fall
  back to "Who is asking?", which 3.2 already handles.
- The demo orgs share this code. Quiet pages reach them too; Ask follows
  each org's public-student-info setting.
- Every ship that changes what people see carries its own What's New
  entry, not only the flip.

## 7. How changes arrive

Two kinds of change, treated differently.

- **Things that disappear** (the banner, help paragraphs, seed buttons,
  duplicate buttons) go live as each is ready. Nobody has to relearn
  anything.
- **Things that move** (the menu folds, Calendar's top, the Event form's
  folds, Change a Day) are built behind the same owner preview as the
  look, so the director sees them on Sundays and every teacher gets them
  once, on Dec 13, with a single "what moved" note.

## 8. Order of work (the director checks on Sundays)

Concerts in the window, to be confirmed against the live calendar: Nov 16,
Nov 30, Dec 3, Dec 9, Dec 10, Dec 12. No merges on those days.

| By | Ships |
|---|---|
| Sun Nov 15 | `studentDay.ts` with page and feed agreeing. Ask, English and Spanish, in the owner preview. Nothing changes for anyone else. |
| Sun Nov 22 | Ask to everyone, if the director says so. `Fold` and `DirPageHead`. Staff removals live: banner, tips, seeds to Setup, Roster, Requests, Tracker, form responses. |
| Sun Nov 29 | Home and the student page, with the Now and Tonight cards. Gradebook, Move a Student. |
| Sun Dec 6 | In the preview: menu folds, Calendar, Event form, Change a Day. iPhone pass. Contact sheets, before and after. Then a freeze. |
| Sun Dec 13 | The look and the moved things, for everyone. |
| January | Phone bottom bar. Staff Ask. The remaining staff screens. Week strip, concert hero, badges if kept. |

## 9. Decisions for the director

1. **Rehearsals with no music listed** show "Preparing for" and the next
   concert's pieces. Recommended: yes.
2. **Ask goes to everyone Nov 22**, after one Sunday in the preview.
   Recommended: yes.
3. **Removals now, moves on Dec 13** (section 7). Recommended: yes.
4. **Staff Ask and the phone bottom bar in January.** Recommended: yes.
5. **Week strip, concert hero, instrument badges:** January, or retired.
   Recommended: January, decided after the flip.
6. **The questions people really type.** The corpus starts from 30 the
   review wrote. Any the director adds in his own words, or collects from
   students, go straight into the self-check.
