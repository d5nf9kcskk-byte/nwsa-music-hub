/**
 * Runnable self-check:  npx tsx src/director/lessonMirrorWrite.selfcheck.ts
 *
 * Pins how useLessons.updateLesson writes the public mirror (#privacy,
 * #applied).
 *
 * `/lessonsPublic` is pinned to an exact key allowlist, and a Firestore MERGE
 * cannot REMOVE a key. So a mirror doc that has ever drifted outside that
 * allowlist fails the rule on every later save — and because the mirror rides
 * in the SAME batch as the lesson, the rejection takes the lesson's own write
 * down with it. The teacher gets "Lesson update failed to save", the retry
 * does the identical thing, and the log they just typed is gone.
 *
 * That is not hypothetical: `lessonsPublic/6wpSwYNwxJtBnvr1LQdi` picked up
 * `updatedAt` + `updatedBy` on 2026-11-05 and made that lesson unsaveable
 * until the mirror write was changed to REPLACE rather than merge. Verified
 * against the real firestore.rules in the emulator: merge → rejected,
 * replace → accepted, and the doc repairs itself.
 *
 *   1. updateLesson reads the lesson, then SETS the mirror with no merge.
 *   2. Projecting a drifted doc yields the allowlist and nothing else, so a
 *      save heals the drift instead of failing on it.
 *   3. A partial payload still publishes the WHOLE projection — replacing
 *      must never blank a student's lesson time.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { publicLessonFields } from './publicMirror';
import type { Lesson } from './types';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`lessonMirrorWrite.selfcheck: ${msg}`);
}

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p: string) => readFileSync(resolve(repo, p), 'utf8');

// ── 1. The write replaces the mirror ─────────────────────────────────
const hook = read('src/director/hooks/useLessons.ts');
const start = hook.indexOf('async function updateLesson(');
assert(start > 0, 'updateLesson still exists in useLessons.ts');
const body = hook.slice(start, hook.indexOf('\n  async function', start + 1));

assert(
  /getDoc\(doc\(dbRef, 'lessons', id\)\)/.test(body),
  'updateLesson reads the lesson before projecting it — the payload alone is a '
  + 'PARTIAL, and the local snapshot is stale within one save',
);
const replace = body.match(/batch\.set\(mirror, publicLessonFields\(\{ \.\.\.after, \.\.\.payload \}\)\)([^\n]*)/);
assert(replace, 'updateLesson sets the mirror from the lesson plus this write');
assert(
  !replace[1]!.includes('merge'),
  'the mirror set carries NO { merge: true } — a merge cannot remove a key, so a '
  + 'drifted mirror doc would fail the /lessonsPublic allowlist on every save and '
  + 'take the lesson write with it',
);

// ── 2. A drifted doc heals ───────────────────────────────────────────
const keyList = read('src/director/publicMirror.ts').match(/const PUBLIC_LESSON_KEYS = \[([^\]]*)\]/);
assert(keyList, 'PUBLIC_LESSON_KEYS is readable from publicMirror.ts');
const allowed = [...keyList[1]!.matchAll(/'([^']+)'/g)].map(m => m[1]!);

const after: Lesson = {
  id: 'L1', teacherEmail: 't@x.org', teacherName: 'A Teacher', studentId: 's1',
  date: '2026-11-06', startTime: '11:45', endTime: '12:35', status: 'Scheduled',
  location: '4103', instrument: 'Violin', createdAt: 0,
};
// The live broken shape: staff metadata that no allowlist names.
const drifted = { ...after, updatedAt: 1793887492915, updatedBy: 'Dr. Grant Gilman' };
const payload = { grade: '95', gradeNote: 'Scales', updatedAt: Date.now(), updatedBy: 'A Teacher' };

const healed = Object.keys(publicLessonFields({ ...drifted, ...payload })).sort();
assert(
  healed.join(',') === [...allowed].sort().join(','),
  `projecting a drifted doc must yield exactly the allowlist, got: ${healed.join(', ')}`,
);
for (const stray of ['updatedAt', 'updatedBy', 'grade', 'gradeNote']) {
  assert(!healed.includes(stray), `${stray} never reaches the mirror`);
}

// ── 3. Replacing never blanks a lesson time ──────────────────────────
// The partial carries none of the eight; the projection must still be whole,
// or a graded lesson would vanish from the student's own calendar feed.
const fromPartial = publicLessonFields({ ...after, ...payload });
assert(fromPartial.date === '2026-11-06', 'the date survives a grade-only save');
assert(fromPartial.startTime === '11:45', 'the start time survives a grade-only save');
assert(fromPartial.endTime === '12:35', 'the end time survives a grade-only save');
assert(fromPartial.location === '4103', 'the room survives a grade-only save');
assert(Object.keys(fromPartial).length === allowed.length, 'the whole projection is published');

// A field the save CLEARS does leave the mirror — the thing a merge could not
// say, and why saveLesson needed syncLessonMirror to clean up after it.
const cleared = publicLessonFields({ ...after, ...payload, location: undefined });
assert(!('location' in cleared), 'a cleared room leaves the mirror');

console.log('lessonMirrorWrite.selfcheck: ok');
