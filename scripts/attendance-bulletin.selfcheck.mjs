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

console.log('attendance-bulletin.selfcheck: ok');
