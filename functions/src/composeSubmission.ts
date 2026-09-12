import { randomUUID } from 'node:crypto';
import { DEFAULT_VIDEO_MAX_MB } from '../../src/director/types.ts';
import {
  MAX_COMPOSE_SOURCES, MAX_CHUNK_COUNT, parseChunkIndex, submissionDocIdForSession,
} from '../../src/shared/submissionChunks.ts';

/**
 * Turning uploaded chunks into a real submission (#video-upload-reliability
 * Phase 2).
 *
 * Everything here is pure — it takes a `Firestore`/`Bucket`-shaped `deps`
 * object rather than calling `getFirestore()`/`getStorage()` itself — so
 * composeSubmission.selfcheck.ts can exercise the full validate → list →
 * fold-compose → cleanup → write sequence against fake in-memory
 * implementations, with no project, no credential, and no real GCS compose
 * call (which this sandbox has no way to test against a live bucket at
 * all — see the selfcheck header and the PR for that caveat). index.ts
 * holds only the HTTP wiring and the real Admin SDK objects.
 *
 * This function's Firestore write goes through the Admin SDK, which
 * bypasses firestore.rules entirely — so unlike the direct-write path
 * (`assignmentSubmissions`'s `allow create` in firestore.rules), NOTHING
 * else validates this write's shape. Every bound the rule puts on a direct
 * submission is reimplemented in validateRequest() below on purpose.
 *
 * The GCS operation the docs and other client libraries call "compose" is
 * `Bucket#combine(sources, destination, options)` in the Node
 * `@google-cloud/storage` client (there is no `File#compose()`) — checked
 * against the installed 7.x package rather than assumed.
 */

export type ComposeFailure =
  | 'bad-request' | 'unknown-assignment' | 'unknown-student'
  | 'too-large' | 'chunks-missing' | 'size-mismatch';

interface FailureOutcome { ok: false; failure: ComposeFailure; message: string }
interface SuccessOutcome { ok: true; submissionId: string; videoUrl: string }
export type ComposeOutcome = SuccessOutcome | FailureOutcome;

const MESSAGES: Record<ComposeFailure, string> = {
  'bad-request': 'That upload could not be finished. Try sending it again.',
  'unknown-assignment': 'That assignment could not be found.',
  'unknown-student': 'We could not find you on the roster. Find a director.',
  'too-large': 'That video is larger than this assignment allows.',
  'chunks-missing': 'Part of that upload did not arrive. Try sending it again.',
  'size-mismatch': 'That upload did not come through correctly. Try sending it again.',
};

function fail(failure: ComposeFailure): FailureOutcome {
  return { ok: false, failure, message: MESSAGES[failure] };
}

export interface ComposeRequest {
  sessionId: string;
  assignmentId: string;
  studentId: string;
  studentName: string;
  fileName: string;
  contentType: string;
  chunkCount: number;
  totalSize: number;
  videoDurationSeconds: number;
  videoThumbnailUrl?: string;
  notes?: string;
}

export type ValidationResult = { ok: true; value: ComposeRequest } | FailureOutcome;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Every doc id this app hands to Firestore is auto-generated or one of these
// shapes — never a slash, dot-segment, or anything else that could steer a
// path built by string interpolation (assignmentId/studentId ride directly
// into Storage prefixes below).
const DOC_ID_RE = /^[A-Za-z0-9_-]{1,200}$/;

/**
 * Cheap, no-network validation — every bound here must run BEFORE any
 * Storage or Firestore call, so a garbage or replayed request fails
 * immediately rather than paying for a bucket listing first.
 */
export function validateRequest(body: unknown): ValidationResult {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.sessionId !== 'string' || !UUID_RE.test(b.sessionId)) return fail('bad-request');
  if (typeof b.assignmentId !== 'string' || !DOC_ID_RE.test(b.assignmentId)) return fail('bad-request');
  if (typeof b.studentId !== 'string' || !DOC_ID_RE.test(b.studentId)) return fail('bad-request');
  if (typeof b.studentName !== 'string' || b.studentName.length === 0 || b.studentName.length > 120) return fail('bad-request');
  if (typeof b.fileName !== 'string' || b.fileName.length === 0 || b.fileName.length > 256) return fail('bad-request');
  if (typeof b.contentType !== 'string' || !/^video\//.test(b.contentType)) return fail('bad-request');
  if (!Number.isInteger(b.chunkCount) || (b.chunkCount as number) < 1 || (b.chunkCount as number) > MAX_CHUNK_COUNT) return fail('bad-request');
  if (typeof b.totalSize !== 'number' || !Number.isFinite(b.totalSize) || b.totalSize <= 0) return fail('bad-request');
  if (typeof b.videoDurationSeconds !== 'number' || !Number.isFinite(b.videoDurationSeconds) || b.videoDurationSeconds < 0) return fail('bad-request');
  if (b.notes !== undefined && (typeof b.notes !== 'string' || b.notes.length > 500)) return fail('bad-request');
  if (b.videoThumbnailUrl !== undefined && (typeof b.videoThumbnailUrl !== 'string' || b.videoThumbnailUrl.length > 200_000)) return fail('bad-request');
  return {
    ok: true,
    value: {
      sessionId: b.sessionId, assignmentId: b.assignmentId, studentId: b.studentId,
      studentName: b.studentName, fileName: b.fileName, contentType: b.contentType,
      chunkCount: b.chunkCount, totalSize: b.totalSize, videoDurationSeconds: b.videoDurationSeconds,
      ...(b.notes !== undefined ? { notes: b.notes as string } : {}),
      ...(b.videoThumbnailUrl !== undefined ? { videoThumbnailUrl: b.videoThumbnailUrl as string } : {}),
    } as ComposeRequest,
  };
}

