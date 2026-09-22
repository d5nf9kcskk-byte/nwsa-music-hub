# Session note — 2026-09-22: the answer key you can set, and grading a test where you grade everything else

Reported by the director *during* the first online test, with students mid-exam:

> "In the survey music history exam 1 we created, you did not allow me to say
> in the key which answers were to the 3 aural excerpts they heard. I have kept
> track, but now need to do that part manually. I should have been able to tell
> you directly in the app what the answers were so you could at least grade
> those automatically since they are multiple choice."

> "Also when they are done, will I be able to view and give them a grade
> directly in the same line, just like the playing exams? I need to be able to
> see their writing, give a grade and have it added together for a final grade.
> … and can it be done right now while they are taking the exam?"

Two separate holes, and the second question — can it ship mid-exam — has its
own answer worth writing down.

## The exam in question

`assignments/TjSAik4MtravU9lEDOdp`, "Survey Music History 1 - Exam 1", a
Written Test, open at the time. Five questions selected out of a 30-question
bank (`quizSelection: ['L1','L2','L3','S3Q2','S6Q1']`), 20 points each:

| id | kind | what |
|----|------|------|
| L1, L2, L3 | choice | "Excerpt 1/2/3" — **all three share one option list**: Anonymous *Two Graduals*, Hildegard *Columba aspexit*, Bernart de Ventadorn *Can vei la lauzeta mover* |
| S3Q2 | text | Gregorian chant as a Frankish political project |
| S6Q1 | text | troubadours vs. trouvères |

That table is the whole problem. Three questions, one option list, and which
excerpt is which is a fact about **what was played in the room that morning**.

## 1. The key was write-once, and the app had no opinion about it

`splitQuizFile()` **requires** an `answer` on every choice question and refuses
a file without one. So L1/L2/L3 were never "unkeyed" — they carried whatever
the file was authored with, which for three interchangeable excerpts is a
guess. The director's only remedy was to re-upload the whole test file, which
the panel disables while a test is open. Hence "I have kept track" on paper.

`setQuizAnswer(assignmentId, questionId, answer)` writes one question's answer;
the panel's new **Answer key** list sets or clears each choice question from a
dropdown of its own options. Two details that are not decoration:

- **The write is a `setDoc(..., { merge: true })` with a one-key `answers` map,
  and clearing rides as `deleteField()`.** Firestore's merge deep-merges maps,
  which is normally the trap — here it is exactly the wanted behaviour: this
  question's answer replaced, every other question's untouched. An `undefined`
  would be dropped on the way out and the old answer would survive the clear.
- **Clearing is a real state.** An unset answer scores as `unkeyed`, which
  `scoreQuiz` has always treated as not-yet rather than wrong.

### The property that made this safe to ship mid-exam

**A `quizSubmissions` doc stores the student's ANSWERS and never a score.**
Scoring is computed in the browser, on read, every time. So changing the key
re-scores every test already submitted — including ones taken before the change
landed. The director does not have to grade the listening section by hand at
all; he sets the key when they are done and thirty tests re-score at once.

Do not ever cache a score onto a submission. It would freeze the first,
possibly wrong, key onto every test taken before someone noticed.

## 2. The row knew a test had arrived and showed none of it

`GradeRow` already received `testSubmission` and used it for exactly one thing:
a chip reading "test sent 10:32". The writing itself lived in a second list at
the bottom of the page, in `QuizPanel`. That is the read-a-name-twice shape
`#exam-rubric` rebuilt the video row to kill, reappearing for written tests.

A test now grades through **the same rubric machinery a playing exam does**,
rather than growing its own totals:

