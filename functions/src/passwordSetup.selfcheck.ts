/**
 * Setting or resetting a player's password (#password-sign-in, ported for
 * members in #member-sign-in). Run:
 *   node --experimental-strip-types functions/src/passwordSetup.selfcheck.ts
 *
 * Drives requestSetup / completeSetup with fakes and pins:
 *   • asking for a link changes NOTHING, answers the same whether or not
 *     the address is listed, and takes the same time; a listed address gets
 *     one emailed, the token stored only as a hash;
 *   • a link works once, for an hour, and only for a listed person;
 *   • the account is touched only at completion, and is always a fresh one;
 *     the only Google identity attached to it is the one the ENTRY names;
 *     a switched-off account is left off;
 *   • the record is written on an existing directors doc only, and the
 *     person is told by email that a password was set;
 *   • the limits, as numbers: per network address and per step, per inbox
 *     per hour and per day, and for the whole mailbox;
 *   • the function is off until the org flag is on, wants App Check before
 *     it reads anything, counts callers by the address Google appended, logs
 *     nothing but an error code, takes a link inside a transaction, and the
 *     app sets no password itself and keeps none.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  ADDRESS_DAILY_LIMIT, ADDRESS_LIMIT, COMPLETE_CALLER_LIMIT, GLOBAL_LIMIT, INVITE_LIFETIME_MS, LINK_LIFETIME_MS, REQUEST_CALLER_LIMIT,
  REQUEST_FLOOR_MS, buildDoneMail, buildSetupMail, callerAddress, completeSetup, limitKey, looksLikeEmail,
  staffSendLink, requestSetup, tokenId, type MailDoc, type SetupDeps,
} from './passwordSetup.ts';
import type { AccountRecord } from './freshAccount.ts';
import { MIN_PASSWORD_LENGTH, readSetupLink, setupLink } from '../../src/shared/passwordSetupLink.ts';

let failures = 0;
function check(cond: unknown, msg: string) {
  if (!cond) { failures++; console.error(`  ✗ ${msg}`); }
}

interface FakeUser extends AccountRecord { password?: string }
const PAT = 'pat@school.test';

function harness(opts: { users?: FakeUser[]; listed?: Record<string, Record<string, unknown>>; bindFails?: boolean; mailFails?: 'done'; busy?: () => boolean } = {}) {
  const users = new Map((opts.users ?? []).map(u => [u.uid, u]));
  const directors = new Map(Object.entries(opts.listed ?? { [PAT]: { role: 'director' } }));
  const tokens = new Map<string, { email: string; expiresAt: number }>();
  const mails: MailDoc[] = [];
  const counts = new Map<string, number>();
  const log: string[] = [];
  let clock = 1_700_000_000_500;
  let made = 0;
  let nextToken = 0;
  const byEmail = (email: string) => [...users.values()].find(u => u.email === email);
  const deps: SetupDeps = {
    auth: {
      async getUserByEmail(email) {
        const u = byEmail(email);
        if (!u) throw Object.assign(new Error('none'), { code: 'auth/user-not-found' });
        return u;
      },
      async createUser() {
        const u: FakeUser = { uid: `new-${++made}`, emailVerified: false, disabled: false, providerData: [] };
        users.set(u.uid, u);
        log.push(`create ${u.uid}`);
        return u;
      },
      async updateUser(uid, props) {
        const u = users.get(uid)!;
        if (props.providerToLink) {
          log.push(`link ${uid} ${props.providerToLink.uid}`);
          u.providerData.push(props.providerToLink);
        }
        if (props.providersToUnlink) {
          log.push(`unlink ${uid}`);
          u.providerData = u.providerData.filter(q => !props.providersToUnlink!.includes(q.providerId));
        }
        if (props.email) {
          if (byEmail(props.email)) throw Object.assign(new Error('exists'), { code: 'auth/email-already-exists' });
          log.push(`address ${uid}`);
          u.email = props.email;
          u.emailVerified = props.emailVerified === true;
        }
        if (props.password) {
          u.password = props.password;
          u.providerData.push({ providerId: 'password', email: u.email });
        }
        return u;
      },
      async deleteUser(uid) {
        if (!users.delete(uid)) throw Object.assign(new Error('none'), { code: 'auth/user-not-found' });
        log.push(`delete ${uid}`);
      },
    },
    async lock(email, fn) {
      if (opts.busy?.()) throw Object.assign(new Error('busy'), { code: 'hub/busy' });
      log.push(`lock ${email}`);
      try { return await fn(); } finally { log.push(`unlock ${email}`); }
    },
    async getDirector(email) { log.push('read entry'); return directors.get(email); },
    async bind(email, uid, now) {
      log.push(`bind ${uid}`);
      const d = directors.get(email);
      if (!d || opts.bindFails) return false;
      d.boundUid = uid; d.boundAt = now; d.passwordSet = true;
      return true;
    },
    async saveToken(id, record) { tokens.set(id, record); },
    async retireTokens(email) { for (const [id, r] of tokens) if (r.email === email) tokens.delete(id); },
    async peekToken(id) { const r = tokens.get(id); return r ? { email: r.email } : null; },
    async takeToken(id, now) {
      log.push('take link');
      const r = tokens.get(id);
      tokens.delete(id);
      return r && r.expiresAt > now ? { email: r.email } : null;
    },
    async sendMail(mail) {
      if (opts.mailFails === 'done' && /was just set/.test(mail.message.subject)) throw new Error('mail is down');
      mails.push(mail);
    },
    async allow(key, max) {
      const n = (counts.get(key) ?? 0) + 1;
      counts.set(key, n);
      return n <= max;
    },
    newToken: () => `token-number-${++nextToken}-aaaaaaaaaaaaaaaaaaaa`,
    now: () => clock,
    async sleepUntil(ms) { log.push(`sleep ${ms - clock}`); clock = Math.max(clock, ms); },
    publicUrl: 'https://example.org/hub/',
    appName: 'Example Hub',
  };
  const authCalls = () => log.filter(l => /^(create|link|unlink|address|delete)/.test(l));
  const links = () => mails.filter(m => /choose your password/.test(m.message.subject));
  return { deps, users, byEmail, directors, tokens, mails, links, log, authCalls, advance: (ms: number) => { clock += ms; } };
}

const GOOD = 'a long enough password';
const google = (email: string, over: Partial<FakeUser> = {}): FakeUser => ({
  uid: `g-${email}`, email, emailVerified: true, disabled: false, providerData: [{ providerId: 'google.com', uid: `google-id-of-${email}`, email }], ...over,
});
const passwordOnly = (email: string, emailVerified: boolean): FakeUser => ({
  uid: `p-${email}`, email, emailVerified, disabled: false, password: 'someone chose this',
  providerData: [{ providerId: 'password', email }],
});

/** Ask for a link and hand back its token, as the inbox would. */
async function linkFor(h: ReturnType<typeof harness>, email: string, caller = '1.1.1.1') {
  await requestSetup(h.deps, email, caller);
  const mail = h.links()[h.links().length - 1];
  const href = mail.message.text.split('\n').find(l => l.startsWith('https://')) ?? '';
  return readSetupLink(href.slice(href.indexOf('#')))!.token;
}

