/**
 * Pins applied-lesson grading (#applied). Three promises are one-liners to
 * break by accident: a cancelled lesson never counts, an unrecognized mark is
 * ignored rather than counted as a zero, and the letter boundary rounds to
 * the better grade. Getting any of them wrong changes a student's term grade.
 */
import { gradeSummary, letterFor, isGraded, needsGrade, isLessonMark, markPoints, LESSON_MARKS } from './lessonGrades';
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

// The 4-point scale, and the closed set that guards it.
assert(markPoints('A') === 4 && markPoints('F') === 0, 'A is 4 points, F is 0');
assert(LESSON_MARKS.length === 5, 'five marks');
assert(isLessonMark('A') && !isLessonMark('A-') && !isLessonMark('') && !isLessonMark(undefined), 'closed mark set');

// Nothing graded is not a zero — it is nothing.
assert(gradeSummary([], TODAY) === null, 'no lessons → no summary');
assert(gradeSummary([lesson('2026-08-10')], TODAY) === null, 'ungraded lesson → no summary');

// A cancelled lesson never counts, even carrying a mark.
assert(!isGraded(lesson('2026-08-10', 'F', 'Cancelled')), 'cancelled lesson is not graded');
const withCancelled = gradeSummary([lesson('2026-08-10', 'A'), lesson('2026-08-11', 'F', 'Cancelled')], TODAY)!;
assert(withCancelled.graded === 1 && withCancelled.average === 4, 'cancelled F does not drag the average down');
assert(withCancelled.gradable === 1, 'a cancelled lesson is not owed a grade either');

// Legacy free text in the reserved field is ignored, not counted as a zero.
const legacy = gradeSummary([lesson('2026-08-10', 'A'), lesson('2026-08-11', 'satisfactory')], TODAY)!;
assert(legacy.graded === 1 && legacy.average === 4, 'unrecognized mark is ignored, not zero');
assert(legacy.gradable === 2, 'but it still shows as a lesson owed a grade');

// The teacher's to-do list: past and unmarked, never future, never cancelled.
assert(needsGrade(lesson('2026-08-10'), TODAY), 'past unmarked lesson needs a grade');
assert(needsGrade(lesson(TODAY), TODAY), "today's lesson needs a grade");
assert(!needsGrade(lesson('2026-09-01'), TODAY), 'a future lesson does not');
assert(!needsGrade(lesson('2026-08-10', 'B'), TODAY), 'a marked lesson does not');
assert(!needsGrade(lesson('2026-08-10', undefined, 'Cancelled'), TODAY), 'a cancelled lesson does not');

// The boundary rounds to the BETTER letter, and the ends stay in range.
assert(letterFor(4) === 'A' && letterFor(0) === 'F', 'the ends of the scale');
assert(letterFor(3.5) === 'A', '3.5 rounds up to an A');
assert(letterFor(3.4) === 'B', '3.4 is still a B');
assert(letterFor(0.5) === 'D' && letterFor(0.4) === 'F', 'the bottom boundary rounds the same way');
assert(letterFor(9) === 'A' && letterFor(-1) === 'F', 'out-of-range points clamp instead of crashing');

// End to end: A + B + cancelled F over three lessons is a 3.5 → an A.
const mixed = gradeSummary([lesson('2026-08-10', 'A'), lesson('2026-08-11', 'B'), lesson('2026-08-12', 'F', 'Cancelled')], TODAY)!;
assert(mixed.graded === 2 && mixed.average === 3.5 && mixed.letter === 'A', 'term summary end to end');

console.log('lessonGrades.selfcheck: ok');
