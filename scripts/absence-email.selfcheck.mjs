#!/usr/bin/env node
/**
 * Self-check for absence-email parsing + matching.
 * Uses only the anonymized fixture (no real student/parent PII).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseAbsenceEmail, extractDates, looksLikeAbsenceEmail } from './lib/absenceEmailParse.mjs';

const dir = dirname(fileURLToPath(import.meta.url));
const emails = JSON.parse(readFileSync(join(dir, 'fixtures/absence-email-anonymized.json'), 'utf8'));

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exit(1); }
}

const students = [
  { id: 's1', name: 'Jane Musicone', grade: '10', status: 'Active' },
  { id: 's2', name: 'Sam Music Two', grade: '11', status: 'Active' },
  { id: 's3', name: 'Emma Earlybird', grade: '11', status: 'Active' },
];

const results = emails.map(email => parseAbsenceEmail(email, students));

// #1: clean single-student, single-date match → auto-write.
assert(results[0].status === 'matched', `fixture 1 expected matched, got ${results[0].status}`);
assert(results[0].studentId === 's1', `fixture 1 expected s1, got ${results[0].studentId}`);
assert(results[0].date === '2026-08-20', `fixture 1 expected 2026-08-20, got ${results[0].date}`);

// #2: "today" resolves relative to the email's own received date, not "now".
assert(results[1].status === 'matched', `fixture 2 expected matched, got ${results[1].status}`);
assert(results[1].studentId === 's2', `fixture 2 expected s2, got ${results[1].studentId}`);
assert(results[1].date === '2026-08-19', `fixture 2 expected 2026-08-19, got ${results[1].date}`);

// #3: no absence language at all → ignored, nothing written or queued.
assert(results[2].status === 'ignored', `fixture 3 expected ignored, got ${results[2].status}`);

// #4: absence-shaped but no roster name recognized → queued for a human.
assert(results[3].status === 'ambiguous', `fixture 4 expected ambiguous, got ${results[3].status}`);
assert(results[3].candidateIds.length === 0, 'fixture 4 should have no candidates');

// #5: two roster names in one email → queued rather than guessing which.
assert(results[4].status === 'ambiguous', `fixture 5 expected ambiguous, got ${results[4].status}`);
assert(results[4].candidateIds.length === 2, `fixture 5 expected 2 candidates, got ${results[4].candidateIds.length}`);

// Weekday / explicit-date resolution, pinned independent of the fixture.
assert(extractDates('see you Monday', '2026-08-19').includes('2026-08-24'), 'bare weekday → nearest upcoming');
assert(extractDates('out on 8/21', '2026-08-19').includes('2026-08-21'), 'explicit M/D resolves this year');
assert(!looksLikeAbsenceEmail('Great concert last night!'), 'unrelated email is not absence-shaped');

console.log('absence-email.selfcheck: ok');