// ── Asking for a link ───────────────────────────────────────────────────────
{
  const h = harness({ users: [google(PAT)] });
  check(await requestSetup(h.deps, 'stranger@elsewhere.test', '1.1.1.1') === 'ok', 'an unlisted address gets the same answer');
  check(h.mails.length === 0 && h.tokens.size === 0, 'and nothing is sent or stored for it');
  check(await requestSetup(h.deps, '  Pat@School.test ', '1.1.1.1') === 'ok', 'a listed address: ok (capitals and spaces do not matter)');
  check(h.mails.length === 1 && h.mails[0].to.length === 1 && h.mails[0].to[0] === PAT, 'one email, to that address only');
  const [id, record] = [...h.tokens.entries()][0];
  const token = readSetupLink(h.mails[0].message.text.slice(h.mails[0].message.text.indexOf('#')).split('\n')[0])!.token;
  check(id === tokenId(token) && id !== token && !JSON.stringify([...h.tokens]).includes(token), 'the token is stored only as its hash');
  check(record.email === PAT && record.expiresAt - LINK_LIFETIME_MS <= h.deps.now() && LINK_LIFETIME_MS === 60 * 60 * 1000, 'for that person, for one hour');
  check(h.authCalls().length === 0 && !h.log.some(l => l.startsWith('bind')), 'asking changes NOTHING: no account touched, nothing recorded');
  check(Object.keys(h.directors.get(PAT)!).join() === 'role', 'the directors doc is as it was');
  for (const bad of ['', 'not an email', 42, null, undefined, 'a@b', `${'x'.repeat(250)}@school.test`, 'a/b@school.test', 'pat@school.test/x']) {
    check(await requestSetup(h.deps, bad, '9.9.9.9') === 'ok', `a malformed address (${String(bad).slice(0, 16)}) gets the same answer`);
  }
  check(h.mails.length === 1, 'and sends nothing');
  check(!looksLikeEmail('a/b@school.test') && !looksLikeEmail('a@school.test/b') && looksLikeEmail('a.b+c@school.test'), 'an address with a slash in it is not an address');
}

