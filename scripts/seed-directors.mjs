#!/usr/bin/env node
/**
 * seed-directors.mjs
 *
 * One-time bootstrap for the data-driven director allowlist. The `directors`
 * collection is the source of truth for who may sign in and edit the Hub, and
 * it is normally managed from the app's Directors screen. But writing there
 * requires already being a director — so the FOUNDING account(s) have to be
 * seeded out-of-band. The Admin SDK bypasses Firestore rules, so this script
 * can create them.
 *
 * BOOTSTRAP-ONLY: if the collection already has any directors, this does
 * nothing — so it can never resurrect a director someone removed in the app.
 *
 * Run it once via the "Seed Directors" GitHub Action (workflow_dispatch), or
 * locally with a service account:
 *   FIREBASE_SERVICE_ACCOUNT_JSON="$(cat serviceAccount.json)" node scripts/seed-directors.mjs
 *
 * Required env: FIREBASE_SERVICE_ACCOUNT_JSON (GitHub secret)
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// The founding directors. Add or remove people from the app afterwards — this
// list is only used to create the very first entries when the collection is empty.
const SEED_EMAILS = [
  'nwsaorchestras@gmail.com',
  'g.elgarresta@gmail.com', // Giselle Rios — chorus director
];

const SERVICE_ACCOUNT_JSON = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!SERVICE_ACCOUNT_JSON) {
  console.error('FIREBASE_SERVICE_ACCOUNT_JSON not set — aborting.');
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(SERVICE_ACCOUNT_JSON);
} catch {
  console.error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON — aborting.');
  process.exit(1);
}

if (getApps().length === 0) initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

(async () => {
  const existing = await db.collection('directors').limit(1).get();
  if (!existing.empty) {
    console.log('directors collection already initialized — leaving it untouched.');
    return;
  }

  const batch = db.batch();
  for (const raw of SEED_EMAILS) {
    const email = raw.trim().toLowerCase();
    batch.set(db.collection('directors').doc(email), {
      email,
      addedBy: 'seed-directors.mjs',
      addedAt: Date.now(),
    });
  }
  await batch.commit();
  console.log(`Seeded ${SEED_EMAILS.length} founding director(s): ${SEED_EMAILS.join(', ')}`);
})();
