/**
 * The app's side of setting a staff password (#password-sign-in): three calls
 * to the `passwordSetup` Cloud Function and nothing else. The app never
 * creates an account and never sets a password itself; the server does both,
 * and only for someone holding the link from their own inbox
 * (functions/src/passwordSetup.ts).
 */
import { appCheckReady } from './firebase';

function endpoint(): string {
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  return projectId ? `https://us-central1-${projectId}.cloudfunctions.net/passwordSetup` : '';
}

export interface SetupAnswer {
  ok: boolean;
  /** The address the password now belongs to (complete only). */
  email?: string;
  /** What to tell the person when it did not work. Always says what to do next. */
  message?: string;
}

const NO_REACH = 'That did not reach the Hub. Check your internet and try again.';

async function call(body: Record<string, string>, idToken = ''): Promise<SetupAnswer> {
  const url = endpoint();
  if (!url) return { ok: false, message: NO_REACH };
  try {
    // The function refuses a request with no App Check token.
    const appCheck = await appCheckReady;
    let token = '';
    if (appCheck) {
      const { getToken } = await import('firebase/app-check');
      token = (await getToken(appCheck)).token;
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'X-Firebase-AppCheck': token } : {}),
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null) as { ok?: boolean; email?: string; message?: string } | null;
    if (res.ok && data?.ok) return { ok: true, email: data.email };
    return { ok: false, message: data?.message || NO_REACH };
  } catch {
    return { ok: false, message: NO_REACH };
  }
}

/** Ask for the link. The answer is the same whether or not the address is on the staff list. */
export const requestPasswordLink = (email: string) => call({ action: 'request', email });

/**
 * The Owner has the Hub email one listed person their link (Directors
 * screen). `idToken` is the Owner's own sign-in; the server checks it.
 */
export const ownerSendPasswordLink = (idToken: string, email: string) =>
  call({ action: 'owner-send', email }, idToken);

/** The link was opened and a password chosen. On success the server has set it. */
export const completePasswordSetup = (token: string, password: string) =>
  call({ action: 'complete', token, password });
