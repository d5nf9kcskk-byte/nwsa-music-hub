// Explicit .ts, matching every other importer of the shared cell escaper: the
// self-check runs this file under a type-stripping loader.
import { csvEscape as esc } from './csv.ts';

/**
 * Online tests (#online-test). A Written Test assignment can carry a test that
 * students take on the public assignment page and submit with their name.
 *
 * Three promises this file keeps, and `quiz.selfcheck.ts` pins:
 *
 *   1. **The answer key is never public.** An assignment doc is world-readable,
 *      so it carries the QUESTIONS only (`Assignment.quiz`). The key lives in
 *      the staff-only `assignmentKeys/{assignmentId}` doc. `splitQuizFile()` is
 *      the ONE place a test file is divided, and nothing it returns in `quiz`
 *      holds a correct answer.
 *   2. **A written answer is not scored as zero.** Short answers are graded by
 *      a person. The auto score covers choice questions only and says so; a
 *      total that silently counted an ungraded essay as 0 would be a failing
 *      grade nobody gave (same posture as `lessonGradeValue`).
 *   3. **Answers are matched by question ID, never by position.** Re-ordering
 *      or re-wording a test after students submitted must not move one
 *      student's answer into another question's column.
 *
 * Deliberately no ORG import and no DOM, so the self-check runs under plain
 * node.
 */

export type QuizQuestionKind = 'choice' | 'text';

export interface QuizQuestion {
  /** Stable key. Answers and the key are both matched on it. */
  id: string;
  kind: QuizQuestionKind;
  prompt: string;
  /** Choice questions only. */
  options?: string[];
  points: number;
}

export interface QuizSection {
  id: string;
  title: string;
  instructions?: string;
  /** Answer only this many of the section's questions (e.g. "any two"). */
  choose?: number;
  questions: QuizQuestion[];
}

/** What the public assignment doc carries. No answers, ever. */
export interface QuizDefinition {
  sections: QuizSection[];
}

/** Staff-only: question id -> the correct option, exactly as written. */
export type QuizKey = Record<string, string>;

/** A student's answers: question id -> chosen option or typed text. */
export type QuizAnswers = Record<string, string>;

export interface QuizSubmission {
  id: string;
  assignmentId: string;
  /** The roster doc the student picked from the class list. The rules anchor
   *  on it: only someone on this assignment's roster can submit. Absent on
   *  nothing today, but read defensively — an older doc has no id. */
  studentId?: string;
  studentName: string;
  answersJson: string;
  submittedAt: number;
  status: 'submitted';
}

/** Firestore rules cap `answersJson` at this many characters. */
export const QUIZ_ANSWERS_MAX = 20000;
/** Per written answer, so two answers can never approach the cap. */
export const QUIZ_TEXT_MAX = 3000;

export class QuizFileError extends Error {}

/**
 * Read an uploaded test file and divide it into the public test and the
 * private key. The file format is the public shape plus `answer` on each
 * choice question. Throws `QuizFileError` with a sentence a director can act on.
 */