/* ── The minimal Firestore/Storage surface this module needs ──────────────
 * Structural (not nominal) types — a real Firestore/Bucket satisfies these
 * shapes without any adapter, and the selfcheck's fakes only need to
 * implement exactly this much. */

export interface DocSnapshotLike { exists: boolean; data(): Record<string, unknown> | undefined }
export interface DocRefLike {
  get(): Promise<DocSnapshotLike>;
  set(data: Record<string, unknown>): Promise<unknown>;
}
export interface FirestoreLike { doc(path: string): DocRefLike }

export interface StorageFileLike {
  name: string;
  exists(): Promise<[boolean]>;
  delete(): Promise<unknown>;
  setMetadata(metadata: Record<string, unknown>): Promise<unknown>;
}
export interface StorageObjectMeta { name: string; metadata: { size?: string | number; timeCreated?: string } }
export interface StorageBucketLike {
  name: string;
  file(name: string): StorageFileLike;
  // The real Bucket#getFiles() resolves a 3-tuple (files, next-page query,
  // raw API response) — only the first element is ever used here, but the
  // type has to admit the rest or a real Bucket doesn't satisfy this shape.
  getFiles(options: { prefix: string }): Promise<[StorageObjectMeta[], ...unknown[]]>;
  /** Bucket#combine — GCS calls this "compose"; the Node client's method is
   *  named combine(). Destination is always a plain object NAME (never a
   *  File instance): the real File class carries private fields, which
   *  makes it impossible for any structural stand-in — including this
   *  fake-able interface — to satisfy it, and there is no need to anyway,
   *  since the content type is set explicitly afterward (see
   *  composeSubmission's setMetadata call) rather than through combine(). */
  combine(sources: string[], destination: string): Promise<unknown>;
}

export interface ComposeDeps {
  db: FirestoreLike;
  bucket: StorageBucketLike;
  now: () => number;
}

/**
 * Fold an arbitrary number of source objects into one, honoring GCS
 * compose's 32-source limit UNCONDITIONALLY rather than assuming a session
 * fits in one call. Standard tree/accumulator strategy: each round after
 * the first reserves one of its 32 slots for the running accumulator, so
 * no round is ever asked to carry more sources than compose allows.
 * Intermediate accumulator objects are temp implementation detail and are
 * deleted once folded into the next one — the ORIGINAL chunk objects are
 * left untouched; the caller deletes those after this resolves.
 *
 * Sets no metadata on the result — composeSubmission() sets the real
 * content type (and the download token) in one explicit setMetadata() call
 * afterward, rather than through combine() itself, which only accepts a
 * destination NAME here (see the note on StorageBucketLike#combine above).
 */
export async function composeMany(
  bucket: StorageBucketLike, sourceNames: string[], destPath: string,
): Promise<void> {
  if (sourceNames.length === 0) throw new Error('composeMany: no source objects');

  if (sourceNames.length <= MAX_COMPOSE_SOURCES) {
    await bucket.combine(sourceNames, destPath);
    return;
  }

  const tempNames: string[] = [];
  let carry: string | null = null;
  const remaining = [...sourceNames];
  let tmp = 0;
  while (remaining.length > 0) {
    const capacity = carry ? MAX_COMPOSE_SOURCES - 1 : MAX_COMPOSE_SOURCES;
    const batch = remaining.splice(0, capacity);
    const isFinal = remaining.length === 0;
    const sources = carry ? [carry, ...batch] : batch;
    const targetName = isFinal ? destPath : `${destPath}.compose-tmp-${tmp++}`;
    await bucket.combine(sources, targetName);
    // The PREVIOUS accumulator's bytes are now folded into `targetName` —
    // safe to drop it only once that combine() call has actually succeeded.
    if (carry) tempNames.push(carry);
    carry = targetName;
  }
  await Promise.allSettled(tempNames.map(n => bucket.file(n).delete()));
}

/**
 * The whole finalize step: validate → (idempotent) short-circuit if this
 * session already produced a submission → verify the real chunks against
 * what the caller claims → compose → clean up → write the submission doc
 * under a session-derived id.
 */
