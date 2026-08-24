#!/usr/bin/env node
/**
 * Self-check for attendance bulletin parsing + matching.
 * Uses only the anonymized fixture (no real student PII).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  parseAttendanceBulletinText,
  mapBulletinToAttendance,
  matchBulletinRows,
  mergeBulletinMarks,
  schoolDayTardyRows,
} from './lib/attendanceBulletinParse.mjs';

const dir = dirname(fileURLToPath(import.meta.url));
const text = readFileSync(join(dir, 'fixtures/attendance-bulletin-anonymized.txt'), 'utf8');
const { date, rows } = parseAttendanceBulletinText(text);

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exit(1); }
}

assert(date === '2026-08-13', `date expected 2026-08-13, got ${date}`);
assert(rows.length === 5, `expected 5 roll rows (withdrawal skipped), got ${rows.length}: ${rows.map(r => r.rawName).join(' | ')}`);

const cats = rows.map(r => r.category).sort().join(',');
assert(cats === 'EXCUSED EARLY,EXCUSED EARLY,NO SHOWS,NO SHOWS,NO SHOWS', `categories: ${cats}`);

const earlyToday = rows.find(r => r.category === 'EXCUSED EARLY' && r.rawName.includes('EARLYBIRD'));
assert(earlyToday?.time === '9:52', `early time: ${earlyToday?.time}`);
assert(earlyToday?.date === '2026-08-13', `earlyToday date: ${earlyToday?.date}`);
assert(mapBulletinToAttendance(earlyToday)?.status === 'Excused', 'early → Excused');

// A bulletin can carry a same-named EXCUSED EARLY section for a prior day —
// that row must keep ITS OWN date, not fall back to today's bulletin date.
const earlyPriorDay = rows.find(r => r.category === 'EXCUSED EARLY' && r.rawName.includes('MUSICONE'));
assert(earlyPriorDay?.date === '2026-08-12', `earlyPriorDay date: ${earlyPriorDay?.date}`);
assert(earlyPriorDay?.time === '12:15', `earlyPriorDay time: ${earlyPriorDay?.time}`);

const students = [
  { id: 's1', name: 'Jane Musicone', grade: '10', status: 'Active', ensembleIds: ['orch'] },
  { id: 's2', name: 'Sam Music Two', grade: '11', status: 'Active', ensembleIds: ['band'] },
  { id: 's3', name: 'Emma Earlybird', grade: '11', status: 'Active', ensembleIds: ['choir'] },
];
const { matched, ambiguous, ignored } = matchBulletinRows(rows, students);
assert(matched.length === 4, `matched ${matched.length}`);
assert(ignored === 1, `ignored other-dept ${ignored}`);
assert(ambiguous.length === 0, `ambiguous ${ambiguous.length}`);

// A school-day TARDY is not a class mark (#tardies) — late to school says
// nothing about whether the student reached the rehearsal on time. It must
// produce no attendance at all, or the two are indistinguishable forever.
assert(mapBulletinToAttendance({ category: 'TARDY' }) === null, 'a tardy is not a class mark');
assert(mergeBulletinMarks(
  [{ row: { category: 'TARDY', rawName: 'X' }, student: { id: 'd9', name: 'X' } }],
  '2026-08-13',
).length === 0, 'a tardy-only bulletin writes no attendance');

// One student, two sections on the same day (came late, left early). The Hub
// stores one status per student/day, so these must collapse before any write
// or whichever row is processed last wins by accident. The tardy half no
// longer contributes a status — only the excused-early half does.
const dup = [
  { row: { category: 'TARDY', rawName: 'Two Sections' }, student: { id: 'd1', name: 'Two Sections' } },
  { row: { category: 'EXCUSED EARLY', time: '9:52', rawName: 'Two Sections' }, student: { id: 'd1', name: 'Two Sections' } },
];
const merged = mergeBulletinMarks(dup, '2026-08-13');
assert(merged.length === 1, `two rows collapse to one mark, got ${merged.length}`);
assert(merged[0].status === 'Excused', `the excused-early half stands alone, got ${merged[0].status}`);
assert(/Excused early 9:52/.test(merged[0].reason), `the reason survives, got "${merged[0].reason}"`);
assert((merged[0].reason.match(/office bulletin/g) || []).length === 1,
  `the office-bulletin suffix appears once, got "${merged[0].reason}"`);

// …and the tardy half is still recorded, as a school-day tardy.
const tardies = schoolDayTardyRows(dup, '2026-08-13');
assert(tardies.length === 1 && tardies[0].student.id === 'd1', 'the tardy is recorded separately');
assert(tardies[0].date === '2026-08-13', 'the tardy takes the bulletin date');

// Severity still governs the statuses that DO collapse together.
const flip = [
  { row: { category: 'EXCUSED EARLY', rawName: 'X' }, student: { id: 'd2', name: 'X' } },
  { row: { category: 'ABSENT', rawName: 'X' }, student: { id: 'd2', name: 'X' } },
];
assert(mergeBulletinMarks(flip, '2026-08-13')[0].status === 'Absent', 'Absent outranks Excused');
assert(mergeBulletinMarks([...flip].reverse(), '2026-08-13')[0].status === 'Absent',
  'severity does not depend on row order');

// Different students never merge, and a lone mark is untouched.
const solo = mergeBulletinMarks([dup[1]], '2026-08-13');
assert(solo.length === 1 && solo[0].status === 'Excused', 'a lone row keeps its own mark');
assert(mergeBulletinMarks([dup[1], flip[0]], '2026-08-13').length === 2, 'distinct students stay separate');

// Per-row dates x collapse: a late EXCUSED EARLY update for a PRIOR day must
// NOT merge with today's mark for the same student. Same student, different
// days, so two marks — collapsing those would move a prior day's excuse onto
// today and lose the day it actually happened.
const twoDays = mergeBulletinMarks([
  { row: { category: 'ABSENT', rawName: 'A B', date: null }, student: { id: 'x1', name: 'A B' } },
  { row: { category: 'EXCUSED EARLY', time: '9:52', rawName: 'A B', date: '2026-08-18' }, student: { id: 'x1', name: 'A B' } },
], '2026-08-20');
assert(twoDays.length === 2, `different days stay separate, got ${twoDays.length}`);
const today = twoDays.find(m => m.date === '2026-08-20');
const prior = twoDays.find(m => m.date === '2026-08-18');
assert(today?.status === 'Absent', `today's row keeps its own mark, got ${today?.status}`);
assert(prior?.status === 'Excused', `the prior day keeps its own mark, got ${prior?.status}`);
assert(/9:52/.test(prior?.reason ?? ''), 'the prior day keeps its own time');

// Tardies carry per-row dates the same way, and a student is tardy once a day
// however many rows report it — the earliest reported arrival wins.
const tardyDays = schoolDayTardyRows([
  { row: { category: 'TARDY', rawName: 'A B', date: null, time: '8:40' }, student: { id: 'x1', name: 'A B' } },
  { row: { category: 'TARDY', rawName: 'A B', date: null, time: '8:15' }, student: { id: 'x1', name: 'A B' } },
  { row: { category: 'TARDY', rawName: 'A B', date: '2026-08-18' }, student: { id: 'x1', name: 'A B' } },
], '2026-08-20');
assert(tardyDays.length === 2, `one tardy per student per day, got ${tardyDays.length}`);
assert(tardyDays.find(t => t.date === '2026-08-20')?.time === '8:15', 'earliest reported time wins');
assert(tardyDays.find(t => t.date === '2026-08-18')?.time === null, 'a timeless tardy is still recorded');

console.log('attendance-bulletin.selfcheck: ok');
