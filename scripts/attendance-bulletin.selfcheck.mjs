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
assert(rows.length === 4, `expected 4 roll rows (withdrawal skipped), got ${rows.length}: ${rows.map(r => r.rawName).join(' | ')}`);

const cats = rows.map(r => r.category).sort().join(',');
assert(cats === 'EXCUSED EARLY,NO SHOWS,NO SHOWS,NO SHOWS', `categories: ${cats}`);

const early = rows.find(r => r.category === 'EXCUSED EARLY');
assert(early?.time === '9:52', `early time: ${early?.time}`);
assert(mapBulletinToAttendance(early)?.status === 'Excused', 'early → Excused');

const students = [
  { id: 's1', name: 'Jane Musicone', grade: '10', status: 'Active', ensembleIds: ['orch'] },
  { id: 's2', name: 'Sam Music Two', grade: '11', status: 'Active', ensembleIds: ['band'] },
  { id: 's3', name: 'Emma Earlybird', grade: '11', status: 'Active', ensembleIds: ['choir'] },
];
const { matched, ambiguous, ignored } = matchBulletinRows(rows, students);
assert(matched.length === 3, `matched ${matched.length}`);
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

console.log('attendance-bulletin.selfcheck: ok');
