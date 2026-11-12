/**
 * Each listed person is tied to their own Google account (#google-binding).
 * Run:
 *   node --experimental-strip-types functions/src/googleBinding.selfcheck.ts
 *
 * Drives bindGoogle with fakes and pins:
 *   • a Google sign-in whose own Google address is the listed address is
 *     tied, once, and asking again changes nothing;
 *   • an account that only CARRIES the address is refused, and the list is
 *     not even looked at for it;
 *   • a tie is never changed, and an entry is never created;
 *   • every other kind of sign-in is refused;
 *   • the function verifies the caller's token, logs nothing personal, and
 *     the store writes with update() inside one transaction.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { bindGoogle, googleSubOf, isOwnGoogleAccount, type BindClaims, type BindDeps, type BindUser } from './googleBinding.ts';

let failures = 0;
function check(cond: unknown, msg: string) {
  if (!cond) { failures++; console.error(`  ✗ ${msg}`); }
}

const EMAIL = 'pat@school.test';
const googleUser = (over: Partial<BindUser> = {}): BindUser => ({
  uid: 'acct-1', email: EMAIL, emailVerified: true, disabled: false,
  providerData: [{ providerId: 'google.com', uid: 'g-pat', email: EMAIL }], ...over,
});
const claims = (over: Partial<BindClaims> = {}): BindClaims => ({
  uid: 'acct-1', email: EMAIL, email_verified: true,
  firebase: { sign_in_provider: 'google.com', identities: { 'google.com': ['g-pat'], email: [EMAIL] } }, ...over,
});

function harness(opts: { user?: BindUser | null; entries?: Record<string, Record<string, unknown>> } = {}) {
  const entries = new Map(Object.entries(opts.entries ?? { [EMAIL]: { roles: ['director'] } }));
  const log: string[] = [];
  const deps: BindDeps = {
    async getUser(uid) { log.push(`getUser ${uid}`); return opts.user === undefined ? googleUser() : opts.user; },
    async tieIfUntied(email, googleSub, now) {
      log.push(`list ${email}`);
      const e = entries.get(email);
      if (!e) return { listed: false };
      if (typeof e.googleSub === 'string' && e.googleSub) return { listed: true, googleSub: e.googleSub };
      e.googleSub = googleSub; e.googleBoundAt = now;
      log.push(`tie ${email}`);
      return { listed: true, googleSub };
    },
    now: () => 1_700_000_000_000,
  };
  return { deps, entries, log };
}

// ── Their own Google account ────────────────────────────────────────────────
{
  const h = harness();
  check(await bindGoogle(h.deps, claims()) === 'bound', 'a Google sign-in whose own address is the listed one is tied');
  const e = h.entries.get(EMAIL)!;
  check(e.googleSub === 'g-pat' && e.googleBoundAt === 1_700_000_000_000, 'Google\'s id for the person, and when, are recorded');
  check(e.roles !== undefined && Object.keys(e).length === 3, 'and nothing else on the entry is touched');
  check(await bindGoogle(h.deps, claims()) === 'bound' && h.log.filter(l => l.startsWith('tie')).length === 1, 'asking again answers the same and writes nothing');
  check(await bindGoogle(h.deps, { ...claims(), uid: undefined, sub: 'acct-1' }) === 'bound', 'the account id is read from sub when uid is absent');
  const caps = harness({ user: googleUser({ email: 'Pat@School.test', providerData: [{ providerId: 'google.com', uid: 'g-pat', email: 'PAT@school.test' }] }) });
  check(await bindGoogle(caps.deps, claims()) === 'bound', 'capitals in what the sign-in service reports do not matter');
}

// ── An account that only carries the address ────────────────────────────────
for (const [label, user] of [
  ['Google\'s own address for the account is a different one', googleUser({ providerData: [{ providerId: 'google.com', uid: 'g-pat', email: 'someone@gmail.test' }] })],
  ['Google reports no address for the account', googleUser({ providerData: [{ providerId: 'google.com', uid: 'g-pat' }] })],
  ['the Google identity on the account is not the one that signed in', googleUser({ providerData: [{ providerId: 'google.com', uid: 'g-other', email: EMAIL }] })],
  ['the account carries a different address from the token', googleUser({ email: 'other@school.test' })],
  ['the account\'s address is not verified', googleUser({ emailVerified: false })],
  ['the account is switched off', googleUser({ disabled: true })],
  ['the account has no Google identity', googleUser({ providerData: [{ providerId: 'password', email: EMAIL }] })],
  ['the account is gone', null],
] as const) {
  const h = harness({ user });
  check(await bindGoogle(h.deps, claims()) === 'mismatch', `${label}: refused`);
  check(!h.log.some(l => l.startsWith('list')) && h.entries.get(EMAIL)!.googleSub === undefined, `${label}: the list is not looked at, nothing is tied`);
  check(!isOwnGoogleAccount(user, EMAIL, 'g-pat'), `${label}: not "their own Google account"`);
}

// ── Other kinds of sign-in ──────────────────────────────────────────────────
for (const [label, c] of [
  ['a password sign-in', claims({ firebase: { sign_in_provider: 'password', identities: { 'google.com': ['g-pat'] } } })],
  ['an anonymous sign-in', claims({ firebase: { sign_in_provider: 'anonymous', identities: {} } })],
  ['a Google sign-in with no Google identity in the token', claims({ firebase: { sign_in_provider: 'google.com', identities: {} } })],
  ['a token with two Google identities', claims({ firebase: { sign_in_provider: 'google.com', identities: { 'google.com': ['g-pat', 'g-2'] } } })],
  ['a token with no firebase claim', { uid: 'acct-1', email: EMAIL, email_verified: true }],
  ['an unverified email', claims({ email_verified: false })],
  ['no email', claims({ email: undefined })],
  ['no account id', claims({ uid: undefined })],
] as const) {
  const h = harness();
  check(await bindGoogle(h.deps, c) === 'mismatch' && h.log.length === 0, `${label}: refused before anything is read`);
}
check(googleSubOf(claims()) === 'g-pat' && googleSubOf(claims({ firebase: { sign_in_provider: 'google.com', identities: { 'google.com': [7] } } })) === '', 'Google\'s id is read only from a plain Google sign-in');

// ── A tie is never changed, and an entry is never made ──────────────────────
{
  const tied = harness({ entries: { [EMAIL]: { roles: ['director'], googleSub: 'g-someone-else', googleBoundAt: 5 } } });
  check(await bindGoogle(tied.deps, claims()) === 'other-account', 'an entry tied to a different Google account: refused');
  check(tied.entries.get(EMAIL)!.googleSub === 'g-someone-else' && tied.entries.get(EMAIL)!.googleBoundAt === 5, 'and the tie that was there is untouched');
  const none = harness({ entries: {} });
  check(await bindGoogle(none.deps, claims()) === 'not-listed' && none.entries.size === 0, 'an address that is not listed: said so, and no entry is created');
}

// ── A failure is not an answer ──────────────────────────────────────────────
{
  const deps: BindDeps = {
    async getUser() { throw Object.assign(new Error('down'), { code: 'auth/internal-error' }); },
    async tieIfUntied() { throw new Error('should not be reached'); },
    now: () => 0,
  };
  let threw = false;
  try { await bindGoogle(deps, claims()); } catch { threw = true; }
  check(threw, 'an outage throws instead of answering "mismatch"');
}

// ── The wiring, read from the source ────────────────────────────────────────
{
  const here = dirname(fileURLToPath(import.meta.url));
  const repo = resolve(here, '../..');
  const noComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  const index = noComments(readFileSync(resolve(repo, 'functions/src/index.ts'), 'utf8'));
  const at = index.indexOf('export const bindGoogle');
  const handler = index.slice(at, index.indexOf('\n});', at));
  check(at > 0, 'index.ts exports bindGoogle');
  check(/verifyIdToken\(idToken\)/.test(handler) && handler.indexOf('verifyIdToken(idToken)') < handler.indexOf('runBindGoogle('), 'the caller\'s token is verified before anything else');
  check(!/req\.body/.test(handler), 'it reads nothing from the request body: who to tie comes from the verified token alone');
  const logged = [...handler.matchAll(/console\.\w+\(([^;]*)\);/g)].map(m => m[1].replace(/'[^']*'|`[^`]*`/g, ''));
  check(logged.length === 1 && !/email|token|claims|err\)|err,/.test(logged[0]), 'it logs an error code and nothing else');

  const store = noComments(readFileSync(resolve(here, 'googleBindingStore.ts'), 'utf8'));
  check(/runTransaction/.test(store) && /tx\.update\(ref, \{ googleSub, googleBoundAt: now \}\)/.test(store) && !/\.set\(/.test(store),
    'the tie is written with update() inside one transaction, so it can never put anyone on the list');
  check(/if \(typeof existing === 'string' && existing\) return/.test(store), 'and never over a tie that is already there');

  const workflow = readFileSync(resolve(repo, '.github/workflows/deploy-functions.yml'), 'utf8');
  check(/functions:bindGoogle\b/.test(workflow.split('\n').filter(l => !l.trim().startsWith('#')).join('\n')), 'bindGoogle is in the deploy list');
}

if (failures) {
  console.error(`google binding self-check: ${failures} failure(s)`);
  process.exit(1);
}
console.log('google binding self-check: ok');
