// Pins #copy-requests: whose screen a request lands on, and the vague-part warning.
// Run: npx tsx src/shared/copyRequest.selfcheck.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { COPY_LIMITS, COPY_REQUEST_REASONS, copyRequestIsMine, partLooksVague, sortCopyRequests } from './copyRequest';

const staffed = new Set(['symphony', 'band']);
const hasStaff = (id: string) => staffed.has(id);

// 1. My group: mine. Someone else's staffed group: not mine.
assert.equal(copyRequestIsMine({ ensembleId: 'symphony' }, ['symphony'], hasStaff), true);
assert.equal(copyRequestIsMine({ ensembleId: 'band' }, ['symphony'], hasStaff), false);
// 2. A group nobody is assigned to reaches every director, so nothing is dropped.
assert.equal(copyRequestIsMine({ ensembleId: 'choir' }, ['symphony'], hasStaff), true);
// 3. A director with no groups sees everything.
assert.equal(copyRequestIsMine({ ensembleId: 'band' }, [], hasStaff), true);

// 4. Vague parts warn; specific ones do not; blank is not "vague".
for (const p of ['Violin', 'trumpet', 'Clarinet in Bb', 'Horn']) assert.equal(partLooksVague(p), true, p);
for (const p of ['Violin 2', 'Violin II', 'Horn 3 in F', '2nd Trumpet', 'Flute I', 'Solo Cello', 'Trumpet 1 in B♭', 'Percussion 3', 'Viola only']) {
  assert.equal(partLooksVague(p), false, p);
}
assert.equal(partLooksVague('   '), false);

// 5. Open requests first, newest first within each.
assert.deepEqual(
  sortCopyRequests([
    { id: 'a', status: 'done' as const, submittedAt: 5 },
    { id: 'b', status: 'new' as const, submittedAt: 1 },
    { id: 'c', status: 'new' as const, submittedAt: 3 },
  ]).map(r => r.id),
  ['c', 'b', 'a'],
);

// 6. The rules file carries the same reason list and ceilings.
const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
const block = rules.slice(rules.indexOf('match /copyRequests/'), rules.indexOf('match /copyRequests/') + 4000);
assert.ok(block.length > 100, 'firestore.rules has a /copyRequests clause');
assert.ok(block.includes(`[${COPY_REQUEST_REASONS.map(r => `'${r}'`).join(', ')}]`), 'reason list matches the rules');
for (const [k, n] of Object.entries(COPY_LIMITS)) {
  if (k === 'partMin') assert.ok(block.includes(`part.size() >= ${n}`), 'part floor matches');
  else assert.ok(block.includes(`${k}.size() <= ${n}`), `${k} ceiling matches the rules`);
}
// Staff-only read: a request names a student and is never world-readable.
assert.ok(/allow read, update, delete: if isStaff\(\);/.test(block), 'copyRequests read is staff-only');

console.log('copyRequest self-check OK');
