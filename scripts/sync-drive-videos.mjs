#!/usr/bin/env node
/**
 * sync-drive-videos.mjs (#video-submissions)
 *
 * Cron job (runs every 15 min via GitHub Actions) that syncs new video
 * submissions from Firebase Storage to Google Drive folders set up by
 * directors per assignment.
 *
 * Flow:
 *   1. Query Firestore for submissions where googleDriveFileId is null
 *      (not yet synced to Drive).
 *   2. For each, resolve the assignment to find the target Drive folder.
 *   3. Download the video from Firebase Storage (via the download URL).
 *   4. Upload to Google Drive using a service account.
 *   5. Update the Submission doc with the Drive file id.
 *
 * Env:
 *   FIREBASE_SERVICE_ACCOUNT_JSON — Firebase Admin SDK service account key.
 *   GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON — GCP service account key with
 *     Drive file write access (same format as Firebase key).
 *
 * The Drive service account must have "Writer" access on each director's
 * assignment folder (granted by the director via useGoogleDrive.ts when
 * they first connect).
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { google } from 'googleapis';

const rawFirebase = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const rawDrive = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON;

if (!rawFirebase) {
  console.error('FIREBASE_SERVICE_ACCOUNT_JSON is not set — aborting.');
  process.exit(1);
}
if (!rawDrive) {
  console.error('GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON is not set — aborting.');
  process.exit(1);
}

const firebaseApp = initializeApp({ credential: cert(JSON.parse(rawFirebase)) });
const db = getFirestore(firebaseApp);

const driveAuth = new google.auth.GoogleAuth({
  credentials: JSON.parse(rawDrive),
  scopes: ['https://www.googleapis.com/auth/drive.file'],
});
const drive = google.drive({ version: 'v3', auth: driveAuth });

async function main() {
  console.log('[sync-drive] Starting sync…');

  // 1. Find all submissions not yet synced to Drive.
  const subSnap = await db.collection('assignmentSubmissions')
    .where('googleDriveFileId', '==', null)
    .get();

  if (subSnap.empty) {
    console.log('[sync-drive] No unsynced submissions. Done.');
    return;
  }

  let synced = 0;
  let failed = 0;

  for (const subDoc of subSnap.docs) {
    const sub = subDoc.data();
    const subId = subDoc.id;

    try {
      // 2. Resolve the assignment's Drive folder.
      const assignDoc = await db.collection('assignments').doc(sub.assignmentId).get();
      if (!assignDoc.exists) {
        console.warn(`[sync-drive] Assignment ${sub.assignmentId} not found for submission ${subId} — skipping.`);
        continue;
      }
      const assignment = assignDoc.data();
      const folderId = assignment?.googleDriveFolderId;
      if (!folderId) {
        console.warn(`[sync-drive] No Drive folder for assignment ${sub.assignmentId} — skipping submission ${subId}.`);
        continue;
      }

      // 3. Download the video from Firebase Storage.
      console.log(`[sync-drive] Downloading ${sub.fileName} (${sub.fileSize} bytes)…`);
      const res = await fetch(sub.videoUrl);
      if (!res.ok) {
        throw new Error(`Failed to download video: HTTP ${res.status}`);
      }
      const buffer = Buffer.from(await res.arrayBuffer());

      // 4. Upload to Google Drive (resumable for large files).
      console.log(`[sync-drive] Uploading to Drive folder ${folderId}…`);
      const driveFile = await drive.files.create({
        requestBody: {
          name: sub.fileName,
          parents: [folderId],
        },
        media: {
          mimeType: res.headers.get('content-type') ?? 'video/webm',
          body: require('stream').Readable.from(buffer),
        },
        fields: 'id,webViewLink',
      });

      // 5. Update Firestore.
      await db.collection('assignmentSubmissions').doc(subId).update({
        googleDriveFileId: driveFile.data.id,
        googleDriveFolderId: folderId,
      });

      console.log(`[sync-drive] Synced ${subId}: ${driveFile.data.webViewLink}`);
      synced++;
    } catch (err) {
      console.error(`[sync-drive] Failed to sync submission ${subId}:`, err.message);
      failed++;
    }
  }

  console.log(`[sync-drive] Done. Synced: ${synced}, Failed: ${failed}`);
}

main().catch(err => {
  console.error('[sync-drive] Fatal error:', err);
  process.exit(1);
});
