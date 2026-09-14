/**
 * Self-check for the chunked-upload finalize step (#video-upload-reliability
 * Phase 2).
 * Run: node --experimental-strip-types functions/src/composeSubmission.selfcheck.ts
 *
 * Runs in deploy-functions.yml BEFORE any credential is written, alongside
 * every other trigger's guard. This is pure-logic-only: it exercises
 * validateRequest/composeMany/composeSubmission against fake in-memory
 * Firestore/Storage doubles, so it needs no project and no credential — but
 * that also means it CANNOT verify the real GCS Bucket#combine()/File#
 * exists()/setMetadata() calls actually behave the way this file assumes
 * against a live bucket. That gap is called out explicitly in the PR; a
 * manual test against a real (or emulated) project is the way to close it.
 *
 * What this pins:
 *
 *   1. Every malformed-input case is rejected BEFORE any fake Storage/
 *      Firestore call happens — validation must be cheap-first.
 *   2. The real chunk check: fewer files than claimed, a gap in the index
 *      sequence, and a size that doesn't match are all refused, even though
 *      storage.rules can only ever bound ONE chunk's size.
 *   3. The >32-chunk fold produces a chain of combine() calls that ends at
 *      the real destination, in the correct numeric chunk order, and cleans
 *      up every intermediate accumulator — never the original chunks
 *      (assumed to run through the identical <=32 path already covered by
 *      the small-chunk-count assertions here).
 *   4. TWO separate idempotent short-circuits, each provably skipping the
 *      Storage work it doesn't need: a session whose assignmentSubmissions
 *      doc already exists never touches the bucket at all; a session whose
 *      FINAL object already exists (but has no submission doc yet) never
 *      calls combine() again, but still finishes the submission.
 */
import {
  composeMany, composeSubmission, validateRequest,
  type ComposeDeps, type FirestoreLike, type StorageBucketLike, type StorageFileLike, type StorageObjectMeta,
} from './composeSubmission.ts';
import { chunkPartPath } from '../../src/shared/submissionChunks.ts';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

const ASSIGNMENT_ID = 'asg-exam-1';
const STUDENT_ID = 'stu-1';
const SESSION_ID = '11111111-2222-4333-8444-555555555555';

function baseRequest(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: SESSION_ID,
    assignmentId: ASSIGNMENT_ID,
    studentId: STUDENT_ID,
    studentName: 'Ruiz, Maya',
    fileName: 'recording-123.webm',
    contentType: 'video/webm',
    chunkCount: 3,
    totalSize: 300,
    videoDurationSeconds: 42,
    ...overrides,
  };
}

// ── 1. Cheap validation, no network at all ────────────────────────────────
const throwingDb: FirestoreLike = {
  doc: () => { throw new Error('validateRequest must never reach Firestore'); },
};
const throwingBucket: StorageBucketLike = {
  name: 'unused',
  file: () => { throw new Error('validateRequest must never reach Storage'); },
  getFiles: async () => { throw new Error('validateRequest must never reach Storage'); },
  combine: async () => { throw new Error('validateRequest must never reach Storage'); },
};
const throwingDeps: ComposeDeps = { db: throwingDb, bucket: throwingBucket, now: () => 0 };

for (const bad of [
  {}, // nothing at all
  baseRequest({ sessionId: 'not-a-uuid' }),
  baseRequest({ assignmentId: '../etc/passwd' }),
  baseRequest({ assignmentId: 'a/b' }),
  baseRequest({ studentId: '' }),
  baseRequest({ studentName: '' }),
  baseRequest({ studentName: 'x'.repeat(121) }),
  baseRequest({ fileName: '' }),
  baseRequest({ contentType: 'application/octet-stream' }),
  baseRequest({ chunkCount: 0 }),
  baseRequest({ chunkCount: 1.5 }),
  baseRequest({ chunkCount: 100_000 }),
  baseRequest({ totalSize: 0 }),
  baseRequest({ totalSize: -5 }),
  baseRequest({ videoDurationSeconds: -1 }),
  baseRequest({ notes: 'x'.repeat(501) }),
]) {
  const v = validateRequest(bad);
  assert(!v.ok, `rejected: ${JSON.stringify(bad).slice(0, 80)}`);
  assert((v as { failure?: string }).failure === 'bad-request', 'failure reason is bad-request');
}
assert(validateRequest(baseRequest()).ok, 'a well-formed request validates');

// composeSubmission() itself must reject bad input before EVER calling the
// (throwing) fakes — proves validation genuinely runs first in the real
// entry point, not just in validateRequest() considered alone.
{
  const out = await composeSubmission({}, throwingDeps);
  assert(!out.ok && out.failure === 'bad-request', 'composeSubmission validates before touching Storage or Firestore');
}

