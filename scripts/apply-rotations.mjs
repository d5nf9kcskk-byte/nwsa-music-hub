#!/usr/bin/env node
/**
 * apply-rotations.mjs
 *
 * Applies a standing ensemble-rotation plan (built from the Instrumental
 * roster spreadsheet, parsed to JSON OUTSIDE the repo — never commit student
 * PII) to Firestore:
 *
 *   • students.ensembleIds        ← EVERY ensemble the student belongs to, so
 *       concerts and off-weekday events list them correctly.
 *   • rosterOverrides (kind:'rotation') ← one 'remove' doc per ensemble they
 *       rotate out of, carrying `days` (0=Sun…6=Sat). Membership is base-minus-
 *       removals; deliberately NOT destEnsembleId, which would make the
 *       destination membership exist only on rotation days and drop the student
 *       from that ensemble's concerts. See overrideApplies() in rosterResolver.ts.
 *
 * Both public mirrors are written in the same batch (#privacy) — the projection
 * hooks read studentsPublic / rosterOverridesPublic, and the backfill Action
 * has no cron, so an unmirrored write stays invisible to the public site.
 *
 *   FIREBASE_SERVICE_ACCOUNT_JSON=… node scripts/apply-rotations.mjs plan.json
 *   … --dry-run     # print the plan, write nothing
 *
 * Re-running is idempotent: every kind:'rotation' override belonging to a
 * student named in the plan is deleted first, then recreated. Rotation docs for
 * students NOT in the plan are left alone and reported as drift.
 */
import { readFileSync } from 'node:fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!raw) { console.error('FIREBASE_SERVICE_ACCOUNT_JSON is not set — aborting.'); process.exit(1); }
const planPath = process.argv[2];
if (!planPath) { console.error('Usage: node scripts/apply-rotations.mjs <plan.json> [--dry-run]'); process.exit(1); }
const DRY = process.argv.includes('--dry-run');

const plan = JSON.parse(readFileSync(planPath, 'utf8'));
const { startDate, endDate, students } = plan;
if (!startDate || !endDate || !Array.isArray(students)) {
  console.error('plan.json needs startDate, endDate and a students[] array.'); process.exit(1);
}
if (students.length === 0) { console.log('Plan lists no students — nothing to do.'); process.exit(0); }

if (getApps().length === 0) initializeApp({ credential: cert(JSON.parse(raw)) });
const db = getFirestore();

const same = (a, b) => { const x = [...a].sort(), y = [...b].sort();
  return x.length === y.length && x.every((v, i) => v === y[i]); };
const DN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const ops = [];   // { label, fn(batch) }
let memberChanges = 0, rotationDocs = 0, deleted = 0;

// ── 1. Base membership ────────────────────────────────────────────────
const live = await db.getAll(...students.map(s => db.collection('students').doc(s.id)));
const liveById = Object.fromEntries(live.map(d => [d.id, d.exists ? d.data() : null]));

const unresolved = students.filter(s => !liveById[s.id]);
if (unresolved.length) {
  console.error('Aborting — these plan entries have no students/{id} doc:');
  for (const s of unresolved) console.error(`  ${s.id}  (${s.name})`);
  console.error('Writing rotations for them would leave orphaned override docs.');
  process.exit(1);
}

for (const s of students) {
  const cur = liveById[s.id];
  const before = cur.ensembleIds ?? [];
  if (same(before, s.base)) continue;
  memberChanges++;
  console.log(`  membership  ${s.name.padEnd(30)} ${before.join(',') || '(none)'} → ${s.base.join(',')}`);
  ops.push({
    label: `students/${s.id}`,
    fn: b => {
      b.update(db.collection('students').doc(s.id),
        { ensembleIds: s.base, updatedAt: Date.now(), updatedBy: 'rotation import' });
      b.set(db.collection('studentsPublic').doc(s.id), { ensembleIds: s.base }, { merge: true });
    },
  });
}

// ── 2. Replace this plan's rotation overrides ─────────────────────────
const planIds = new Set(students.map(s => s.id));
const existing = await db.collection('rosterOverrides').where('kind', '==', 'rotation').get();
for (const d of existing.docs) {
  if (!planIds.has(d.data().studentId)) {
    console.warn(`  drift: rotation ${d.id} belongs to ${d.data().studentId}, not in this plan — LEFT ALONE`);
    continue;
  }
  deleted++;
  ops.push({ label: `delete rosterOverrides/${d.id}`, fn: b => {
    b.delete(db.collection('rosterOverrides').doc(d.id));
    b.delete(db.collection('rosterOverridesPublic').doc(d.id));
  }});
}

for (const s of students) {
  for (const rem of s.removals ?? []) {
    if (!Array.isArray(rem.days) || rem.days.length === 0) {
      console.error(`  !! ${s.name}: removal from ${rem.ensembleId} has no days — refusing ` +
        '(an empty `days` is a FULL year-long removal, not a rotation).');
      process.exit(1);
    }
    rotationDocs++;
    const doc = {
      studentId: s.id, ensembleId: rem.ensembleId,
      action: 'remove', kind: 'rotation', scope: 'range',
      startDate, endDate, days: rem.days,
    };
    console.log(`  rotation    ${s.name.padEnd(30)} out of ${rem.ensembleId.padEnd(26)} on ${rem.days.map(d => DN[d]).join(',')}`);
    const ref = db.collection('rosterOverrides').doc();
    ops.push({ label: `rosterOverrides/${ref.id}`, fn: b => {
      b.set(ref, doc);
      b.set(db.collection('rosterOverridesPublic').doc(ref.id), doc); // no `reason` to strip
    }});
  }
}

console.log(`\n${memberChanges} membership change(s), ${deleted} old rotation doc(s) removed, ${rotationDocs} written.`);
if (DRY) { console.log('--dry-run: nothing written.'); process.exit(0); }

// Each op is ≤2 writes; 200 ops keeps us under the 500-write batch cap.
for (let i = 0; i < ops.length; i += 200) {
  const batch = db.batch();
  for (const op of ops.slice(i, i + 200)) op.fn(batch);
  await batch.commit();
}
console.log('Applied.');
