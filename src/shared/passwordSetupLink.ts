/**
 * The "choose your password" link (#password-sign-in): how the server writes
 * it and how the page reads it. ONE definition, bundled into the
 * `passwordSetup` Cloud Function and into the sign-in screen, so the two
 * cannot disagree about the shape of a link or the length of a password.
 *
 * Zero imports on purpose: it is bundled into a function, and a function's
 * bundle must not reach React or the browser.
 */

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 200;

export function normaliseEmail(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().toLowerCase() : '';
}

export function passwordAcceptable(password: unknown): password is string {
  return typeof password === 'string'
    && password.length >= MIN_PASSWORD_LENGTH && password.length <= MAX_PASSWORD_LENGTH;
}

/**
 * The token rides in the FRAGMENT (after #), which a browser never sends to
 * a server, so it stays out of every access log between the inbox and the
 * page. `publicUrl` ends in a slash.
 */
export function setupLink(publicUrl: string, token: string, email: string): string {
  return `${publicUrl}director#setup=${token}&for=${encodeURIComponent(email)}`;
}

export function readSetupLink(hash: string): { token: string; email: string } | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const token = params.get('setup') ?? '';
  if (!/^[A-Za-z0-9_-]{20,200}$/.test(token)) return null;
  return { token, email: normaliseEmail(params.get('for')) };
}