// ── Every answer takes the same time ────────────────────────────────────────
{
  check(REQUEST_FLOOR_MS >= 500, 'the floor is long enough to hide the work behind it');
  const waits = async (h: ReturnType<typeof harness>, email: unknown, caller: string) => {
    const before = h.log.length;
    try { await requestSetup(h.deps, email, caller); } catch { /* the wait must happen all the same */ }
    return h.log.slice(before).filter(l => l.startsWith('sleep'));
  };
  const h = harness();
  const floor = `sleep ${REQUEST_FLOOR_MS}`;
  check((await waits(h, 'stranger@elsewhere.test', '1.1.1.1')).join() === floor, 'an unlisted address: held to the floor');
  check((await waits(h, PAT, '1.1.1.1')).join() === floor, 'a listed address: held to the same floor');
  check((await waits(h, 'not an email', '1.1.1.1')).join() === floor, 'a malformed address: the same');
  for (let i = 0; i < ADDRESS_LIMIT.max; i++) await requestSetup(h.deps, PAT, `10.0.0.${i}`);
  check((await waits(h, PAT, '1.1.1.2')).join() === floor, 'a listed address past its cap: the same');
  const busy = harness();
  for (let i = 0; i < REQUEST_CALLER_LIMIT.max; i++) await requestSetup(busy.deps, 'x@elsewhere.test', '7.7.7.7');
  check((await waits(busy, 'x@elsewhere.test', '7.7.7.7')).join() === floor, 'a caller past its cap: the same');
  const broken = harness();
  broken.deps.getDirector = async () => { throw new Error('the database is down'); };
  check((await waits(broken, PAT, '1.1.1.1')).join() === floor, 'an error on our side: the same');
}

// ── The link itself ─────────────────────────────────────────────────────────
{
  const link = setupLink('https://example.org/hub/', 'abc_DEF-123456789012345', 'pat+x@school.test');
  check(link.startsWith('https://example.org/hub/director#') && !link.split('#')[0].includes('abc_'), 'the token rides after the #, never in the path or query');
  const back = readSetupLink(new URL(link).hash);
  check(back?.token === 'abc_DEF-123456789012345' && back.email === 'pat+x@school.test', 'and the page reads the same link back');
  check(readSetupLink('') === null && readSetupLink('#setup=short') === null && readSetupLink('#setup=has spaces in it, quite long') === null, 'anything that is not a token is not a link');
  const mail = buildSetupMail(PAT, link, 'Example Hub');
  check(mail.message.text.includes(link) && mail.message.html.includes('#setup=abc_DEF-123456789012345'), 'the email carries the link in both forms');
  check(/Nothing has changed/.test(mail.message.text), 'and says nothing has changed unless the link is used');
  check(!buildSetupMail('<b>x</b>@school.test', link, 'A & B').message.html.includes('<b>x</b>'), 'an address is escaped in the HTML');
  const done = buildDoneMail(PAT, 'Example Hub');
  check(done.to.join() === PAT && /was just set/.test(done.message.subject) && !/https?:|#setup/.test(done.message.text + done.message.html),
    'the notice that a password was set goes to that address and carries no link');
  check(/tell the office/.test(done.message.text), 'and says what to do if it was not them');
}

// ── A link works once, for an hour, for a listed person ─────────────────────
{
  const h = harness();
  const token = await linkFor(h, PAT);
  check((await completeSetup(h.deps, 'not-a-real-token-aaaaaaaaaaaa', GOOD, '1.1.1.1')).status === 'expired' && h.authCalls().length === 0, 'an unknown token: expired, nothing touched');
  check(h.tokens.size === 1, 'and a wrong guess does not use the real link up');
  for (const bad of [undefined, null, 7, '']) {
    check((await completeSetup(h.deps, bad, GOOD, '1.1.1.1')).status === 'expired', `a token of ${String(bad)}: expired`);
  }
  const done = await completeSetup(h.deps, token, GOOD, '2.2.2.2');
  check(done.status === 'done' && done.email === PAT, 'the real token completes');
  check((await completeSetup(h.deps, token, GOOD, '3.3.3.3')).status === 'expired', 'and never works a second time');

  const late = harness();
  const t2 = await linkFor(late, PAT);
  late.advance(LINK_LIFETIME_MS + 1);
  check((await completeSetup(late.deps, t2, GOOD, '1.1.1.1')).status === 'expired' && late.authCalls().length === 0, 'after an hour: expired, nothing touched');
  check(late.tokens.size === 0, 'and the dead link is gone');

  // Used up on first use, whether or not the rest succeeds.
  for (const [label, bad] of [
    ['a password under 10 characters', 'short'],
    ['a password over 200 characters', 'x'.repeat(201)],
    ['the email address as its own password', PAT],
    ['the email address with capitals and spaces', '  Pat@School.TEST '],
    ['a password that is not text', 1234567890123],
  ] as const) {
    const w = harness();
    const t = await linkFor(w, PAT);
    check((await completeSetup(w.deps, t, bad, '4.4.4.4')).status === 'weak' && w.authCalls().length === 0, `${label}: refused, no account touched`);
    check(w.tokens.size === 0 && (await completeSetup(w.deps, t, GOOD, '5.5.5.5')).status === 'expired', `${label}: and the link is used up all the same`);
  }

  // A newer link retires the ones before it.
  const two = harness();
  const first = await linkFor(two, PAT);
  const second = await linkFor(two, PAT, '6.6.6.6');
  check(two.tokens.size === 1 && first !== second, 'asking again leaves exactly one live link for the address');
  check((await completeSetup(two.deps, first, GOOD, '7.7.7.1')).status === 'expired' && two.authCalls().length === 0, 'the earlier email\'s link no longer works');
  check((await completeSetup(two.deps, second, GOOD, '7.7.7.2')).status === 'done', 'the newest email\'s link does');
  const others = harness({ listed: { [PAT]: { role: 'director' }, 'sam@school.test': { role: 'director' } } });
  const pats = await linkFor(others, PAT);
  await linkFor(others, 'sam@school.test');
  check((await completeSetup(others.deps, pats, GOOD, '7.7.7.3')).status === 'done', 'someone else asking for THEIR link retires nobody else\'s');
  check(others.directors.get('sam@school.test')!.boundUid === undefined, 'and a link sets a password for its own address only');

  // A link is not spent while the person's claim cannot be had.
  let claimBusy = true;
  const waiting = harness({ busy: () => claimBusy });
  const t4 = await linkFor(waiting, PAT);
  check((await completeSetup(waiting.deps, t4, GOOD, '1.1.1.1')).status === 'busy' && waiting.tokens.size === 1 && !waiting.log.includes('take link') && waiting.authCalls().length === 0,
    'while the person\'s claim is busy: "try again shortly", the link is not used up, nothing is touched');
  claimBusy = false;
  check((await completeSetup(waiting.deps, t4, GOOD, '1.1.1.1')).status === 'done', 'and the same link works once the claim is free');
  const ordered = harness();
  await completeSetup(ordered.deps, await linkFor(ordered, PAT), GOOD, '1.1.1.1');
  check(ordered.log.indexOf(`lock ${PAT}`) >= 0 && ordered.log.indexOf(`lock ${PAT}`) < ordered.log.indexOf('take link') && ordered.log.indexOf('take link') < ordered.log.indexOf(`unlock ${PAT}`),
    'the link is used up only once the claim is held');

  const gone = harness();
  const t3 = await linkFor(gone, PAT);
  gone.directors.delete(PAT);
  check((await completeSetup(gone.deps, t3, GOOD, '1.1.1.1')).status === 'expired' && gone.authCalls().length === 0, 'a person taken off the list meanwhile: expired, nothing touched');
}

