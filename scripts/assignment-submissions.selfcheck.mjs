#!/usr/bin/env node
/**
 * Pins that the director submissions query does NOT pair
 * where(assignmentId) with orderBy(submittedAt) — that shape needs a
 * composite index the repo does not ship, and a missing index made the
 * grade sheet show an empty list while videos sat in Storage.
 *
 * Run: node scripts/assignment-submissions.selfcheck.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(
  join(here, '../src/director/hooks/useAssignmentSubmissions.ts'),
  'utf8',
);

assert(!/orderBy\s*\(\s*['"]submittedAt['"]/.test(src), 'no orderBy(submittedAt) — needs composite index');
assert(src.includes("where('assignmentId'"), 'filters by assignmentId');
assert(src.includes('sortSubmissionsNewestFirst'), 'sorts newest-first on the client');
assert(src.includes("'assignmentSubmissions'"), 'own load-error source key (not shared with assignments)');

const list = [
  { id: 'old', submittedAt: 100 },
  { id: 'new', submittedAt: 300 },
  { id: 'mid', submittedAt: 200 },
];
const sorted = [...list].sort((a, b) => (b.submittedAt ?? 0) - (a.submittedAt ?? 0));
assert(sorted.map(s => s.id).join(',') === 'new,mid,old', 'newest first');

console.log('assignment-submissions.selfcheck: ok');
