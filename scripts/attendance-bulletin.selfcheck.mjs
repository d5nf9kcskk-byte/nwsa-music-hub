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

console.log('attendance-bulletin.selfcheck: ok');