// ── The Owner sends one person a link ───────────────────────────────────────
{
  const h = harness();
  for (let i = 0; i < ADDRESS_DAILY_LIMIT.max + 2; i++) await requestSetup(h.deps, PAT, `10.3.0.${i}`);
  const before = h.links().length;
  check(before === ADDRESS_LIMIT.max, 'the inbox\'s own cap has been used up by people asking');
  check(await staffSendLink(h.deps, ` ${PAT.toUpperCase()} `) === 'sent' && h.links().length === before + 1, 'the Owner\'s link is sent all the same');
  const text = h.links()[h.links().length - 1].message.text;
  const token = readSetupLink(text.slice(text.indexOf('#')).split('\n')[0])!.token;
  check(h.tokens.size === 1 && h.authCalls().length === 0 && !h.log.some(l => l.startsWith('bind')), 'it is the one live link, and sending it changed nothing');
  check((await completeSetup(h.deps, token, GOOD, '1.1.1.1')).status === 'done', 'and it works like any other');
  check(await staffSendLink(h.deps, 'stranger@elsewhere.test') === 'not-listed' && await staffSendLink(h.deps, 'a/b@school.test') === 'not-listed' && await staffSendLink(h.deps, 42) === 'not-listed',
    'an address that is not listed gets nothing');
  const many: Record<string, Record<string, unknown>> = {};
  for (let i = 0; i < GLOBAL_LIMIT.max + 1; i++) many[`q${i}@school.test`] = { role: 'director' };
  const all = harness({ listed: many });
  let sent = 0;
  for (let i = 0; i < GLOBAL_LIMIT.max + 1; i++) if (await staffSendLink(all.deps, `q${i}@school.test`) === 'sent') sent++;
  check(sent === GLOBAL_LIMIT.max, 'the whole mailbox\'s hourly cap still applies to it');
}

