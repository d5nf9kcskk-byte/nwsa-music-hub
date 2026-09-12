#!/usr/bin/env node
/**
 * Delete temp chunk objects under submissions-parts/ that are older than
 * ~48 hours (#video-upload-reliability Phase 2).
 *
 * A chunk that never gets composed means the student closed the tab for
 * good, gave up, or submitted a different take entirely — normal chunks are
 * deleted by composeSubmission itself right after a successful compose
 * (functions/src/composeSubmission.ts), so anything still here after two
 * days is abandoned, not mid-upload. 48 hours is generous on purpose: a real
 * upload attempt finishes in minutes, and this only needs to be safely
 * longer than the longest a student could plausibly leave a resumable
 * session sitting half-finished (a weekend, say) before this sweep should
 * stop waiting for them to come back.
 *
 * Runs hourly via .github/workflows/deploy.yml, same cadence as the ICS
 * feed refresh, and same posture as that step: this cleans up Storage, not
 * the deployed site, so a failure here must NEVER fail the Pages deploy —
 * every path below logs and exits 0.
 *
 * Usage:
 *   FIREBASE_SERVICE_ACCOUNT_JSON=... node scripts/cleanup-abandoned-chunks.mjs
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export const CUTOFF_HOURS = 48;
export const PREFIX = 'submissions-parts/';

/** Pure so cleanup-abandoned-chunks.selfcheck.mjs can pin it without a
 *  bucket. A missing/unparseable timeCreated is treated as abandoned rather
 *  than kept forever — a real GCS object always carries one; only a
 *  malformed test double or a genuinely corrupt listing entry would not. */
export function isAbandoned(timeCreatedIso, nowMs, cutoffHours = CUTOFF_HOURS) {
  const created = Date.parse(timeCreatedIso ?? '');
  if (!Number.isFinite(created)) return true;
  return created < nowMs - cutoffHours * 60 * 60 * 1000;
}

async function main() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    console.log('cleanup-abandoned-chunks: no FIREBASE_SERVICE_ACCOUNT_JSON — skipping (nothing to authenticate a Storage listing with).');
    return;
  }

  const admin = require('firebase-admin');
  const sa = JSON.parse(raw);
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(sa),
      storageBucket: 'nwsa-hub.firebasestorage.app',
    });
  }
  const bucket = admin.storage().bucket();

  const [files] = await bucket.getFiles({ prefix: PREFIX });
  const now = Date.now();

  let deleted = 0;
  let kept = 0;
  let failed = 0;
  for (const file of files) {
    if (!isAbandoned(file.metadata?.timeCreated, now)) { kept++; continue; }
    try {
      await file.delete();
      deleted++;
    } catch (err) {
      failed++;
      console.error(`cleanup-abandoned-chunks: could not delete ${file.name}:`, err?.message ?? err);
    }
  }

  console.log(`cleanup-abandoned-chunks: ${files.length} object(s) under ${PREFIX}, deleted ${deleted}, kept ${kept} (not old enough), ${failed} delete failure(s).`);
}

// Only run as a script — cleanup-abandoned-chunks.selfcheck.mjs imports
// isAbandoned()/CUTOFF_HOURS/PREFIX as a pure library and must not also
// trigger a real (or even a no-credential-skip) run as a side effect of
// that import.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    // Never fail the deploy job over Storage housekeeping — see file header.
    console.error('cleanup-abandoned-chunks: unexpected error (deploy continues):', err);
  });
}
