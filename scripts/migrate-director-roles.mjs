#!/usr/bin/env node
/**
 * migrate-director-roles.mjs
 *
 * One-time backfill for the Owner/Director/Teacher role system (#roles).
 * Every director doc created before this feature has no `role` field — the
 * app treats those as 'director' (full access) at read time, but the ONE
 * Owner account needs `role: 'owner'` written explicitly so firestore.rules
 * can lock the Directors screen down to them alone. Writing that requires
 * already being able to write the `directors` collection under the NEW
 * rules (owner-only) — chicken-and-egg — so, like seed-directors.mjs, this
 * runs with the Admin SDK, which bypasses rules entirely.
 *
 * Idempotent: only touches docs that don't already have a `role` set, so
 * re-running (or the push self-trigger) never overwrites a role someone
 * since changed from the Directors screen.
 *
 * Run it once via the "Migrate Director Roles" GitHub Action (workflow_dispatch),
 * after deploying the new firestore.rules, or locally with a service account:
 *   FIREBASE_SERVICE_ACCOUNT_JSON="$(cat serviceAccount.json)" node scripts/migrate-director-roles.mjs
 *
 * Required env: FIREBASE_SERVICE_ACCOUNT_JSON (GitHub secret)
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// The sole Owner account — confirmed by the school director. Every other
// existing director doc becomes 'director' (full access, same as they have
// today); nobody is demoted or locked out by this script.
const OWNER_EMAIL = 'nwsaorchestras@gmail.com';

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
  const snap = await db.collection('directors').get();
  if (snap.empty) {
    console.log('No directors yet — nothing to migrate (seed-directors.mjs runs first).');
    return;
  }

  const batch = db.batch();
  let changed = 0;
  for (const d of snap.docs) {
    const data = d.data();
    if (data.role) continue; // already migrated / explicitly set — leave it alone
    const role = d.id === OWNER_EMAIL ? 'owner' : 'director';
    batch.update(d.ref, { role });
    changed += 1;
    console.log(`${d.id} -> role: ${role}`);
  }

  if (changed === 0) {
    console.log('Every director already has a role — nothing to do.');
    return;
  }
  await batch.commit();
  console.log(`Migrated ${changed} director(s).`);
})().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
