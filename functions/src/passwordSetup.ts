/**
 * Setting or resetting a staff password (#password-sign-in).
 *
 * One promise holds the whole design together: NOTHING ABOUT ANYONE'S
 * ACCOUNT CHANGES UNLESS SOMEONE WHO CAN READ THEIR MAIL ASKS FOR IT.
 *
 * Two steps, one emailed link:
 *
 *   request   Anyone may ask for a link for any address. It changes nothing.
 *             If the address is on the Directors list, the Hub emails it a
 *             one-time link; if not, nothing happens. The answer is the same
 *             either way.
 *
 *   complete  The link opens the Hub's own "choose your password" screen.
 *             Presenting the link's token is the proof of the inbox, and only
 *             then is the account touched: the password the inbox holder
 *             chose is set, older sessions are ended, and the account is
 *             BOUND to that listed person (`passwordUid`, `passwordBoundAt`
 *             on their directors doc). The rules honour a password sign-in
 *             for the bound account only (firestore.rules honouredSignIn).
 *
 * Which account is bound: always a FRESH one, made at completion. Whatever
 * stood on the address before is deleted, so every session ever opened on it
 * ends at once, and nothing shows whose those were. Nothing in the Hub is
 * keyed by account id, so a fresh account loses nothing. If what stood there
 * was this person's own Google sign-in (verified, Google's address for it is
 * the listed address, and nothing on it but Google and a password), that
 * Google identity is attached to the fresh account, so Sign in with Google
 * keeps opening their account.
 *
 * The app never creates an account and never sets a password itself.
 *
 * Pure: the sign-in service, the database and the clock are passed in, so
 * the function, the emulator proof and the self-check run the same code.
 */
import { createHash, randomBytes } from 'node:crypto';
import { normaliseEmail, passwordAcceptable, setupLink } from '../../src/shared/passwordSetupLink.ts';

/** How long an emailed link works. */
export const LINK_LIFETIME_MS = 60 * 60 * 1000;

/** Requests one network address may make (either step) in a window. */
export const IP_LIMIT = { max: 8, windowMs: 15 * 60 * 1000 };
/**
 * Links one address may be sent in a window. Past it nothing more is sent,
 * and the answer does not change: the links already in the inbox still work,
 * so the real person is never locked out by someone else's asking.
 */
export const ADDRESS_LIMIT = { max: 3, windowMs: 60 * 60 * 1000 };

/** One sign-in identity on an account. For Google, `uid` is Google's own id for the person. */
export interface SetupProvider {
  providerId: string;
  uid?: string;
  email?: string;
  displayName?: string;
  photoURL?: string;
}

export interface SetupUser {
  uid: string;
  emailVerified: boolean;
  disabled: boolean;
  providerData: SetupProvider[];
}

export interface SetupAuth {
  getUserByEmail(email: string): Promise<SetupUser>;
  createUser(props: { email: string; emailVerified: boolean; password: string }): Promise<SetupUser>;
  /** Attach one sign-in identity to an account. Used for nothing else here. */
  updateUser(uid: string, props: { providerToLink: SetupProvider & { uid: string } }): Promise<SetupUser>;
  deleteUser(uid: string): Promise<void>;
}

export interface MailDoc {
  to: string[];
  message: { subject: string; text: string; html: string };
}

export interface SetupDeps {
  auth: SetupAuth;
  /** The directors doc for a lowercased address, or undefined when not listed. */
  getDirector(email: string): Promise<Record<string, unknown> | undefined>;
  /** Stamp the binding on an EXISTING directors doc. False if the doc is gone. Never creates one. */
  bind(email: string, uid: string, boundAtSeconds: number): Promise<boolean>;
  saveToken(id: string, record: { email: string; expiresAt: number }): Promise<void>;
  /** Throw away every unused link for this address, so only the newest email's link works. */
  retireTokens(email: string): Promise<void>;
  /** Use a token up: the record if it existed and has not expired, else null. Never usable twice. */
  takeToken(id: string, now: number): Promise<{ email: string } | null>;
  sendMail(mail: MailDoc): Promise<void>;
  /** Count one use of `key`; false once it is over `max` in the window. */
  allow(key: string, max: number, windowMs: number): Promise<boolean>;
  newToken(): string;
  now(): number;
  /** Resolve once the clock has passed `ms`. */
  sleepUntil(ms: number): Promise<void>;
  /** Where the Hub lives, ending in a slash. */
  publicUrl: string;
  appName: string;
}

