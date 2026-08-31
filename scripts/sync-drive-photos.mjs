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
import { driveClient, driveAccountLabel } from './lib/driveAuth.mjs';

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
const { drive, mode: driveMode, describe: driveDescribe } =
  driveClient(google, sa, ['https://www.googleapis.com/auth/drive']);

/** The address Drive says these credentials belong to, once the preflight has
 *  asked. Null until then — and every message has to cope with not knowing,
 *  because explain() also runs from main().catch, before any lookup. */
let driveAccount = null;

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
    const fix = driveMode === 'oauth'
      // Signed in as a person, so the quota being refused is theirs: a full
      // 15 GB Drive, not the service account's zero.
      ? 'The Google account that owns the folder is out of Drive storage. Free some'
        + ' space, or upgrade that account, and the next run picks up everything.'
      : 'A service account has no Drive storage of its own, so it cannot own files in a'
        + ' personal My Drive folder — sharing the folder does not change that. Either set'
        + ' the DRIVE_OAUTH_* secrets so the sync signs in as the folder owner'
        + ' (docs/drive-oauth-setup.md), or move the folder into a Google Workspace SHARED'
        + ' DRIVE and add the service account as a Content Manager.';
    return `Google refused the write for storage quota. ${fix}`
      + ' Meanwhile the photos are still safe in Firebase Storage and visible in the Hub.';
  }
  // Both walls below are about WHO Drive refused, so both have to name the
  // account actually in use: under OAuth the service account is out of the
  // picture entirely, and "share the folder with firebase-adminsdk@…" is
  // advice that fixes nothing.
  const oauth = driveMode === 'oauth';
  const who = driveAccountLabel(driveMode, driveAccount, sa.client_email);
  // Drive answers "not shared with you" with the same 404 it gives for an id
  // that doesn't exist, so a 404 has to name both — but 403 means it FOUND the
  // folder and the write was refused, which is a different fix.
  if (/insufficientFilePermissions|403/i.test(msg)) {
    return `Drive found the folder but ${who} cannot write to it. `
      + (oauth
        ? 'Give that account Editor access to the folder, or re-mint the refresh token'
          + ' as an account that has it (docs/drive-oauth-setup.md).'
        : `Change its access to Editor: ${sa.client_email}`);
  }
  if (/File not found|notFound|404/i.test(msg)) {
    return `Drive says the folder is missing OR not visible to ${who} — it answers both`
      + ' the same way. '
      + (oauth
        ? 'That account should be the folder\u2019s owner, so check the folder id in'
          + ' Concert Check-In \u2192 Settings first, then whether the refresh token really'
          + ' belongs to the account that owns the folder.'
        : 'If you can open the folder yourself, it is sharing: share it as Editor with'
          + ` ${sa.client_email}. If you cannot, the folder id in Concert Check-In`
          + ' \u2192 Settings is wrong.');
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
  // Who these credentials actually are. The service account carries its own
  // address; an OAuth token does not, so ask Drive rather than assert. One
  // round trip buys every message below a real name instead of a description.
  if (driveMode === 'oauth') {
    try {
      const me = await drive.about.get({ fields: 'user(emailAddress)' });
      driveAccount = me.data.user?.emailAddress ?? null;
    } catch {
      // Not fatal, and deliberately quiet: the sync's job is filing photos,
      // and every message still reads correctly without a name (that is what
      // driveAccountLabel's fallback is for). A credential broken badly
      // enough to fail here fails again on the folder, with a better message.
    }
  } else {
    driveAccount = sa.client_email;
  }
  // Only the OAuth line was uninformative. The service-account describe names
  // its address AND carries the Shared-Drive constraint, so it stays as it is.
  console.log(`[sync-photos] ${driveMode === 'oauth' && driveAccount
    ? `Drive: signed in as ${driveAccount} (OAuth). Files are owned by that account.`
    : driveDescribe}`);

  try {
    const folder = await drive.files.get({
      // owners rides along on a call already being made — the folder's owner
      // costs nothing extra, and it is the other half of the comparison.
      fileId: parentId, fields: 'id,name,owners(emailAddress)', ...ALL_DRIVES,
    });
    const owner = folder.data.owners?.[0]?.emailAddress ?? null;
    console.log(`[sync-photos] Folder: "${folder.data.name}"${owner ? ` (owned by ${owner})` : ''}`);

    // A mismatch is worth SAYING and not worth failing on: an account with
    // Editor access can file photos into someone else's folder perfectly well
    // — it owns the files it uploads and they come out of its own storage,
    // which is the whole reason this sync signs in as a person. But it is also
    // the shape of a token minted as the wrong account, and that only surfaces
    // later as a quota or permission error pointing nowhere near the cause.
    if (owner && driveAccount && owner !== driveAccount) {
      console.warn(`[sync-photos] Note: ${driveAccount} is not the folder's owner (${owner}).`
        + ' Fine if that account was deliberately given Editor access — its uploads use its own'
        + ' Drive storage. If it was not, the refresh token belongs to the wrong account:'
        + ' re-mint it as ' + owner + ' (docs/drive-oauth-setup.md).');
    }
  } catch (err) {
    console.error(`[sync-photos] Cannot open the Drive folder. ${explain(err)}`);
    process.exit(1);
  }

  const { synced, failed } = await syncPhotos(parentId);
  try {
    await writeCsv(parentId);
  } catch (err) {
    // Every other Drive call explains itself; this one used to fall through to
    // main().catch and print a raw Gaxios error, which is how a storage-quota
    // wall read as an unhandled crash.
    console.error(`[sync-photos] Could not write ${CSV_NAME}. ${explain(err)}`);
    process.exit(1);
  }

  console.log(`[sync-photos] Done. Filed: ${synced}, failed: ${failed}.`);
  // A failure is worth a red run — silence is how the video sync's own gap
  // went unnoticed — but only after the CSV has been refreshed.
  if (failed > 0) process.exit(1);
}

main().catch(err => {
  // Through explain(), not raw: the CSV rewrite throws here rather than inside
  // the per-photo loop, so the quota wall — the one failure explain() has a
  // whole paragraph of remedy for — was the one arriving as a bare Gaxios
  // stack. Anything explain() can't name falls through as its own message, and
  // keeps the stack, because that's a code fault and not a Google-side wall.
  const said = explain(err);
  console.error('[sync-photos] Fatal:', said);
  if (said === String(err?.message ?? err)) console.error(err);
  process.exit(1);
});
