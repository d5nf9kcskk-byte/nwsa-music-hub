#!/usr/bin/env node
/**
 * set-storage-cors.mjs
 *
 * Applies config/storage-cors.json to the Storage bucket. Without it the
 * browser refuses every in-page download from Storage (getBlob / fetch) —
 * the bucket answers, but with no Access-Control-Allow-Origin, so the SDK
 * reads it as a network blip and retries for two minutes. That was "Open
 * signed form" hanging on "Opening…" (#sign-pdf, Oct 2026).
 *
 * CORS decides which WEBSITE may read a response; it grants no access. Who
 * may read which object is still storage.rules, so allowing the Hub's own
 * origin publishes nothing.
 *
 * Required env: FIREBASE_SERVICE_ACCOUNT_JSON, STORAGE_BUCKET.
 * Pass --dry-run to print the current and new policy without writing.
 */
import { readFileSync } from 'node:fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';

const dryRun = process.argv.includes('--dry-run');
const bucketName = (process.env.STORAGE_BUCKET ?? '').trim();
if (!bucketName) { console.error('STORAGE_BUCKET is required'); process.exit(1); }
const policy = JSON.parse(readFileSync('config/storage-cors.json', 'utf8'));

if (!getApps().length) initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)) });
const bucket = getStorage().bucket(bucketName);

const [before] = await bucket.getMetadata();
console.log('Current CORS:', JSON.stringify(before.cors ?? []));
console.log('New CORS:    ', JSON.stringify(policy));
if (dryRun) { console.log('Dry run — nothing written.'); process.exit(0); }

await bucket.setCorsConfiguration(policy);
const [after] = await bucket.getMetadata();
console.log('Applied:     ', JSON.stringify(after.cors ?? []));