export const newToken = (): string => randomBytes(32).toString('base64url');
/** Tokens are stored hashed: the database never holds a usable link. */
export const tokenId = (token: string): string => createHash('sha256').update(token).digest('hex');
/** A stable, address-free key for a rate-limit doc. */
export const limitKey = (kind: 'ip' | 'to', value: string): string =>
  `${kind}_${createHash('sha256').update(value).digest('hex').slice(0, 32)}`;

export function looksLikeEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

export function buildSetupMail(email: string, link: string, appName: string): MailDoc {
  const subject = `${appName}: choose your password`;
  const text = [
    `Someone asked to set or reset the password for ${email} on ${appName}.`,
    '',
    'If that was you, open this link and choose your password:',
    link,
    '',
    'The link works once, for one hour.',
    'If it was not you, ignore this email. Nothing has changed, and nothing will unless the link is used.',
  ].join('\n');
  const html = `<p>Someone asked to set or reset the password for <strong>${escapeHtml(email)}</strong> on ${escapeHtml(appName)}.</p>`
    + `<p>If that was you, open this link and choose your password:</p>`
    + `<p><a href="${escapeHtml(link)}">Choose my password</a></p>`
    + `<p style="color:#52525b">The link works once, for one hour. If it was not you, ignore this email. Nothing has changed, and nothing will unless the link is used.</p>`;
  return { to: [email], message: { subject, text, html } };
}

/** 'ok' is the answer whether or not the address is listed. */
export type RequestOutcome = 'ok' | 'limited';

export async function requestSetup(deps: SetupDeps, rawEmail: unknown, ip: string): Promise<RequestOutcome> {
  if (!await deps.allow(limitKey('ip', ip), IP_LIMIT.max, IP_LIMIT.windowMs)) return 'limited';
  const email = normaliseEmail(rawEmail);
  if (!looksLikeEmail(email)) return 'ok';
  if (!await deps.getDirector(email)) return 'ok';
  if (!await deps.allow(limitKey('to', email), ADDRESS_LIMIT.max, ADDRESS_LIMIT.windowMs)) return 'ok';
  // One live link per address: a new one retires the ones before it. The
  // newest email in the inbox is always the one that works. (Past the cap
  // above nothing new is issued, so nothing is retired either.)
  await deps.retireTokens(email);
  const token = deps.newToken();
  await deps.saveToken(tokenId(token), { email, expiresAt: deps.now() + LINK_LIFETIME_MS });
  await deps.sendMail(buildSetupMail(email, setupLink(deps.publicUrl, token, email), deps.appName));
  return 'ok';
}

/**
 * Why a completion did not happen. These names are for the tests and the
 * proof. The CALLER is told none of them: every failure gets one and the
 * same answer (the function in index.ts), so a failed attempt says nothing
 * about the link, the address or the list.
 */
export type CompleteOutcome =
  | { status: 'done'; email: string }
  /** The password is too short, too long, or is the email address itself. The link is used up all the same. */
  | { status: 'weak' }
  /** The link is unknown, used, retired, expired, or its person is no longer listed. */
  | { status: 'expired' }
  | { status: 'limited' };

/**
 * Is this account the listed person's own Google sign-in, with nothing on it
 * that could be anyone else's? Google's own address for the account must BE
 * the listed address: a Google identity that merely sits on an account
 * carrying this address does not count.
 */
