/**
 * The one way the server gives a listed person their sign-in account
 * (#google-binding).
 *
 * The account a Directors entry names is ALWAYS made here, afresh, at the
 * moment the record is written. Whatever account stood on the address before
 * is deleted, so nothing that was signed in before is still signed in after.
 * The rules then honour a sign-in only on the account this returns (its id
 * is recorded on the entry).
 *
 * The order matters. The new account is made FIRST, with nothing on it, and
 * the step that attaches a Google identity is tried on it before anything
 * that exists is touched. Only when that has worked is the old account
 * deleted and the address moved over. So if this project turns out not to
 * allow one of those steps, the person still has the account they had.
 *
 * Nothing in the Hub is keyed by a sign-in account's id, so nothing is lost:
 * the person signs in once more and is on the fresh account. (The browser's
 * own queue of unsent changes IS kept per account, which is why the app lets
 * it empty before it asks for this.)
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
  createUser(props: { displayName?: string; photoURL?: string }): Promise<AccountRecord>;
  /** Used here for three things only: attach or remove one sign-in identity, and give the account its address (and password). */
  updateUser(uid: string, props: {
    providerToLink?: AccountProvider & { uid: string };
    providersToUnlink?: string[];
    email?: string;
    emailVerified?: boolean;
    password?: string;
  }): Promise<AccountRecord>;
  deleteUser(uid: string): Promise<void>;
}

export interface FreshAccountSpec {
  /** The listed address, lowercased. */
  email: string;
  /** An account to delete even if it no longer holds the address (the caller's own). */
  alsoDelete?: string;
  /** The person's own Google identity, to attach so Sign in with Google opens the fresh account. */
  google?: AccountProvider & { uid: string };
  /** A password its owner chose (#password-sign-in). */
  password?: string;
  displayName?: string;
  photoURL?: string;
}

/** How many times to look again when an account appears on the address between the delete and the move. */
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
 * Make one fresh account for the address and delete whatever stood on it.
 * Returns the fresh account's id, or null when an account on the address has
 * been switched off on purpose (this must not be a way to switch it back
 * on). Throws if it cannot finish; nothing half-made is left behind, and if
 * it fails before the old account is touched, the old account is as it was.
 */
export async function freshAccount(auth: AccountAuth, spec: FreshAccountSpec): Promise<string | null> {
  if ((await find(auth, spec.email))?.disabled) return null;

  // 1. The new account, with nothing on it. Nothing that exists is touched.
  const fresh = (await auth.createUser({
    ...(spec.displayName ? { displayName: spec.displayName } : {}),
    ...(spec.photoURL ? { photoURL: spec.photoURL } : {}),
  })).uid;
  try {
    // 2. Prove, on the new account, that attaching a Google identity is
    //    allowed here: attach a placeholder and take it off again.
    if (spec.google) {
      const placeholder = `placeholder-${fresh}`;
      await auth.updateUser(fresh, { providerToLink: { providerId: 'google.com', uid: placeholder } });
      await auth.updateUser(fresh, { providersToUnlink: ['google.com'] });
    }

    // 3. Only now does the old account go, and the address move over.
    if (spec.alsoDelete) await remove(auth, spec.alsoDelete);
    let moved = false;
    for (let attempt = 0; attempt < FRESH_ACCOUNT_TRIES && !moved; attempt++) {
      const standing = await find(auth, spec.email);
      if (standing?.disabled) throw Object.assign(new Error('freshAccount: an account switched off on purpose appeared on the address'), { code: 'hub/disabled' });
      if (standing) await remove(auth, standing.uid);
      try {
        await auth.updateUser(fresh, {
          email: spec.email, emailVerified: true,
          ...(spec.password ? { password: spec.password } : {}),
        });
        moved = true;
      } catch (e) {
        // An account took the address in the gap. Look again.
        if (codeOf(e) !== 'auth/email-already-exists') throw e;
      }
    }
    if (!moved) throw new Error(`freshAccount: the address kept being taken; gave up after ${FRESH_ACCOUNT_TRIES} tries`);

    // 4. The person's own Google identity.
    if (spec.google) await auth.updateUser(fresh, { providerToLink: spec.google });
    return fresh;
  } catch (e) {
    await remove(auth, fresh).catch(() => {}); // leave nothing half-made
    if (codeOf(e) === 'hub/disabled') return null;
    throw e;
  }
}
