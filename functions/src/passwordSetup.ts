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
 *             either way, and takes the same time.
 *
 *   complete  The link opens the Hub's own "choose your password" screen.
 *             Presenting the link's token is the proof of the inbox, and only
 *             then is the account touched: the person's sign-in account is
 *             made afresh with the password the inbox holder chose, and the
 *             entry records it (`boundUid`, `boundAt`, `passwordSet`). The
 *             rules honour a password sign-in on that account only
 *             (firestore.rules honouredSignIn). The person is then told by
 *             email that a password was set.
 *
 * Which account: always a FRESH one, made at completion by the same step the
 * Google tie uses (freshAccount.ts). Whatever stood on the address before is
 * deleted, so every session ever opened on it ends at once. Nothing in the
 * Hub is keyed by account id, so a fresh account loses nothing. When the
 * entry is tied to a Google account (`googleSub`), that Google identity, and
 * no other, is attached to the fresh account, so Sign in with Google keeps
 * opening it. A Google identity that merely sat on the old account is not
 * carried over.
 *
 * The app never creates an account and never sets a password itself.
 *
 * Pure: the sign-in service, the database and the clock are passed in, so
 * the function, the emulator proof and the self-check run the same code.
 */
import { createHash, randomBytes } from 'node:crypto';
import { normaliseEmail, passwordAcceptable, setupLink } from '../../src/shared/passwordSetupLink.ts';
import { freshAccount, type AccountAuth } from './freshAccount.ts';

/** How long an emailed link works. */
export const LINK_LIFETIME_MS = 60 * 60 * 1000;

/**
 * Calls one network address may make in a window, counted SEPARATELY for
 * asking and for completing, so a busy morning of people asking cannot stop
 * anyone finishing. Generous on purpose: a whole campus can sit behind one
 * address. The caps that actually protect an inbox are the ones below.
 */
export const REQUEST_CALLER_LIMIT = { max: 30, windowMs: 15 * 60 * 1000 };
export const COMPLETE_CALLER_LIMIT = { max: 30, windowMs: 15 * 60 * 1000 };
/**
 * Links one inbox may be sent: per hour, and per day. Past either, nothing
 * more is sent and the answer does not change: the links already in the
 * inbox still work, so the real person is never locked out by someone else's
 * asking.
 */
export const ADDRESS_LIMIT = { max: 3, windowMs: 60 * 60 * 1000 };
export const ADDRESS_DAILY_LIMIT = { max: 6, windowMs: 24 * 60 * 60 * 1000 };
/** Links the Hub's mailbox may send to everyone together in an hour. It also carries lesson logs and absence answers. */
export const GLOBAL_LIMIT = { max: 60, windowMs: 60 * 60 * 1000 };
/** Every answer to "request" takes at least this long, so the time it takes says nothing about the address. */
export const REQUEST_FLOOR_MS = 700;

export type SetupAuth = AccountAuth;

export interface MailDoc {
  to: string[];
  message: { subject: string; text: string; html: string };
}