// ── Which account is recorded ───────────────────────────────────────────────
{
  // Nobody has ever signed in.
  const h = harness();
  await completeSetup(h.deps, await linkFor(h, PAT), GOOD, '1.1.1.1');
  const u = h.byEmail(PAT)!;
  const d = h.directors.get(PAT)!;
  check(u.password === GOOD && u.emailVerified, 'no account: one is made with the chosen password, verified by the link');
  check(d.boundUid === u.uid && d.passwordSet === true && d.boundAt === h.deps.now(), 'and recorded on the entry, with the password mark');
  check(u.providerData.every(p => p.providerId === 'password'), 'with no Google identity on it: the entry names none');
  const notice = h.mails[h.mails.length - 1];
  check(/was just set/.test(notice.message.subject) && notice.to.join() === PAT, 'and the person is told by email that a password was set');
  check(h.log.indexOf(`bind ${u.uid}`) < h.log.length && h.mails.indexOf(notice) === h.mails.length - 1, 'after the record is written');
}
{
  // Tied to Google: the entry's Google identity, and no other, is attached.
  const mine = google(PAT, { uid: 'bound-before' });
  const h = harness({ users: [mine], listed: { [PAT]: { role: 'director', googleSub: `google-id-of-${PAT}`, boundUid: 'bound-before', boundAt: 5 } } });
  await completeSetup(h.deps, await linkFor(h, PAT), GOOD, '1.1.1.1');
  const u = h.byEmail(PAT)!;
  const d = h.directors.get(PAT)!;
  check(u.uid !== mine.uid && h.log.includes(`delete ${mine.uid}`), 'the account that stood there is replaced by a fresh one (every older session on it ends)');
  const carried = u.providerData.filter(p => p.providerId === 'google.com');
  check(carried.length === 1 && carried[0].uid === `google-id-of-${PAT}` && carried[0].email === PAT, 'and the Google identity the entry names is attached to the fresh one');
  check(d.boundUid === u.uid && d.passwordSet === true && d.googleSub === `google-id-of-${PAT}`, 'the entry now names the fresh account, keeps its Google identity, and has the password mark');
  const order = [`lock ${PAT}`, `create ${u.uid}`, `link ${u.uid} placeholder-${u.uid}`, `unlink ${u.uid}`, `delete ${mine.uid}`, `address ${u.uid}`, `link ${u.uid} google-id-of-${PAT}`, `bind ${u.uid}`, `unlock ${PAT}`].map(s => h.log.indexOf(s));
  check(order.every(i => i >= 0) && order.join() === [...order].sort((a, b) => a - b).join(),
    'in this order, all under the person\'s claim: fresh account made, the attach step proven on it, only then the old account gone, the address moved, Google attached, recorded');
  const readAt = h.log.lastIndexOf('read entry');
  check(readAt > h.log.indexOf(`lock ${PAT}`) && readAt < h.log.indexOf(`create ${u.uid}`), 'and the entry is read under that claim, just before the account is made');
}
{
  // Tied to Google, but the account standing on the address has some OTHER
  // Google identity on it. That one is not carried over; the entry's is.
  const other = google(PAT, { providerData: [{ providerId: 'google.com', uid: 'google-id-of-someone-else', email: PAT }] });
  const h = harness({ users: [other], listed: { [PAT]: { role: 'director', googleSub: `google-id-of-${PAT}`, boundUid: 'x', boundAt: 5 } } });
  await completeSetup(h.deps, await linkFor(h, PAT), GOOD, '1.1.1.1');
  const ids = h.byEmail(PAT)!.providerData.filter(p => p.providerId === 'google.com').map(p => p.uid);
  check(ids.join() === `google-id-of-${PAT}`, 'a Google identity that merely sat on the old account is not carried over; the entry\'s own is attached');
}
for (const [label, existing] of [
  ['their own Google account, entry not tied yet', google(PAT)],
  ['a password-only account, unverified', passwordOnly(PAT, false)],
  ['a password-only account, verified', passwordOnly(PAT, true)],
  ['a Google identity whose own address is a different one', google(PAT, { providerData: [{ providerId: 'google.com', uid: 'g-x', email: 'other@gmail.test' }] })],
  ['an account with no provider at all', google(PAT, { providerData: [] })],
] as const) {
  const h = harness({ users: [existing] });
  const out = await completeSetup(h.deps, await linkFor(h, PAT), GOOD, '1.1.1.1');
  const u = h.byEmail(PAT)!;
  check(out.status === 'done' && u.uid !== existing.uid && h.log.includes(`delete ${existing.uid}`), `${label}: replaced by a fresh account`);
  check(u.password === GOOD && u.providerData.every(p => p.providerId === 'password'), `${label}: the fresh one carries only the chosen password (an entry that names no Google identity gets none)`);
  check(h.directors.get(PAT)!.boundUid === u.uid, `${label}: and it is the fresh one that is recorded`);
}
{
  // Switched off on purpose stays off.
  const off = google(PAT, { disabled: true });
  const h = harness({ users: [off] });
  const out = await completeSetup(h.deps, await linkFor(h, PAT), GOOD, '1.1.1.1');
  check(out.status === 'expired' && h.authCalls().length === 0 && h.byEmail(PAT) === off, 'a switched-off account is left exactly as it is');
  check(h.directors.get(PAT)!.boundUid === undefined, 'and nothing is recorded');
}
{
  const lost = harness({ bindFails: true });
  const out = await completeSetup(lost.deps, await linkFor(lost, PAT), GOOD, '1.1.1.1');
  check(out.status === 'expired' && !lost.mails.some(m => /was just set/.test(m.message.subject)), 'a directors doc that vanished before the record: expired, never created, and no notice sent');
  const quiet = harness({ mailFails: 'done' });
  check((await completeSetup(quiet.deps, await linkFor(quiet, PAT), GOOD, '1.1.1.1')).status === 'done', 'if the notice cannot be sent, the password still stands');
}

