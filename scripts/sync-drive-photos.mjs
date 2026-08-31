#!/usr/bin/env node
/**
 * sync-drive-photos.mjs (#concert-checkin)
 *
 * Files concert check-in selfies into the directors' shared Google Drive
 * folder, and keeps the cumulative attendance CSV sitting there beside them.
 *
 * Why Drive at all, when the photos are already in Firebase Storage: Storage
 * holds them under a path with NO public read (storage.rules), which is
 * correct — they are photographs of students. But that also means the only
 * way to look at one is to be signed into the Hub. Drive gives the directors
 * an archive they can browse, share with each other, and keep after a
 * concert, with access governed by Drive's own sharing rather than by a token
 * in a URL. The Hub stays the live view; Drive is the record.
 *
 * Flow, per run:
 *   1. Find check-ins that have a photoPath and no photoDriveId yet.
 *   2. Resolve (or create) one subfolder per concert, named for the concert.
 *   3. Download the object from Storage with the Admin SDK — NOT from a
 *      public URL, because there isn't one and there must not be.
 *   4. Upload to Drive, then write the file id and link back onto the record,
 *      which is what makes the CSV's Drive column fill in.
 *   5. Rewrite concert-attendance.csv in the parent folder from the whole
 *      collection, using the SAME builder the director's Download CSV button
 *      uses (src/director/checkin/checkinCsv.ts) — one spelling of that file.
 *
 * Idempotent and resumable: step 1 only picks up unsynced records, step 2
 * reuses a subfolder that already exists, and a photo that fails leaves its
 * record untouched so the next run retries it.
 *
 * Env:
 *   FIREBASE_SERVICE_ACCOUNT_JSON — the same secret the other workflows use.
 *     Also authenticates to Drive; the Drive API is already enabled on the
 *     project for the video sync.
 *
 * The service account must have Writer access on the Concert Attendance
 * folder, and the folder id must be set in the Hub
 * (Concert Check-In → Settings), which writes settings/concertAttendanceSync.
 */

import { Readable } from 'stream';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { google } from 'googleapis';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { checkinsToCsv } from '../src/director/checkin/checkinCsv.ts';
import {
  escapeDriveQuery as q, concertFolderName, photoFileName, needsFiling,
} from './lib/drivePhotoNames.mjs';

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!raw) {
  console.error('[sync-photos] FIREBASE_SERVICE_ACCOUNT_JSON is not set — aborting.');
  process.exit(1);
}
const sa = JSON.parse(raw);

// The org config, read straight off disk the way generate-feeds.mjs does —
// this script runs under plain node, where the vite `define` constants that
// src/org/index.ts expects do not exist.
const ORG_ID = process.env.ORG || process.env.VITE_ORG || 'nwsa';
const ORG = JSON.parse(readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '..', 'config', 'orgs', `${ORG_ID}.json`),
  'utf8',
));

const firebaseApp = initializeApp({
  credential: cert(sa),
  storageBucket: ORG.checkin?.storageBucket,
});
const db = getFirestore(firebaseApp);
const bucket = getStorage(firebaseApp).bucket();

const driveAuth = new google.auth.GoogleAuth({
  credentials: sa,
  scopes: ['https://www.googleapis.com/auth/drive.file'],
});
const drive = google.drive({ version: 'v3', auth: driveAuth });

const CSV_NAME = 'concert-attendance.csv';

/** Find a child folder by name, or make one. Cached per run so a concert with
 *  two hundred photos costs one lookup, not two hundred. */
