/**
 * Self-check for the public submission receipt (#video-upload-reliability
 * Phase 1).
 * Run: node --experimental-strip-types functions/src/submissionReceipt.selfcheck.ts
 *
 * Runs in deploy-functions.yml BEFORE any credential is written, alongside
 * every other trigger's guard. What it pins:
 *
 *   1. The receipt is EXACTLY three fields — assignmentId, studentId,
 *      submittedAt — no matter what else rides on the submission doc that
 *      triggered it (videoUrl, notes, fileName, …). Since the trigger writes
 *      through the Admin SDK, firestore.rules cannot constrain this shape —
 *      buildSubmissionReceipt() is the ONLY enforcement, which is exactly
 *      why it needs its own pin.
 *   2. A malformed or missing required field produces NO receipt (never a
 *      half-built one).
 *   3. The doc id format `${assignmentId}_${studentId}` is stable — it's
 *      what makes a later submission for the same pair overwrite the
 *      earlier receipt instead of piling up a second doc.
 *   4. firestore.rules' `submissionReceiptsPublic` block allows reads and
 *      denies every client write — a receipt a browser could write itself
 *      would not prove anything actually uploaded.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSubmissionReceipt, submissionReceiptId, SUBMISSION_RECEIPT_KEYS } from './submissionReceipt.ts';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

// ── 1 & 2: the shape, and only the shape ──────────────────────────────────
assert(SUBMISSION_RECEIPT_KEYS.length === 3, 'exactly three keys in the allowlist');
assert(
  [...SUBMISSION_RECEIPT_KEYS].sort().join(',') === 'assignmentId,studentId,submittedAt',
  'the allowlist is exactly assignmentId, studentId, submittedAt',
);

const full = buildSubmissionReceipt({
  assignmentId: 'asg1',
  studentId: 'stu1',
  submittedAt: 1_700_000_000_000,
  // Everything a real assignmentSubmissions doc also carries — none of it
  // may survive into the receipt.
  videoUrl: 'https://firebasestorage.googleapis.com/…',
  videoThumbnailUrl: 'data:image/jpeg;base64,…',
  fileName: 'recording-123.webm',
  fileSize: 12_345_678,
  notes: 'please watch the second half',
  studentName: 'Ruiz, Maya',
  status: 'submitted',
} as never);
assert(full !== null, 'a well-formed submission produces a receipt');
assert(Object.keys(full!).sort().join(',') === 'assignmentId,studentId,submittedAt',
  'the built receipt carries ONLY the three allowed fields — no videoUrl, thumbnail, notes, filename, or name');
assert(full!.assignmentId === 'asg1' && full!.studentId === 'stu1' && full!.submittedAt === 1_700_000_000_000,
  'the three fields carry the submission’s own values');

for (const bad of [
  { studentId: 'stu1', submittedAt: 1 }, // no assignmentId
  { assignmentId: 'a', submittedAt: 1 }, // no studentId
  { assignmentId: 'a', studentId: 's' }, // no submittedAt
  { assignmentId: '', studentId: 's', submittedAt: 1 }, // blank assignmentId
  { assignmentId: 'a', studentId: 's', submittedAt: 'now' }, // wrong type
]) {
  assert(buildSubmissionReceipt(bad as never) === null, `malformed input produces no receipt: ${JSON.stringify(bad)}`);
}

// ── 3: the doc id ──────────────────────────────────────────────────────────
assert(submissionReceiptId('asg1', 'stu1') === 'asg1_stu1', 'doc id is assignmentId_studentId');
assert(submissionReceiptId('asg1', 'stu1') === submissionReceiptId('asg1', 'stu1'),
  'the same pair always resolves to the same doc — a later submission overwrites, never duplicates');

// ── 4: firestore.rules denies every client write ──────────────────────────
const here = dirname(fileURLToPath(import.meta.url));
const rules = readFileSync(join(here, '../../firestore.rules'), 'utf8');

function ruleBlock(src: string, path: string): string {
  const marker = `match /${path}/{doc} {`;
  const start = src.indexOf(marker);
  assert(start >= 0, `firestore.rules has a match block for ${path}`);
  let depth = 0;
  let i = start + marker.length - 1; // the opening brace itself
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
  }
  return src.slice(start, i + 1);
}

const block = ruleBlock(rules, 'submissionReceiptsPublic');
assert(/allow read;/.test(block), 'submissionReceiptsPublic is world-readable');
assert(/allow write:\s*if false;/.test(block), 'submissionReceiptsPublic denies every client write');
assert(!/allow create/.test(block) && !/allow update/.test(block) && !/allow delete/.test(block),
  'no client create/update/delete path exists at all — only the Admin SDK trigger ever writes this collection');

console.log('submissionReceipt.selfcheck: ok');