// ── Fakes ──────────────────────────────────────────────────────────────────

function fakeDb(seed: Record<string, Record<string, unknown>> = {}): FirestoreLike & { docs: typeof seed } {
  const docs = { ...seed };
  return {
    docs,
    doc(path: string) {
      return {
        async get() {
          return { exists: path in docs, data: () => docs[path] };
        },
        async set(data: Record<string, unknown>) {
          docs[path] = data;
        },
      };
    },
  };
}

interface FakeBucket extends StorageBucketLike {
  composedCalls: { dest: string; sources: string[] }[];
  deleted: string[];
  metadataSet: { name: string; metadata: Record<string, unknown> }[];
  /** Test-only: mark an object as already present WITHOUT going through
   *  combine() — for setting up the "a prior attempt already finished this
   *  part" scenarios without polluting composedCalls/metadataSet. */
  _seedExists(name: string): void;
}

function fakeBucket(chunks: { name: string; size: number; timeCreated?: string }[]): FakeBucket {
  const files = new Map<string, StorageObjectMeta>(
    chunks.map(c => [c.name, { name: c.name, metadata: { size: c.size, timeCreated: c.timeCreated } }]),
  );
  const existing = new Set<string>();
  const composedCalls: FakeBucket['composedCalls'] = [];
  const deleted: string[] = [];
  const metadataSet: FakeBucket['metadataSet'] = [];

  function makeFile(name: string): StorageFileLike {
    return {
      name,
      async exists() { return [existing.has(name)]; },
      async delete() { deleted.push(name); files.delete(name); existing.delete(name); },
      async setMetadata(metadata: Record<string, unknown>) { metadataSet.push({ name, metadata }); },
    };
  }

  return {
    name: 'test-bucket',
    composedCalls, deleted, metadataSet,
    _seedExists: (name: string) => { existing.add(name); },
    async getFiles({ prefix }) {
      return [[...files.values()].filter(f => f.name.startsWith(prefix))];
    },
    file: makeFile,
    async combine(sources: string[], destination: string) {
      composedCalls.push({ dest: destination, sources: [...sources] });
      existing.add(destination);
    },
  };
}

function chunkNamesFor(count: number, sizeEach: number, tCreated = '2026-09-01T00:00:00.000Z') {
  return Array.from({ length: count }, (_, i) => ({
    name: chunkPartPath(ASSIGNMENT_ID, STUDENT_ID, SESSION_ID, i),
    size: sizeEach,
    timeCreated: tCreated,
  }));
}

const ASSIGNMENT_DOC = { 'assignments/asg-exam-1': { acceptsVideoSubmissions: true, maxVideoSizeMB: 10 } };
const STUDENT_DOC = { 'students/stu-1': { name: 'Maya Ruiz' } };

