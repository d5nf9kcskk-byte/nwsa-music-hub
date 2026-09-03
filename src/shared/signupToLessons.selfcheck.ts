/**
 * Self-check for sign-up → standing weekly lesson (#signups, #applied).
 * Run: npx tsx src/shared/signupToLessons.selfcheck.ts
 *
 * The promises worth pinning are the ones that go wrong SILENTLY. A weekday
 * derived one day off puts a student in the wrong room every week for a year
 * and nothing complains. A booking that quietly converts to nothing loses a
 * student off the schedule with no error to notice. And a hand-typed slot
 * label must never be guessed into a day — signupBooking.ts already refuses
 * to put those on a calendar, and this must refuse for the same reason.
 */
import { planLessonsFromSignup, slotFromBooking } from './signupToLessons.ts';
import type { SignupForm, SignupSlotBooking, Student } from '../director/types.ts';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

const formId = 'lessonTimes';

// 2026-09-07 is a Monday; 2026-09-11 is a Friday.
const form: SignupForm = {
  id: formId,
  title: 'Fall lesson times',
  ownerName: 'Mr. Munger',
  ensembleIds: [],
  families: [],
  createdAt: 0,
  questions: [
    {
      id: 'q1', label: 'Pick your weekly time', type: 'timeslot',
      options: ['a', 'b', 'c'],
      slotDefs: [
        { date: '2026-09-07', startMin: 900, endMin: 945 },   // Mon 15:00–15:45
        { date: '2026-09-11', startMin: 780, endMin: 825 },   // Fri 13:00–13:45
        { date: '2026-09-07', startMin: 0, endMin: 45 },      // Mon midnight
      ],
    },
    // A hand-typed question: labels only, no slotDefs. Nothing here has a day.
    { id: 'q2', label: 'Or tell me when', type: 'timeslot', options: ['Monday after school'] },
  ],
};

const students: Pick<Student, 'id' | 'name' | 'grade' | 'instrument'>[] = [
  { id: 's1', name: 'Maria Sanchez', grade: '11th', instrument: 'Violin' },
  { id: 's2', name: 'Andre Boyd', grade: '12th', instrument: 'Cello' },
];

const booking = (over: Partial<SignupSlotBooking>): SignupSlotBooking => ({
  id: 'b1', formId, questionId: 'q1', slotIndex: 0, slotLabel: 'a',
  studentId: 's1', studentName: 'Maria Sanchez', submittedAt: 10, ...over,
});

// ── The weekday contract ──────────────────────────────────────────────
{
  // 900 minutes = 15:00. Monday is 1, matching Date#getUTCDay() and dayOf().
  const slot = slotFromBooking({ date: '2026-09-07', startMin: 900, endMin: 945 });
  assert(slot.weekday === 1, `Sep 7 2026 is a Monday (1), got ${slot.weekday}`);
  assert(slot.startTime === '15:00' && slot.endTime === '15:45',
    `900–945 min is 15:00–15:45, got ${slot.startTime}–${slot.endTime}`);

  const fri = slotFromBooking({ date: '2026-09-11', startMin: 780, endMin: 825 });
  assert(fri.weekday === 5, `Sep 11 2026 is a Friday (5), got ${fri.weekday}`);

  // Midnight must not wrap to the previous day, and must zero-pad.
  const mid = slotFromBooking({ date: '2026-09-07', startMin: 0, endMin: 45 });
  assert(mid.weekday === 1 && mid.startTime === '00:00', `midnight stays on its own day, got ${mid.weekday} ${mid.startTime}`);

  // No location is invented — a slot definition has none to give.
  assert(slot.location === undefined, 'a booked slot carries no room');
}

// ── The happy path ────────────────────────────────────────────────────
{
  const plan = planLessonsFromSignup(form, [
    booking({ id: 'b1', slotIndex: 0, studentId: 's1' }),
    booking({ id: 'b2', slotIndex: 1, studentId: 's2', studentName: 'Andre Boyd' }),
  ], students);
  assert(plan.planned.length === 2, `two bookings convert, got ${plan.planned.length}`);
  assert(plan.skipped.length === 0, 'nothing skipped');
  // Sorted by first date: Sep 7 before Sep 11.
  assert(plan.planned[0].student.id === 's1' && plan.planned[0].firstDate === '2026-09-07',
    'earliest booked date first');
  // The student record rides along — payroll band and instrument come from it.
  assert(plan.planned[1].student.grade === '12th' && plan.planned[1].student.instrument === 'Cello',
    'the roster record travels with the plan');
}

// ── A hand-typed slot never becomes a weekday ─────────────────────────
{
  const plan = planLessonsFromSignup(form,
    [booking({ id: 'b3', questionId: 'q2', slotIndex: 0, slotLabel: 'Monday after school' })],
    students);
  assert(plan.planned.length === 0, 'a label with no date converts to nothing');
  assert(plan.skipped.length === 1 && /typed by hand/.test(plan.skipped[0].reason),
    `and says why, got "${plan.skipped[0]?.reason}"`);
}

// A slot index past the end of the list is the same case: no def, no guess.
{
  const plan = planLessonsFromSignup(form, [booking({ slotIndex: 99 })], students);
  assert(plan.planned.length === 0 && plan.skipped.length === 1, 'a deleted slot converts to nothing');
}

// ── A student off the roster is reported, never scheduled ─────────────
{
  const plan = planLessonsFromSignup(form, [booking({ studentId: 'gone' })], students);
  assert(plan.planned.length === 0, 'no lesson for a student who is not on the roster');
  assert(/roster/.test(plan.skipped[0]?.reason ?? ''), 'and the director is told which');
}

// ── One standing time per student: the newest booking wins ────────────
{
  const plan = planLessonsFromSignup(form, [
    booking({ id: 'early', slotIndex: 0, submittedAt: 10 }),
    booking({ id: 'late', slotIndex: 1, submittedAt: 20 }),
  ], students);
  assert(plan.planned.length === 1, `one slot per student, got ${plan.planned.length}`);
  assert(plan.planned[0].booking.id === 'late', 'the later booking wins');
  assert(plan.skipped.length === 1 && plan.skipped[0].booking.id === 'early',
    'and the earlier one is reported, not dropped in silence');
}

// ── Bookings from another form are none of this form's business ───────
{
  const plan = planLessonsFromSignup(form, [booking({ formId: 'other' })], students);
  assert(plan.planned.length === 0 && plan.skipped.length === 0, 'other forms are ignored outright');
}

console.log('signupToLessons.selfcheck: OK');