// ── The limits ──────────────────────────────────────────────────────────────
{
  check(JSON.stringify([REQUEST_CALLER_LIMIT, COMPLETE_CALLER_LIMIT, ADDRESS_LIMIT, ADDRESS_DAILY_LIMIT, GLOBAL_LIMIT])
    === JSON.stringify([{ max: 30, windowMs: 900000 }, { max: 30, windowMs: 900000 }, { max: 3, windowMs: 3600000 }, { max: 6, windowMs: 86400000 }, { max: 120, windowMs: 3600000 }]),
  'the limits are the agreed numbers (change them here on purpose, not by accident)');

  const h = harness();
  for (let i = 0; i < ADDRESS_LIMIT.max; i++) await requestSetup(h.deps, PAT, `10.0.0.${i}`);
  check(h.links().length === ADDRESS_LIMIT.max, `${ADDRESS_LIMIT.max} links to one inbox in an hour are sent`);
  check(await requestSetup(h.deps, PAT, '10.0.9.9') === 'ok' && h.links().length === ADDRESS_LIMIT.max, 'the next is NOT sent, and the answer does not change');
  const newest = h.links()[h.links().length - 1].message.text;
  const live = readSetupLink(newest.slice(newest.indexOf('#')).split('\n')[0])!.token;
  check(h.tokens.size === 1 && (await completeSetup(h.deps, live, GOOD, '10.0.0.0')).status === 'done',
    'and the newest link in the inbox still works: past the cap nothing is retired, so nobody is locked out by someone else asking');

  // Per day: a fake counter that forgets the hourly key, as an hour passing would.
  const day = harness();
  const realAllow = day.deps.allow;
  const dayCounts = new Map<string, number>();
  day.deps.allow = async (key, max, windowMs) => {
    if (key.startsWith('to_')) return true; // the hourly window keeps reopening
    if (key.startsWith('day_')) { const n = (dayCounts.get(key) ?? 0) + 1; dayCounts.set(key, n); return n <= max; }
    return realAllow(key, max, windowMs);
  };
  for (let i = 0; i < ADDRESS_DAILY_LIMIT.max + 4; i++) await requestSetup(day.deps, PAT, `10.1.0.${i}`);
  check(day.links().length === ADDRESS_DAILY_LIMIT.max, `one inbox gets at most ${ADDRESS_DAILY_LIMIT.max} links in a day, however the hours fall`);

  // The whole mailbox.
  const many: Record<string, Record<string, unknown>> = {};
  for (let i = 0; i < GLOBAL_LIMIT.max + 5; i++) many[`p${i}@school.test`] = { role: 'director' };
  const all = harness({ listed: many });
  for (let i = 0; i < GLOBAL_LIMIT.max + 5; i++) await requestSetup(all.deps, `p${i}@school.test`, `10.2.${Math.floor(i / 20)}.${i % 20}`);
  check(all.links().length === GLOBAL_LIMIT.max, `the Hub's mailbox sends at most ${GLOBAL_LIMIT.max} links an hour to everyone together`);

  // Per caller, and separately for each step.
  const busy = harness();
  let limited = 0;
  for (let i = 0; i < REQUEST_CALLER_LIMIT.max + 3; i++) if (await requestSetup(busy.deps, 'stranger@elsewhere.test', '7.7.7.7') === 'limited') limited++;
  check(limited === 3, `one network address is stopped asking after ${REQUEST_CALLER_LIMIT.max} tries`);
  const t = await linkFor(busy, PAT, '8.8.8.8');
  check((await completeSetup(busy.deps, t, GOOD, '7.7.7.7')).status === 'done', 'and can still COMPLETE: the two steps are counted apart, so a morning of asking stops nobody finishing');
  const stuck = harness();
  const t2 = await linkFor(stuck, PAT, '8.8.8.8');
  for (let i = 0; i < COMPLETE_CALLER_LIMIT.max; i++) await completeSetup(stuck.deps, 'wrong-token-aaaaaaaaaaaaaaaa', GOOD, '7.7.7.7');
  check((await completeSetup(stuck.deps, t2, GOOD, '7.7.7.7')).status === 'limited' && stuck.tokens.size === 1, 'a caller over the completing cap is told so BEFORE the link is looked at, so the link is not used up');
  check((await completeSetup(stuck.deps, t2, GOOD, '7.7.7.8')).status === 'done', 'and it still works from somewhere else, or later');
  check(limitKey('to', PAT) === limitKey('to', PAT) && !limitKey('to', PAT).includes('pat') && limitKey('req', 'x') !== limitKey('done', 'x'), 'a limit key is stable, carries no address, and differs by step');

  check(callerAddress('6.6.6.6, 9.9.9.9', '1.2.3.4') === '9.9.9.9' && callerAddress('made-up, also made up , 9.9.9.9', undefined) === '9.9.9.9',
    'a caller is counted by the LAST forwarded address (the one Google appended), never one the caller sent first');
  check(callerAddress(undefined, '1.2.3.4') === '1.2.3.4' && callerAddress('', undefined) === 'unknown' && callerAddress(' , ', '5.5.5.5') === '5.5.5.5', 'with nothing forwarded, the connection\'s own address');
}