export async function composeSubmission(body: unknown, deps: ComposeDeps): Promise<ComposeOutcome> {
  const validated = validateRequest(body);
  if (!validated.ok) return validated;
  const req = validated.value;

  // Idempotent short-circuit #1: a prior call (or an earlier attempt of a
  // retried one) already finished this exact session. The doc id is a pure
  // function of sessionId, so this is the SAME doc a retry would write —
  // never a duplicate submission.
  const submissionId = submissionDocIdForSession(req.sessionId);
  const submissionRef = deps.db.doc(`assignmentSubmissions/${submissionId}`);
  const existingSubmission = await submissionRef.get();
  if (existingSubmission.exists) {
    const data = existingSubmission.data() ?? {};
    return { ok: true, submissionId, videoUrl: typeof data.videoUrl === 'string' ? data.videoUrl : '' };
  }

  // Same anchors the direct-write rule puts on assignmentSubmissions — this
  // write bypasses that rule entirely, so they have to be real here.
  const [assignmentSnap, studentSnap] = await Promise.all([
    deps.db.doc(`assignments/${req.assignmentId}`).get(),
    deps.db.doc(`students/${req.studentId}`).get(),
  ]);
  if (!assignmentSnap.exists || assignmentSnap.data()?.acceptsVideoSubmissions !== true) return fail('unknown-assignment');
  if (!studentSnap.exists) return fail('unknown-student');

  const rawMax = assignmentSnap.data()?.maxVideoSizeMB;
  const maxBytes = (typeof rawMax === 'number' ? rawMax : DEFAULT_VIDEO_MAX_MB) * 1024 * 1024;
  if (req.totalSize > maxBytes) return fail('too-large');

  // The real chunk-existence and combined-size check — storage.rules can
  // only bound ONE chunk's size, never the sum, so this has to be real
  // function code.
  const prefix = `submissions-parts/${req.assignmentId}/${req.studentId}/${req.sessionId}/`;
  const [files] = await deps.bucket.getFiles({ prefix });
  const indexed = files
    .map(f => ({ file: f, index: parseChunkIndex(f.name) }))
    .filter((x): x is { file: StorageObjectMeta; index: number } => x.index !== null)
    .sort((a, b) => a.index - b.index);

  if (indexed.length !== req.chunkCount) return fail('chunks-missing');
  for (let i = 0; i < req.chunkCount; i++) {
    if (indexed[i].index !== i) return fail('chunks-missing'); // a gap or a duplicate index
  }

  const actualTotal = indexed.reduce((sum, x) => sum + Number(x.file.metadata.size ?? 0), 0);
  if (actualTotal !== req.totalSize) return fail('size-mismatch');
  if (actualTotal > maxBytes) return fail('too-large'); // belt-and-suspenders on the REAL sum

  // A stable "timestamp" for the final path even across a retried finalize
  // call: Date.now() at compose time would differ between attempts and
  // defeat the existence check just below, so this reads the EARLIEST
  // chunk's own upload time instead — real, and fixed once the chunks
  // landed. Falls back to now() only if no chunk metadata carries one
  // (never happens against a real bucket; keeps this total).
  const chunkTimes = indexed
    .map(x => new Date(x.file.metadata.timeCreated ?? '').getTime())
    .filter(t => Number.isFinite(t) && t > 0);
  const timestamp = chunkTimes.length > 0 ? Math.min(...chunkTimes) : deps.now();

  const finalPath = `submissions/${req.assignmentId}/${req.studentId}/${timestamp}-${req.fileName}`;
  const finalFile = deps.bucket.file(finalPath);
  const [finalExists] = await finalFile.exists();
  if (!finalExists) {
    // Idempotent short-circuit #2: a retry that reaches this point after an
    // earlier attempt already composed (but perhaps died before writing the
    // Firestore doc) finds the object already here and skips composing
    // again, rather than risking a second compose call or a stray duplicate.
    await composeMany(deps.bucket, indexed.map(x => x.file.name), finalPath);
  }

  // Best-effort cleanup — a failure here must not fail the submission the
  // student is waiting on; the scheduled sweep for abandoned chunks catches
  // anything left behind.
  await Promise.allSettled(indexed.map(x => deps.bucket.file(x.file.name).delete()));

  // The real content type AND the download token, in one explicit write —
  // combine() itself is never told the content type (see the note on
  // StorageBucketLike#combine), so this is the one place it's set.
  const token = randomUUID();
  await finalFile.setMetadata({ contentType: req.contentType, metadata: { firebaseStorageDownloadTokens: token } });
  const videoUrl = `https://firebasestorage.googleapis.com/v0/b/${deps.bucket.name}/o/${encodeURIComponent(finalPath)}?alt=media&token=${token}`;

  await submissionRef.set({
    assignmentId: req.assignmentId,
    studentId: req.studentId,
    studentName: req.studentName,
    status: 'submitted',
    videoUrl,
    videoDurationSeconds: req.videoDurationSeconds,
    fileName: req.fileName,
    fileSize: actualTotal,
    ...(req.notes ? { notes: req.notes } : {}),
    ...(req.videoThumbnailUrl ? { videoThumbnailUrl: req.videoThumbnailUrl } : {}),
    submittedAt: deps.now(),
  });

  return { ok: true, submissionId, videoUrl };
}