const folderCache = new Map();
async function folderFor(parentId, name) {
  if (folderCache.has(name)) return folderCache.get(name);
  const found = await drive.files.list({
    q: `'${q(parentId)}' in parents and name = '${q(name)}'`
      + ` and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id)',
    pageSize: 1,
  });
  let id = found.data.files?.[0]?.id;
  if (!id) {
    const made = await drive.files.create({
      requestBody: { name, parents: [parentId], mimeType: 'application/vnd.google-apps.folder' },
      fields: 'id',
    });
    id = made.data.id;
    console.log(`[sync-photos] Created folder "${name}"`);
  }
  folderCache.set(name, id);
  return id;
}

async function syncPhotos(parentId) {
  // Records with a photo that has not been filed yet. `photoDriveId` is
  // absent (never null) on a fresh record, so this is an inequality-free
  // query over a small collection rather than a composite index.
  const snap = await db.collection('concertCheckins').get();
  const pending = snap.docs.filter(d => needsFiling(d.data()));

  if (pending.length === 0) {
    console.log('[sync-photos] No unfiled photos.');
    return { synced: 0, failed: 0 };
  }
  console.log(`[sync-photos] ${pending.length} photo(s) to file.`);

  let synced = 0;
  let failed = 0;

  for (const doc of pending) {
    const rec = doc.data();
    try {
      const folderId = await folderFor(parentId, concertFolderName(rec));

      // Straight from Storage with admin credentials. There is no public URL
      // for these objects and there must never be one.
      const [buffer] = await bucket.file(rec.photoPath).download();

      const file = await drive.files.create({
        requestBody: { name: photoFileName(rec), parents: [folderId] },
        media: { mimeType: 'image/jpeg', body: Readable.from(buffer) },
        fields: 'id,webViewLink',
      });

      await doc.ref.update({
        photoDriveId: file.data.id,
        photoDriveLink: file.data.webViewLink ?? '',
      });
      synced++;
    } catch (err) {
      // One bad object must not stop the run — the record stays unsynced and
      // the next run picks it up again.
      console.error(`[sync-photos] Failed on ${doc.id}: ${err.message}`);
      failed++;
    }
  }
  return { synced, failed };
}

/**
 * Rewrite the cumulative CSV in the parent folder.
 *
 * Rewritten whole rather than appended: the file is a projection of the
 * collection, and appending would double rows whenever a run overlapped or a
 * record was corrected. Built by the SAME function behind the Hub's Download
 * CSV button, so the two files cannot drift.
 */
async function writeCsv(parentId) {
  const snap = await db.collection('concertCheckins').get();
  const records = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const csv = checkinsToCsv(records, {
    terms: ORG.terms ?? [],
    timeZone: ORG.timezone,
    publicUrl: ORG.publicUrl,
  });
  // Excel needs the BOM to read UTF-8, same as the in-app download.
  const body = '﻿' + csv;

  const existing = await drive.files.list({
    q: `'${q(parentId)}' in parents and name = '${q(CSV_NAME)}' and trashed = false`,
    fields: 'files(id)',
    pageSize: 1,
  });
  const media = { mimeType: 'text/csv', body: Readable.from(Buffer.from(body, 'utf8')) };
  const fileId = existing.data.files?.[0]?.id;

  if (fileId) {
    await drive.files.update({ fileId, media });
    console.log(`[sync-photos] Updated ${CSV_NAME} (${records.length} scans).`);
  } else {
    await drive.files.create({
      requestBody: { name: CSV_NAME, parents: [parentId] },
      media,
      fields: 'id',
    });
    console.log(`[sync-photos] Created ${CSV_NAME} (${records.length} scans).`);
  }
}

async function main() {
  console.log('[sync-photos] Starting…');

  const settings = await db.doc('settings/concertAttendanceSync').get();
  const parentId = settings.exists ? settings.get('driveFolderId') : undefined;
  if (!parentId) {
    // Not an error: the feature works without Drive, and this is the normal
    // state until a director pastes the folder id in.
    console.log('[sync-photos] No Drive folder configured (Concert Check-In → Settings). Nothing to do.');
    return;
  }

  const { synced, failed } = await syncPhotos(parentId);
  await writeCsv(parentId);

  console.log(`[sync-photos] Done. Filed: ${synced}, failed: ${failed}.`);
  // A failure is worth a red run — silence is how the video sync's own gap
  // went unnoticed — but only after the CSV has been refreshed.
  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('[sync-photos] Fatal:', err);
  process.exit(1);
});
