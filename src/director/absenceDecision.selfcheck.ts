/**
 * Pins absenceDecision.ts (#requests). Run:
 *   node --experimental-strip-types src/director/absenceDecision.selfcheck.ts
 */
import assert from 'node:assert/strict';
import { absenceAwaiting, absenceExcuseMarks, excusedStatusFor } from './absenceDecision.ts';

const today = '2026-10-30';

// 1. Waiting = unanswered and not yet past. Old docs with no status count as pending.
assert.equal(absenceAwaiting({ date: today }, today), true);
assert.equal(absenceAwaiting({ date: today, status: 'pending' }, today), true);
assert.equal(absenceAwaiting({ date: '2026-10-29', status: 'pending' }, today), false, 'a past day asks nobody');
assert.equal(absenceAwaiting({ date: today, status: 'approved' }, today), false);
assert.equal(absenceAwaiting({ date: today, status: 'declined' }, today), false);
assert.equal(absenceAwaiting({ date: today, status: 'dismissed' }, today), false);

// 2. The mark a yes stands for.
assert.equal(excusedStatusFor('arriving-late'), 'LateExcused');
assert.equal(excusedStatusFor('leaving-early'), 'Excused');
assert.equal(excusedStatusFor(undefined), 'Excused');

const events = [
  { id: 'am', date: today, ensembleIds: ['sym', 'band'], startTime: '08:00', endTime: '09:30' },
  { id: 'pm', date: today, ensembleIds: ['sym'], startTime: '14:00', endTime: '16:00' },
  { id: 'jazz', date: today, ensembleIds: ['jazz'], startTime: '14:00', endTime: '16:00' },
];
const base = { studentId: 's1', date: today };

// 3. Only the groups the student named, every block they cover.
let p = absenceExcuseMarks({ ...base, ensembleIds: ['sym'] }, events, [], ['sym', 'jazz']);
assert.deepEqual(p.creates.map(c => `${c.eventId}/${c.ensembleId}/${c.status}`), ['am/sym/Excused', 'pm/sym/Excused']);
assert.equal(p.updates.length, 0);

// 4. No groups named (an older writer) = every group the student is in.
p = absenceExcuseMarks(base, events, [], ['sym', 'jazz']);
assert.deepEqual(p.creates.map(c => c.eventId), ['am', 'pm', 'jazz']);

// 5. A time window covers only the blocks it overlaps; arriving late covers
//    blocks that start before the arrival time and is LateExcused.
p = absenceExcuseMarks({ ...base, ensembleIds: ['sym'], timeWindow: 'specific', startTime: '13:00', endTime: '17:00' }, events, [], []);
assert.deepEqual(p.creates.map(c => c.eventId), ['pm']);
p = absenceExcuseMarks({ ...base, ensembleIds: ['sym'], category: 'arriving-late', timeWindow: 'specific', endTime: '10:00' }, events, [], []);
assert.deepEqual(p.creates.map(c => `${c.eventId}/${c.status}`), ['am/LateExcused']);

// 6. Never a downgrade: Absent/Late become excused; excused and Lesson stay;
//    a legacy no-eventId record is updated once, not once per block.
const recs = [
  { id: 'r-am', studentId: 's1', ensembleId: 'sym', date: today, eventId: 'am', status: 'Absent' as const },
  { id: 'r-pm', studentId: 's1', ensembleId: 'sym', date: today, eventId: 'pm', status: 'Lesson' as const },
  { id: 'r-other', studentId: 's2', ensembleId: 'sym', date: today, eventId: 'am', status: 'Absent' as const },
];
p = absenceExcuseMarks({ ...base, ensembleIds: ['sym'] }, events, recs, []);
assert.deepEqual(p.updates, [{ id: 'r-am', status: 'Excused' }]);
assert.equal(p.creates.length, 0, 'another student\'s mark is never read as this one\'s');
const legacy = [{ id: 'old', studentId: 's1', ensembleId: 'sym', date: today, eventId: null, status: 'Late' as const }];
p = absenceExcuseMarks({ ...base, ensembleIds: ['sym'] }, events, legacy, []);
assert.deepEqual(p.updates, [{ id: 'old', status: 'Excused' }]);
assert.equal(p.creates.length, 0);

// 7. Another day's events are never touched.
p = absenceExcuseMarks({ ...base, date: '2026-10-31', ensembleIds: ['sym'] }, events, [], []);
assert.equal(p.creates.length + p.updates.length, 0);

console.log('absenceDecision self-check passed');
