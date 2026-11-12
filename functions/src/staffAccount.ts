/**
 * The Hub makes the sign-in account, not the person (#password-sign-in).
 *
 * When the owner lists an email on the Directors screen, an account for that
 * address is made here: empty, with no password, and not marked verified. A
 * password can then only be put on it through the emailed reset link, so the
 * person who can open the inbox is the one who chooses it.
 *
 * The one rule that matters: A PASSWORD NEVER SURVIVES BEING LISTED. An
 * account that already carries a password when its address is listed is
 * replaced by an empty one, because nothing shows who chose that password.
 * The real person loses nothing: every staff record in the Hub is keyed by
 * email, never by account id, and they set a password again by link (or keep
 * using Google, which opens the new account by the same address).
 *
 * An account WITHOUT a password is left exactly as it is. That is every
 * account that has only ever signed in with Google.
 *
 * This module sets no password and marks nothing verified, ever. Pure: the
 * sign-in service is passed in, so the trigger, the backfill script
 * (scripts/ensure-staff-accounts.mjs), the emulator proof and the self-check
 * all run the same code.
 */

/** The slice of the Admin SDK's Auth this needs. */
export interface StaffAuth {
  getUserByEmail(email: string): Promise<StaffUser>;
  createUser(props: { email: string; emailVerified: boolean }): Promise<StaffUser>;
  deleteUser(uid: string): Promise<void>;
}

export interface StaffUser {
  uid: string;
  passwordHash?: string;
  providerData: { providerId: string }[];
}

export type StaffAccountOutcome =
  /** No account existed; an empty one was made. */
  | 'created'
  /** An account with no password was already there; untouched. */
  | 'exists'
  /** An account carrying a password was replaced by an empty one. */
  | 'replaced'
  /** An account carrying a password was found and left (backfill default). */
  | 'has-password'
  /** No account, and this was a look only. */
  | 'missing'
  /** The document id is not an email address; nothing was done. */
  | 'skipped';

export interface StaffAccountOptions {
  /**
   * Replace an account that carries a password. TRUE when an address is being
   * listed (the trigger). FALSE for the backfill's ordinary run: once people
   * have chosen passwords, sweeping the whole list must not take them away.
   */
  replacePassworded: boolean;
  /** Look only: report what would happen and change nothing. */
  dryRun?: boolean;
}

/** A directors doc id is the lowercased sign-in email. Anything else is not ours to act on. */
export function isListedEmail(id: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(id) && id === id.toLowerCase();
}

export function carriesPassword(user: StaffUser): boolean {
  return !!user.passwordHash || user.providerData.some(p => p.providerId === 'password');
}

const errorCode = (e: unknown) => (e as { code?: string } | null)?.code ?? '';

async function find(auth: StaffAuth, email: string): Promise<StaffUser | null> {
  try { return await auth.getUserByEmail(email); }
  catch (e) {
    if (errorCode(e) === 'auth/user-not-found') return null;
    throw e;
  }
}

/**
 * Make sure a listed address has an account nobody else chose a password for.
 * Safe to run twice: the second run finds the empty account and leaves it.
 */
export async function ensureStaffAccount(
  auth: StaffAuth, email: string, opts: StaffAccountOptions,
): Promise<StaffAccountOutcome> {
  if (!isListedEmail(email)) return 'skipped';
  let replaced = false;
  // Bounded: an account can appear between the look and the create (someone
  // making one at that instant). Look again rather than trust the first look.
  for (let attempt = 0; attempt < 3; attempt++) {
    const user = await find(auth, email);
    if (!user) {
      if (opts.dryRun) return 'missing';
      try {
        await auth.createUser({ email, emailVerified: false });
        return replaced ? 'replaced' : 'created';
      } catch (e) {
        if (errorCode(e) === 'auth/email-already-exists') continue;
        throw e;
      }
    }
    if (!carriesPassword(user)) return replaced ? 'replaced' : 'exists';
    if (!opts.replacePassworded || opts.dryRun) return 'has-password';
    await auth.deleteUser(user.uid);
    replaced = true;
  }
  throw new Error('ensureStaffAccount: the account kept changing underneath; gave up after 3 tries');
}