- `quizGradeLines(quiz, answers?)` — each section's choice questions collapse
  into **one** line (`auto:<sectionId>`, worth the section's choice points);
  every written question is its own line worth its own points.
- `quizAutoPicks(quiz, key, answers)` — what the key already scored, as a
  starting value for those auto lines.
- `quizLineNotes(quiz, answers, key)` — what to show under each line: the
  student's writing verbatim, and under an auto line the working behind its
  number.

`GradeRow` gained two props, `seedPicks` and `lineNotes`, and nothing else. One
total, one Confirm, one `RubricScore[]` snapshot — there is no second sum that
could disagree with the first.

These functions are shaped structurally (`id` / `label` / `max`) instead of
importing `RubricCriterion`. `src/shared/quiz.ts` is shared with the public
site and stays free of the director layer; TypeScript accepts the shape.

### The three refusals

All pinned in `quiz.selfcheck.ts`. Each one is a wrong grade if it goes.

- **A section holding ANY unkeyed question seeds nothing.** Not "seed it with
  what the rest of it earned". A line arriving at 40/60 because one excerpt has
  no answer set is a grade somebody confirms without stopping to check. Blank
  blocks Confirm and sends the director to the key — same fail-closed posture
  as `lessonGradeValue` and `rubricScores`.
- **A choose-N section raises lines only for the questions that student
  answered.** A question they were told they could skip must not sit on their
  sheet as an unscored line inflating their denominator. This is why
  `quizGradeLines` takes answers at all; called without them it returns every
  line the test can produce, which is what the CSV's columns need.
- **A filed grade is never rewritten underneath a director.** Fixing the key
  after grading makes the row *say* the scored part has moved (`autoStale`);
  re-scoring is the director's press. Same contract as `rubricChangedSince`.

One thing found while wiring it: `nextToGrade()` looked for a **video** to
decide who was next, so Confirm on a written exam collapsed the row and left
you hunting for the next name. It now counts a test submission too.

## 3. Shipping it during the exam

Nothing under `src/public/` was touched — the student page, the form and the
submit path are byte-identical. A new build does not take over an open tab
(prompt-flow SW, `#pwa`), and the public form drafts answers to `localStorage`
anyway, so even a reload mid-exam loses nothing.

Landed as `8cfdd11`, notes as `71b1e2c`. Both deploys green, neither
superseded; confirmed by pulling the served `DirectorApp-*.js` and `index-*.js`
and grepping for the new strings, per the "green locally is not live" rule.

## 4. A second session, an hour later

`f2f4007` landed on top, from a parallel session, and is also live. It is a
real improvement on this work:

- `reviewAnswers()` — the ONE join behind "what was asked, what this student
  put, what the key says". `quizLineNotes` and `quizResultsToCsv` both build
  from it, so a screen and a spreadsheet cannot disagree about somebody's
  answer.
- A missed line now names the **right** answer as well as the chosen one
  ("✗ Excerpt 2: Hildegard — correct: Bernart de Ventadorn"). With three
  excerpts sharing one option list, that is exactly where you cannot guess.
- The results sheet carries the key in its **headers** rather than a third
  column — it is the same for every student, so repeating it down thirty rows
  costs a column per question and buys nothing.

It keeps every posture above: `unkeyed` is not wrong, `blank` is not wrong, and
a right answer's line does not bother repeating the key.

## Ordering trap, for whoever uses this next

**Set the Answer key before grading.** The other order works — the row flags it
and you re-score — but it is a second pass over the roster.

## Not verified

Nobody has opened this in a browser. The grade sheet and the test panel are
staff screens behind Google sign-in, and `preview_start` ignores worktrees.
Evidence is the build, `tsc`, all 62 CI self-checks, and the deployed-chunk
grep. **The layout is unseen, at every width** — and a test question is a whole
sentence as a rubric line label, not a word like "Intonation", which is the
kind of thing `#one-nav` exists to warn about. Look at 375×812 as well as a
laptop before relying on it in a hurry.

Also left standing: `QuizPanel`'s own submission list at the bottom still lists
the same people the roster rows now cover. It was kept because it holds
delete-a-submission and surfaces submissions from people off the roster — but
it is the same two-lists shape this change removed from the row, and it is a
candidate to fold in later.

## Files

- `src/shared/quiz.ts` — `quizGradeLines`, `quizAutoPicks`, `quizLineNotes`,
  `unkeyedQuestions`, `QUIZ_AUTO_PREFIX`; `reviewAnswers` (f2f4007)
- `src/shared/quiz.selfcheck.ts` — the three refusals, plus the CSV pins
- `src/director/hooks/useQuiz.ts` — `setQuizAnswer`
- `src/director/assignments/QuizPanel.tsx` — the Answer key list; the key is
  now a prop, lifted so one listener serves the panel and the rows
- `src/director/assignments/GradeRow.tsx` — `lineNotes`, `seedPicks`,
  `autoStale`
- `src/director/assignments/AssignmentsView.tsx` — quiz-derived criteria,
  per-row answers, `nextToGrade`
- `src/director/uiUpdates.css`, `src/director/assignments/quizPanel.css`
- `CLAUDE.md` — the two new bullets under `#online-test`
