/**
 * Reading Google's own sign-in token (#google-binding).
 *
 * When a person signs in with Google, Google hands the browser a short-lived
 * token that Google itself signed, saying who the person is, what their
 * address is, and whether Google has verified that address. The record step
 * (googleBinding.ts) makes a record only from what THAT token says, never
 * from what the Hub's own sign-in service has on file.
 *
 * This checks such a token the way Google's guidance says to: the signature
 * against Google's published keys, that Google issued it, that it was issued
 * for one of this project's own sign-in clients, and that it has not expired.
 *
 * Pure: the keys, the project number and the clock are passed in, so the
 * self-check runs it against keys of its own. Zero imports beyond Node.
 */
import { createPublicKey, verify as verifySignature, type JsonWebKey } from 'node:crypto';

/** What Google says about the person who just signed in. */
export interface GoogleIdentity {
  /** Google's own id for the person. */
  sub: string;
  /** Their address at Google, lowercased. */
  email: string;
  /** Has Google itself verified that address? */
  emailVerified: boolean;
}

/** One of Google's published signing keys (https://www.googleapis.com/oauth2/v3/certs). */
export interface GoogleJwk { kid?: string; kty?: string; n?: string; e?: string; alg?: string; use?: string }

const ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];
/** A token is a little over 1 KB. Anything far larger is not one. */
const MAX_TOKEN_LENGTH = 4096;
/** How far ahead of our clock a token's issue time may be, in seconds. */
const CLOCK_SKEW_SECONDS = 300;

/**
 * Is this one of THIS project's own Google sign-in clients? Their ids are
 * `<project number>-<letters and digits>.apps.googleusercontent.com`.
 */
export function isProjectClientId(aud: unknown, projectNumber: string): boolean {
  if (typeof aud !== 'string' || !/^\d{6,}$/.test(projectNumber)) return false;
  const rest = aud.slice(projectNumber.length);
  return aud.startsWith(projectNumber) && /^-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(rest);
}

const decode = (part: string) => Buffer.from(part, 'base64url');

/** What Google says in this token, or null if the token is not one Google signed for this project, now. */
export function verifyGoogleIdToken(
  token: unknown, opts: { keys: GoogleJwk[]; projectNumber: string; now: number },
): GoogleIdentity | null {
  if (typeof token !== 'string' || !token || token.length > MAX_TOKEN_LENGTH) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  let header: Record<string, unknown>;
  let payload: Record<string, unknown>;
  try {
    header = JSON.parse(decode(parts[0]).toString('utf8'));
    payload = JSON.parse(decode(parts[1]).toString('utf8'));
  } catch { return null; }
  if (!header || !payload || typeof header !== 'object' || typeof payload !== 'object') return null;
  // One way of signing, and only that one: the key decides nothing about it.
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') return null;
  const jwk = opts.keys.find(k => k.kid === header.kid && k.kty === 'RSA');
  if (!jwk) return null;
  let signed = false;
  try {
    signed = verifySignature(
      'RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`),
      createPublicKey({ key: jwk as JsonWebKey, format: 'jwk' }), decode(parts[2]),
    );
  } catch { return null; }
  if (!signed) return null;

  const seconds = Math.floor(opts.now / 1000);
  if (typeof payload.iss !== 'string' || !ISSUERS.includes(payload.iss)) return null;
  if (!isProjectClientId(payload.aud, opts.projectNumber)) return null;
  if (typeof payload.exp !== 'number' || payload.exp <= seconds) return null;
  if (typeof payload.iat !== 'number' || payload.iat > seconds + CLOCK_SKEW_SECONDS) return null;
  if (typeof payload.sub !== 'string' || !payload.sub) return null;
  if (typeof payload.email !== 'string' || !payload.email) return null;
  return { sub: payload.sub, email: payload.email.toLowerCase(), emailVerified: payload.email_verified === true };
}
