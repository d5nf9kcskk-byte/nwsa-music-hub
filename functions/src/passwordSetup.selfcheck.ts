/**
 * Setting or resetting a staff password (#password-sign-in). Run:
 *   node --experimental-strip-types functions/src/passwordSetup.selfcheck.ts
 *
 * Drives requestSetup / completeSetup with fakes and pins:
 *   • asking for a link changes NOTHING and answers the same whether or not
 *     the address is listed; a listed address gets one emailed, the token
 *     stored only as a hash;
 *   • a link works once, for an hour, and only for a listed person;
 *   • the account is touched only at completion: a person's own Google
 *     account is kept, anything else is replaced, a switched-off account is
 *     left off;
 *   • the binding is stamped after the password is in place, on an existing
 *     directors doc only, and the answer waits out the binding second;
 *   • the limits: per network address, and per inbox without locking the
 *     real person out;
 *   • the function is off until the org flag is on, wants App Check before
 *     it reads anything, logs no address, and the app sets no password itself.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  ADDRESS_LIMIT, IP_LIMIT, LINK_LIFETIME_MS, buildSetupMail, completeSetup, isOwnGoogleAccount,
  limitKey, requestSetup, tokenId, type MailDoc, type SetupDeps, type SetupUser,
} from './passwordSetup.ts';
import { MIN_PASSWORD_LENGTH, readSetupLink, setupLink } from '../../src/shared/passwordSetupLink.ts';

let failures = 0;
function check(cond: unknown, msg: string) {
  if (!cond) { failures++; console.error(`  ✗ ${msg}`); }
}

interface FakeUser extends SetupUser { email: string; password?: string }

function harness(opts: { users?: FakeUser[]; listed?: string[]; bindFails?: boolean } = {}) {
  const users = new Map((opts.users ?? []).map(u => [u.email, u]));
  const directors = new Map((opts.listed ?? ['pat@school.test']).map(e => [e, { role: 'director' } as Record<string, unknown>]));
  const tokens = new Map<string, { email: string; expiresAt: number }>();
  const mails: MailDoc[] = [];
  const counts = new Map<string, number>();
  const log: string[] = [];
  let clock = 1_700_000_000_500;
  let made = 0;
  let nextToken = 0;
  const deps: SetupDeps = {
    auth: {
      async getUserByEmail(email) {
        const u = users.get(email);
        if (!u) throw Object.assign(new Error('none'), { code: 'auth/user-not-found' });
        return u;
      },
      async createUser(props) {
        log.push('create');
        if (users.has(props.email)) throw Object.assign(new Error('exists'), { code: 'auth/email-already-exists' });
        const u: FakeUser = {
          uid: `new-${++made}`, email: props.email, emailVerified: props.emailVerified, disabled: false,
          password: props.password, providerData: [{ providerId: 'password', email: props.email }],
        };
        users.set(props.email, u);
        return u;
      },
      async updateUser(uid, props) {
        log.push(`link ${uid}`);
        const u = [...users.values()].find(x => x.uid === uid)!;
        u.providerData.push(props.providerToLink);
        return u;
      },
      async deleteUser(uid) {
        log.push(`delete ${uid}`);
        for (const [email, u] of users) if (u.uid === uid) users.delete(email);
      },
    },
    async getDirector(email) { return directors.get(email); },
    async bind(email, uid, boundAt) {
      log.push(`bind ${uid}`);
      const d = directors.get(email);
      if (!d || opts.bindFails) return false;
      d.passwordUid = uid; d.passwordBoundAt = boundAt;
      return true;
    },
    async saveToken(id, record) { tokens.set(id, record); },
    async retireTokens(email) { for (const [id, r] of tokens) if (r.email === email) tokens.delete(id); },
    async takeToken(id, now) {
      const r = tokens.get(id);
      tokens.delete(id);
      return r && r.expiresAt > now ? { email: r.email } : null;
    },
    async sendMail(mail) { mails.push(mail); },
    async allow(key, max) {
      const n = (counts.get(key) ?? 0) + 1;
      counts.set(key, n);
      return n <= max;
    },
    newToken: () => `token-number-${++nextToken}-aaaaaaaaaaaaaaaaaaaa`,
    now: () => clock,
    async sleepUntil(ms) { log.push(`sleep ${ms}`); clock = Math.max(clock, ms); },
    publicUrl: 'https://example.org/hub/',
    appName: 'Example Hub',
  };
  const authCalls = () => log.filter(l => /^(create|link|delete)/.test(l));
  return { deps, users, directors, tokens, mails, log, authCalls, advance: (ms: number) => { clock += ms; } };
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
async function linkFor(h: ReturnType<typeof harness>, email: string, ip = '1.1.1.1') {
  await requestSetup(h.deps, email, ip);
  const mail = h.mails[h.mails.length - 1];
  const href = mail.message.text.split('\n').find(l => l.startsWith('https://')) ?? '';
  return readSetupLink(href.slice(href.indexOf('#')))!.token;
}

// ── Asking for a link ───────────────────────────────────────────────────────
{
  const h = harness({ users: [google('pat@school.test')] });
  check(await requestSetup(h.deps, 'stranger@elsewhere.test', '1.1.1.1') === 'ok', 'an unlisted address gets the same answer');
  check(h.mails.length === 0 && h.tokens.size === 0, 'and nothing is sent or stored for it');
  check(await requestSetup(h.deps, '  Pat@School.test ', '1.1.1.1') === 'ok', 'a listed address: ok (capitals and spaces do not matter)');
  check(h.mails.length === 1 && h.mails[0].to.length === 1 && h.mails[0].to[0] === 'pat@school.test', 'one email, to that address only');
  const [id, record] = [...h.tokens.entries()][0];
  const token = readSetupLink(h.mails[0].message.text.slice(h.mails[0].message.text.indexOf('#')).split('\n')[0])!.token;
  check(id === tokenId(token) && id !== token && !JSON.stringify([...h.tokens]).includes(token), 'the token is stored only as its hash');
  check(record.email === 'pat@school.test' && record.expiresAt === h.deps.now() + LINK_LIFETIME_MS && LINK_LIFETIME_MS === 60 * 60 * 1000, 'for that person, for one hour');
  check(h.authCalls().length === 0 && !h.log.some(l => l.startsWith('bind')), 'asking changes NOTHING: no account touched, nothing bound');
  check(h.directors.get('pat@school.test')!.passwordUid === undefined, 'the directors doc is as it was');
  for (const bad of ['', 'not an email', 42, null, undefined, 'a@b', `${'x'.repeat(250)}@school.test`]) {
    check(await requestSetup(h.deps, bad, '9.9.9.9') === 'ok', `a malformed address (${String(bad).slice(0, 12)}) gets the same answer`);
  }
  check(h.mails.length === 1, 'and sends nothing');
}

// ── The link itself ─────────────────────────────────────────────────────────
{
  const link = setupLink('https://example.org/hub/', 'abc_DEF-123456789012345', 'pat+x@school.test');
  check(link.startsWith('https://example.org/hub/director#') && !link.split('#')[0].includes('abc_'), 'the token rides after the #, never in the path or query');
  const back = readSetupLink(new URL(link).hash);
  check(back?.token === 'abc_DEF-123456789012345' && back.email === 'pat+x@school.test', 'and the page reads the same link back');
  check(readSetupLink('') === null && readSetupLink('#setup=short') === null && readSetupLink('#setup=has spaces in it, quite long') === null, 'anything that is not a token is not a link');
  const mail = buildSetupMail('pat@school.test', link, 'Example Hub');
  check(mail.message.text.includes(link) && mail.message.html.includes('#setup=abc_DEF-123456789012345'), 'the email carries the link in both forms');
  check(/Nothing has changed/.test(mail.message.text), 'and says nothing has changed unless the link is used');
  check(!buildSetupMail('<b>x</b>@school.test', link, 'A & B').message.html.includes('<b>x</b>'), 'an address is escaped in the HTML');
}

// ── A link works once, for an hour, for a listed person ─────────────────────
{
  const h = harness();
  const token = await linkFor(h, 'pat@school.test');
  check((await completeSetup(h.deps, 'not-a-real-token-aaaaaaaaaaaa', GOOD, '1.1.1.1')).status === 'expired' && h.authCalls().length === 0, 'an unknown token: expired, nothing touched');
  check(h.tokens.size === 1, 'and a wrong guess does not use the real link up');
  for (const bad of [undefined, null, 7, '']) {
    check((await completeSetup(h.deps, bad, GOOD, '1.1.1.1')).status === 'expired', `a token of ${String(bad)}: expired`);
  }
  const done = await completeSetup(h.deps, token, GOOD, '2.2.2.2');
  check(done.status === 'done' && done.email === 'pat@school.test', 'the real token completes');
  check((await completeSetup(h.deps, token, GOOD, '3.3.3.3')).status === 'expired', 'and never works a second time');

  const late = harness();
  const t2 = await linkFor(late, 'pat@school.test');
  late.advance(LINK_LIFETIME_MS + 1);
  check((await completeSetup(late.deps, t2, GOOD, '1.1.1.1')).status === 'expired' && late.authCalls().length === 0, 'after an hour: expired, nothing touched');
  check(late.tokens.size === 0, 'and the dead link is gone');

  // Used up on first use, whether or not the rest succeeds.
  for (const [label, bad] of [
    ['a password under 10 characters', 'short'],
    ['a password over 200 characters', 'x'.repeat(201)],
    ['the email address as its own password', 'pat@school.test'],
    ['the email address with capitals and spaces', '  Pat@School.TEST '],
    ['a password that is not text', 1234567890123],
  ] as const) {
    const w = harness();
    const t = await linkFor(w, 'pat@school.test');
    check((await completeSetup(w.deps, t, bad, '4.4.4.4')).status === 'weak' && w.authCalls().length === 0, `${label}: refused, no account touched`);
    check(w.tokens.size === 0 && (await completeSetup(w.deps, t, GOOD, '5.5.5.5')).status === 'expired', `${label}: and the link is used up all the same`);
  }

  // A newer link retires the ones before it.
  const two = harness();
  const first = await linkFor(two, 'pat@school.test');
  const second = await linkFor(two, 'pat@school.test', '6.6.6.6');
  check(two.tokens.size === 1 && first !== second, 'asking again leaves exactly one live link for the address');
  check((await completeSetup(two.deps, first, GOOD, '7.7.7.1')).status === 'expired' && two.authCalls().length === 0, 'the earlier email\'s link no longer works');
  check((await completeSetup(two.deps, second, GOOD, '7.7.7.2')).status === 'done', 'the newest email\'s link does');
  const others = harness({ listed: ['pat@school.test', 'sam@school.test'] });
  const pats = await linkFor(others, 'pat@school.test');
  await linkFor(others, 'sam@school.test');
  check((await completeSetup(others.deps, pats, GOOD, '7.7.7.3')).status === 'done', 'someone else asking for THEIR link retires nobody else\'s');
  check(others.directors.get('sam@school.test')!.passwordUid === undefined, 'and a link sets a password for its own address only');

  const gone = harness();
  const t3 = await linkFor(gone, 'pat@school.test');
  gone.directors.delete('pat@school.test');
  check((await completeSetup(gone.deps, t3, GOOD, '1.1.1.1')).status === 'expired' && gone.authCalls().length === 0, 'a person taken off the list meanwhile: expired, nothing touched');
}

// ── Which account is bound ──────────────────────────────────────────────────
{
  // Nobody has ever signed in.
  const h = harness();
  await completeSetup(h.deps, await linkFor(h, 'pat@school.test'), GOOD, '1.1.1.1');
  const u = h.users.get('pat@school.test')!;
  check(u.password === GOOD && u.emailVerified, 'no account: one is made with the chosen password, verified by the link');
  check(h.directors.get('pat@school.test')!.passwordUid === u.uid, 'and bound');
}
{
  // Their own Google account: replaced like anything else, and their Google
  // identity carried over, so Sign in with Google keeps opening their account.
  const mine = google('pat@school.test');
  const h = harness({ users: [mine] });
  await completeSetup(h.deps, await linkFor(h, 'pat@school.test'), GOOD, '1.1.1.1');
  const u = h.users.get('pat@school.test')!;
  check(u.uid !== mine.uid && h.log.includes(`delete ${mine.uid}`), 'their own Google account is replaced by a fresh one (every older session on it ends)');
  const carried = u.providerData.find(p => p.providerId === 'google.com');
  check(carried?.uid === 'google-id-of-pat@school.test' && carried.email === 'pat@school.test', 'and their own Google identity is attached to the fresh one');
  check(u.password === GOOD && u.emailVerified, 'which carries the chosen password');
  const order = [`delete ${mine.uid}`, 'create', `link ${u.uid}`, `bind ${u.uid}`].map(s => h.log.indexOf(s));
  check(order.every(i => i >= 0) && order.join() === [...order].sort((a, b) => a - b).join(), 'in this order: old account gone, fresh one made, Google attached, then bound');
}
{
  // Their own Google account that already carries some password.
  const mine = google('pat@school.test', { password: 'older', providerData: [{ providerId: 'google.com', uid: 'google-id-of-pat@school.test', email: 'pat@school.test' }, { providerId: 'password', email: 'pat@school.test' }] });
  const h = harness({ users: [mine] });
  await completeSetup(h.deps, await linkFor(h, 'pat@school.test'), GOOD, '1.1.1.1');
  const u = h.users.get('pat@school.test')!;
  check(u.uid !== mine.uid && u.password === GOOD && u.providerData.some(p => p.providerId === 'google.com'), 'Google plus an older password: fresh account, Google carried over, the older password gone');
}
for (const [label, existing] of [
  ['a password-only account, unverified', passwordOnly('pat@school.test', false)],
  ['a password-only account, verified', passwordOnly('pat@school.test', true)],
  ['a Google identity whose own address is a different one', google('pat@school.test', { providerData: [{ providerId: 'google.com', email: 'other@gmail.test' }] })],
  ['a Google identity with no address of its own', google('pat@school.test', { providerData: [{ providerId: 'google.com' }] })],
  ['their Google account with one more provider on it', google('pat@school.test', { providerData: [{ providerId: 'google.com', email: 'pat@school.test' }, { providerId: 'phone' }] })],
  ['their Google account, address not verified', google('pat@school.test', { emailVerified: false })],
  ['an account with no provider at all', google('pat@school.test', { providerData: [] })],
] as const) {
  check(!isOwnGoogleAccount(existing, 'pat@school.test'), `${label}: not "their own Google account"`);
  const h = harness({ users: [existing] });
  const out = await completeSetup(h.deps, await linkFor(h, 'pat@school.test'), GOOD, '1.1.1.1');
  const u = h.users.get('pat@school.test')!;
  check(out.status === 'done' && u.uid !== existing.uid && h.log.includes(`delete ${existing.uid}`), `${label}: replaced by a fresh account`);
  check(u.password === GOOD && u.providerData.every(p => p.providerId === 'password'), `${label}: the fresh one carries only the chosen password`);
  check(h.directors.get('pat@school.test')!.passwordUid === u.uid, `${label}: and it is the fresh one that is bound`);
}
{
  // Switched off on purpose stays off.
  const off = google('pat@school.test', { disabled: true });
  const h = harness({ users: [off] });
  const out = await completeSetup(h.deps, await linkFor(h, 'pat@school.test'), GOOD, '1.1.1.1');
  check(out.status === 'expired' && h.authCalls().length === 0 && h.users.get('pat@school.test') === off, 'a switched-off account is left exactly as it is');
  check(h.directors.get('pat@school.test')!.passwordUid === undefined, 'and nothing is bound');
}

// ── The binding ─────────────────────────────────────────────────────────────
{
  const h = harness();
  const before = h.deps.now();
  await completeSetup(h.deps, await linkFor(h, 'pat@school.test'), GOOD, '1.1.1.1');
  const d = h.directors.get('pat@school.test')!;
  check(Number.isInteger(d.passwordBoundAt) && d.passwordBoundAt === Math.floor(before / 1000), 'the binding time is whole seconds');
  check(h.log.includes(`sleep ${((d.passwordBoundAt as number) + 2) * 1000}`) && h.log.indexOf('bind new-1') < h.log.findIndex(l => l.startsWith('sleep')),
    'and the answer is held until that second has passed, so the sign-in that follows counts');

  const lost = harness({ bindFails: true });
  const out = await completeSetup(lost.deps, await linkFor(lost, 'pat@school.test'), GOOD, '1.1.1.1');
  check(out.status === 'expired', 'a directors doc that vanished before the binding: expired, never created');
}

// ── The limits ──────────────────────────────────────────────────────────────
{
  const h = harness();
  for (let i = 0; i < ADDRESS_LIMIT.max; i++) await requestSetup(h.deps, 'pat@school.test', `10.0.0.${i}`);
  check(h.mails.length === ADDRESS_LIMIT.max, `${ADDRESS_LIMIT.max} links to one inbox are sent`);
  check(await requestSetup(h.deps, 'pat@school.test', '10.0.9.9') === 'ok' && h.mails.length === ADDRESS_LIMIT.max, 'the next is NOT sent, and the answer does not change');
  const newest = h.mails[h.mails.length - 1].message.text;
  const live = readSetupLink(newest.slice(newest.indexOf('#')).split('\n')[0])!.token;
  check(h.tokens.size === 1 && (await completeSetup(h.deps, live, GOOD, '10.0.0.0')).status === 'done',
    'and the newest link in the inbox still works: past the cap nothing is retired, so nobody is locked out by someone else asking');

  const busy = harness();
  let limited = 0;
  for (let i = 0; i < IP_LIMIT.max + 3; i++) if (await requestSetup(busy.deps, 'stranger@elsewhere.test', '7.7.7.7') === 'limited') limited++;
  check(limited === 3, `one network address is stopped after ${IP_LIMIT.max} tries`);
  check((await completeSetup(busy.deps, 'whatever-token-aaaaaaaaaaaaaaaa', GOOD, '7.7.7.7')).status === 'limited', 'for completing as well as asking');
  check(limitKey('to', 'pat@school.test') === limitKey('to', 'pat@school.test') && !limitKey('to', 'pat@school.test').includes('pat'), 'a limit key is stable and carries no address');
}

// ── The wiring, read from the source ────────────────────────────────────────
{
  const here = dirname(fileURLToPath(import.meta.url));
  const repo = resolve(here, '../..');
  const noComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  const index = noComments(readFileSync(resolve(repo, 'functions/src/index.ts'), 'utf8'));
  const at = index.indexOf('export const passwordSetup');
  const handler = index.slice(at, index.indexOf('\n});', at));
  check(at > 0, 'index.ts exports passwordSetup');
  const order = ['ORG.features.passwordSignIn', 'getAppCheck().verifyToken(', 'req.body'].map(s => handler.indexOf(s));
  check(order.every(i => i > 0) && order[0] < order[1] && order[1] < order[2], 'it is off until the org flag is on, and wants App Check, before it reads the request');
  check(/if \(!ORG\.features\.passwordSignIn\) \{ refuse\(404/.test(handler), 'with the flag off it answers 404 to everything');
  const logged = [...handler.matchAll(/console\.\w+\(([^;]*)\);/g)].map(m => m[1].replace(/'[^']*'|`[^`]*`/g, ''));
  check(logged.length === 2 && logged.every(args => !/email|token|password|req\.body|err\)|err,/.test(args)), 'it logs an error code and nothing else: no address, token, password or raw error');
  check((handler.match(/res\.status\(200\)\.json\(\{ ok: true \}\)/g) ?? []).length === 1 && !/requestSetup[\s\S]*refuse\(5/.test(handler.slice(0, handler.indexOf("action === 'complete'"))),
    'asking answers ok even when something fails inside, so an error is not a way to learn who is listed');

  const store = noComments(readFileSync(resolve(here, 'passwordSetupStore.ts'), 'utf8'));
  check(/\.update\(\{ passwordUid: uid, passwordBoundAt: boundAtSeconds \}\)/.test(store) && !/directors\/\$\{email\}`\)\.set\(/.test(store), 'the binding is written with update(), so it can never put anyone on the list');
  const core = noComments(readFileSync(resolve(here, 'passwordSetup.ts'), 'utf8'));
  const request = core.slice(core.indexOf('export async function requestSetup'), core.indexOf('export type CompleteOutcome'));
  check(!/deps\.auth|deps\.bind/.test(request), 'requestSetup never reaches the sign-in service or the binding');

  // Every failed completion gets one and the same answer.
  const complete = handler.slice(handler.indexOf("action === 'complete'"), handler.lastIndexOf("refuse(400, 'That did not reach"));
  check((complete.match(/refuse\(/g) ?? []).length === 1 && (complete.match(/res\.status\(/g) ?? []).length === 1,
    'completing has exactly one failure answer and one success answer');
  check(!/outcome\.status === '(weak|expired|limited)'/.test(complete), 'and it does not tell the caller WHY it failed');
  const core2 = noComments(readFileSync(resolve(here, 'passwordSetup.ts'), 'utf8'));
  const completeFn = core2.slice(core2.indexOf('export async function completeSetup'));
  check(completeFn.indexOf('deps.takeToken(') < completeFn.indexOf('passwordAcceptable(') && completeFn.indexOf('deps.takeToken(') < completeFn.indexOf('deps.getDirector('),
    'the link is used up before the password or the list is looked at');
  check(/randomBytes\(32\)/.test(core2), 'a token is 32 random bytes');
  check(/retireTokens\(email\)[\s\S]*saveToken\(/.test(core2.slice(core2.indexOf('export async function requestSetup'), core2.indexOf('export type CompleteOutcome'))),
    'a new link retires the older ones before it is saved');

  // The app's side of the same promise.
  const gate = noComments(readFileSync(resolve(repo, 'src/director/components/AuthGate.tsx'), 'utf8'));
  const choose = gate.slice(gate.indexOf('async function choosePassword'), gate.indexOf('async function signIn()'));
  check(choose.length > 0 && !/signInWith|getIdToken|signInWithCustomToken/.test(choose), 'choosing a password signs nobody in: it hands over to the ordinary sign-in form');
  check(!gate.includes('signInWithCustomToken') && !gate.includes('signInWithEmailLink'), 'AuthGate signs in by Google or by password and by nothing else');
  check(/autoComplete="username" readOnly/.test(gate) && (gate.match(/autoComplete="new-password"/g) ?? []).length === 2 && /autoComplete="current-password"/.test(gate),
    'the fields are marked so a phone saves the email and password as a pair');
  const choosing = gate.slice(gate.indexOf("PASSWORD_SIGN_IN && setupLink && mode === 'choose'"));
  check(!/<(img|script|link|iframe)[^>]*(src|href)=["{]\s*["`']?https?:/.test(choosing.slice(0, choosing.indexOf("mode === 'setup'"))), 'the choose-your-password screen loads nothing from another site');
  for (const never of ['createUserWithEmailAndPassword', 'sendPasswordResetEmail', 'sendEmailVerification', 'updatePassword', 'confirmPasswordReset']) {
    check(!gate.includes(never), `AuthGate never calls ${never}: accounts and passwords are the server's work`);
  }
  check(MIN_PASSWORD_LENGTH === 10, 'the shortest password is 10 characters, enforced here and not by a console setting');
}

if (failures) {
  console.error(`password setup self-check: ${failures} failure(s)`);
  process.exit(1);
}
console.log('password setup self-check: ok');
