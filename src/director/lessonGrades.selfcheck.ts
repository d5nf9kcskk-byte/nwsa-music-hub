/**
 * Pins applied-lesson grading (#applied). Four promises are one-liners to
 * break by accident: a cancelled lesson never counts, a value that isn't a
 * whole 0–100 is ignored rather than counted as a zero (which is what makes
 * the retired A–F letters harmless), the average is a plain mean, and the
 * displayed number is rounded in exactly one place. Getting any of them wrong
 * changes a student's term grade.
 */
import { gradeSummary, isGraded, needsGrade, isLessonGrade, lessonGradeValue } from './lessonGrades';
import type { Lesson } from './types';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

const TODAY = '2026-08-24';
let n = 0;
const lesson = (date: string, grade?: string, status: Lesson['status'] = 'Scheduled'): Lesson => ({
  id: `l${++n}`, teacherEmail: 't@x.org', studentId: 's1', date,
  startTime: '15:00', endTime: '15:30', status, grade, createdAt: 0,
});

// The 0–100 scale, and what it refuses.
assert(lessonGradeValue('92') === 92 && lessonGradeValue('0') === 0 && lessonGradeValue('100') === 100, 'whole 0–100');
assert(lessonGradeValue(' 92 ') === 92, 'surrounding space is trimmed');
assert(lessonGradeValue(92) === 92, 'a number reads the same as its string');
assert(lessonGradeValue('101') === null && lessonGradeValue('999') === null, 'above 100 is not a grade');
assert(lessonGradeValue('95.5') === null, 'a fraction is not a grade — the column is whole numbers');
assert(lessonGradeValue('-5') === null, 'negative is not a grade');
assert(lessonGradeValue('') === null && lessonGradeValue(undefined) === null, 'blank is not a grade');
assert(lessonGradeValue('A') === null && lessonGradeValue('B+') === null, 'the retired letters are not grades');
assert(isLessonGrade('92') && !isLessonGrade('A'), 'isLessonGrade agrees with lessonGradeValue');

// Nothing graded is not a zero — it is nothing.
assert(gradeSummary([], TODAY) === null, 'no lessons → no summary');
assert(gradeSummary([lesson('2026-08-10')], TODAY) === null, 'ungraded lesson → no summary');

// A cancelled lesson never counts, even carrying a number.
assert(!isGraded(lesson('2026-08-10', '50', 'Cancelled')), 'cancelled lesson is not graded');
const withCancelled = gradeSummary([lesson('2026-08-10', '100'), lesson('2026-08-11', '50', 'Cancelled')], TODAY)!;
assert(withCancelled.graded === 1 && withCancelled.average === 100, 'a cancelled 50 does not drag the average down');
assert(withCancelled.gradable === 1, 'a cancelled lesson is not owed a grade either');

// Legacy letters and free text in the field are ignored, not counted as zeros.
const legacy = gradeSummary([lesson('2026-08-10', '90'), lesson('2026-08-11', 'A'), lesson('2026-08-12', 'satisfactory')], TODAY)!;
assert(legacy.graded === 1 && legacy.average === 90, 'unreadable marks are ignored, not zero');
assert(legacy.gradable === 3, 'but they still show as lessons owed a grade');

// The teacher's to-do list: past and unmarked, never future, never cancelled.
assert(needsGrade(lesson('2026-08-10'), TODAY), 'past unmarked lesson needs a grade');
assert(needsGrade(lesson(TODAY), TODAY), "today's lesson needs a grade");
assert(needsGrade(lesson('2026-08-10', 'A'), TODAY), 'a lesson left on a retired letter still needs a number');
assert(!needsGrade(lesson('2026-09-01'), TODAY), 'a future lesson does not');
assert(!needsGrade(lesson('2026-08-10', '85'), TODAY), 'a graded lesson does not');
assert(!needsGrade(lesson('2026-08-10', undefined, 'Cancelled'), TODAY), 'a cancelled lesson does not');

// A zero is a real grade, not a missing one.
const zero = gradeSummary([lesson('2026-08-10', '0'), lesson('2026-08-11', '100')], TODAY)!;
assert(zero.graded === 2 && zero.average === 50, 'a zero counts');
assert(!needsGrade(lesson('2026-08-10', '0'), TODAY), 'a zero is graded');

// Rounding happens once, in the summary, and rounds half up.
const halves = gradeSummary([lesson('2026-08-10', '89'), lesson('2026-08-11', '90')], TODAY)!;
assert(halves.average === 89.5 && halves.rounded === 90, '89.5 displays as 90');

// End to end: 95 + 88 + a cancelled 40 over three lessons is a 91.5 → 92.
const mixed = gradeSummary(
  [lesson('2026-08-10', '95'), lesson('2026-08-11', '88'), lesson('2026-08-12', '40', 'Cancelled')],
  TODAY,
)!;
assert(mixed.graded === 2 && mixed.average === 91.5 && mixed.rounded === 92, 'term summary end to end');

console.log('lessonGrades.selfcheck: ok');
