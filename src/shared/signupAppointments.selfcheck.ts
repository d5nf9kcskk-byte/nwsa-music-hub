/**
 * Self-check for sign-up appointments (#signup-appointments).
 * Run: npx tsx src/shared/signupAppointments.selfcheck.ts
 *
 * Pins the promises the director's calendar and the appointmentsFeed Cloud
 * Function both depend on. The UID contract in particular: the ICS event id
 * is built from `appointment.id`, so if that stops equalling the booking's
 * doc id, every calendar refresh duplicates every appointment instead of
 * updating it.
 */
import {
  appointmentsFor, appointmentsForForms, formatClock24, parseAnswers, responseIsComplete,
} from './signupAppointments.ts';
import { formatClock24 as bookingClock24, slotDefAt } from './signupBooking.ts';
import type { SignupForm, SignupResponse, SignupSlotBooking } from '../director/types.ts';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

const formId = 'formABC';

const form: SignupForm = {
  id: formId,
  title: 'All-State auditions',
  ownerName: 'Mr. Munger',
  ensembleIds: [],
  families: [],
  createdAt: 0,
  signatureStatement: 'I will attend.',
  questions: [
    { id: 'q1', label: 'Pick a time', type: 'timeslot', options: ['a', 'b', 'c'], slotDefs: [
      { date: '2026-09-10', startMin: 900, endMin: 915 },
      { date: '2026-09-10', startMin: 915, endMin: 930 },
      { date: '2026-09-09', startMin: 600, endMin: 615 },
    ] },
    { id: 'q2', label: 'What are you playing?', type: 'short' },
    { id: 'q3', label: 'Anything I should know?', type: 'long' },
  ],
};

const booking = (over: Partial<SignupSlotBooking>): SignupSlotBooking => ({
  id: 'b1', formId, questionId: 'q1', slotIndex: 0, slotLabel: 'a',
  studentId: 's1', studentName: 'Maria Sanchez', submittedAt: 10, ...over,
});

const response = (over: Partial<SignupResponse>): SignupResponse => ({
  id: 'r1', formId, studentId: 's1', studentName: 'Maria Sanchez', grade: '11th',
  submittedAt: 10, status: 'submitted', ...over,
});

// ── The UID contract ──────────────────────────────────────────────────
{
  const [appt] = appointmentsFor(form, [booking({})], []);
  assert(appt.id === 'b1', 'appointment id IS the booking doc id (ICS UID contract)');
}

// ── Times come from slotDefs, never from the label ────────────────────
{
  const [appt] = appointmentsFor(form, [booking({ slotIndex: 1, slotLabel: 'nonsense' })], []);
  assert(appt.date === '2026-09-10' && appt.startMin === 915 && appt.endMin === 930,
    'times read from slotDefs by index, not parsed from slotLabel');
}

// ── Hand-typed slot lists produce NO appointments ─────────────────────
{
  const manual: SignupForm = {
    ...form,
    questions: [{ id: 'q1', label: 'Pick a time', type: 'timeslot', options: ['Mon 3pm', 'Mon 4pm'] }],
  };
  assert(slotDefAt(manual, 'q1', 0) === null, 'manual slot has no slotDef');
  assert(appointmentsFor(manual, [booking({})], []).length === 0,
    'a dateless manual slot produces no appointment');
}

// ── An out-of-range index is skipped, not thrown ──────────────────────
{
  assert(appointmentsFor(form, [booking({ slotIndex: 99 })], []).length === 0,
    'slotIndex past the end produces no appointment');
  assert(appointmentsFor(form, [booking({ questionId: 'gone' })], []).length === 0,
    'a booking whose question was deleted produces no appointment');
  assert(appointmentsFor(form, [booking({ questionId: 'q2' })], []).length === 0,
    'a booking pointing at a non-timeslot question produces no appointment');
}

// ── A booking with no response still shows up ─────────────────────────
{
  const [appt] = appointmentsFor(form, [booking({})], []);
  assert(appt.studentName === 'Maria Sanchez', 'name comes from the booking itself');
  assert(appt.answers.length === 0, 'no response → no answers');
  assert(appt.complete === false, 'no response → paperwork is not complete');
}

// ── The NEWEST response wins (there is no unauthenticated update) ─────
{
  const older = response({ id: 'r1', submittedAt: 10, answersJson: '{"q2":"Mozart"}' });
  const newer = response({ id: 'r2', submittedAt: 20, answersJson: '{"q2":"Bartok"}' });
  const [appt] = appointmentsFor(form, [booking({})], [older, newer]);
  assert(appt.answers.length === 1 && appt.answers[0].value === 'Bartok',
    'the newer response supplies the answers');
  assert(appt.answers[0].label === 'What are you playing?', 'answers carry the question label');
}

