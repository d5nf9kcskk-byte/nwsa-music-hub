/**
 * Chunk-upload resume tracking (#video-upload-reliability Phase 2).
 *
 * A DEDICATED IndexedDB database — separate from anything Firestore
 * touches (src/director/firestoreCache.ts is a different database
 * entirely) — so a latched Firestore queue or a cleared Firestore cache can
 * never take upload-resume state down with it, and vice versa.
 *
 * Every exported function here is BEST-EFFORT: wrapped so it can never
 * throw or reject. A private browsing tab that blocks IndexedDB, a full
 * disk, a browser that's simply having a bad day — none of it may block or
 * break the submission flow, which already worked before any of this
 * existed. Callers check for `null`/`false` and fall back to today's
 * direct-upload behavior; they never need a try/catch of their own.
 *
 * Two shapes share the one `sessions` store:
 *   - `kind: 'file'` — a picked file. Keyed for lookup by a FINGERPRINT
 *     (name + size + lastModified), never by the file's bytes: browsers do
 *     not hand back a picked File across a reload, so resuming this kind
 *     depends on the student re-picking the SAME file, which is recognized
 *     by fingerprint match. No blob is stored for this kind.
 *   - `kind: 'recording'` — the Blob MediaRecorder produced, stored the
 *     moment it exists (there is no "re-pick" affordance for a recording —
 *     the blob a crashed tab loses is gone for good otherwise). Keyed by a
 *     fresh session id; studentId may still be '' if recording happened
 *     before a name was picked.
 */

export interface UploadSession {
  sessionId: string;
  kind: 'file' | 'recording';
  assignmentId: string;
  studentId: string;
  fpKey: string; // '' for kind 'recording' — only 'file' sessions are looked up this way
  fileName: string;
  contentType: string;
  totalSize: number;
  chunkCount: number;
  uploadedIndexes: number[];
  blob?: Blob;
  durationSeconds?: number;
  thumbnailUrl?: string;
  finalizedAt?: number;
  createdAt: number;
  updatedAt: number;
}

const DB_NAME = 'nwsa-upload-resume';
const DB_VERSION = 1;
const STORE = 'sessions';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('no indexedDB')); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'sessionId' });
        store.createIndex('by_fpKey', 'fpKey');
        store.createIndex('by_assignment', 'assignmentId');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** name + size + lastModified — enough to recognize "this is the same file
 *  as before" without reading a single byte of it. */
export function fingerprintFile(file: File): string {
  return `${file.name}|${file.size}|${file.lastModified}`;
}

function fpKeyFor(assignmentId: string, studentId: string, fingerprint: string): string {
  return `${assignmentId}:${studentId}:${fingerprint}`;
}

export async function putSession(session: UploadSession): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    await promisify(tx.objectStore(STORE).put(session));
  } catch {
    // Best-effort — see file header.
  }
}

export async function getSession(sessionId: string): Promise<UploadSession | null> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readonly');
    const result = await promisify(tx.objectStore(STORE).get(sessionId) as IDBRequest<UploadSession | undefined>);
    return result ?? null;
  } catch {
    return null;
  }
}

export async function getSessionByFingerprint(
  assignmentId: string, studentId: string, fingerprint: string,
): Promise<UploadSession | null> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readonly');
    const index = tx.objectStore(STORE).index('by_fpKey');
    const result = await promisify(index.get(fpKeyFor(assignmentId, studentId, fingerprint)) as IDBRequest<UploadSession | undefined>);
    return result && !result.finalizedAt ? result : null;
  } catch {
    return null;
  }
}

/**
 * What an unfinished session still needs from the student, decided from its
 * OWN bookkeeping and nothing else. Pure, so uploadResumeDb.selfcheck.ts can
 * pin it without a browser.
 *
 * This is the one answer to "can this be rescued, and how" — before it
 * existed, only `kind: 'recording'` was ever offered back, and a picked file
 * that died mid-upload was silently unrecoverable even though every byte of
 * bookkeeping needed to finish it was sitting right here (#video-upload-
 * reliability Phase 3).
 *
 *  - 'finish' — every chunk already reached Storage. composeSubmission is
 *    idempotent and takes only this session's METADATA, so the submission
 *    can be completed with one call and NO file: there is nothing left to
 *    upload. Checked first, and for both kinds — re-sending 150 MB that is
 *    already in the bucket is the worst answer available.
 *  - 'resume' — a recording whose blob is on this device; re-stage it and
 *    the upload picks up at the first chunk that never landed.
 *  - 'repick' — a picked file, partly uploaded. Browsers never hand a File
 *    back across a reload, so finishing needs the student to choose the SAME
 *    file again; sessionForFile() then matches it by fingerprint and
 *    uploadChunks() skips what already arrived.
 *  - null — nothing worth offering: already finalized, or not one chunk ever
 *    left the device (a failure that early surfaced as an error on screen at
 *    the time, so there is nothing to tell the student they don't know).
 */
