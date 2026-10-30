import { ref as storageRef, getDownloadURL } from 'firebase/storage';
import { storage } from './firebaseAuth';

/** Open an absence report's excuse-slip photo. Resolved lazily, on tap —
 *  most reports have no photo, and Take Roll runs to 80+ students, so nothing
 *  should fetch a Storage URL up front. */
export async function openExcusePhoto(path: string) {
  if (!storage) return;
  try {
    const url = await getDownloadURL(storageRef(storage, path));
    window.open(url, '_blank', 'noopener');
  } catch {
    window.alert("That photo couldn't be opened — it may not have finished uploading. Ask the student to try again.");
  }
}