// ── The invitation (#member-sign-in) ────────────────────────────────────────
{
  const h = harness();
  check(await staffSendLink(h.deps, PAT) === 'sent', 'staff can send a listed player an invitation');
  const [rec] = [...h.tokens.values()];
  check(rec && rec.expiresAt - h.deps.now() === INVITE_LIFETIME_MS && INVITE_LIFETIME_MS === 3 * 24 * 3600 * 1000, 'an invitation works for three days');
  const mail = h.mails[h.mails.length - 1];
  check(/invited/.test(mail.message.subject) && /three days/.test(mail.message.text) && /Set up or reset my password/.test(mail.message.text), 'it says it is an invitation, how long it lasts, and what to do after');
  check(/Add to Home Screen/.test(mail.message.text) && /Install app/.test(mail.message.html) && !/Home Screen/.test(buildSetupMail(PAT, 'x', 'H').message.text), 'an invitation coaches the Home Screen install; a reset does not');
  check(await staffSendLink(h.deps, 'nobody@school.test') === 'not-listed', 'an address that is not listed is not sent anything');
  await requestSetup(h.deps, PAT, '1.1.1.1');
  check(h.tokens.size === 1 && [...h.tokens.values()][0].expiresAt - h.deps.now() <= LINK_LIFETIME_MS, 'a link the player asks for still lasts one hour, and retires the invitation');
}

