/**
 * Retries a flaky async step a few times with backoff before giving up.
 * Extracted from SubmissionForm.tsx's Phase 0 fix (#video-upload-reliability)
 * so the chunked-upload path (src/public/chunkedUpload.ts) can retry a
 * single failed chunk the same way, without a second copy of this logic.
 */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 3, baseDelayMs = 1000): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt >= attempts) throw e;
      await new Promise(resolve => setTimeout(resolve, baseDelayMs * 2 ** (attempt - 1)));
    }
  }
}
