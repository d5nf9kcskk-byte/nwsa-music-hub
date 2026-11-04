/**
 * Where a device remembers its OWN alert sign-up (#push), in localStorage:
 * the subscription doc itself is unreadable by design. Zero imports, so the
 * public Home can ask "did this phone sign up?" without loading the push
 * client, which stays out of the precache and loads only when needed.
 */
export const PUSH_STATE_KEY = { staff: 'hub.push.staff.v1', family: 'hub.push.family.v1' } as const;

export function hasPushState(kind: 'staff' | 'family'): boolean {
  try { return !!localStorage.getItem(PUSH_STATE_KEY[kind]); } catch { return false; }
}
