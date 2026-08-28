#!/usr/bin/env node
/**
 * Repair: create assignmentSubmissions docs for videos that landed in
 * Storage but never got a Firestore doc (or whose doc the grade sheet
 * could not list). Idempotent on videoUrl — skips when a submission with
 * the same download URL already exists.
 *
 * Usage:
 *   FIREBASE_SERVICE_ACCOUNT_JSON=... node scripts/repair-assignment-submissions.mjs
 *   FIREBASE_SERVICE_ACCOUNT_JSON=... node scripts/repair-assignment-submissions.mjs --apply
 *
 * Default is dry-run. Pass --apply to write.
 *
 * Scope: optional --assignment <id> (repeatable). Default: all assignments
 * that accept video submissions.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const admin = require('firebase-admin');

const APPLY = process.argv.includes('--apply');
const onlyIds = [];
for (let i = 0; i < process.argv.length; i++) {
  if (process.argv[i] === '--assignment' && process.argv[i + 1]) {
    onlyIds.push(process.argv[++i]);
  }
}

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!raw) {
  console.error('FIREBASE_SERVICE_ACCOUNT_JSON is required');
  process.exit(1);
}
const sa = JSON.parse(raw);
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(sa),
    storageBucket: 'nwsa-hub.firebasestorage.app',
  });
}
const db = admin.firestore();
const bucket = admin.storage().bucket();

function parseStoragePath(path) {
  // submissions/{assignmentId}/{studentId}/{timestamp}-{fileName}
  const parts = path.split('/');
  if (parts.length < 4 || parts[0] !== 'submissions') return null;
  const assignmentId = parts[1];
  const studentId = parts[2];
  const leaf = parts.slice(3).join('/');
  const dash = leaf.indexOf('-');
  const timestamp = dash > 0 ? Number(leaf.slice(0, dash)) : NaN;
  const fileName = dash > 0 ? leaf.slice(dash + 1) : leaf;
  return { assignmentId, studentId, fileName, submittedAt: Number.isFinite(timestamp) ? timestamp : Date.now() };
}

async function main() {
  let assignSnap;
  if (onlyIds.length) {
    const docs = await Promise.all(onlyIds.map(id => db.collection('assignments').doc(id).get()));
    assignSnap = { docs: docs.filter(d => d.exists) };
  } else {
    assignSnap = await db.collection('assignments').where('acceptsVideoSubmissions', '==', true).get();
  }

  let created = 0;
  let skipped = 0;
  let scanned = 0;

  for (const aDoc of assignSnap.docs) {
    const assignmentId = aDoc.id;
    const title = aDoc.data().title || assignmentId;
    const [files] = await bucket.getFiles({ prefix: `submissions/${assignmentId}/` });
    const subSnap = await db.collection('assignmentSubmissions')
      .where('assignmentId', '==', assignmentId)
      .get();
    const existingUrls = new Set(subSnap.docs.map(d => d.data().videoUrl).filter(Boolean));

    console.log(`\n${title} (${assignmentId}): ${files.length} storage file(s), ${subSnap.size} submission doc(s)`);

    for (const file of files) {
      scanned++;
      const parsed = parseStoragePath(file.name);
      if (!parsed) continue;

      const [meta] = await file.getMetadata();
      const token = meta.metadata?.firebaseStorageDownloadTokens
        || (await ensureDownloadToken(file, meta));
      const encoded = encodeURIComponent(file.name);
      const videoUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encoded}?alt=media&token=${token}`;

      if (existingUrls.has(videoUrl)) {
        skipped++;
        continue;
      }

      // Also skip if any existing doc points at the same storage object path
      // (token can rotate; path is stable).
      const pathHit = subSnap.docs.some(d => {
        const u = d.data().videoUrl || '';
        return u.includes(encoded) || u.includes(file.name);
      });
      if (pathHit) {
        skipped++;
        continue;
      }

      let studentName = parsed.studentId;
      const stu = await db.collection('studentsPublic').doc(parsed.studentId).get();
      if (stu.exists) studentName = stu.data().name || studentName;

      const size = Number(meta.size || 0);
      if (!(size > 0)) {
        console.log(`  skip empty ${file.name}`);
        skipped++;
        continue;
      }

      const row = {
        assignmentId,
        studentId: parsed.studentId,
        studentName,
        status: 'submitted',
        videoUrl,
        videoDurationSeconds: 0,
        fileName: parsed.fileName,
        fileSize: size,
        submittedAt: parsed.submittedAt,
        notes: '[hub-repair] recovered from Storage',
      };

      console.log(`  ${APPLY ? 'CREATE' : 'would create'}: ${studentName} · ${parsed.fileName} (${size} bytes)`);
      if (APPLY) {
        await db.collection('assignmentSubmissions').add(row);
        existingUrls.add(videoUrl);
        created++;
      } else {
        created++; // count of would-create
      }
    }
  }

  console.log(`\nScanned ${scanned} file(s). ${APPLY ? 'Created' : 'Would create'} ${created}, skipped ${skipped}.`);
  if (!APPLY && created > 0) console.log('Re-run with --apply to write.');
}

async function ensureDownloadToken(file, meta) {
  const existing = meta.metadata?.firebaseStorageDownloadTokens;
  if (existing) return String(existing).split(',')[0];
  const { randomUUID } = await import('node:crypto');
  const token = randomUUID();
  await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: token } });
  return token;
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