export interface SetupDeps {
  auth: SetupAuth;
  /** One request at a time per address, shared with the Google step (entryLock.ts). */
  lock<T>(email: string, fn: () => Promise<T>): Promise<T>;
  /** The directors doc for a lowercased address, or undefined when not listed. */
  getDirector(email: string): Promise<Record<string, unknown> | undefined>;
  /** Record the fresh account on an EXISTING directors doc. False if the doc is gone. Never creates one. */
  bind(email: string, uid: string, now: number): Promise<boolean>;
  saveToken(id: string, record: { email: string; expiresAt: number }): Promise<void>;
  /** Throw away every unused link for this address, so only the newest email's link works. */
  retireTokens(email: string): Promise<void>;
  /** Whose link is this? Read only: the link is NOT used up. Null if there is no such link. */
  peekToken(id: string): Promise<{ email: string } | null>;
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
/**
 * Tokens are stored hashed: `passwordSetup` never holds a usable link. (The
 * email waiting to be sent, in `mail`, does carry the whole link until it is
 * used or an hour passes. No browser can read `mail`.)
 */
export const tokenId = (token: string): string => createHash('sha256').update(token).digest('hex');
/** A stable, address-free key for a rate-limit doc. */
export const limitKey = (kind: 'req' | 'done' | 'to' | 'day' | 'all', value: string): string =>
  `${kind}_${createHash('sha256').update(value).digest('hex').slice(0, 32)}`;

/**
 * The network address to count a caller by. Google's front end APPENDS the
 * address it saw to X-Forwarded-For, so the LAST entry is the one to trust;
 * everything before it is whatever the caller chose to send.
 */
export function callerAddress(forwardedFor: string | undefined, remote: string | undefined): string {
  const hops = (forwardedFor ?? '').split(',').map(s => s.trim()).filter(Boolean);
  return hops.length ? hops[hops.length - 1] : (remote || 'unknown');
}

/** An entry's name is its address, so "/" can never be part of one. */
export function looksLikeEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(email);
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

/** Sent after a password is set, so its owner hears about it even if someone else did it. No link, no password. */
export function buildDoneMail(email: string, appName: string): MailDoc {
  const subject = `${appName}: a password was just set`;
  const lines = [
    `A password was just set for ${email} on ${appName}, using a link that was emailed to this address.`,
    'If that was you, there is nothing more to do.',
    `If it was not you, open ${appName}, tap "Set up or reset my password" to choose a new one, and tell the Owner.`,
  ];
  return { to: [email], message: { subject, text: lines.join('\n\n'), html: lines.map(l => `<p>${escapeHtml(l)}</p>`).join('') } };
}

/** 'ok' is the answer whether or not the address is listed. */
export type RequestOutcome = 'ok' | 'limited';

async function requestNow(deps: SetupDeps, rawEmail: unknown, caller: string): Promise<RequestOutcome> {
  if (!await deps.allow(limitKey('req', caller), REQUEST_CALLER_LIMIT.max, REQUEST_CALLER_LIMIT.windowMs)) return 'limited';
  const email = normaliseEmail(rawEmail);
  if (!looksLikeEmail(email)) return 'ok';
  if (!await deps.getDirector(email)) return 'ok';
  if (!await deps.allow(limitKey('to', email), ADDRESS_LIMIT.max, ADDRESS_LIMIT.windowMs)) return 'ok';
  if (!await deps.allow(limitKey('day', email), ADDRESS_DAILY_LIMIT.max, ADDRESS_DAILY_LIMIT.windowMs)) return 'ok';
  if (!await deps.allow(limitKey('all', 'everyone'), GLOBAL_LIMIT.max, GLOBAL_LIMIT.windowMs)) return 'ok';
  await issueLink(deps, email);
  return 'ok';
}

/**
 * One live link per address: a new one retires the ones before it. The
 * newest email in the inbox is always the one that works. (Past a cap
 * nothing new is issued, so nothing is retired either.)
 */
async function issueLink(deps: SetupDeps, email: string): Promise<void> {
  await deps.retireTokens(email);
  const token = deps.newToken();
  await deps.saveToken(tokenId(token), { email, expiresAt: deps.now() + LINK_LIFETIME_MS });
  await deps.sendMail(buildSetupMail(email, setupLink(deps.publicUrl, token, email), deps.appName));
}

export type OwnerSendOutcome = 'sent' | 'not-listed' | 'limited';

/**
 * The Owner sends one listed person a link (Directors screen). It is the
 * same link by the same email, and it too changes nothing until the person
 * uses it. It does not count against that inbox's hourly and daily caps:
 * those can be used up by anyone asking in the person's name, and the Owner
 * is who a person turns to when that has happened. The caller (index.ts)
 * has already established that it IS the Owner asking. The whole mailbox's
 * cap still applies.
 */
export async function ownerSendLink(deps: SetupDeps, rawEmail: unknown): Promise<OwnerSendOutcome> {
  const email = normaliseEmail(rawEmail);
  if (!looksLikeEmail(email) || !await deps.getDirector(email)) return 'not-listed';
  if (!await deps.allow(limitKey('all', 'everyone'), GLOBAL_LIMIT.max, GLOBAL_LIMIT.windowMs)) return 'limited';
  await issueLink(deps, email);
  return 'sent';
}

/** `caller` is the caller's network address (callerAddress above). */
export async function requestSetup(deps: SetupDeps, rawEmail: unknown, caller: string): Promise<RequestOutcome> {
  const started = deps.now();
  try {
    return await requestNow(deps, rawEmail, caller);
  } finally {
    // Whatever happened, the answer leaves no sooner than this.
    await deps.sleepUntil(started + REQUEST_FLOOR_MS);
  }
}

/**
 * Why a completion did not happen. These names are for the tests and the
 * proof. The CALLER is told only "limited" (decided before the link is
 * looked at) and "busy" (the link was found but not used); both leave the
 * link usable. Every other failure gets one and the same answer (the
 * function in index.ts), so a failed attempt says nothing about the link,
 * the address or the list.
 */
export type CompleteOutcome =
  | { status: 'done'; email: string }
  /** The password is too short, too long, or is the email address itself. The link is used up all the same. */
  | { status: 'weak' }
  /** The link is unknown, used, retired, expired, or its person is no longer listed. */
  | { status: 'expired' }
  /** Too many tries from this network address. Nothing was looked at; the link still works. */
  | { status: 'limited' }
  /** Another request for this person is still running. The link was NOT used; it still works. */
  | { status: 'busy' };

export async function completeSetup(
  deps: SetupDeps, token: unknown, password: unknown, caller: string,
): Promise<CompleteOutcome> {
  if (!await deps.allow(limitKey('done', caller), COMPLETE_CALLER_LIMIT.max, COMPLETE_CALLER_LIMIT.windowMs)) return { status: 'limited' };
  if (typeof token !== 'string' || !token) return { status: 'expired' };
  // Whose link is it? Looked up WITHOUT using it up, so that the person's
  // claim can be taken first: a link must not be spent while this waits on
  // a claim that a request which died left behind.
  const named = await deps.peekToken(tokenId(token));
  if (!named) return { status: 'expired' };
  const email = named.email;
  // One request at a time per person, the Google step's requests included
  // (entryLock.ts): the link is used up, the entry read, the account
  // replaced and the record written with no other request for this person
  // in between.
  let outcome: CompleteOutcome | 'recorded';
  try {
    outcome = await deps.lock(email, async (): Promise<CompleteOutcome | 'recorded'> => {
      // The token is used up HERE, before anything else is looked at: a link
      // works once, whether or not what follows succeeds. A failure leaves at
      // worst an account the entry does not name, which the rules refuse, and
      // the person asks for a new link. (The token is never compared with a
      // stored secret, so there is no comparison to time: its hash is the name
      // of the record, and the lookup finds that record or does not.)
      const record = await deps.takeToken(tokenId(token), deps.now());
      if (!record || record.email !== email) return { status: 'expired' };
      // The screen checks these before it sends, so a person never loses a link
      // to a typo. They are checked again here because the screen is not the
      // only thing that can call this.
      if (!passwordAcceptable(password) || normaliseEmail(password) === email) return { status: 'weak' };
      // Still on the list at this moment, not just when the link was sent.
      const director = await deps.getDirector(email);
      if (!director) return { status: 'expired' };

      // The account that gets recorded is ALWAYS a fresh one (freshAccount.ts).
      // The only thing attached to it besides the password is the Google
      // identity the ENTRY names, if it names one.
      const googleSub = typeof director.googleSub === 'string' ? director.googleSub : '';
      const uid = await freshAccount(deps.auth, {
        email,
        password,
        ...(googleSub ? { google: { providerId: 'google.com', uid: googleSub, email } } : {}),
    });
    // An account on the address was switched off on purpose. A link must not
    // be a way to switch it back on.
    if (!uid) return { status: 'expired' };
    return await deps.bind(email, uid, deps.now()) ? 'recorded' : { status: 'expired' };
    });
  } catch (e) {
    // The claim could not be had in time (another request for this person
    // is still running, or one died a moment ago). Nothing was looked at
    // and the link has NOT been used: the person tries again shortly.
    if ((e as { code?: unknown } | null)?.code === 'hub/busy') return { status: 'busy' };
    throw e;
  }
  if (outcome !== 'recorded') return outcome;
  // Tell the person, at the address the link went to. If the notice cannot
  // be sent the password is still set; that is not a reason to fail.
  try { await deps.sendMail(buildDoneMail(email, deps.appName)); } catch { /* the password stands */ }
  return { status: 'done', email };
}
