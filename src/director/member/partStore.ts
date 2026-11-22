/**
 * The parts a player has opened, kept on their device so the reader works
 * with no signal (#parts-reader, personnel orgs only).
 *
 * IndexedDB, not Cache Storage and never the service worker: the SW serves
 * public app code to anyone, and a member's part must never sit where a
 * signed-out visitor's request could be answered from it. Each record is
 * keyed by the signed-in account AND the members-only Storage path, and the
 * whole database is deleted on sign-out (`clearParts`), so a signed-out
 * device keeps no parts. Pinned by partStore.selfcheck.ts.
 */

export const PARTS_DB = 'hub-member-parts';
const STORE = 'parts';

export interface StoredPart {
  key: string;
  uid: string;
  path: string;
  label: string;
  pieceTitle: string;
  sha256: string;
  savedAt: number;
  bytes: Uint8Array;
}

/** The ONE key a stored part lives under. Refuses anything that is not a members-only part. */
export function partKey(uid: string, path: string): string {
  if (!uid) throw new Error('no signed-in account');
  if (!path.startsWith('members/parts/') || path.includes('..')) throw new Error(`not a members-only part: ${path}`);
  return `${uid}|${path}`;
}

/** The stored copy is older than the file on the card. Unknown hashes never say "updated". */
export const isUpdated = (stored: { sha256: string } | undefined, currentSha: string | undefined): boolean =>
  !!stored && !!currentSha && !!stored.sha256 && stored.sha256 !== currentSha.toLowerCase();

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource));
  return Array.from(d, b => b.toString(16).padStart(2, '0')).join('');
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(PARTS_DB, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE, { keyPath: 'key' }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export const getPart = (uid: string, path: string) =>
  run<StoredPart | undefined>('readonly', s => s.get(partKey(uid, path)));

export async function listParts(uid: string): Promise<StoredPart[]> {
  const all = await run<StoredPart[]>('readonly', s => s.getAll());
  return all.filter(p => p.uid === uid);
}

export async function putPart(uid: string, part: Omit<StoredPart, 'key' | 'uid' | 'savedAt' | 'sha256'>): Promise<StoredPart> {
  const rec: StoredPart = { ...part, key: partKey(uid, part.path), uid, savedAt: Date.now(), sha256: await sha256Hex(part.bytes) };
  await run('readwrite', s => s.put(rec));
  // Ask the browser not to evict it under storage pressure; a refusal is fine.
  void navigator.storage?.persist?.().catch(() => {});
  return rec;
}

/** Sign-out: every stored part, every account, gone. Resolves even if the browser blocks it. */
export function clearParts(): Promise<void> {
  return new Promise(resolve => {
    try {
      const req = indexedDB.deleteDatabase(PARTS_DB);
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}
