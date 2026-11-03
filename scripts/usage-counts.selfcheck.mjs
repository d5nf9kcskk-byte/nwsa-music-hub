#!/usr/bin/env node
/**
 * Pins scripts/usage-counts.mjs's output to numbers and concert titles only.
 *
 * Its log is a PUBLIC Actions log (#student-data). The records it reads carry
 * names, emails, free-text reasons and doc ids; none of them may come out.
 * This feeds fake records stuffed with recognisable sensitive values through
 * the same pure functions the script uses and fails if any of them reaches
 * the printed lines, if a line breaks the allowed shapes, or if the counts
 * are wrong.
 */
import assert from 'node:assert/strict';
import {
  buildReport, formatReport, assertSafeReport, pickTerm, cleanTitle,
} from './lib/usageCounts.mjs';

const terms = [
  { id: '2026-fall', name: 'Fall 2026', start: '2026-08-17', end: '2026-12-19' },
  { id: '2027-spring', name: 'Spring 2027', start: '2027-01-06', end: '2027-06-03' },
];
const timeZone = 'America/New_York';
const today = '2026-11-03';
const term = pickTerm(terms, today);
assert.equal(term.id, '2026-fall');
assert.equal(pickTerm(terms, '2026-12-28').id, '2026-fall', 'winter gap counts the term just finished');

// Values that must NEVER appear in output.
const SECRET = [
  'stuSecretId1', 'stuSecretId2', 'stuSecretId3', 'gGuestSecret',
  'Zelda Fakename', 'Ignatius Notreal', 'zelda@students.example.net',
  'parent@example.com', 'stomach flu, see note', 'evtSecretDoc', 'absSecretDoc',
  'Need Violin 2 part please', 'copySecretDoc', 'respSecretDoc', 'weird-status-word',
];

const students = [
  { id: 'stuSecretId1', name: 'Zelda Fakename', ensembleIds: ['sym'], status: 'Active' },
  { id: 'stuSecretId2', name: 'Ignatius Notreal', ensembleIds: ['sym'], status: 'Active' },
  { id: 'stuSecretId3', name: 'Old Grad', ensembleIds: ['sym'], status: 'Graduated' },
  { id: 'stuAud', name: 'Audience Kid', ensembleIds: ['band'], status: 'Active' },
];
const events = [
  { id: 'evtSecretDoc', type: 'Concert', date: '2026-10-03', title: 'Fall | Concert\nNight', ensembleIds: ['sym'], attendanceEnsembleIds: ['band'] },
  { id: 'e2', type: 'Concert', date: '2026-10-10', title: 'Cancelled One', status: 'Cancelled', ensembleIds: ['sym'] },
  { id: 'e3', type: 'Concert', date: '2026-12-01', title: 'Future Concert', ensembleIds: ['sym'] },
  { id: 'e4', type: 'Rehearsal', date: '2026-10-05', title: 'Plain Rehearsal', ensembleIds: ['sym'] },
  { id: 'e5', type: 'Other', date: '2026-10-20', title: 'Faculty Recital', ensembleIds: [], concertAttendance: 'required' },
];
const scan = (eventId, studentId, kind, extra = {}) => ({
  eventId, studentId, kind, studentName: 'Zelda Fakename', email: 'zelda@students.example.net', termId: '2026-fall', ...extra,
});
const checkins = [
  scan('evtSecretDoc', 'stuSecretId1', 'in'),
  scan('evtSecretDoc', 'stuSecretId1', 'out'),
  scan('evtSecretDoc', 'stuSecretId2', 'in'),
  scan('evtSecretDoc', 'gGuestSecret', 'in', { guest: true }),
  scan('e5', 'stuAud', 'in'),
];
const at = d => Date.parse(`${d}T15:00:00Z`);
const absences = [
  { id: 'absSecretDoc', date: '2026-09-02', status: 'approved', reason: 'stomach flu, see note', studentName: 'Zelda Fakename' },
  { date: '2026-09-03', reason: 'x' }, // older writer: no status = pending
  { date: '2026-09-04', status: 'declined' },
  { date: '2026-09-05', status: 'weird-status-word' },
  { date: '2026-06-01', status: 'approved' }, // last term
];
const signupResponses = [
  { id: 'respSecretDoc', submittedAt: at('2026-09-10'), studentName: 'Ignatius Notreal', email: 'parent@example.com' },
  { submittedAt: at('2026-10-10') },
  { submittedAt: at('2026-08-01') }, // before the term
];
const copyRequests = [
  { id: 'copySecretDoc', submittedAt: at('2026-09-12'), status: 'new', notes: 'Need Violin 2 part please' },
  { submittedAt: at('2026-09-13'), status: 'done' },
  { submittedAt: at('2027-02-01'), status: 'new' }, // next term
];

const report = buildReport({ term, today, timeZone, events, checkins, students, absences, signupResponses, copyRequests });
const lines = formatReport(report);
const text = lines.join('\n');

// 1. Nothing sensitive leaks.
for (const s of SECRET) assert.ok(!text.includes(s), `output leaked a fake sensitive value (${SECRET.indexOf(s)})`);
assert.ok(!/@/.test(text), 'output contains an @');

// 2. Every line is an allowed shape, and the guard refuses anything else.
assertSafeReport(lines, { termName: report.term.name, allowedTitles: report.concerts.map(c => c.title) });
for (const bad of [
  [...lines, 'Zelda Fakename'],
  [...lines, 'Concert | 2026-10-03 | Zelda Fakename | arrivals 1 | departures 1 | both 1 | guests 0 | expected 1'],
  [...lines, 'Sign-up responses | total 3 | zelda@students.example.net'],
  [...lines, 'Copy requests | total 2 | new 1 | done 1 | declined 0 | other 0 | stuSecretId1'],
]) {
  assert.throws(() => assertSafeReport(bad, { termName: report.term.name, allowedTitles: report.concerts.map(c => c.title) }));
}
// The guard's own error never quotes the line it refused.
try {
  assertSafeReport(['Zelda Fakename'], { termName: 'x', allowedTitles: [] });
} catch (e) {
  assert.ok(!String(e.message).includes('Zelda'), 'guard error quotes the refused line');
}

// 3. The numbers are right.
assert.equal(report.concerts.length, 2, 'past, non-cancelled concerts + scanned Required event; not future, cancelled or rehearsal');
const [fall, recital] = report.concerts;
assert.equal(fall.title, cleanTitle('Fall | Concert\nNight'));
assert.ok(!fall.title.includes('|'));
assert.deepEqual(
  { a: fall.arrivals, d: fall.departures, b: fall.both, g: fall.guests, e: fall.expected },
  { a: 3, d: 1, b: 1, g: 1, e: 3 }, // 2 active performers + 1 audience; graduate excluded
);
assert.equal(recital.expected, 4 - 1, 'an event listing nobody is school-wide: every active student');
assert.equal(recital.arrivals, 1);
assert.deepEqual(report.absences, { total: 4, pending: 1, approved: 1, declined: 1, dismissed: 0, other: 1 });
assert.equal(report.signupResponses, 2);
assert.deepEqual(report.copyRequests, { total: 2, new: 1, done: 1, declined: 0, other: 0 });

console.log('usage-counts self-check: ok');
