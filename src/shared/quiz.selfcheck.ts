/**
 * Pins online tests (#online-test). Run:
 *   npx tsx src/shared/quiz.selfcheck.ts
 *
 * A wrong answer here is either a leaked answer key or a wrong grade, so each
 * assertion names which of the two it guards.
 */
import {
  QUIZ_TEXT_MAX, QuizFileError, cleanAnswers, latestPerStudent, nameKey, parseAnswers,
  quizResultsToCsv, quizTotalPoints, scoreQuiz, selectedQuiz, splitQuizFile, type QuizSubmission,
} from './quiz.ts';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

const allIds = (q: { sections: { questions: { id: string }[] }[] }) =>
  q.sections.flatMap(s => s.questions.map(x => x.id));

const FILE = {
  sections: [
    {
      id: 'listening', title: 'Part I · Listening',
      questions: [
        { id: 'L-A', kind: 'choice', prompt: 'Excerpt A', options: ['One', 'Two', 'Three'], answer: 'Three', points: 6 },
        { id: 'L-B', kind: 'choice', prompt: 'Excerpt B', options: ['One', 'Two', 'Three'], answer: 'One', points: 6 },
      ],
    },
    {
      id: 'short', title: 'Part III · Short answer', choose: 2,
      questions: [
        { id: 'S1', kind: 'text', prompt: 'First?', points: 20 },
        { id: 'S2', kind: 'text', prompt: 'Second?', points: 20 },
        { id: 'S3', kind: 'text', prompt: 'Third?', points: 20 },
      ],
    },
  ],
};

/* ── the key never reaches the public test ─────────────────────────────── */

const { quiz, key } = splitQuizFile(FILE);
const publicJson = JSON.stringify(quiz);
assert(!publicJson.includes('"answer"'), 'LEAK: the public test carries an answer field');
assert(key['L-A'] === 'Three' && key['L-B'] === 'One', 'the key keeps every choice answer');
assert(Object.keys(key).length === 2, 'the key holds choice questions only');

const throws = (raw: unknown, why: string) => {
  try { splitQuizFile(raw); } catch (e) { assert(e instanceof QuizFileError, `${why}: wrong error type`); return; }
  throw new Error(`${why}: accepted a bad file`);
};
throws({ sections: [] }, 'no sections');
throws({ sections: [{ title: 'X', questions: [{ id: 'a', kind: 'choice', prompt: 'p', options: ['x', 'y'], answer: 'z', points: 1 }] }] },
  'an answer that is not an option');
throws({ sections: [{ title: 'X', questions: [{ id: 'a', kind: 'text', prompt: 'p', points: 1 }, { id: 'a', kind: 'text', prompt: 'q', points: 1 }] }] },
  'duplicate question ids');
throws({ sections: [{ title: 'X', choose: 4, questions: [{ id: 'a', kind: 'text', prompt: 'p', points: 1 }] }] },
  'choose more than exist');

/* ── what a student may send ───────────────────────────────────────────── */

const cleaned = cleanAnswers(quiz, {
  'L-A': 'Three', 'L-B': 'Not an option', S1: '  one  ', S2: 'two', S3: 'three', bogus: 'x',
});
assert(cleaned['L-A'] === 'Three', 'a real option is kept');
assert(!('L-B' in cleaned), 'an invented option is dropped');
assert(!('bogus' in cleaned), 'an unknown question id is dropped');
assert(cleaned.S1 === 'one' && cleaned.S2 === 'two' && !('S3' in cleaned), 'choose-2 keeps the first two written answers');
assert(cleanAnswers(quiz, { S1: 'x'.repeat(QUIZ_TEXT_MAX + 50) }).S1.length === QUIZ_TEXT_MAX, 'written answers are bounded');

/* ── scoring: blank written work is not a zero ─────────────────────────── */

const s = scoreQuiz(quiz, key, { 'L-A': 'Three', 'L-B': 'Two', S1: 'essay', S2: 'essay' });
assert(s.autoEarned === 6 && s.autoPossible === 12, 'choice questions score by the key');
assert(s.toGrade === 40, 'choose-2 of three 20-point questions leaves 40 to grade, not 60');
assert(s.sections[1].possible === 0 && s.sections[1].earned === 0, 'written sections add nothing to the auto score');