export function splitQuizFile(raw: unknown): { quiz: QuizDefinition; key: QuizKey } {
  const fail = (msg: string): never => { throw new QuizFileError(msg); };
  if (!raw || typeof raw !== 'object') fail('That file is not a test file.');
  const sectionsIn = (raw as { sections?: unknown }).sections;
  if (!Array.isArray(sectionsIn) || sectionsIn.length === 0) fail('The test file has no sections.');

  const key: QuizKey = {};
  const seen = new Set<string>();
  const sections: QuizSection[] = (sectionsIn as unknown[]).map((s, si) => {
    const sec = s as Record<string, unknown>;
    const title = str(sec.title) || fail(`Section ${si + 1} has no title.`);
    const qs = Array.isArray(sec.questions) ? sec.questions as unknown[] : fail(`"${title}" has no questions.`);
    const questions: QuizQuestion[] = qs.map((q, qi) => {
      const item = q as Record<string, unknown>;
      const id = str(item.id) || fail(`Question ${qi + 1} in "${title}" has no id.`);
      if (seen.has(id)) fail(`Two questions share the id "${id}".`);
      seen.add(id);
      const kind = item.kind === 'text' ? 'text' : item.kind === 'choice' ? 'choice' : fail(`Question "${id}" needs kind "choice" or "text".`);
      const prompt = str(item.prompt) || fail(`Question "${id}" has no prompt.`);
      const points = typeof item.points === 'number' && item.points >= 0 ? item.points : fail(`Question "${id}" needs a points value.`);
      const out: QuizQuestion = { id, kind, prompt, points };
      if (kind === 'choice') {
        const options = Array.isArray(item.options) ? (item.options as unknown[]).map(str).filter(Boolean) : [];
        if (options.length < 2) fail(`Question "${id}" needs at least two options.`);
        const answer = str(item.answer);
        if (!options.includes(answer)) fail(`The answer for "${id}" is not one of its options.`);
        out.options = options;
        key[id] = answer;
      }
      return out;
    });
    const section: QuizSection = { id: str(sec.id) || `s${si + 1}`, title, questions };
    const instructions = str(sec.instructions);
    if (instructions) section.instructions = instructions;
    if (typeof sec.choose === 'number') {
      if (sec.choose < 1 || sec.choose > questions.length) fail(`"${title}" asks for ${sec.choose} of ${questions.length} questions.`);
      section.choose = sec.choose;
    }
    return section;
  });
  return { quiz: { sections }, key };
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

export function allQuestions(quiz: QuizDefinition): QuizQuestion[] {
  return quiz.sections.flatMap(s => s.questions);
}

/**
 * The test as it will actually be taken (#online-test).
 *
 * A test file is a BANK: every listening item and every study question the
 * unit covers. The director ticks what goes on this exam, and `selection` is
 * that list of question ids. ABSENT means nobody has chosen, so the whole bank
 * is the test — which is what every test loaded before this feature keeps
 * doing. An EMPTY list is a real answer too: nothing is on the exam yet, and
 * the student form says so rather than quietly showing all of it.
 */
export function selectedQuiz(quiz: QuizDefinition, selection?: string[]): QuizDefinition {
  if (!selection) return quiz;
  const keep = new Set(selection);
  const sections = quiz.sections
    .map(s => ({ ...s, questions: s.questions.filter(q => keep.has(q.id)) }))
    .filter(s => s.questions.length > 0)
    .map(s => (s.choose && s.choose >= s.questions.length ? { ...s, choose: undefined } : s));
  return { sections };
}

/** Points on the test as selected. */
export function quizTotalPoints(quiz: QuizDefinition): number {
  return quiz.sections.reduce((total, s) => {
    const pts = s.questions.map(q => q.points).sort((a, b) => b - a);
    return total + (s.choose ? pts.slice(0, s.choose) : pts).reduce((a, b) => a + b, 0);
  }, 0);
}

/** The answers a student is allowed to send: known ids only, choice answers
 *  from the option list, text trimmed and bounded, and no more than `choose`
 *  written answers in a choose-N section (the first ones they wrote win). */
export function cleanAnswers(quiz: QuizDefinition, answers: QuizAnswers): QuizAnswers {
  const out: QuizAnswers = {};
  for (const section of quiz.sections) {
    let taken = 0;
    for (const q of section.questions) {
      const v = (answers[q.id] ?? '').trim();
      if (!v) continue;
      if (q.kind === 'choice' && !(q.options ?? []).includes(v)) continue;
      if (section.choose && taken >= section.choose) continue;
      out[q.id] = q.kind === 'text' ? v.slice(0, QUIZ_TEXT_MAX) : v;
      taken++;
    }
  }
  return out;
}

export function parseAnswers(json: string): QuizAnswers {
  try {
    const v = JSON.parse(json);
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    return Object.fromEntries(Object.entries(v).filter(([, x]) => typeof x === 'string')) as QuizAnswers;
  } catch {
    return {};
  }
}

export interface SectionScore {
  sectionId: string;
  title: string;
  /** Points earned on choice questions. */
  earned: number;
  /** Points possible on choice questions. */
  possible: number;
  /** Points in this section that a person has to grade. For a choose-N
   *  section, only the questions a student can actually answer count. */
  toGrade: number;
}

export interface QuizScore {
  sections: SectionScore[];
  autoEarned: number;
  autoPossible: number;
  /** Points not auto-scored. Never folded into the auto score as zero. */
  toGrade: number;
  /** Choice questions the key has no answer for. Scored as not-yet, not wrong. */
  unkeyed: string[];
}

export function scoreQuiz(quiz: QuizDefinition, key: QuizKey, answers: QuizAnswers): QuizScore {
  const unkeyed: string[] = [];
  const sections = quiz.sections.map(section => {
    let earned = 0, possible = 0;
    for (const q of section.questions) {
      if (q.kind !== 'choice') continue;
      if (!(q.id in key)) { unkeyed.push(q.id); continue; }
      possible += q.points;
      if (answers[q.id] === key[q.id]) earned += q.points;
    }
    const text = section.questions.filter(q => q.kind === 'text').map(q => q.points).sort((a, b) => b - a);
    const counted = section.choose ? text.slice(0, section.choose) : text;
    return { sectionId: section.id, title: section.title, earned, possible, toGrade: counted.reduce((a, b) => a + b, 0) };
  });
  return {
    sections,
    autoEarned: sections.reduce((a, s) => a + s.earned, 0),
    autoPossible: sections.reduce((a, s) => a + s.possible, 0),
    toGrade: sections.reduce((a, s) => a + s.toGrade, 0),
    unkeyed,
  };
}

/**
 * Grading a test on the roster row (#online-test).
 *
 * The grade sheet already knows how to mark a rubric: named lines, points per
 * line, one total, one Confirm that snapshots what it gave. A test's questions
 * ARE those lines — so a test grades through the same machinery rather than a
 * second set of totals that could disagree with it. The choice questions of a
 * section collapse into one line the answer key fills in; every written
 * question is a line the director marks.
 *
 * Shaped structurally (`id` / `label` / `max`) rather than by importing the
 * director layer's `RubricCriterion`: this module stays free of anything the
 * public site can't have, and the rubric keeps living where rubrics live.
 */
export interface QuizGradeLine {
  id: string;
  label: string;
  max: number;
}

/** A line id that is a whole section's choice questions, not one question.
 *  Prefixed so it can never collide with a question id from a test file. */
export const QUIZ_AUTO_PREFIX = 'auto:';

/**
 * The lines this test is graded on, in the order it is laid out.
 *
 * `answers` is a student's own answers, and matters only for a choose-N
 * section: there the lines are the questions THAT STUDENT answered, because a
 * question they were told they could skip must not sit on their sheet as an
 * unscored line dragging their denominator up. Called without answers it
 * returns every line the test can produce — which is what the export's
 * columns need, since one sheet covers everybody.
 */
export function quizGradeLines(quiz: QuizDefinition, answers?: QuizAnswers): QuizGradeLine[] {
  const out: QuizGradeLine[] = [];
  for (const section of quiz.sections) {
    const choicePoints = section.questions
      .filter(q => q.kind === 'choice')
      .reduce((n, q) => n + q.points, 0);
    if (choicePoints > 0) {
      out.push({ id: QUIZ_AUTO_PREFIX + section.id, label: section.title, max: choicePoints });
    }
    const text = section.questions.filter(q => q.kind === 'text');
    const lines = section.choose && answers
      ? text.filter(q => (answers[q.id] ?? '').trim()).slice(0, section.choose)
      : text;
    for (const q of lines) out.push({ id: q.id, label: q.prompt, max: q.points });
  }
  return out;
}

/**
 * What the answer key already knows, as a starting score for the auto lines.
 *
 * A section holding ANY choice question the key has no answer for is left out
 * entirely rather than seeded with the points the rest of it earned. An
 * unanswered key is not a wrong answer (`scoreQuiz` says the same with
 * `unkeyed`), and a line seeded two-thirds low would be confirmed as a real
 * grade by anyone who didn't stop to check. Left blank, it blocks Confirm and
 * the director goes and sets the answer.
 */
export function quizAutoPicks(
  quiz: QuizDefinition,
  key: QuizKey,
  answers: QuizAnswers,
): Record<string, number> {
  const picks: Record<string, number> = {};
  for (const section of quiz.sections) {
    const choice = section.questions.filter(q => q.kind === 'choice');
    if (choice.length === 0 || choice.some(q => !(q.id in key))) continue;
    picks[QUIZ_AUTO_PREFIX + section.id] = choice
      .reduce((n, q) => n + (answers[q.id] === key[q.id] ? q.points : 0), 0);
  }
  return picks;
}

/**
 * What to show the grader under each line: a written answer verbatim, and for
 * an auto line the choices behind its number, so a score arrives with its
 * working shown rather than as a figure to trust. A section the key can't
 * score says so instead of printing ticks and crosses it hasn't earned.
 */
export function quizLineNotes(
  quiz: QuizDefinition,
  answers: QuizAnswers,
  key: QuizKey | null,
): Record<string, string> {
  const notes: Record<string, string> = {};
  for (const section of quiz.sections) {
    const choice = section.questions.filter(q => q.kind === 'choice');
    if (choice.length > 0) {
      const unkeyed = !key || choice.some(q => !(q.id in key));
      notes[QUIZ_AUTO_PREFIX + section.id] = unkeyed
        ? 'Not scored yet — set the correct answers on the answer key below.'
        : choice
          .map(q => `${answers[q.id] === key[q.id] ? '✓' : '✗'} ${q.prompt}: ${answers[q.id] || '(blank)'}`)
          .join('\n');
    }
    for (const q of section.questions) {
      if (q.kind === 'text' && answers[q.id]) notes[q.id] = answers[q.id];
    }
  }
  return notes;
}

/** Choice questions on this test the key has no answer for. They score as
 *  not-yet, so the panel can say what is still missing. */
export function unkeyedQuestions(quiz: QuizDefinition, key: QuizKey | null): QuizQuestion[] {
  return allQuestions(quiz).filter(q => q.kind === 'choice' && !(key && q.id in key));
}

/** Case, spacing and punctuation don't make two people. Used only where a
 *  submission has no roster id to group by. */
export function nameKey(name: string): string {
  return name.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

export interface LatestSubmission {
  submission: QuizSubmission;
  /** How many times this name submitted. More than one is worth a look. */
  count: number;
}

/** One row per student, carrying the newest submission. There is no public
 *  update, so a student who submits twice creates two docs. Grouped by the
 *  roster id they picked, falling back to the name for any doc without one. */
export function latestPerStudent(subs: QuizSubmission[]): LatestSubmission[] {
  const byName = new Map<string, LatestSubmission>();
  for (const s of subs) {
    const k = s.studentId || nameKey(s.studentName);
    const cur = byName.get(k);
    if (!cur) byName.set(k, { submission: s, count: 1 });
    else {
      cur.count++;
      if ((s.submittedAt ?? 0) > (cur.submission.submittedAt ?? 0)) cur.submission = s;
    }
  }
  return [...byName.values()].sort((a, b) => a.submission.studentName.localeCompare(b.submission.studentName));
}

/**
 * The results sheet: one row per student, newest submission. Columns are
 * built from the test's question ids, so a cell can never land under the
 * wrong question. Written answers get their text plus an empty score column
 * for the grader; the auto total covers choice questions only and its header
 * says so.
 */
export function quizResultsToCsv(
  quiz: QuizDefinition,
  key: QuizKey,
  subs: QuizSubmission[],
  fmtTime: (ms: number) => string,
): string {
  const qs = allQuestions(quiz);
  const header: string[] = ['Name', 'Submitted', 'Times submitted'];
  for (const section of quiz.sections) {
    header.push(`${section.title} (auto)`);
  }
  const score0 = scoreQuiz(quiz, key, {});
  header.push(`Auto total (of ${score0.autoPossible})`);
  if (score0.toGrade > 0) header.push(`Written score (of ${score0.toGrade})`);
  for (const q of qs) {
    if (q.kind === 'choice') header.push(`${q.id} answer`, `${q.id} correct?`);
    else header.push(`${q.id} written`);
  }

  const rows = latestPerStudent(subs).map(({ submission, count }) => {
    const answers = parseAnswers(submission.answersJson);
    const score = scoreQuiz(quiz, key, answers);
    const row: (string | number)[] = [submission.studentName, fmtTime(submission.submittedAt), count];
    for (const s of score.sections) row.push(s.possible > 0 ? s.earned : '');
    row.push(score.autoEarned);
    if (score0.toGrade > 0) row.push('');
    for (const q of qs) {
      const a = answers[q.id] ?? '';
      if (q.kind === 'choice') {
        const verdict = !a ? 'blank' : !(q.id in key) ? '' : a === key[q.id] ? 'yes' : 'no';
        row.push(a, verdict);
      } else {
        row.push(a);
      }
    }
    return row;
  });

  return [header, ...rows].map(r => r.map(esc).join(',')).join('\r\n');
}

export function quizCsvFilename(title: string, today: string): string {
  const slug = title.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'test';
  return `${slug}-results-${today}.csv`;
}
