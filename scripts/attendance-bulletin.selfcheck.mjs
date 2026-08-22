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

// One student, two sections on the same day (came late, left early). The Hub
// stores one status per student/day, so these must collapse before any write
// or whichever row is processed last wins by accident.
const dup = [
  { row: { category: 'TARDY', rawName: 'Two Sections' }, student: { id: 'd1', name: 'Two Sections' } },
  { row: { category: 'EXCUSED EARLY', time: '9:52', rawName: 'Two Sections' }, student: { id: 'd1', name: 'Two Sections' } },
];
const merged = mergeBulletinMarks(dup, '2026-08-13');
assert(merged.length === 1, `two rows collapse to one mark, got ${merged.length}`);
assert(merged[0].status === 'Late', `Late outranks Excused, got ${merged[0].status}`);
assert(/Tardy/.test(merged[0].reason) && /Excused early 9:52/.test(merged[0].reason),
  `both reasons preserved, got "${merged[0].reason}"`);
assert((merged[0].reason.match(/office bulletin/g) || []).length === 1,
  `the office-bulletin suffix appears once, got "${merged[0].reason}"`);

// Absent outranks Late regardless of which row came first.
const flip = [
  { row: { category: 'TARDY', rawName: 'X' }, student: { id: 'd2', name: 'X' } },
  { row: { category: 'ABSENT', rawName: 'X' }, student: { id: 'd2', name: 'X' } },
];
assert(mergeBulletinMarks(flip, '2026-08-13')[0].status === 'Absent', 'Absent outranks Late');
assert(mergeBulletinMarks([...flip].reverse(), '2026-08-13')[0].status === 'Absent',
  'severity does not depend on row order');

// Different students never merge, and a lone mark is untouched.
const solo = mergeBulletinMarks([dup[0]], '2026-08-13');
assert(solo.length === 1 && solo[0].status === 'Late', 'a lone row keeps its own mark');
assert(mergeBulletinMarks([dup[0], flip[0]], '2026-08-13').length === 2, 'distinct students stay separate');

// Per-row dates x collapse: a late EXCUSED EARLY update for a PRIOR day must
// NOT merge with today's mark for the same student. Same student, different
// days, so two marks — collapsing those would move a prior day's excuse onto
// today and lose the day it actually happened.
const twoDays = mergeBulletinMarks([
  { row: { category: 'TARDY', rawName: 'A B', date: null }, student: { id: 'x1', name: 'A B' } },
  { row: { category: 'EXCUSED EARLY', time: '9:52', rawName: 'A B', date: '2026-08-18' }, student: { id: 'x1', name: 'A B' } },
], '2026-08-20');
assert(twoDays.length === 2, `different days stay separate, got ${twoDays.length}`);
const today = twoDays.find(m => m.date === '2026-08-20');
const prior = twoDays.find(m => m.date === '2026-08-18');
assert(today?.status === 'Late', `today's row keeps its own mark, got ${today?.status}`);
assert(prior?.status === 'Excused', `the prior day keeps its own mark, got ${prior?.status}`);
assert(/9:52/.test(prior?.reason ?? ''), 'the prior day keeps its own time');

console.log('attendance-bulletin.selfcheck: ok');
