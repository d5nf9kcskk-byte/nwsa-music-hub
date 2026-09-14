import { ref as storageRef, uploadBytesResumable } from 'firebase/storage';
import { storage } from '../director/firebaseAuth';
import { withRetry } from '../shared/withRetry';
import { CHUNK_SIZE_BYTES, chunkCountFor, chunkPartPath } from '../shared/submissionChunks';
import {
  fingerprintFile, getSession, getSessionByFingerprint, newSession, putSession,
  markChunkUploaded, type UploadSession,
} from './uploadResumeDb';

/**
 * Client-side chunked resumable upload (#video-upload-reliability Phase 2).
 *
 * The mechanics: split into ~16 MiB pieces, upload each to a temp Storage
 * path, then ask composeSubmission (a Cloud Function) to glue them into the
 * real submission. Session bookkeeping lives in uploadResumeDb.ts and is
 * ALWAYS best-effort — sessionForFile()/sessionForRecording() below return
 * `null` on anything from a private-browsing IndexedDB block to a first-time
 * quota surprise, and the caller (SubmissionForm.tsx) falls back to the
 * Phase 0 direct-upload path whenever that happens. Once a session exists,
 * though, a chunk-upload or finalize failure is a REAL failure — it surfaces
 * the normal way, it does not also fall back, so a genuine problem is never
 * masked by silently retrying under a different mechanism.
 */

/** Get-or-create the session for a PICKED FILE. Reuses an existing session
 *  if this exact (assignment, student, file) was seen before — a resumed
 *  upload after a reload skips whatever chunks already made it, since the
 *  student has to re-pick the file for the browser to hand it back at all.
 *  Returns null on any IndexedDB failure, never throws. */
export async function sessionForFile(
  file: File, assignmentId: string, studentId: string, contentType: string,
): Promise<UploadSession | null> {
  try {
    const fingerprint = fingerprintFile(file);
    const existing = await getSessionByFingerprint(assignmentId, studentId, fingerprint);
    if (existing) return existing;
    const session = newSession({
      sessionId: crypto.randomUUID(),
      kind: 'file',
      assignmentId, studentId, fingerprint,
      fileName: file.name, contentType, totalSize: file.size,
      chunkCount: chunkCountFor(file.size),
    });
    await putSession(session);
    return session;
  } catch {
    return null;
  }
}

/**
 * Claim an already-persisted RECORDING session for the now-known student.
 * A recording's session is created the instant MediaRecorder produces the
 * blob (handleRecordedVideo in SubmissionForm.tsx), before a name is
 * necessarily picked — studentId starts as ''. This fills it in at submit
 * time, once selectedStudentId is guaranteed set (Submit is disabled
 * without one). Returns null if the session can't be found or updated —
 * the caller falls back to the direct-upload path exactly as it would for
 * a missing file-kind session.
 */
export async function sessionForRecording(sessionId: string, assignmentId: string, studentId: string): Promise<UploadSession | null> {
  try {
    const session = await getSession(sessionId);
    // The assignment is already fixed at recording time (handleRecordedVideo
    // stamps it); refusing a mismatch here is a cheap guard against ever
    // claiming a stray session recorded for a DIFFERENT assignment, rather
    // than trusting the caller never mixes them up.
    if (!session || session.assignmentId !== assignmentId) return null;
    session.studentId = studentId;
    session.updatedAt = Date.now();
    await putSession(session);
    return session;
  } catch {
    return null;
  }
}

async function uploadOneChunk(path: string, chunk: Blob, contentType: string): Promise<void> {
  if (!storage) throw new Error('Storage not configured');
  const sRef = storageRef(storage, path);
  const task = uploadBytesResumable(sRef, chunk, { contentType });
  await new Promise<void>((resolve, reject) => {
    task.on('state_changed', undefined, reject, () => resolve());
  });
}

/**
 * Upload every chunk of `blob` that `session` doesn't already record as
 * uploaded, in order, retrying each one before giving up on the whole
 * upload. Throws on a genuine failure (after retries) — this is the point
 * past which a problem is real and must surface normally, not fall back to
 * anything else.
 */
export async function uploadChunks(
  blob: Blob, session: UploadSession, onProgress?: (fraction: number) => void,
): Promise<void> {
  const { sessionId, assignmentId, studentId, chunkCount } = session;
  for (let index = 0; index < chunkCount; index++) {
    if (!session.uploadedIndexes.includes(index)) {
      const start = index * CHUNK_SIZE_BYTES;
      const end = Math.min(start + CHUNK_SIZE_BYTES, blob.size);
      const path = chunkPartPath(assignmentId, studentId, sessionId, index);
      await withRetry(() => uploadOneChunk(path, blob.slice(start, end), session.contentType));
      await markChunkUploaded(sessionId, index);
    }
    onProgress?.((index + 1) / chunkCount);
  }
}

export interface FinalizeArgs {
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

export interface FinalizeOutcome {
  ok: boolean;
  failure?: string;
  message?: string;
  submissionId?: string;
  videoUrl?: string;
}

/** The v1 Functions hostname is derivable from the project id alone — same
 *  reasoning as checkinEndpoint() in src/public/checkinSubmit.ts. */
export function composeSubmissionEndpoint(): string {
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  return projectId ? `https://us-central1-${projectId}.cloudfunctions.net/composeSubmission` : '';
}

/** Ask composeSubmission to turn this session's uploaded chunks into a real
 *  submission. Every chunk must already be uploaded before calling this. */
export async function finalizeChunkedSubmission(args: FinalizeArgs): Promise<FinalizeOutcome> {
  const url = composeSubmissionEndpoint();
  if (!url) {
    return { ok: false, failure: 'offline', message: 'The Hub is not configured for uploads yet.' };
  }
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
  } catch {
    return { ok: false, failure: 'network', message: 'That did not reach the Hub. Check your connection and try again.' };
  }
  try {
    return await res.json() as FinalizeOutcome;
  } catch {
    return { ok: false, failure: 'network', message: 'The Hub gave an answer we could not read. Try again.' };
  }
}
