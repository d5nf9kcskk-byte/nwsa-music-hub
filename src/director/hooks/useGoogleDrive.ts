import { useState, useCallback } from 'react';
import { getApps, initializeApp } from 'firebase/app';
import {
  signInWithPopup, GoogleAuthProvider, getAuth, initializeAuth, inMemoryPersistence,
  browserPopupRedirectResolver, signOut,
} from 'firebase/auth';
import type { Auth } from 'firebase/auth';
import { auth } from '../firebaseAuth';
import { ORG } from '../../org';

/**
 * Where the Drive pop-up signs in (#password-sign-in).
 *
 * The pop-up is a Google SIGN-IN that also asks for Drive access. On the
 * Hub's own sign-in, picking a Google account there makes that account the
 * signed-in one. For someone whose account has Google on it that is the same
 * person, and it is left exactly as it always was. For someone whose account
 * has NO Google on it (they came in by email and password), it would swap
 * them out for whatever Google account they picked, usually one that is not
 * on the Directors list, mid-edit.
 *
 * So those people get the pop-up on a second, throwaway sign-in that lives
 * in memory only: it hands back the Drive token and is signed out again, and
 * the Hub's own sign-in never changes. Everything here is synchronous on
 * purpose: nothing may be awaited before the pop-up opens.
 */
const DRIVE_APP = 'drive-connect';
function popupAuthFor(main: Auth): Auth {
  if (main.currentUser?.providerData.some(p => p.providerId === 'google.com')) return main;
  const existing = getApps().find(a => a.name === DRIVE_APP);
  if (existing) return getAuth(existing);
  return initializeAuth(initializeApp(main.app.options, DRIVE_APP), {
    persistence: inMemoryPersistence,
    popupRedirectResolver: browserPopupRedirectResolver,
  });
}

const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
// ponytail: hardcoded NWSA fallback until we know the Firebase SA
// client_email; Connect still works without share — cron skips unshared
// folders. Other orgs set VITE_FIREBASE_SERVICE_ACCOUNT_EMAIL (Firebase
// Console → Project settings → Service accounts).
const SERVICE_ACCOUNT_EMAIL =
  import.meta.env.VITE_FIREBASE_SERVICE_ACCOUNT_EMAIL
  || 'firebase-adminsdk@nwsa-hub.iam.gserviceaccount.com';

interface DriveState {
  connected: boolean;
  folderId: string | null;
  folderUrl: string | null;
  error: string | null;
}

export function useGoogleDrive() {
  const [drive, setDrive] = useState<DriveState>({
    connected: false,
    folderId: null,
    folderUrl: null,
    error: null,
  });
  const [loading, setLoading] = useState(false);

  /**
   * One click → one Google popup → create the assignment folder.
   * Must not await anything before signInWithPopup or browsers block it.
   */
  const connectAndCreateFolder = useCallback(async (assignmentTitle: string) => {
    if (!auth?.currentUser) {
      setDrive(d => ({ ...d, error: 'Sign in first, then connect Drive.' }));
      return null;
    }

    setLoading(true);
    setDrive(d => ({ ...d, error: null }));

    // Popup FIRST — no awaits above this line.
    const provider = new GoogleAuthProvider();
    provider.addScope(DRIVE_FILE_SCOPE);
    let token: string | null = null;
    try {
      const popupAuth = popupAuthFor(auth);
      const result = await signInWithPopup(popupAuth, provider);
      token = GoogleAuthProvider.credentialFromResult(result)?.accessToken ?? null;
      // The throwaway sign-in has done its job; the token is what we keep.
      if (popupAuth !== auth) void signOut(popupAuth).catch(() => {});
    } catch (e) {
      const code = (e as { code?: string }).code ?? '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setDrive(d => ({ ...d, error: 'Drive connection cancelled.' }));
        setLoading(false);
        return null;
      }
      setDrive(d => ({
        ...d,
        error: code === 'auth/popup-blocked'
          ? 'Your browser blocked the popup — allow popups for this site and try again.'
          : e instanceof Error ? e.message : 'Could not connect Drive',
      }));
      setLoading(false);
      return null;
    }

    if (!token) {
      setDrive(d => ({ ...d, error: 'Google did not return a Drive token — try again.' }));
      setLoading(false);
      return null;
    }

    try {
      const rootId = await findOrCreateFolder(token, ORG.appName, null);
      const subId = await findOrCreateFolder(token, assignmentTitle, rootId);
      const folderUrl = `https://drive.google.com/drive/folders/${subId}`;
      setDrive({ connected: true, folderId: subId, folderUrl, error: null });
      try { await shareFolder(token, subId, SERVICE_ACCOUNT_EMAIL); } catch { /* ignore */ }
      return { folderId: subId, folderUrl };
    } catch (e) {
      setDrive(d => ({ ...d, connected: true, error: e instanceof Error ? e.message : 'Could not create Drive folder' }));
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { ...drive, loading, connectAndCreateFolder };
}

async function driveFetch(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`https://www.googleapis.com/drive/v3${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `Drive API error ${res.status}`);
  }
  return res.json();
}

async function findOrCreateFolder(token: string, name: string, parentId: string | null): Promise<string> {
  const q = parentId
    ? `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
    : `name='${name}' and mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false`;
  const list = await driveFetch(token, `/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`);
  if (list.files?.length) return list.files[0].id;

  const created = await driveFetch(token, '/files', {
    method: 'POST',
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : undefined,
    }),
  });
  return created.id;
}

async function shareFolder(token: string, folderId: string, email: string) {
  await driveFetch(token, `/files/${folderId}/permissions`, {
    method: 'POST',
    body: JSON.stringify({ type: 'user', role: 'writer', emailAddress: email }),
  });
}
