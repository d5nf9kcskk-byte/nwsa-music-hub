/**
 * migrate-group-kinds.mjs
 *
 * Stamps `kind` on ensemble docs that predate the field (#classes).
 * `kind` absent means 'ensemble', so ONLY the groups that are really classes
 * need touching — everything else is already correct and is left alone.
 *
 * Today that is the four string master classes, which were seeded as
 * ensembles because there was nothing else to seed them as.
 *
 *   FIREBASE_SERVICE_ACCOUNT_JSON=… node scripts/migrate-group-kinds.mjs --dry-run
 *   FIREBASE_SERVICE_ACCOUNT_JSON=… node scripts/migrate-group-kinds.mjs
 */
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!raw) { console.error('FIREBASE_SERVICE_ACCOUNT_JSON is not set — aborting.'); process.exit(1); }
const DRY = process.argv.includes('--dry-run');
if (getApps().length === 0) initializeApp({ credential: cert(JSON.parse(raw)) });
const db = getFirestore();

/** Doc-id prefix → kind. Prefix, not name matching: a renamed master class
 *  ("Violin Studio Class") must still migrate, and a NEW ensemble that happens
 *  to have "class" in its name must not. */
const BY_ID_PREFIX = [{ prefix: 'masterclass-', kind: 'masterclass' }];

const snap = await db.collection('ensembles').get();
const changes = [];

for (const d of snap.docs) {
  const data = d.data();
  const rule = BY_ID_PREFIX.find(r => d.id.startsWith(r.prefix));
  if (!rule) continue;
  if (data.kind === rule.kind) continue;      // already migrated — idempotent
  changes.push({ ref: d.ref, id: d.id, name: data.name ?? d.id, from: data.kind ?? '(none)', kind: rule.kind });
}

for (const c of changes) {
  console.log(`  ${c.id.padEnd(22)} ${String(c.name).padEnd(22)} ${c.from} → ${c.kind}`);
}
console.log(`\n${changes.length} group(s) to update; ${snap.size - changes.length} left as ensembles.`);

if (DRY) { console.log('--dry-run: nothing written.'); process.exit(0); }
if (changes.length === 0) { console.log('Nothing to do.'); process.exit(0); }

const batch = db.batch();
for (const c of changes) batch.update(c.ref, { kind: c.kind });
await batch.commit();
console.log('Applied.');
