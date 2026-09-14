/**
 * Chunked resumable upload — the shared shape both sides agree on
 * (#video-upload-reliability Phase 2).
 *
 * The client (src/public/chunkedUpload.ts) slices a video into pieces and
 * uploads each one to a temp Storage path; the composeSubmission Cloud
 * Function (functions/src/composeSubmission.ts) lists that same prefix and
 * glues the pieces back together with GCS compose. Everything in this file
 * is pure and isomorphic (no browser globals, no firebase-admin) so both
 * sides — and composeSubmission.selfcheck.ts — can import it directly.
 */

/** ~16 MiB per piece: small enough that one failed chunk on bad wifi costs
 *  seconds to retry rather than the whole upload, big enough that a typical
 *  playing-exam video splits into a two-digit chunk count rather than
 *  thousands of tiny requests. */
export const CHUNK_SIZE_BYTES = 16 * 1024 * 1024;

/** GCS compose() accepts at most this many source objects per call. A
 *  session with more chunks than this MUST fold them through an
 *  accumulator (composeMany() on the function side) — never assume one
 *  call is enough. */
export const MAX_COMPOSE_SOURCES = 32;

/** Generous ceiling on chunk count purely so a garbage/malicious request
 *  fails validation before touching Storage at all — real videos land
 *  nowhere near this (even 8 GB at 16 MiB/chunk is ~512 chunks). */
export const MAX_CHUNK_COUNT = 4000;

export function chunkCountFor(totalBytes: number): number {
  return Math.max(1, Math.ceil(totalBytes / CHUNK_SIZE_BYTES));
}

/** Temp object path for one piece. Zero-padded so a plain lexicographic
 *  Storage listing already sorts in upload order — composeSubmission also
 *  parses and re-sorts the index numerically itself (parseChunkIndex),
 *  rather than trusting that alone, but there's no reason to make it work
 *  any harder than it has to. */
export function chunkPartPath(assignmentId: string, studentId: string, sessionId: string, index: number): string {
  return `submissions-parts/${assignmentId}/${studentId}/${sessionId}/${String(index).padStart(5, '0')}`;
}

/** The index encoded in a chunk object's own name (the last path segment).
 *  Null for anything that doesn't parse as a plain non-negative integer —
 *  the caller treats that as a foreign/corrupt object, never a chunk to
 *  compose. */
export function parseChunkIndex(objectName: string): number | null {
  const leaf = objectName.split('/').pop() ?? '';
  return /^\d+$/.test(leaf) ? Number(leaf) : null;
}

/**
 * The assignmentSubmissions doc id for a chunked-upload session — a PURE
 * function of the session id, so a retried finalize call always names the
 * SAME doc instead of minting a new submission. Same idempotency reasoning
 * as Phase 0's newSubmissionId()/setDoc fix (src/director/hooks/
 * useAssignmentSubmissions.ts), applied on the function side this time,
 * where there is no client to hold a generated id steady across a retry —
 * the session id (already a crypto.randomUUID(), unique per upload attempt)
 * has to carry that job instead. Prefixed so a chunked-upload submission
 * reads as one at a glance in the Firestore console.
 */
export function submissionDocIdForSession(sessionId: string): string {
  return `chunked-${sessionId}`;
}
