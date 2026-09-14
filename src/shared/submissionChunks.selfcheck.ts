/**
 * Self-check for the chunked-upload shared shape (#video-upload-reliability
 * Phase 2). The heavier fold/idempotency logic that CONSUMES these helpers
 * is pinned end-to-end in functions/src/composeSubmission.selfcheck.ts —
 * this only pins the primitives themselves: chunk counting, the path
 * format both the client and the function agree on, and the doc id
 * derivation.
 * Run: npx tsx src/shared/submissionChunks.selfcheck.ts
 */
import {
  CHUNK_SIZE_BYTES, MAX_COMPOSE_SOURCES, chunkCountFor, chunkPartPath,
  parseChunkIndex, submissionDocIdForSession,
} from './submissionChunks';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

// ── chunkCountFor ──────────────────────────────────────────────────────────
assert(chunkCountFor(0) === 1, 'an empty/unknown-size file still gets at least one chunk');
assert(chunkCountFor(1) === 1, 'a tiny file is one chunk');
assert(chunkCountFor(CHUNK_SIZE_BYTES) === 1, 'exactly one chunk size worth is still one chunk');
assert(chunkCountFor(CHUNK_SIZE_BYTES + 1) === 2, 'one byte over a chunk needs a second chunk');
assert(chunkCountFor(CHUNK_SIZE_BYTES * 40) === 40, 'an exact multiple divides evenly');
assert(chunkCountFor(CHUNK_SIZE_BYTES * 40 + 1) === 41, 'a partial trailing chunk still counts');
assert(MAX_COMPOSE_SOURCES === 32, 'GCS compose’s real 32-source limit, not a stand-in value');

// ── chunkPartPath / parseChunkIndex round-trip ────────────────────────────
const p0 = chunkPartPath('asg1', 'stu1', 'sess1', 0);
const p1 = chunkPartPath('asg1', 'stu1', 'sess1', 1);
const p10 = chunkPartPath('asg1', 'stu1', 'sess1', 10);
assert(p0 === 'submissions-parts/asg1/stu1/sess1/00000', 'zero-padded, matching storage.rules’ submissions-parts/{a}/{s}/{sess}/{index} shape');
assert(p0 < p1 && p1 < p10, 'zero-padding makes a plain lexicographic Storage listing already sort in upload order');
assert(parseChunkIndex(p0) === 0 && parseChunkIndex(p1) === 1 && parseChunkIndex(p10) === 10,
  'the index round-trips out of the path it was built into');
assert(parseChunkIndex('submissions-parts/a/b/c/not-a-number') === null, 'a non-numeric leaf is never mistaken for a chunk');
assert(parseChunkIndex('submissions-parts/a/b/c/007') === 7, 'a leading zero still parses as a plain integer, not octal');
assert(parseChunkIndex('') === null, 'an empty name is not a chunk');

// ── submissionDocIdForSession ─────────────────────────────────────────────
const id1 = submissionDocIdForSession('11111111-2222-4333-8444-555555555555');
const id2 = submissionDocIdForSession('11111111-2222-4333-8444-555555555555');
const id3 = submissionDocIdForSession('99999999-2222-4333-8444-555555555555');
assert(id1 === id2, 'the SAME session id always derives the SAME doc id — a retried finalize call must land on it');
assert(id1 !== id3, 'different sessions never collide');
assert(id1.startsWith('chunked-'), 'reads as a chunked-upload submission in the Firestore console at a glance');

console.log('submissionChunks.selfcheck: ok');
