#!/usr/bin/env node
/**
 * Pins the read rule on student video submissions (storage.rules).
 *
 * Both path segments, submissions/{assignmentId}/{studentId}, are public ids.
 * A plain `allow read` grants LIST as well as GET, and an open list hands out
 * every video in a folder. The app never lists: every reader uses the token
 * URL on the staff-only submission doc, and the uploading browser's own
 * getDownloadURL only needs GET. So the block must keep exactly:
 *   allow get;                    (the upload flow)
 *   allow list: if isStaff();     (nobody else)
 * and never a bare `allow read`.
 *
 * A text check on purpose: the emulator test that proved the change needs
 * Java and network, and the self-checks stay offline.
 */
import { readFileSync } from 'node:fs';

const rules = readFileSync(new URL('../storage.rules', import.meta.url), 'utf8');

function fail(msg) {
  console.error(`storage-rules self-check FAILED: ${msg}`);
  process.exit(1);
}

const start = rules.indexOf('match /submissions/{assignmentId}/{studentId}/{allPaths=**} {');
if (start < 0) fail('the submissions match block is missing or renamed');
const end = rules.indexOf('\n    }', start);
if (end < 0) fail('could not find the end of the submissions match block');
const block = rules.slice(start, end);

if (/allow\s+read\b/.test(block)) fail('submissions must not use `allow read` (it includes list)');
if (!/allow\s+get\s*;/.test(block)) fail('submissions must keep `allow get;` (the upload flow reads its own object)');
if (!/allow\s+list\s*:\s*if\s+isStaff\(\)\s*;/.test(block)) fail('submissions list must be `allow list: if isStaff();`');

console.log('storage-rules self-check OK: submissions are get-only for the public, list is staff-only');