// ── The wiring, read from the source ────────────────────────────────────────
{
  const here = dirname(fileURLToPath(import.meta.url));
  const repo = resolve(here, '../..');
  const noComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
  const school = noComments(readFileSync(resolve(repo, 'functions/src/index.ts'), 'utf8'));
  check(!/passwordSetup|memberToken|memberView/.test(school), 'the school\'s functions (index.ts) do not import any of this');
  const index = noComments(readFileSync(resolve(here, 'personnelIndex.ts'), 'utf8'));
  const at = index.indexOf('export const passwordSetup');
  const handler = index.slice(at, index.indexOf('\n});', at));
  check(at > 0, 'personnelIndex.ts exports passwordSetup');
  const order = ['.personnel) { refuse(404', 'getAppCheck().verifyToken(', 'req.body'].map(s => handler.indexOf(s));
  check(order.every(i => i > 0) && order[0] < order[1] && order[1] < order[2], 'it is off outside a personnel org, and wants App Check, before it reads the request');
  check(squash(handler).includes("try { await getAppCheck().verifyToken(req.get('X-Firebase-AppCheck') ?? ''); } catch { refuse(401, 'That did not reach the Hub correctly. Reload the page and try again.'); return; }"),
    'a request with no valid App Check token is refused and goes no further');
  check(squash(handler).includes("const caller = callerAddress(req.get('X-Forwarded-For'), req.socket?.remoteAddress);") && !/req\.ip\b/.test(handler),
    'callers are counted by callerAddress, never by req.ip');
  const logged = [...index.matchAll(/console\.\w+\(([^;]*)\);/g)].map(m => m[1]);
  check(logged.length === 4 && logged.every(l => /^'(passwordSetup (staff-send|request|complete)|memberHome) failed:', \(err as \{ code\?: unknown \} \| null\)\?\.code \?\? 'unknown'$/.test(l)),
    'it logs an error code and nothing else: no address, token, password or raw error');
  const send = squash(handler.slice(handler.indexOf("action === 'staff-send'"), handler.indexOf("action === 'request'")));
  check(/const staff = await getAuth\(\)\.verifyIdToken\(idToken\)\.then\(d => staffFromToken\(d, loadDirector\)\)\.catch\(\(\) => null\);/.test(send)
    && send.indexOf("if (!staff) { refuse(401") < send.indexOf('if (!isStaffDoc(staff.director)) { refuse(403')
    && send.indexOf('isStaffDoc(staff.director)') < send.indexOf('staffSendLink('),
  'an invitation is sent only for a caller the staff test honours whose entry is an Owner\'s or a Director\'s, checked before anything is done');
  check((handler.match(/res\.status\(200\)\.json\(\{ ok: true \}\)/g) ?? []).length === 1,
    'asking answers ok even when something fails inside, so an error is not a way to learn who is listed');
  const complete = handler.slice(handler.indexOf("action === 'complete'"), handler.lastIndexOf("refuse(400, 'That did not reach"));
  check((complete.match(/refuse\(/g) ?? []).length === 3 && (complete.match(/res\.status\(/g) ?? []).length === 1 && !/outcome\.status === '(weak|expired)'/.test(complete),
    'completing has one success answer, "too many tries", "busy", and one answer for every other failure, never saying why');
  const home = squash(index.slice(index.indexOf('export const memberHome')));
  check(/const member = await getAuth\(\)\.verifyIdToken\(idToken\)\.then\(d => memberFromToken\(d, loadDirector\)\)\.catch\(\(\) => null\);/.test(home) && home.indexOf("if (!member) { refuse(401") < home.indexOf('db.doc(`personnel/'),
    'memberHome reads nothing until the token is a member sign-in the rules would honour');
  check(/const personnelId = member\.director\.personnelId;/.test(home) && !/req\.body/.test(home), 'and the person is the entry\'s personnelId, never anything the caller sends');
  check(/memberView\(personnelId,/.test(home), 'and it answers only through the projection (memberView)');

  const store = noComments(readFileSync(resolve(here, 'passwordSetupStore.ts'), 'utf8'));
  check(/return isMemberEntry\(d\) \? d : undefined;/.test(store), 'the store hands the password steps member entries only: staff keep Google');
  check(/lock: entryLock\(db\),/.test(store), 'the store takes the same per-person claim the Google step takes');
  check(/\.update\(\{ boundUid: uid, boundAt: now, passwordSet: true \}\)/.test(store) && !/directors\/\$\{email\}`\)\.set\(/.test(store), 'the record is written with update(), so it can never put anyone on the list');
  const take = squash(store.slice(store.indexOf('async takeToken('), store.indexOf('async sendMail(')));
  check(take.startsWith('async takeToken(id, now) { return db.runTransaction(async tx => {') && /tx\.delete\(ref\);/.test(take),
    'a link is read and used up inside ONE transaction');
  const core = noComments(readFileSync(resolve(here, 'passwordSetup.ts'), 'utf8'));
  for (const [name, src] of [['passwordSetup.ts', core], ['passwordSetupStore.ts', store]] as const) {
    check(!/console\./.test(src), `${name} logs nothing at all`);
  }
  const request = core.slice(core.indexOf('async function requestNow'), core.indexOf('export type CompleteOutcome'));
  check(!/deps\.auth|deps\.bind|freshAccount/.test(request), 'asking never reaches the sign-in service or the record');
  check(/finally \{[^}]*await deps\.sleepUntil\(started \+ REQUEST_FLOOR_MS\);/.test(squash(request)), 'and every way out of it waits for the floor');
  const completeFn = core.slice(core.indexOf('export async function completeSetup'));
  check(completeFn.indexOf("return { status: 'limited' }") < completeFn.indexOf('deps.takeToken('), '"too many tries" is decided before the link is looked at');
  check(completeFn.indexOf('deps.takeToken(') < completeFn.indexOf('passwordAcceptable(') && completeFn.indexOf('deps.takeToken(') < completeFn.indexOf('deps.getDirector('),
    'the link is used up before the password or the list is looked at');
  const sendFn = core.slice(core.indexOf('export async function staffSendLink'), core.indexOf('export type CompleteOutcome'));
  check(sendFn.length > 0 && !/deps\.auth|deps\.bind|freshAccount|limitKey\('(to|day)'/.test(sendFn) && /limitKey\('all', 'everyone'\)/.test(sendFn),
    'an invitation touches no account and no record, skips the inbox\'s own caps and keeps the mailbox\'s');
  check(/const uid = await freshAccount\(deps\.auth, \{/.test(completeFn) && !/deps\.auth\.(createUser|updateUser|deleteUser|getUserByEmail)/.test(core),
    'the account is made through freshAccount and no other way');
  check(/randomBytes\(32\)/.test(core), 'a token is 32 random bytes');

  // The app's side of the same promise.
  const gate = noComments(readFileSync(resolve(repo, 'src/director/components/MemberSignIn.tsx'), 'utf8'));
  check(!/signInWithCustomToken|signInWithEmailLink/.test(gate), 'the player sign-in signs in by password and by nothing else');
  for (const never of ['createUserWithEmailAndPassword', 'sendPasswordResetEmail', 'sendEmailVerification', 'updatePassword', 'confirmPasswordReset']) {
    check(!gate.includes(never), `MemberSignIn never calls ${never}: accounts and passwords are the server's work`);
  }
  const choose = gate.slice(gate.indexOf('async function choosePassword'), gate.indexOf('async function signInWithPassword'));
  check(choose.length > 0 && !/signInWith/.test(choose), 'choosing a password signs nobody in: it hands over to the ordinary sign-in form');
  check(/autoComplete="username"/.test(gate) && /autoComplete="new-password"/.test(gate) && /autoComplete="current-password"/.test(gate),
    'the fields are marked so a phone saves the email and password as a pair');
  check(!/localStorage/.test(gate), 'nothing is kept in localStorage');
  check(MIN_PASSWORD_LENGTH === 10, 'the shortest password the Hub\'s own link accepts is 10 characters');
}

if (failures) {
  console.error(`password setup self-check: ${failures} failure(s)`);
  process.exit(1);
}
console.log('password setup self-check: ok');
