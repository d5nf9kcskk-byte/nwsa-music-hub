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
import { driveFolderIdFrom } from '../src/shared/concertCheckin.ts';
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

/**
 * Full `drive` scope, NOT `drive.file`.
 *
 * `drive.file` grants access only to files the app itself created or that a
 * user opened through the Google Picker. A folder a director makes by hand
 * and shares with this service account is neither, so under `drive.file` the
 * folder is simply invisible and every run reports "not found" for a folder
 * that plainly exists. (The assignment-video sync uses `drive.file` because
 * its folders ARE created by the app, through useGoogleDrive.ts.)
 *
 * A service account has no Drive of its own, so this scope grants nothing
 * beyond what somebody has deliberately shared with this account.
 */
const driveAuth = new google.auth.GoogleAuth({
  credentials: sa,
  scopes: ['https://www.googleapis.com/auth/drive'],
});
const drive = google.drive({ version: 'v3', auth: driveAuth });

const CSV_NAME = 'concert-attendance.csv';

/** Required on every call for a Shared Drive to be reachable at all. Harmless
 *  on an ordinary My Drive folder, and it is the difference between the
 *  Shared-Drive remedy below working and not. */
const ALL_DRIVES = { supportsAllDrives: true, includeItemsFromAllDrives: true };

/**
 * Two Google-side walls stand between "I shared the folder" and a working
 * sync, and both report themselves badly. Name them, with the fix, rather
 * than letting a director read a raw API error at 15 past the hour.
 *
 *   • 404 / no access — the folder id is wrong, or it was never shared with
 *     THIS service account. (Under the old drive.file scope this happened
 *     even when it had been shared correctly; the scope above fixes that.)
 *   • storageQuotaExceeded — the folder is in a personal My Drive. A service
 *     account has no storage quota of its own, and a file it uploads into a
 *     personal folder is owned by the service account, so Google refuses it.
 *     A Google Workspace SHARED DRIVE is the fix: files are owned by the
 *     drive, not the uploader. Add the service account as a Content Manager.
 */
function explain(err) {
  const msg = String(err?.message ?? err);
  if (/storageQuotaExceeded|quota/i.test(msg)) {
    return 'Google refused the upload for storage quota. A service account has no Drive'
      + ' storage of its own, so it cannot own files in a personal My Drive folder.'
      + ' Move the Concert Attendance folder into a Google Workspace SHARED DRIVE and add'
      + ' the service account as a Content Manager — files there are owned by the drive.'
      + ' Until then the photos are still safe in Firebase Storage and visible in the Hub.';
  }
  // Drive answers "not shared with you" with the same 404 it gives for an id
  // that doesn't exist, so a 404 has to name both — but 403 means it FOUND the
  // folder and the service account simply can't write, which is a different fix.
  if (/insufficientFilePermissions|403/i.test(msg)) {
    return 'Drive found the folder but the service account cannot write to it.'
      + ` Change its access to Editor: ${sa.client_email}`;
  }
  if (/File not found|notFound|404/i.test(msg)) {
    return 'Drive says the folder is missing OR not shared with this service account —'
      + ' it answers both the same way. If you can open the folder yourself, it is sharing:'
      + ` share it as Editor with ${sa.client_email}. If you cannot, the folder id in`
      + ' Concert Check-In \u2192 Settings is wrong.';
  }
  return msg;
}

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
    ...ALL_DRIVES,
  });
  let id = found.data.files?.[0]?.id;
  if (!id) {
    const made = await drive.files.create({
      requestBody: { name, parents: [parentId], mimeType: 'application/vnd.google-apps.folder' },
      fields: 'id',
      ...ALL_DRIVES,
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
        ...ALL_DRIVES,
      });

      await doc.ref.update({
        photoDriveId: file.data.id,
        photoDriveLink: file.data.webViewLink ?? '',
      });
      synced++;
    } catch (err) {
      // One bad object must not stop the run — the record stays unsynced and
      // the next run picks it up again.
      console.error(`[sync-photos] Failed on ${doc.id}: ${explain(err)}`);
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
    ...ALL_DRIVES,
  });
  const media = { mimeType: 'text/csv', body: Readable.from(Buffer.from(body, 'utf8')) };
  const fileId = existing.data.files?.[0]?.id;

  if (fileId) {
    await drive.files.update({ fileId, media, ...ALL_DRIVES });
    console.log(`[sync-photos] Updated ${CSV_NAME} (${records.length} scans).`);
  } else {
    await drive.files.create({
      requestBody: { name: CSV_NAME, parents: [parentId] },
      media,
      fields: 'id',
      ...ALL_DRIVES,
    });
    console.log(`[sync-photos] Created ${CSV_NAME} (${records.length} scans).`);
  }
}

async function main() {
  console.log('[sync-photos] Starting…');

  const settings = await db.doc('settings/concertAttendanceSync').get();
  const stored = settings.exists ? settings.get('driveFolderId') : undefined;
  // Normalized here as well as in the Settings box, so a URL saved before the
  // box knew better starts working without anyone re-pasting it.
  const parentId = driveFolderIdFrom(stored);
  if (!parentId) {
    if (String(stored ?? '').trim()) {
      // Configured, but with something that cannot be a folder id. Silence
      // here would read as "nobody has set this up yet".
      console.error('[sync-photos] The saved Drive folder setting is not a folder id or a Drive'
        + ' link. Re-paste it in Concert Check-In → Settings.');
      process.exit(1);
    }
    // Not an error: the feature works without Drive, and this is the normal
    // state until a director pastes the folder id in.
    console.log('[sync-photos] No Drive folder configured (Concert Check-In → Settings). Nothing to do.');
    return;
  }

  // Preflight: one cheap read that turns every downstream failure into a
  // sentence naming the fix, instead of two hundred identical stack traces.
  console.log(`[sync-photos] Service account: ${sa.client_email}`);
  try {
    const folder = await drive.files.get({ fileId: parentId, fields: 'id,name', ...ALL_DRIVES });
    console.log(`[sync-photos] Folder: "${folder.data.name}"`);
  } catch (err) {
    console.error(`[sync-photos] Cannot open the Drive folder. ${explain(err)}`);
    process.exit(1);
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
