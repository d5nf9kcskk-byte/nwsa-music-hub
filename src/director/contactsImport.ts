import { writeBatch, doc } from 'firebase/firestore';
import { db } from './firebase';
import type { Guardian } from './types';

/**
 * Imports the private contacts file (JSON array of {id, email?, parentEmail?,
 * phone?, guardians?, extra?}). The file lives outside the repo on purpose —
 * contact details are never committed; they go straight into the auth-only
 * `contacts` collection. Accepts both the flat 3-field export and the richer
 * shape carrying named guardians and extra spreadsheet columns.
 *
 * Ids are validated against the LIVE roster (passed in by the caller) so a
 * wrong or stale file fails loudly instead of writing orphaned contacts.
 */

const BATCH_LIMIT = 400; // Firestore caps a write batch at 500 ops

interface ContactImportRow {
  id: string;
  email?: string;
  parentEmail?: string;
  phone?: string;
  guardians?: Guardian[];
  extra?: Record<string, string>;
}

export async function importContactsFile(raw: unknown, validIds: Set<string>): Promise<number> {
  if (!db) throw new Error('Firebase is not configured.');
  if (!Array.isArray(raw)) throw new Error('Expected a JSON array of contacts.');
  const entries = raw.filter((c): c is ContactImportRow =>
    !!c && typeof c === 'object' && typeof (c as { id?: unknown }).id === 'string');
  const unknown = entries.filter(c => !validIds.has(c.id));
  if (unknown.length > 0) {
    throw new Error(`${unknown.length} contact id(s) don't match any current student — is this the right file?`);
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