// ── The timeslot answer is not repeated in the notes ──────────────────
{
  const r = response({ answersJson: '{"q1":"a","q2":"Mozart"}' });
  const [appt] = appointmentsFor(form, [booking({})], [r]);
  assert(appt.answers.length === 1 && appt.answers[0].label === 'What are you playing?',
    'the timeslot answer is excluded — it IS the event time');
}

// ── Another student's response never leaks onto this booking ──────────
{
  const other = response({ id: 'r9', studentId: 's2', studentName: 'Someone Else', answersJson: '{"q2":"Wrong"}' });
  const [appt] = appointmentsFor(form, [booking({})], [other]);
  assert(appt.answers.length === 0, 'a response from a different student is not attached');
}

// ── Paperwork completeness ────────────────────────────────────────────
{
  const unsigned = response({ answersJson: '{"q2":"Mozart"}' });
  const signed = response({ answersJson: '{"q2":"Mozart"}', signature: 'Maria Sanchez' });
  assert(appointmentsFor(form, [booking({})], [unsigned])[0].complete === false,
    'a form asking for a signature is incomplete without one');
  assert(appointmentsFor(form, [booking({})], [signed])[0].complete === true,
    'signed → complete');
}

// ── Ordering: date, then start time ───────────────────────────────────
{
  const list = appointmentsFor(form, [
    booking({ id: 'b2', slotIndex: 1, studentId: 's2', studentName: 'B' }),
    booking({ id: 'b3', slotIndex: 2, studentId: 's3', studentName: 'C' }),
    booking({ id: 'b1', slotIndex: 0, studentId: 's1', studentName: 'A' }),
  ], []);
  assert(list.map(a => a.id).join(',') === 'b3,b1,b2', 'sorted by date then start time');
}

// ── Bookings belonging to another form are ignored ────────────────────
{
  assert(appointmentsFor(form, [booking({ formId: 'other' })], []).length === 0,
    'a booking from a different form is not this form’s appointment');
}

// ── Several forms at once stay in one sorted stream ───────────────────
{
  const second: SignupForm = {
    ...form, id: 'form2', title: 'Chair auditions',
    questions: [{ id: 'q1', label: 'Time', type: 'timeslot', options: ['x'], slotDefs: [
      { date: '2026-09-09', startMin: 610, endMin: 625 },
    ] }],
  };
  const list = appointmentsForForms(
    [form, second],
    [booking({ id: 'a1', slotIndex: 2 }), booking({ id: 'a2', formId: 'form2', slotIndex: 0 })],
    [],
  );
  assert(list.map(a => a.id).join(',') === 'a1,a2', 'multi-form list sorts across forms');
  assert(list[0].formTitle === 'All-State auditions' && list[1].formTitle === 'Chair auditions',
    'each appointment keeps its own form title');
  assert(list[0].ownerName === 'Mr. Munger', 'the owner name rides along for the calendar notes');
}

// ── parseAnswers never throws ─────────────────────────────────────────
{
  assert(Object.keys(parseAnswers({ answersJson: 'not json' })).length === 0, 'malformed JSON → {}');
  assert(Object.keys(parseAnswers({ answersJson: '[1,2]' })).length === 0, 'array → {}');
  assert(Object.keys(parseAnswers({})).length === 0, 'absent → {}');
  assert(parseAnswers({ answersJson: '{"a":1,"b":"x"}' }).b === 'x', 'non-string values dropped');
}

// ── responseIsComplete honours required questions ─────────────────────
{
  const req: SignupForm = {
    ...form, signatureStatement: undefined,
    questions: [{ id: 'q2', label: 'Piece', type: 'short', required: true }],
  };
  assert(responseIsComplete(req, response({ answersJson: '{"q2":"  "}' })) === false,
    'a blank required answer is not complete');
  assert(responseIsComplete(req, response({ answersJson: '{"q2":"Mozart"}' })) === true,
    'a filled required answer is complete');
}

// ── The clock conversion is signupBooking's, not a second copy ────────
// Re-exported rather than redefined; pinned here because the ICS DTSTART is
// built from it and a drift would move every appointment by hours.
{
  assert(formatClock24(0) === '00:00', 'midnight');
  assert(formatClock24(915) === '15:15', '915 minutes → 15:15');
  assert(formatClock24(1439) === '23:59', 'last minute of the day');
  assert(formatClock24(-5) === '00:00' && formatClock24(99999) === '23:59', 'clamped both ends');
  assert(formatClock24 === bookingClock24, 'the re-export IS signupBooking.formatClock24');
}

console.log('signupAppointments.selfcheck: OK');
