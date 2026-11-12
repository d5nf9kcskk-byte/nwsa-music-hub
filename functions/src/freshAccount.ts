/**
 * The one way the server gives a listed person their sign-in account
 * (#google-binding).
 *
 * The account a Directors entry is bound to is ALWAYS made here, afresh, at
 * the moment of binding. Whatever account stood on the address before is
 * deleted first. Deleting an account ends every session that was ever opened
 * on it, for certain and at once, so nothing that was signed in before the
 * binding is still signed in after it. The rules then honour a sign-in only
 * on the account this returns (its id is recorded on the entry).
 *
 * Nothing in the Hub is keyed by a sign-in account's id, so nothing is lost:
 * the person signs in once more and is on the fresh account.
 *
 * The sign-in service is passed in, so the functions, the emulator proofs and
 * the self-checks all run this same code.
 */

/** One sign-in identity on an account. For Google, `uid` is Google's own id for the person. */
export interface AccountProvider {
  providerId: string;
  uid?: string;
  email?: string;
  displayName?: string;
  photoURL?: string;
}

export interface AccountRecord {
  uid: string;
  email?: string;
  emailVerified: boolean;
  disabled: boolean;
  displayName?: string;
  photoURL?: string;
  providerData: AccountProvider[];
}

export interface AccountAuth {
  getUserByEmail(email: string): Promise<AccountRecord>;
  createUser(props: {
    email: string; emailVerified: boolean; password?: string; displayName?: string; photoURL?: string;
  }): Promise<AccountRecord>;
  /** Attach one sign-in identity to an account. Used for nothing else here. */
  updateUser(uid: string, props: { providerToLink: AccountProvider & { uid: string } }): Promise<AccountRecord>;
  deleteUser(uid: string): Promise<void>;
}

export interface FreshAccountSpec {
  /** The listed address, lowercased. */
  email: string;
  /** An account to delete first even if it no longer holds the address (the caller's own). */
  alsoDelete?: string;
  /** The person's own Google identity, to attach so Sign in with Google opens the fresh account. */
  google?: AccountProvider & { uid: string };
  /** A password its owner chose (#password-sign-in). */
  password?: string;
  displayName?: string;
  photoURL?: string;
}

/** How many times to look again when an account appears between the delete and the create. */
export const FRESH_ACCOUNT_TRIES = 5;

const codeOf = (e: unknown) => (e as { code?: string } | null)?.code ?? '';

async function find(auth: AccountAuth, email: string): Promise<AccountRecord | null> {
  try { return await auth.getUserByEmail(email); }
  catch (e) {
    if (codeOf(e) === 'auth/user-not-found') return null;
    throw e;
  }
}

async function remove(auth: AccountAuth, uid: string): Promise<void> {
  try { await auth.deleteUser(uid); }
  catch (e) {
    if (codeOf(e) !== 'auth/user-not-found') throw e;
  }
}

/**
 * Delete whatever stands on the address and make one fresh account for it.
 * Returns the fresh account's id, or null when an account on the address has
 * been switched off on purpose (binding must not be a way to switch it back
 * on). Throws if it cannot finish; nothing half-made is left behind.
 */
export async function freshAccount(auth: AccountAuth, spec: FreshAccountSpec): Promise<string | null> {
  const standing = await find(auth, spec.email);
  if (standing?.disabled) return null;
  if (spec.alsoDelete) await remove(auth, spec.alsoDelete);

  let uid = '';
  // Bounded: an account can appear on the address between the delete and the
  // create. Look again rather than trust the first look.
  for (let attempt = 0; attempt < FRESH_ACCOUNT_TRIES && !uid; attempt++) {
    const user = await find(auth, spec.email);
    if (user?.disabled) return null;
    if (user) await remove(auth, user.uid);
    try {
      uid = (await auth.createUser({
        email: spec.email,
        emailVerified: true,
        ...(spec.password ? { password: spec.password } : {}),
        ...(spec.displayName ? { displayName: spec.displayName } : {}),
        ...(spec.photoURL ? { photoURL: spec.photoURL } : {}),
      })).uid;
    } catch (e) {
      if (codeOf(e) !== 'auth/email-already-exists') throw e;
    }
  }
  if (!uid) throw new Error(`freshAccount: the address kept being taken; gave up after ${FRESH_ACCOUNT_TRIES} tries`);

  if (spec.google) {
    try {
      await auth.updateUser(uid, { providerToLink: spec.google });
    } catch (e) {
      await remove(auth, uid); // leave nothing half-made
      throw e;
    }
  }
  return uid;
}
