#!/usr/bin/env node
/**
 * seed-director-assignments.mjs
 *
 * Owner-curated conducting / teaching assignments on directors/{email}.
 * Idempotent: merges roles, assignments, and MDC contact info; never removes
 * the Owner role. Also mirrors assigned staff onto each ensemble doc.
 *
 * Run via "Seed Director Assignments" workflow_dispatch or locally:
 *   FIREBASE_SERVICE_ACCOUNT_JSON=… node scripts/seed-director-assignments.mjs
 *   add --dry-run to preview without writing.
 */
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { JAZZ_COMBO_NAME_PATTERN } from '../src/director/directorAssignments.ts';
import { assignedStaffForGroup } from '../src/director/groupStaff.ts';

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!raw) {
  console.error('FIREBASE_SERVICE_ACCOUNT_JSON not set — aborting.');
  process.exit(1);
}
const DRY = process.argv.includes('--dry-run');
if (getApps().length === 0) initializeApp({ credential: cert(JSON.parse(raw)) });
const db = getFirestore();

/** Match a director doc by email (lowercase) and/or display name regex. */
const SPECS = [
  {
    label: 'Brent Mounger',
    email: null,
    nameMatch: /\bbrent\b.*\bmoung/i,
    addRoles: ['director', 'classroom'],
    assignedEnsembleIds: ['wind-ensemble', 'chamber-winds', 'class-ap-theory'],
    mdcEmail: 'brent.mounger@mdc.edu',
    phone: '305-237-3532',
  },
  {
    label: 'Jim Gasior',
    email: null,
    nameMatch: /\bjim\b.*\bgasior\b|\bgasior\b/i,
    addRoles: ['director', 'classroom'],
    assignedEnsembleIds: ['jazz-ensemble', 'class-jazz-theory'],
    assignedEnsemblePatterns: [JAZZ_COMBO_NAME_PATTERN],
    mdcEmail: 'jgasior@mdc.edu',
    phone: '305-237-3946',
  },
  {
    label: 'Grant Gilman',
    email: 'nwsaorchestras@gmail.com',
    nameMatch: /\bgrant\b.*\bgilman\b|\bgilman\b.*\bgrant\b/i,
    addRoles: ['director'],
    assignedEnsembleIds: [
      'symphony-orchestra',
      'camerata-string-orchestra',
      'philharmonic',
      'opera-orchestra',
      'college-chamber-orchestra',
    ],
    mdcEmail: 'ggilman@mdc.edu',
  },
  {
    label: 'Gisele Rios',
    email: 'g.elgarresta@gmail.com',
    nameMatch: /\bgisele\b.*\brios\b|\bgiselle\b.*\brios\b|\brios\b.*\bgise/i,
    addRoles: ['director'],
    assignedEnsembleIds: ['high-school-choir'],
    // MDC email not on nwsa.mdc.edu faculty pages — set manually on Directors screen.
  },
];

function existingRoles(data) {
  if (Array.isArray(data.roles) && data.roles.length) return [...data.roles];
  if (data.role) return [data.role];
  return ['director'];
}

(async () => {
  const snap = await db.collection('directors').get();
  if (snap.empty) {
    console.error('No directors collection — run seed-directors first.');
    process.exit(1);
  }

  let changed = 0;
  for (const spec of SPECS) {
    let doc = spec.email
      ? snap.docs.find(d => d.id === spec.email.toLowerCase())
      : null;
    if (!doc && spec.nameMatch) {
      doc = snap.docs.find(d => spec.nameMatch.test(d.data().name ?? ''));
    }
    if (!doc) {
      console.warn(`SKIP: ${spec.label} — no matching directors doc (add them in the app first).`);
      continue;
    }

    const data = doc.data();
    const roles = new Set([...existingRoles(data), ...spec.addRoles]);
    if (existingRoles(data).includes('owner') || doc.id === 'nwsaorchestras@gmail.com') {
      roles.add('owner');
    }

    const patch = {
      roles: [...roles],
      role: FieldValue.delete(),
      assignedEnsembleIds: spec.assignedEnsembleIds,
      ...(spec.assignedEnsemblePatterns
        ? { assignedEnsemblePatterns: spec.assignedEnsemblePatterns }
        : {}),
      ...(spec.label && !data.name ? { name: spec.label } : {}),
      ...(spec.mdcEmail ? { mdcEmail: spec.mdcEmail } : {}),
      ...(spec.phone ? { phone: spec.phone } : {}),
    };

    console.log(`${doc.id} (${data.name || spec.label})`);
    console.log(`  roles → ${patch.roles.join(', ')}`);
    console.log(`  groups → ${spec.assignedEnsembleIds.join(', ')}`);
    if (spec.mdcEmail) console.log(`  mdc → ${spec.mdcEmail}`);
    if (spec.assignedEnsemblePatterns?.length) {
      console.log(`  patterns → ${spec.assignedEnsemblePatterns.join(', ')}`);
    }

    if (!DRY) {
      await doc.ref.update(patch);
      changed += 1;
    }
  }

  if (DRY) {
    console.log('\n--dry-run: nothing written.');
    return;
  }

  console.log(`\nUpdated ${changed} director(s). Syncing ensemble staff…`);

  const directors = (await db.collection('directors').get()).docs.map(d => ({ email: d.id, ...d.data() }));
  const ensembles = (await db.collection('ensembles').get()).docs.map(d => ({ id: d.id, name: d.data().name ?? d.id }));
  let batch = db.batch();
  let ops = 0;
  for (const e of ensembles) {
    const staff = assignedStaffForGroup(e.id, directors, ensembles);
    batch.update(db.collection('ensembles').doc(e.id), { staff });
    ops += 1;
    if (ops >= 400) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();
  console.log(`Synced staff on ${ensembles.length} group(s).`);
})().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