// ── 2. Real chunk verification ────────────────────────────────────────────
{
  const db = fakeDb({ ...ASSIGNMENT_DOC, ...STUDENT_DOC });
  const bucket = fakeBucket(chunkNamesFor(2, 100)); // only 2 of the claimed 3 chunks landed
  const out = await composeSubmission(baseRequest({ chunkCount: 3, totalSize: 300 }), { db, bucket, now: () => 1 });
  assert(!out.ok && out.failure === 'chunks-missing', 'fewer real chunks than claimed is refused');
  assert(bucket.composedCalls.length === 0, 'never composes when chunks are missing');
}
{
  // A gap: indices 0, 1, 3 present (3 files, matching the claimed count),
  // but index 2 never landed — file COUNT alone would not catch this.
  const db = fakeDb({ ...ASSIGNMENT_DOC, ...STUDENT_DOC });
  const gapChunks = [0, 1, 3].map(i => ({ name: chunkPartPath(ASSIGNMENT_ID, STUDENT_ID, SESSION_ID, i), size: 100 }));
  const bucket = fakeBucket(gapChunks);
  const out = await composeSubmission(baseRequest({ chunkCount: 3, totalSize: 300 }), { db, bucket, now: () => 1 });
  assert(!out.ok && out.failure === 'chunks-missing', 'a gap in the index sequence is refused even with the right file count');
}
{
  const db = fakeDb({ ...ASSIGNMENT_DOC, ...STUDENT_DOC });
  const bucket = fakeBucket(chunkNamesFor(3, 100)); // real total = 300
  const out = await composeSubmission(baseRequest({ chunkCount: 3, totalSize: 999 }), { db, bucket, now: () => 1 });
  assert(!out.ok && out.failure === 'size-mismatch', 'claimed size that disagrees with the real chunk sum is refused');
}
{
  // maxVideoSizeMB is 10 (1 MB = 1,048,576 B) — claim something under that
  // cap but whose REAL chunks sum over it; the cap has to bind the SUM,
  // which storage.rules structurally cannot do per-chunk.
  const db = fakeDb({ ...ASSIGNMENT_DOC, ...STUDENT_DOC });
  const bigEach = 4 * 1024 * 1024; // 3 × 4 MiB = 12 MiB > 10 MiB cap
  const bucket = fakeBucket(chunkNamesFor(3, bigEach));
  const out = await composeSubmission(
    baseRequest({ chunkCount: 3, totalSize: bigEach * 3 }),
    { db, bucket, now: () => 1 },
  );
  assert(!out.ok && out.failure === 'too-large', 'the REAL combined size is checked against maxVideoSizeMB, not just the claim');
}
{
  const db = fakeDb({ 'students/stu-1': { name: 'x' } }); // no assignment doc at all
  const bucket = fakeBucket(chunkNamesFor(3, 100));
  const out = await composeSubmission(baseRequest(), { db, bucket, now: () => 1 });
  assert(!out.ok && out.failure === 'unknown-assignment', 'an assignment that does not exist is refused');
}
{
  const db = fakeDb({ 'assignments/asg-exam-1': { acceptsVideoSubmissions: false, maxVideoSizeMB: 10 } });
  const bucket = fakeBucket(chunkNamesFor(3, 100));
  const out = await composeSubmission(baseRequest(), { db, bucket, now: () => 1 });
  assert(!out.ok && out.failure === 'unknown-assignment', 'an assignment that does not accept video is refused the same way');
}
{
  const db = fakeDb({ ...ASSIGNMENT_DOC });
  const bucket = fakeBucket(chunkNamesFor(3, 100));
  const out = await composeSubmission(baseRequest(), { db, bucket, now: () => 1 });
  assert(!out.ok && out.failure === 'unknown-student', 'a student that does not exist is refused');
}

// ── Happy path, small session (<=32 chunks, one compose call) ─────────────
{
  const db = fakeDb({ ...ASSIGNMENT_DOC, ...STUDENT_DOC });
  const bucket = fakeBucket(chunkNamesFor(3, 100, '2026-09-01T12:00:00.000Z'));
  const out = await composeSubmission(baseRequest(), { db, bucket, now: () => 999 });
  assert(out.ok, `happy path succeeds: ${JSON.stringify(out)}`);
  assert(out.submissionId === 'chunked-11111111-2222-4333-8444-555555555555', 'doc id is derived from the session id');
  assert(bucket.composedCalls.length === 1, 'exactly one compose call for a small session');
  assert(
    bucket.composedCalls[0].sources.join(',') === chunkNamesFor(3, 100).map(c => c.name).join(','),
    'chunks are composed in ascending numeric order',
  );
  assert(bucket.composedCalls[0].dest.startsWith(`submissions/${ASSIGNMENT_ID}/${STUDENT_ID}/`), 'composes to the real submissions/ path');
  // Stable timestamp from the chunks' own upload time, not Date.now().
  assert(bucket.composedCalls[0].dest.includes(String(new Date('2026-09-01T12:00:00.000Z').getTime())),
    'the final path timestamp comes from the chunks’ own upload time, so a retry lands on the same path');
  assert(bucket.deleted.length === 3, 'the three original chunks are deleted after a successful compose');
  const finalMeta = bucket.metadataSet.find(m => m.name === bucket.composedCalls[0].dest);
  assert(finalMeta?.metadata.contentType === 'video/webm',
    'the real content type is set explicitly after compose, not left to combine() to guess from the filename');
  assert('firebaseStorageDownloadTokens' in (finalMeta?.metadata.metadata as Record<string, unknown> ?? {}),
    'a download token is minted on the final object, in the SAME write as the content type');
  assert(typeof out.videoUrl === 'string' && out.videoUrl!.includes('firebasestorage.googleapis.com'), 'returns a usable download URL');
  const stored = db.docs[`assignmentSubmissions/${out.submissionId}`];
  assert(stored?.status === 'submitted' && stored?.fileSize === 300, 'the submission doc is written with the REAL summed size');
}

