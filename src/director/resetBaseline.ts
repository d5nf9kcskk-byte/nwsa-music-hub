import { collection, getDocs, writeBatch, doc } from 'firebase/firestore';
import { db } from './firebase';
import { baselineStudents, baselineNewEnsembles } from './baseline2526';
import type { Guardian } from './types';

/**
 * "Fresh start" tool for the July 2026 redesign test cycle: wipes every
 * student-linked collection and imports the 2025-26 baseline roster
 * (src/director/baseline2526.ts). Structure — ensembles, events, repertoire,
 * announcements, locations, assignment definitions — is deliberately kept.
 *
 * Idempotent: baseline ids are stable slugs, so re-running always converges
 * on the same state. This is also the end-of-redesign reset.
 */
const WIPE: readonly string[] = [
  'students', 'contacts', 'attendance', 'progressNotes',
  'plannedAbsences', 'rosterOverrides', 'seatingCharts', 'assignmentResults',
];

const BATCH_LIMIT = 400; // Firestore caps a write batch at 500 ops

export async function resetToBaseline(
  onProgress?: (msg: string) => void,
): Promise<{ deleted: number; students: number }> {
  if (!db) throw new Error('Firebase is not configured.');
  let deleted = 0;

  for (const name of WIPE) {
    const snap = await getDocs(collection(db, name));
    for (let i = 0; i < snap.docs.length; i += BATCH_LIMIT) {
      const batch = writeBatch(db);
      snap.docs.slice(i, i + BATCH_LIMIT).forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
    deleted += snap.size;
    onProgress?.(`Cleared ${name} (${snap.size} record${snap.size === 1 ? '' : 's'})`);
  }

  // Keep existing ensembles untouched; add only the ones the baseline mapping
  // targets that don't exist yet (currently: Philharmonic).
  const existing = await getDocs(collection(db, 'ensembles'));
  const have = new Set(existing.docs.map(d => d.id));
  const missing = baselineNewEnsembles.filter(e => !have.has(e.id));

  for (let i = 0; i < baselineStudents.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    if (i === 0) {
      for (const { id, ...data } of missing) batch.set(doc(db, 'ensembles', id), data);
    }
    for (const { id, ...data } of baselineStudents.slice(i, i + BATCH_LIMIT)) {
      batch.set(doc(db, 'students', id), data);
    }
    await batch.commit();
  }
  onProgress?.(`Imported ${baselineStudents.length} students${missing.length ? ` + ${missing.map(e => e.name).join(', ')}` : ''}`);

  return { deleted, students: baselineStudents.length };
}

/**
 * Imports the private contacts file (JSON array of {id, email?, parentEmail?,
 * phone?, guardians?, extra?}). The file lives outside the repo on purpose —
 * contact details are never committed; they go straight into the auth-only
 * `contacts` collection. Accepts both the flat 3-field export and the richer
 * shape carrying named guardians and extra spreadsheet columns.
 */
interface ContactImportRow {
  id: string;
  email?: string;
  parentEmail?: string;
  phone?: string;
  guardians?: Guardian[];
  extra?: Record<string, string>;
}

export async function importBaselineContacts(raw: unknown): Promise<number> {
  if (!db) throw new Error('Firebase is not configured.');
  if (!Array.isArray(raw)) throw new Error('Expected a JSON array of contacts.');
  const validIds = new Set(baselineStudents.map(s => s.id));
  const entries = raw.filter((c): c is ContactImportRow =>
    !!c && typeof c === 'object' && typeof (c as { id?: unknown }).id === 'string');
  const unknown = entries.filter(c => !validIds.has(c.id));
  if (unknown.length > 0) {
    throw new Error(`${unknown.length} contact id(s) don't match any baseline student — is this the right file?`);
  }
  for (let i = 0; i < entries.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const c of entries.slice(i, i + BATCH_LIMIT)) {
      const g0 = c.guardians?.[0];
      // Keep the flat trio authoritative for the many back-compat readers
      // (search, checklists, "missing info"), mirroring it from guardian #1
      // when the file carries the richer shape.
      const data: Record<string, unknown> = {
        email: c.email ?? '',
        parentEmail: g0?.email ?? c.parentEmail ?? '',
        phone: g0?.phone ?? c.phone ?? '',
      };
      if (c.guardians?.length) data.guardians = c.guardians;
      if (c.extra && Object.keys(c.extra).length) data.extra = c.extra;
      // Merge, not overwrite: updating never wipes guardians[]/extra a director
      // has since added by hand in the roster.
      batch.set(doc(db, 'contacts', c.id), data, { merge: true });
    }
    await batch.commit();
  }
  return entries.length;
}
