/**
 * Which credentials the Drive syncs use — and why it is not the obvious one.
 *
 * A service account OWNS every file it creates and has no Drive storage of
 * its own, so it cannot create a file inside a personal My Drive folder
 * however that folder is shared. Editor access does not change it; Drive
 * answers `storageQuotaExceeded` no matter what. Google's remedy is a Shared
 * Drive, where files are owned by the drive rather than the uploader — but
 * Shared Drives are a Google Workspace feature and this school's Google
 * account is a consumer one, so that door is closed.
 *
 * So Drive is spoken to as the PERSON who owns the folder, via a long-lived
 * OAuth refresh token: the files land in that account's own storage, owned by
 * them, exactly as if they had dragged them in. Firestore and Storage keep
 * using the service account — only Drive changes.
 *
 * `google` is injected rather than imported so this module (and its
 * self-check) load without googleapis present; the workflows install that
 * package only after the self-checks have run.
 */

export const DRIVE_OAUTH_VARS = [
  'DRIVE_OAUTH_CLIENT_ID',
  'DRIVE_OAUTH_CLIENT_SECRET',
  'DRIVE_OAUTH_REFRESH_TOKEN',
];

/**
 * All three set → 'oauth'. None set → 'service-account' (correct for a Shared
 * Drive, and the honest state before anyone configures OAuth). Some set →
 * 'incomplete', which must NOT quietly fall back: falling back would put the
 * sync on the account that cannot write and report a quota error instead of
 * the missing secret.
 */
/**
 * Who Drive refused, for a message.
 *
 * `account` is the address a caller VERIFIED with `about.get`. Until someone
 * asks, this module can only describe the credential — `driveClient()` infers
 * OAuth from three env vars being non-empty and cannot know whose token it
 * holds. Naming a role instead of an address is exactly what let "signed in as
 * the folder owner" stand as a confident falsehood: the service-account arm
 * reads a real address off the credential, the OAuth arm had only a hope, and
 * only the hope can be wrong.
 *
 * So: name the address when it is known, fall back to describing the
 * credential when it is not. Never interpolate an absent one.
 */
export function driveAccountLabel(mode, account, serviceAccountEmail) {
  const verified = String(account ?? '').trim();
  if (verified) return verified;
  return mode === 'oauth'
    ? 'the account the DRIVE_OAUTH_* secrets sign in as'
    : `the service account ${serviceAccountEmail}`;
}

export function driveAuthMode(env = process.env) {
  const set = k => !!String(env[k] ?? '').trim();
  const missing = DRIVE_OAUTH_VARS.filter(k => !set(k));
  if (missing.length === 0) return { mode: 'oauth', missing: [] };
  if (missing.length === DRIVE_OAUTH_VARS.length) return { mode: 'service-account', missing: [] };
  return { mode: 'incomplete', missing };
}

/** A Drive client, plus a one-line description of whose storage files land in.
 *  Never logs or returns any part of the credential. */
export function driveClient(google, serviceAccount, saScopes, env = process.env) {
  const { mode, missing } = driveAuthMode(env);

  if (mode === 'incomplete') {
    throw new Error(`Drive OAuth is half-configured — missing ${missing.join(', ')}.`
      + ' Set all three repository secrets, or none to fall back to the service account.'
      + ' See docs/drive-oauth-setup.md.');
  }

  if (mode === 'oauth') {
    const auth = new google.auth.OAuth2(
      env.DRIVE_OAUTH_CLIENT_ID.trim(),
      env.DRIVE_OAUTH_CLIENT_SECRET.trim(),
    );
    auth.setCredentials({ refresh_token: env.DRIVE_OAUTH_REFRESH_TOKEN.trim() });
    return {
      drive: google.drive({ version: 'v3', auth }),
      mode,
      // NOT "signed in as the folder owner" — that was a claim this function
      // cannot make. It is inferred from three env vars being non-empty, and
      // it is wrong the moment a token is minted as the wrong account: the
      // consent chooser offers every account signed into the browser, and the
      // preflight would then print a confident falsehood that every later
      // message inherits. The service-account arm below reads a real address
      // off the credential; this arm had only a hope, and only the hope can
      // be wrong. Naming the actual account needs a round trip
      // (drive.about.get) and belongs where the client is used.
      describe: 'Drive: OAuth, as whichever account the DRIVE_OAUTH_* secrets were minted for.'
        + ' Files are owned by that account.',
    };
  }

  const auth = new google.auth.GoogleAuth({ credentials: serviceAccount, scopes: saScopes });
  return {
    drive: google.drive({ version: 'v3', auth }),
    mode,
    describe: `Drive: service account ${serviceAccount.client_email}.`
      + ' This can only write into a Shared Drive, never a personal My Drive folder.',
  };
}