export function isOwnGoogleAccount(user: SetupUser, email: string): boolean {
  const google = user.providerData.filter(p => p.providerId === 'google.com');
  return user.emailVerified && !user.disabled
    && google.length === 1 && (google[0].email ?? '').toLowerCase() === email
    && user.providerData.every(p => p.providerId === 'google.com' || p.providerId === 'password');
}

const errorCode = (e: unknown) => (e as { code?: string } | null)?.code ?? '';

async function find(auth: SetupAuth, email: string): Promise<SetupUser | null> {
  try { return await auth.getUserByEmail(email); }
  catch (e) {
    if (errorCode(e) === 'auth/user-not-found') return null;
    throw e;
  }
}

export async function completeSetup(
  deps: SetupDeps, token: unknown, password: unknown, ip: string,
): Promise<CompleteOutcome> {
  if (!await deps.allow(limitKey('ip', ip), IP_LIMIT.max, IP_LIMIT.windowMs)) return { status: 'limited' };
  if (typeof token !== 'string' || !token) return { status: 'expired' };
  // The token is used up HERE, before anything else is looked at: a link
  // works once, whether or not what follows succeeds. A failure leaves at
  // worst an unbound account, which the rules refuse, and the person asks
  // for a new link. (The token is never compared with a stored secret, so
  // there is no comparison to time: its hash is the name of the record, and
  // the lookup finds that record or does not.)
  const record = await deps.takeToken(tokenId(token), deps.now());
  if (!record) return { status: 'expired' };
  const email = record.email;
  // The screen checks these before it sends, so a person never loses a link
  // to a typo. They are checked again here because the screen is not the
  // only thing that can call this.
  if (!passwordAcceptable(password) || normaliseEmail(password) === email) return { status: 'weak' };
  // Still on the list at this moment, not just when the link was sent.
  if (!await deps.getDirector(email)) return { status: 'expired' };

  // The account that gets bound is ALWAYS a fresh one. Whatever stood on the
  // address is deleted, which ends every session that was ever opened on it,
  // for certain and at once. Nothing in the Hub is keyed by account id, so
  // nothing is lost. The one thing worth carrying over is the person's own
  // Google identity, so that Sign in with Google keeps opening their account.
  let uid = '';
  let ownGoogle: (SetupProvider & { uid: string }) | undefined;
  // Bounded: an account can appear between the delete and the create. Look
  // again rather than trust the first look.
  for (let attempt = 0; attempt < 3 && !uid; attempt++) {
    const user = await find(deps.auth, email);
    if (user?.disabled) {
      // Someone switched this account off on purpose. A link must not be a
      // way to switch it back on.
      return { status: 'expired' };
    }
    if (user) {
      const google = isOwnGoogleAccount(user, email) && user.providerData.find(p => p.providerId === 'google.com');
      if (google && google.uid) ownGoogle = { ...google, uid: google.uid };
      await deps.auth.deleteUser(user.uid);
    }
    try {
      uid = (await deps.auth.createUser({ email, emailVerified: true, password })).uid;
    } catch (e) {
      if (errorCode(e) !== 'auth/email-already-exists') throw e;
    }
  }
  if (!uid) throw new Error('completeSetup: the account kept changing underneath; gave up after 3 tries');
  if (ownGoogle) await deps.auth.updateUser(uid, { providerToLink: ownGoogle });

  // Stamped AFTER the account is in place. The rules honour a sign-in on
  // this account made strictly after this second, and nothing older.
  const boundAt = Math.floor(deps.now() / 1000);
  if (!await deps.bind(email, uid, boundAt)) return { status: 'expired' };
  // The rules want a sign-in strictly AFTER the binding second. Hold the
  // answer until that second has passed, so the sign-in that follows counts.
  await deps.sleepUntil((boundAt + 2) * 1000);
  return { status: 'done', email };
}
