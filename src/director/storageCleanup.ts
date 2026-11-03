import { ref as storageRef, deleteObject } from 'firebase/storage';
import { storage } from './firebaseAuth';

/**
 * Delete files from Storage when the thing that pointed at them goes away
 * (audit rec #6).
 *
 * Nothing used to call deleteObject at all: replacing a document's file, or
 * deleting the document entirely, left the old object sitting in a
 * world-readable bucket at a URL that still worked — a "removed" handbook that
 * anyone with the old link could keep reading.
 *
 * Every call here is best-effort and never throws: the record is already gone
 * from Firestore by the time we try, and a failed cleanup must not surface as
 * a failed delete.
 */

/** Is this one of OUR Storage objects (rather than a Drive/district link)? */
function isStorageUrl(url: string): boolean {
  return /^https?:\/\/(firebasestorage\.googleapis\.com|storage\.googleapis\.com)\//.test(url)
    || url.startsWith('gs://');
}

/** Delete one uploaded file by its download URL. Links we don't own are skipped. */
export async function deleteStoredFile(url: string | undefined): Promise<void> {
  if (!storage || !url || !isStorageUrl(url)) return;
  try {
    await deleteObject(storageRef(storage, url));
  } catch {
    // Already deleted, never existed, or the bucket is gone (Spark plan).
    // Storage rules still restrict deletion to staff, so a denial here means
    // the caller shouldn't have been able to delete the record either.
  }
}

/** Delete several at once; failures are swallowed individually. */
export async function deleteStoredFiles(urls: (string | undefined)[]): Promise<void> {
  await Promise.all(urls.map(deleteStoredFile));
}

/**
 * Delete staff-only objects by their Storage PATH (#lesson-attachments).
 * Those files never get a download URL, so the URL helpers above cannot name
 * them. Only paths under `lessonAttachments/` are accepted: this is a cleanup
 * helper, not a general delete.
 */
export async function deleteStoredPaths(paths: (string | undefined)[]): Promise<void> {
  const st = storage;
  if (!st) return;
  await Promise.all(paths.map(async p => {
    if (!p || !p.startsWith('lessonAttachments/')) return;
    try {
      await deleteObject(storageRef(st, p));
    } catch {
      // Already gone, or the rules refused. Same stance as deleteStoredFile.
    }
  }));
}
