import { useState, useCallback } from 'react';
import { getAuth, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';

const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const SERVICE_ACCOUNT_EMAIL = 'nwsa-video-sync@nwsa-music-hub.iam.gserviceaccount.com';

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

  const getDriveToken = useCallback(async (): Promise<string | null> => {
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) return null;

    const provider = new GoogleAuthProvider();
    provider.addScope(DRIVE_FILE_SCOPE);

    try {
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      return credential?.accessToken ?? null;
    } catch (e) {
      if ((e as { code?: string }).code === 'auth/popup-closed-by-user') {
        setDrive(d => ({ ...d, error: 'Drive connection cancelled.' }));
        return null;
      }
      throw e;
    }
  }, []);

  const connectDrive = useCallback(async () => {
    setLoading(true);
    setDrive(d => ({ ...d, error: null }));
    try {
      const token = await getDriveToken();
      if (token) {
        setDrive({ connected: true, folderId: null, folderUrl: null, error: null });
      }
    } catch (e) {
      setDrive(d => ({ ...d, error: e instanceof Error ? e.message : 'Could not connect Drive' }));
    } finally {
      setLoading(false);
    }
  }, [getDriveToken]);

  const createSubmissionFolder = useCallback(async (assignmentTitle: string) => {
    setLoading(true);
    try {
      const token = await getDriveToken();
      if (!token) return null;

      const rootId = await findOrCreateFolder(token, 'NWSA Music Hub', null);
      const subId = await findOrCreateFolder(token, assignmentTitle, rootId);

      const folderUrl = `https://drive.google.com/drive/folders/${subId}`;
      setDrive(d => ({ ...d, folderId: subId, folderUrl }));

      await shareFolder(token, subId, SERVICE_ACCOUNT_EMAIL);

      return { folderId: subId, folderUrl };
    } catch (e) {
      setDrive(d => ({ ...d, error: e instanceof Error ? e.message : 'Could not create Drive folder' }));
      return null;
    } finally {
      setLoading(false);
    }
  }, [getDriveToken]);

  return { ...drive, loading, connectDrive, createSubmissionFolder };
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
