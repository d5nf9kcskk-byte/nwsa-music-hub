#!/usr/bin/env node
/**
 * migrate-director-roles-array.mjs
 *
 * Backfill `roles: StaffRole[]` from the legacy single `role` field (#roles).
 * Idempotent: skips docs that already have a non-empty `roles` array.
 * Removes the legacy `role` field once `roles` is written.
 *
 * Run via workflow_dispatch or locally:
 *   FIREBASE_SERVICE_ACCOUNT_JSON="$(cat serviceAccount.json)" node scripts/migrate-director-roles-array.mjs
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

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

const KNOWN = new Set(['owner', 'director', 'teacher', 'assistant']);

(async () => {
  const snap = await db.collection('directors').get();
  if (snap.empty) {
    console.log('No directors — nothing to migrate.');
    return;
  }

  const batch = db.batch();
  let changed = 0;
  for (const d of snap.docs) {
    const data = d.data();
    if (Array.isArray(data.roles) && data.roles.length > 0) continue;

    const legacy = data.role ?? 'director';
    if (!KNOWN.has(legacy)) {
      console.warn(`${d.id}: unknown role "${legacy}" — skipping`);
      continue;
    }
    batch.update(d.ref, { roles: [legacy], role: FieldValue.delete() });
    changed += 1;
    console.log(`${d.id} -> roles: [${legacy}]`);
  }

  if (changed === 0) {
    console.log('Every director already has roles[] — nothing to do.');
    return;
  }
  await batch.commit();
  console.log(`Migrated ${changed} director(s) to roles[].`);
})().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
