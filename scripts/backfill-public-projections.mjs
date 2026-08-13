#!/usr/bin/env node
/**
 * backfill-public-projections.mjs (#privacy)
 *
 * Converges the public projection mirrors from the full (staff-only)
 * collections using the Admin SDK (bypasses security rules):
 *
 *   students        → studentsPublic        (name, preferredName, instrument,
 *                                            section, ensembleIds, status)
 *   rosterOverrides → rosterOverridesPublic (all fields EXCEPT reason)
 *
 * Also deletes mirror docs whose source doc no longer exists, so re-running
 * always converges. Client writes keep the mirrors in sync day-to-day
 * (src/director/publicMirror.ts); this script exists for the initial
 * backfill and as a repair tool.
 *
 * Env: FIREBASE_SERVICE_ACCOUNT_JSON — the service-account key JSON.
 */

import { spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!raw) {
  console.error('FIREBASE_SERVICE_ACCOUNT_JSON is not set — aborting.');
  process.exit(1);
}

// Temporary: run opening-week schedule overrides via this existing workflow
// (new .yml needs `workflow` OAuth scope). Remove after successful run.
{
  const here = dirname(fileURLToPath(import.meta.url));
  const r = spawnSync(process.execPath, [join(here, 'opening-week-schedule.mjs')], {
    stdio: 'inherit',
    env: process.env,
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

initializeApp({ credential: cert(JSON.parse(raw)) });
const db = getFirestore();

const PUBLIC_STUDENT_KEYS = ['name', 'preferredName', 'instrument', 'section', 'ensembleIds', 'status'];

function projectStudent(data) {
  const out = {};
  for (const k of PUBLIC_STUDENT_KEYS) if (data[k] !== undefined) out[k] = data[k];
  return out;
}

function projectOverride(data) {
  const { reason, ...rest } = data;
  void reason;
  return rest;
}

async function syncMirror(sourceName, mirrorName, project) {
  const [source, mirror] = await Promise.all([
    db.collection(sourceName).get(),
    db.collection(mirrorName).get(),
  ]);
  const sourceIds = new Set(source.docs.map(d => d.id));

  const writer = db.bulkWriter();
  for (const d of source.docs) {
    writer.set(db.collection(mirrorName).doc(d.id), project(d.data()));
  }
  let removed = 0;
  for (const d of mirror.docs) {
    if (!sourceIds.has(d.id)) { writer.delete(d.ref); removed++; }
  }
  await writer.close();
  console.log(`${mirrorName}: mirrored ${source.size} docs, removed ${removed} stale.`);
}

await syncMirror('students', 'studentsPublic', projectStudent);
await syncMirror('rosterOverrides', 'rosterOverridesPublic', projectOverride);
console.log('Public projections converged.');
