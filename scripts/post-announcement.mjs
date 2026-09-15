#!/usr/bin/env node
/**
 * post-announcement.mjs
 *
 * Writes one announcement into Firestore from the Actions tab, for the times
 * a post has to go up and nobody is at a signed-in browser. The Director
 * Panel is still the normal way to post — this is the same doc, written the
 * same shape, by the service account instead of a director.
 *
 * Fields mirror `Announcement` in src/director/types.ts. Anything the type
 * marks optional is simply left off the doc when its input is blank, so a
 * post written here is indistinguishable from one typed in the app.
 *
 * Required env: FIREBASE_SERVICE_ACCOUNT_JSON, ANN_TITLE.
 * Optional env: ANN_BODY, ANN_PRIORITY, ANN_ENSEMBLE_ID, ANN_EXPIRES_ON,
 *               ANN_PINNED, ANN_LINKS, ANN_AUTHOR, ANN_AUTHOR_EMAIL.
 *
 * ANN_LINKS is one link per line, `Label | https://example.com`. In-app
 * destinations are paths (`Concerts | /concerts`).
 *
 * Pass --dry-run to print the doc and write nothing.
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const MAX_LINKS = 6; // MAX_ANNOUNCEMENT_LINKS in src/director/types.ts
const PRIORITIES = ['info', 'important', 'urgent'];

const dryRun = process.argv.includes('--dry-run');

const title = (process.env.ANN_TITLE ?? '').trim();
// The Actions tab's input boxes are single-line, so a multi-paragraph body
// arrives with "\n" typed literally. Both spellings mean a line break here.
const body = (process.env.ANN_BODY ?? '').replace(/\\n/g, '\n').trim();
const priority = (process.env.ANN_PRIORITY ?? 'info').trim();
const ensembleId = (process.env.ANN_ENSEMBLE_ID ?? '').trim();
const expiresOn = (process.env.ANN_EXPIRES_ON ?? '').trim();
const pinned = /^(true|yes|1)$/i.test((process.env.ANN_PINNED ?? '').trim());
const author = (process.env.ANN_AUTHOR ?? '').trim();
const authorEmail = (process.env.ANN_AUTHOR_EMAIL ?? '').trim();

if (!title) { console.error('ANN_TITLE is required.'); process.exit(1); }
if (!PRIORITIES.includes(priority)) {
  console.error(`Bad ANN_PRIORITY "${priority}" — expected one of ${PRIORITIES.join(', ')}`);
  process.exit(1);
}
if (expiresOn && !/^\d{4}-\d{2}-\d{2}$/.test(expiresOn)) {
  console.error(`Bad ANN_EXPIRES_ON "${expiresOn}" — expected YYYY-MM-DD`);
  process.exit(1);
}

// `Label | url` per line. A bare line with no pipe is a mistake worth
// stopping for: it would otherwise post a chip labelled with its own URL.
const links = (process.env.ANN_LINKS ?? '')
  .replace(/\\n/g, '\n')
  .split('\n')
  .map(l => l.trim())
  .filter(Boolean)
  .map(line => {
    const at = line.indexOf('|');
    if (at === -1) { console.error(`Bad ANN_LINKS line (no "|"): ${line}`); process.exit(1); }
    const label = line.slice(0, at).trim();
    const url = line.slice(at + 1).trim();
    if (!label || !url) { console.error(`Bad ANN_LINKS line: ${line}`); process.exit(1); }
    if (!/^(https?:\/\/|\/)/.test(url)) {
      console.error(`Bad ANN_LINKS url "${url}" — must be http(s) or an in-app path starting "/"`);
      process.exit(1);
    }
    return { label, url };
  });
if (links.length > MAX_LINKS) {
  console.error(`${links.length} links — the app's own limit is ${MAX_LINKS}.`);
  process.exit(1);
}

const doc = {
  ensembleId: ensembleId || null, // null = school-wide, as the app writes it
  title,
  createdAt: Date.now(),
  priority,
  ...(body ? { body } : {}),
  ...(links.length ? { links } : {}),
  ...(expiresOn ? { expiresOn } : {}),
  ...(pinned ? { pinned: true } : {}),
  ...(author ? { createdBy: author } : {}),
  ...(authorEmail ? { createdByEmail: authorEmail } : {}),
};

if (dryRun) {
  console.log('--dry-run — nothing written. Doc would be:');
  console.log(JSON.stringify(doc, null, 2));
  process.exit(0);
}

const SERVICE_ACCOUNT_JSON = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!SERVICE_ACCOUNT_JSON) { console.error('FIREBASE_SERVICE_ACCOUNT_JSON not set.'); process.exit(1); }
let serviceAccount;
try { serviceAccount = JSON.parse(SERVICE_ACCOUNT_JSON); }
catch { console.error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.'); process.exit(1); }
if (getApps().length === 0) initializeApp({ credential: cert(serviceAccount) });

const ref = await getFirestore().collection('announcements').add(doc);
console.log(`Posted announcement ${ref.id}: ${title}`);
