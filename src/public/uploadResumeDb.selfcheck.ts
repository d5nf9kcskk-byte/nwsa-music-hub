/**
 * Self-check for upload-recovery classification (#video-upload-reliability
 * Phase 3).
 *
 * recoveryKind() is the ONE answer to "can this interrupted send be rescued,
 * and how", and it is the fix for a real failure: a student's picked file
 * died two chunks into ten, every byte of bookkeeping needed to finish it sat
 * in IndexedDB, and the app offered him nothing — so he was told he had never
 * submitted and had to send 150 MB a second time, while insisting he had seen
 * it go through. The classification is what decides whether that happens
 * again, so it is pinned here rather than left to the screen that reads it.
 *
 * Pure — recoveryKind takes a plain session record and touches no browser
 * API, so importing this module under Node is safe (openDb() is never
 * called; it is the only thing that reaches for indexedDB, and it does so
 * lazily).
 *
 * Run: npx tsx src/public/uploadResumeDb.selfcheck.ts
 */
import { newSession, recoveryKind, type UploadSession } from './uploadResumeDb';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

/** A file session with `uploaded` of `chunkCount` pieces already in Storage. */
function fileSession(uploaded: number, chunkCount: number): UploadSession {
  const s = newSession({
    sessionId: 'sess-file', kind: 'file',
    assignmentId: 'exam3', studentId: 'stu1', fingerprint: 'IMG_1960.mov|159383552|1762300000000',
    fileName: 'IMG_1960.mov', contentType: 'video/quicktime',
    totalSize: 159_383_552, chunkCount, durationSeconds: 212,
  });
  s.uploadedIndexes = Array.from({ length: uploaded }, (_, i) => i);
  return s;
}

/** A recording session; `withBlob` false stands for one whose blob never
 *  persisted (a quota refusal), which is unrecoverable by definition. */
function recordingSession(uploaded: number, chunkCount: number, withBlob = true): UploadSession {
  const s = newSession({
    sessionId: 'sess-rec', kind: 'recording',
    assignmentId: 'exam3', studentId: '',
    fileName: 'recording-1.webm', contentType: 'video/webm',
    totalSize: 40_000_000, chunkCount,
    ...(withBlob ? { blob: new Blob(['x']) } : {}),
  });
  s.uploadedIndexes = Array.from({ length: uploaded }, (_, i) => i);
  return s;
}

// ── The case that was silently thrown away: a half-uploaded picked file ───
// Israel's exam, to the number: ten 16 MiB pieces, two arrived, then the app
// closed. Before this existed the answer was `null` by omission — the mount
// check only ever looked at recordings — and the student learned nothing.
assert(recoveryKind(fileSession(2, 10)) === 'repick',
  'a picked file with some chunks up is recoverable by re-choosing the same file');
assert(recoveryKind(fileSession(1, 10)) === 'repick', 'one chunk in is still worth telling the student about');
assert(recoveryKind(fileSession(9, 10)) === 'repick', 'nine of ten is not finished — the tenth still has to go up');

// ── Nothing sent: deliberately NOT offered ───────────────────────────────
// A failure before the first chunk landed threw and put an error on screen
// at the time, so there is nothing here the student does not already know,
// and a prompt about it would be noise that trains them to dismiss the one
// that matters.
assert(recoveryKind(fileSession(0, 10)) === null, 'a file session that never sent a byte is not a recovery prompt');

// ── Every chunk up, no record written: finishable with NO file ────────────
// The expensive case, and the one neither the code nor the first diagnosis
// saw. composeSubmission is idempotent and reads only this session's
// metadata, so the submission completes in one call — asking for a 150 MB
// re-send here would be re-sending bytes the bucket is already holding.
assert(recoveryKind(fileSession(10, 10)) === 'finish',
  'all chunks up means finish from metadata alone, never upload again');
assert(recoveryKind(recordingSession(4, 4)) === 'finish',
  'a fully-uploaded RECORDING finishes the same way — "finish" is checked before "resume" on purpose');

// ── A recording keeps its own resume, blob and all ───────────────────────
assert(recoveryKind(recordingSession(0, 4)) === 'resume', 'an unsent recording resumes from its stored blob');
assert(recoveryKind(recordingSession(2, 4)) === 'resume', 'a part-sent recording resumes and skips what landed');
assert(recoveryKind(recordingSession(0, 4, false)) === null, 'a recording with no blob cannot be resumed');

// ── Finalized is finished ────────────────────────────────────────────────
// markFinalized() runs the moment composeSubmission answers, so this is what
// stops a completed send from being offered back as unfinished — which would
// invite a duplicate submission for no reason.
const done = fileSession(10, 10);
done.finalizedAt = Date.now();
assert(recoveryKind(done) === null, 'a finalized session is never offered for recovery');
const doneEarly = fileSession(2, 10);
doneEarly.finalizedAt = Date.now();
assert(recoveryKind(doneEarly) === null, 'finalizedAt wins over chunk bookkeeping either way');

// ── Duplicate indexes never fake a complete upload ───────────────────────
// markChunkUploaded() guards against pushing the same index twice, but the
// count that decides 'finish' must not RELY on that guard holding: counting
// a repeated index as progress would hand composeSubmission a session whose
// chunks are genuinely missing, and it would be refused with
// 'chunks-missing' after the student was told it was ready to finish.
const dupes = fileSession(0, 10);
dupes.uploadedIndexes = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5];
assert(recoveryKind(dupes) === 'repick', 'twelve entries covering six chunks is not a finished upload');

console.log('uploadResumeDb.selfcheck: OK');