export function recoveryKind(session: UploadSession): 'finish' | 'resume' | 'repick' | null {
  if (session.finalizedAt) return null;
  const uploaded = new Set(session.uploadedIndexes).size;
  if (session.chunkCount > 0 && uploaded >= session.chunkCount) return 'finish';
  if (session.kind === 'recording') return session.blob ? 'resume' : null;
  return uploaded > 0 ? 'repick' : null;
}

/**
 * The most recently started rescuable session for this assignment — a device
 * only ever sends one exam at a time, so "most recent" is an unambiguous
 * answer.
 *
 * A recording is offered as it always was: its blob lives on THIS device and
 * its session may not name a student yet. A FILE session is offered only to
 * the student it belongs to, because finishing one files a submission in
 * somebody's name without a video on screen to check it by — a shared
 * classroom phone must never hand one student's unfinished upload to the
 * next person who picks it up.
 */
export async function findRecoverableSession(
  assignmentId: string, studentId?: string,
): Promise<UploadSession | null> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readonly');
    const index = tx.objectStore(STORE).index('by_assignment');
    const all = await promisify(index.getAll(assignmentId) as IDBRequest<UploadSession[]>);
    const candidates = all.filter(s => recoveryKind(s) !== null
      && (s.kind === 'recording' || (!!studentId && s.studentId === studentId)));
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.createdAt - a.createdAt);
    return candidates[0];
  } catch {
    return null;
  }
}

export async function markChunkUploaded(sessionId: string, index: number): Promise<void> {
  try {
    const session = await getSession(sessionId);
    if (!session) return;
    if (session.uploadedIndexes.includes(index)) return;
    session.uploadedIndexes.push(index);
    session.updatedAt = Date.now();
    await putSession(session);
  } catch {
    // Best-effort — losing this bookkeeping only means a future resume
    // re-uploads one chunk it didn't strictly need to; never fatal.
  }
}

export async function markFinalized(sessionId: string): Promise<void> {
  try {
    const session = await getSession(sessionId);
    if (!session) return;
    session.finalizedAt = Date.now();
    await putSession(session);
  } catch {
    // Best-effort.
  }
}

export async function deleteSession(sessionId: string): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    await promisify(tx.objectStore(STORE).delete(sessionId));
  } catch {
    // Best-effort.
  }
}

/** Builds a fresh session record — pure, so callers can persist it via
 *  putSession() themselves and keep the shape in one place. */
export function newSession(args: {
  sessionId: string;
  kind: UploadSession['kind'];
  assignmentId: string;
  studentId: string;
  fingerprint?: string;
  fileName: string;
  contentType: string;
  totalSize: number;
  chunkCount: number;
  blob?: Blob;
  durationSeconds?: number;
  thumbnailUrl?: string;
}): UploadSession {
  const now = Date.now();
  return {
    sessionId: args.sessionId,
    kind: args.kind,
    assignmentId: args.assignmentId,
    studentId: args.studentId,
    fpKey: args.kind === 'file' && args.fingerprint
      ? fpKeyFor(args.assignmentId, args.studentId, args.fingerprint)
      : '',
    fileName: args.fileName,
    contentType: args.contentType,
    totalSize: args.totalSize,
    chunkCount: args.chunkCount,
    uploadedIndexes: [],
    ...(args.blob ? { blob: args.blob } : {}),
    ...(args.durationSeconds !== undefined ? { durationSeconds: args.durationSeconds } : {}),
    ...(args.thumbnailUrl ? { thumbnailUrl: args.thumbnailUrl } : {}),
    createdAt: now,
    updatedAt: now,
  };
}