// ── The >32-chunk fold ─────────────────────────────────────────────────────
{
  const N = 45;
  const db = fakeDb({
    'assignments/asg-exam-1': { acceptsVideoSubmissions: true, maxVideoSizeMB: 10_000 }, // generous cap for this test
    ...STUDENT_DOC,
  });
  const bucket = fakeBucket(chunkNamesFor(N, 10));
  const out = await composeSubmission(baseRequest({ chunkCount: N, totalSize: N * 10 }), { db, bucket, now: () => 1 });
  assert(out.ok, `45-chunk session succeeds: ${JSON.stringify(out)}`);
  assert(bucket.composedCalls.length >= 2, 'more than 32 chunks requires more than one compose call');
  const finalCall = bucket.composedCalls[bucket.composedCalls.length - 1];
  assert(finalCall.dest.startsWith(`submissions/${ASSIGNMENT_ID}/${STUDENT_ID}/`), 'the LAST compose call targets the real destination');
  const finalMetaBig = bucket.metadataSet.find(m => m.name === finalCall.dest);
  assert(finalMetaBig?.metadata.contentType === 'video/webm', 'the real content type is set on the true final object, however many rounds it took');
  for (const call of bucket.composedCalls.slice(0, -1)) {
    assert(call.dest !== finalCall.dest, 'every earlier call is an intermediate accumulator, never the real destination');
  }
  // Original 45 chunks deleted, no accumulator left behind.
  assert(bucket.deleted.filter(n => n.includes(`/${SESSION_ID}/`)).length === N, 'all original chunks are deleted');
  const leftoverAccumulators = [...bucket.composedCalls.map(c => c.dest)]
    .filter(name => name !== finalCall.dest && !bucket.deleted.includes(name));
  assert(leftoverAccumulators.length === 0, 'every intermediate accumulator object is cleaned up, not just the original chunks');
}

// ── 4. Idempotent short-circuits ──────────────────────────────────────────
{
  // #1: the submission doc already exists — must never touch Storage at all.
  const db = fakeDb({
    ...ASSIGNMENT_DOC, ...STUDENT_DOC,
    'assignmentSubmissions/chunked-11111111-2222-4333-8444-555555555555': {
      status: 'submitted', videoUrl: 'https://example.test/already-done.mp4',
    },
  });
  const out = await composeSubmission(baseRequest(), { db, bucket: throwingBucket, now: () => 1 });
  assert(out.ok && out.videoUrl === 'https://example.test/already-done.mp4',
    'a session that already produced a submission returns the SAME videoUrl without touching Storage');
}
{
  // #2: the final Storage object already exists (a prior attempt composed
  // successfully but died before writing Firestore) — compose() must not
  // run a second time, but the submission still gets created.
  const db = fakeDb({ ...ASSIGNMENT_DOC, ...STUDENT_DOC });
  const bucket = fakeBucket(chunkNamesFor(3, 100, '2026-09-01T12:00:00.000Z'));
  const finalPath = `submissions/${ASSIGNMENT_ID}/${STUDENT_ID}/${new Date('2026-09-01T12:00:00.000Z').getTime()}-recording-123.webm`;
  // A prior attempt composed successfully but died before writing Firestore
  // — simulate that by marking the final object present WITHOUT going
  // through compose(), so composedCalls starts empty for this assertion.
  bucket._seedExists(finalPath);

  const out = await composeSubmission(baseRequest(), { db, bucket, now: () => 1 });
  assert(out.ok, `succeeds when the final object already exists: ${JSON.stringify(out)}`);
  assert(bucket.composedCalls.length === 0, 'compose() is never called again once the final object already exists');
  assert(bucket.deleted.length === 3, 'the temp chunks are still cleaned up even when compose itself was skipped');
  const stored = db.docs[`assignmentSubmissions/${out.submissionId}`];
  assert(stored?.status === 'submitted', 'the submission doc still gets written');
}

// ── composeMany() in isolation: exact fold shape for a clean multiple ─────
// composeMany() sets no metadata itself (composeSubmission does that
// afterward in one explicit setMetadata() call) — this only pins the fold's
// SHAPE: where sources land, and that the real destination is reached.
{
  const bucket = fakeBucket([]); // composeMany only needs file()/combine(); getFiles() is unused here
  const names = Array.from({ length: 64 }, (_, i) => `chunk-${i}`);
  await composeMany(bucket, names, 'dest/final.mp4');
  const finalCall = bucket.composedCalls.at(-1)!;
  assert(finalCall.dest === 'dest/final.mp4', 'composeMany always finishes at the given destination');
  // Every compose call together must reference each original chunk exactly
  // once, in order, once accumulator chaining is unwound.
  const flattenedOriginals = bucket.composedCalls.flatMap(c => c.sources).filter(s => s.startsWith('chunk-'));
  assert(flattenedOriginals.join(',') === names.join(','), 'every original chunk is referenced exactly once, in order, across the whole fold');
}

console.log('composeSubmission.selfcheck: ok');
