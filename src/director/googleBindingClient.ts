/**
 * The app's side of tying a listed person to their own Google account
 * (#google-binding): one call to the `bindGoogle` Cloud Function, made by
 * AuthGate straight after a real Google sign-in. The server decides
 * everything (functions/src/googleBinding.ts); this only carries two things
 * to it and brings the answer back: the caller's own Hub sign-in token, and
 * the token Google signed at that same sign-in.
 */

export type BindAnswer =
  /** The entry names this Google account and this very sign-in. Nothing to do. */
  | 'bound'
  /** The entry names this Google account, and its Hub account is not the one this session is on: sign in with the same Google sign-in again. */
  | 'again'
  /** This address is not on the Directors list. */
  | 'not-listed'
  /** The server would not confirm this Google account for this address. */
  | 'mismatch'
  /** The entry names a different Google account. */
  | 'other-account'
  /** No answer: offline, the function is not there yet, or it failed. */
  | 'unreachable';

const ANSWERS: readonly string[] = ['bound', 'again', 'not-listed', 'mismatch', 'other-account'];

export async function bindGoogleAccount(idToken: string, googleIdToken: string): Promise<BindAnswer> {
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  if (!projectId) return 'unreachable';
  try {
    const res = await fetch(`https://us-central1-${projectId}.cloudfunctions.net/bindGoogle`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ googleIdToken }),
    });
    const data = await res.json().catch(() => null) as { ok?: boolean; status?: string } | null;
    return res.ok && data?.ok && ANSWERS.includes(data.status ?? '') ? data.status as BindAnswer : 'unreachable';
  } catch {
    return 'unreachable';
  }
}
