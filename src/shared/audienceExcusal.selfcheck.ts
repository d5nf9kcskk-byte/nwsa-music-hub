/**
 * Pins grade-level audience excusals (#audience-excusal). Three promises:
 *   1. A senior in a required-to-attend ensemble is off the event; an 11th
 *      grader in the same ensemble is not, and a college "Senior" is not.
 *   2. A senior who PERFORMS on the event still performs.
 *   3. A senior named one at a time (`attendanceStudentIds`) is still named.
 * Plus: no excusal set = exactly the old behavior, and a blank grade fails
 * closed (still required).
 */
/// <reference types="node" />
import { gradeExcusedFromAudience, seniorsExcused, SENIOR_GRADE } from './audienceExcusal';
import { studentExpectation } from '../director/rosterResolver';
import type { CalendarEvent, Student } from '../director/types';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

const SYM = 'symphony-orchestra', CCO = 'college-chamber-orchestra';
const stu = (id: string, grade: string | undefined, ensembleIds: string[]): Student =>
  ({ id, name: id, status: 'Active', grade, ensembleIds } as Student);

const senior = stu('senior', '12th', [SYM]);
const seniorBare = stu('senior2', '12', [SYM]);
const junior = stu('junior', '11th', [SYM]);
const blank = stu('blank', undefined, [SYM]);
const collegeSenior = stu('colsr', 'College Senior', [SYM]);
const seniorPlayer = stu('player', '12th', [CCO, SYM]);
const namedSenior = stu('named', '12th', []);
const students = [senior, seniorBare, junior, blank, collegeSenior, seniorPlayer, namedSenior];

const concert: CalendarEvent = {
  id: 'cco', type: 'Concert', date: '2026-09-29', status: 'Scheduled',
  ensembleIds: [CCO], attendanceEnsembleIds: [SYM],
  attendanceStudentIds: ['named'], attendanceExcusedGrades: [SENIOR_GRADE],
} as CalendarEvent;
const exp = (s: Student, ev = concert) => studentExpectation(s.id, ev, students, [], { [ev.id]: ev });

// 1
assert(!exp(senior).expected, '12th grader is excused');
assert(!exp(seniorBare).expected, '"12" grade is excused too');
assert(exp(junior).expected && exp(junior).attendanceOnly, '11th grader still required');
assert(exp(blank).expected, 'blank grade fails closed: still required');
assert(exp(collegeSenior).expected, 'a college Senior is not a 12th grader');
// 2
assert(exp(seniorPlayer).expected && !exp(seniorPlayer).attendanceOnly, 'a senior who plays still plays');
// 3
assert(exp(namedSenior).expected, 'a senior named individually is still named');
// No excusal = old behavior.
const plain = { ...concert, attendanceExcusedGrades: undefined } as CalendarEvent;
assert(exp(senior, plain).expected, 'without the switch seniors are required');
assert(!seniorsExcused(plain) && seniorsExcused(concert), 'seniorsExcused reads the switch');
assert(!gradeExcusedFromAudience('12th', { attendanceExcusedGrades: [''] }), 'an empty prefix excuses nobody');

console.log('audience excusal self-check: OK');
