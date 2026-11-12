/**
 * The app's side of tying a listed person to their own Google account
 * (#google-binding): one call to the `bindGoogle` Cloud Function, made by
 * AuthGate by itself after a Google sign-in. The server decides everything
 * (functions/src/googleBinding.ts); this only carries the caller's own
 * sign-in token to it and brings the answer back.
 */

export type BindAnswer =
  /** The entry is tied to this Google account and this very sign-in. Nothing to do. */
  | 'bound'
  /** The entry is tied, and the person's account is not the one this session is on: sign in once more. */
  | 'again'
  /** This address is not on the Directors list. */
  | 'not-listed'
  /** The server would not confirm this Google account for this address. */
  | 'mismatch'
  /** The entry is tied to a different Google account. */
  | 'other-account'
  /** No answer: offline, the function is not there yet, or it failed. */
  | 'unreachable';

const ANSWERS: readonly string[] = ['bound', 'again', 'not-listed', 'mismatch', 'other-account'];

export async function bindGoogleAccount(idToken: string): Promise<BindAnswer> {
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  if (!projectId) return 'unreachable';
  try {
    const res = await fetch(`https://us-central1-${projectId}.cloudfunctions.net/bindGoogle`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}` },
    });
    const data = await res.json().catch(() => null) as { ok?: boolean; status?: string } | null;
    return res.ok && data?.ok && ANSWERS.includes(data.status ?? '') ? data.status as BindAnswer : 'unreachable';
  } catch {
    return 'unreachable';
  }
}