const noKey = scoreQuiz(quiz, {}, { 'L-A': 'Three' });
assert(noKey.autoPossible === 0 && noKey.unkeyed.length === 2, 'a missing key is not-yet, never a wrong answer');

/* ── answers match by id, not position ─────────────────────────────────── */

const reordered = splitQuizFile({ sections: [{ ...FILE.sections[0], questions: [...FILE.sections[0].questions].reverse() }, FILE.sections[1]] });
const r = scoreQuiz(reordered.quiz, reordered.key, { 'L-A': 'Three', 'L-B': 'One' });
assert(r.autoEarned === 12, 'reordering questions does not move answers');

assert(Object.keys(parseAnswers('not json')).length === 0, 'garbage answers parse to nothing');
assert(Object.keys(parseAnswers('{"a":1,"b":"x"}')).join() === 'b', 'non-string answers are ignored');

/* ── the bank is not the test: what the director ticked is ─────────────── */

assert(allIds(selectedQuiz(quiz, undefined)).length === 5, 'no selection means the whole bank, so old tests are unchanged');
assert(selectedQuiz(quiz, []).sections.length === 0, 'an empty selection is a real answer: nothing is on the test');
const three = selectedQuiz(quiz, ['L-A', 'S1', 'S2']);
assert(allIds(three).join() === 'L-A,S1,S2', 'only the ticked questions are on the test');
assert(three.sections.length === 2 && three.sections[0].questions.length === 1, 'a section with nothing ticked drops off');
assert(three.sections[1].choose === undefined, 'choose-2 of two remaining questions is not a choice at all');
assert(quizTotalPoints(three) === 46, 'points count what is on the test (6 + 20 + 20)');
assert(quizTotalPoints(selectedQuiz(quiz, ['S1', 'S2', 'S3'])) === 40, 'a choose-2 section counts two answers, not three');
const pickedScore = scoreQuiz(selectedQuiz(quiz, ['L-A']), key, { 'L-A': 'Three', 'L-B': 'One' });
assert(pickedScore.autoPossible === 6 && pickedScore.autoEarned === 6, 'a question left off the test is not scored');

/* ── one row per student, newest wins ──────────────────────────────────── */

const subs: QuizSubmission[] = [
  { id: '1', assignmentId: 'x', studentId: 'stu1', studentName: 'Ana Pérez', answersJson: '{"L-A":"One"}', submittedAt: 100, status: 'submitted' },
  { id: '2', assignmentId: 'x', studentId: 'stu1', studentName: 'Ana Perez', answersJson: '{"L-A":"Three"}', submittedAt: 200, status: 'submitted' },
  { id: '3', assignmentId: 'x', studentName: '=HYPERLINK("http://x","y")', answersJson: '{}', submittedAt: 150, status: 'submitted' },
];
assert(nameKey('Ana Pérez') === nameKey('ana  perez'), 'case, accents and spacing are one person');
const latest = latestPerStudent(subs);
assert(latest.length === 2, 'two submissions from one roster id make one row');
const ana = latest.find(l => l.submission.studentId === 'stu1');
assert(ana?.count === 2 && ana.submission.id === '2', 'the newest submission carries the row and the count shows 2');
const twins: QuizSubmission[] = [
  { id: 'a', assignmentId: 'x', studentId: 'stuA', studentName: 'Chris Lee', answersJson: '{}', submittedAt: 10, status: 'submitted' },
  { id: 'b', assignmentId: 'x', studentId: 'stuB', studentName: 'Chris Lee', answersJson: '{}', submittedAt: 20, status: 'submitted' },
];
assert(latestPerStudent(twins).length === 2, 'two students who share a name stay two rows');

const csv = quizResultsToCsv(quiz, key, subs, ms => String(ms));
const lines = csv.split('\r\n');
assert(lines.length === 3, 'header plus one row per student');
assert(lines[0].includes('Auto total (of 12)') && lines[0].includes('Written score (of 40)'), 'the header says what the totals cover');
assert(!csv.includes(',=HYPERLINK'), 'a typed formula is neutralised in the sheet');
assert(lines.some(l => l.startsWith('Ana Perez,200,2,6,,6,')), 'the newest answer is the one scored');

console.log('quiz self-check: ok');
