/**
 * Each listed person is tied to their own Google account (#google-binding).
 * Run:
 *   node --experimental-strip-types functions/src/googleBinding.selfcheck.ts
 *
 * Drives bindGoogle and freshAccount with fakes and pins:
 *   • a Google sign-in on Google's own account for a listed address is tied,
 *     and the account it is tied to is always a fresh one;
 *   • asking again from the tied account changes nothing;
 *   • any other account is refused, and the list is not even looked at;
 *   • a tie is never moved to another Google account, and an entry is never
 *     created;
 *   • every other kind of sign-in is refused;
 *   • the function verifies the caller's token, logs nothing personal, and
 *     the store writes with update() inside one transaction;
 *   • the Directors rules let no browser set or alter the record.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { bindGoogle, googleSubOf, isOwnGoogleAccount, type BindClaims, type BindDeps, type BindUser } from './googleBinding.ts';
import { freshAccount, FRESH_ACCOUNT_TRIES, type AccountAuth, type AccountRecord } from './freshAccount.ts';

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

function harness(opts: { user?: BindUser | null; entries?: Record<string, Record<string, unknown>>; fresh?: string | null } = {}) {
  const entries = new Map(Object.entries(opts.entries ?? { [EMAIL]: { roles: ['director'] } }));
  const log: string[] = [];
  let made = 0;
  const deps: BindDeps = {
    async getUser(uid) { log.push(`getUser ${uid}`); return opts.user === undefined ? googleUser() : opts.user; },
    async getEntry(email) {
      log.push(`list ${email}`);
      const e = entries.get(email);
      return e ? { googleSub: e.googleSub as string | undefined, boundUid: e.boundUid as string | undefined } : null;
    },
    async replaceAccount(user, google) {
      log.push(`replace ${user.uid} ${google.uid}`);
      return opts.fresh === undefined ? `fresh-${++made}` : opts.fresh;
    },
    async tie(email, googleSub, boundUid, now) {
      const e = entries.get(email);
      if (!e) return 'not-listed';
      if (typeof e.googleSub === 'string' && e.googleSub && e.googleSub !== googleSub) return 'other-account';
      e.googleSub = googleSub; e.boundUid = boundUid; e.boundAt = now;
      log.push(`tie ${email} ${boundUid}`);
      return 'tied';
    },
    now: () => 1_700_000_000_000,
  };
  return { deps, entries, log };
}

// ── Their own Google account: tied, on a fresh account ──────────────────────
{
  const h = harness();
  check(await bindGoogle(h.deps, claims()) === 'again', 'a Google sign-in on Google\'s own account for a listed address is tied, and told to sign in once more');
  const e = h.entries.get(EMAIL)!;
  check(e.googleSub === 'g-pat' && e.boundUid === 'fresh-1' && e.boundAt === 1_700_000_000_000, 'Google\'s id, the fresh account and the time are recorded');
  check(e.boundUid !== 'acct-1', 'the account on file is never the one the caller arrived on');
  check(h.log.includes('replace acct-1 g-pat') && h.log.indexOf('replace acct-1 g-pat') < h.log.indexOf(`tie ${EMAIL} fresh-1`), 'the account is made afresh BEFORE the tie is written');
  check(e.roles !== undefined && Object.keys(e).length === 4, 'and nothing else on the entry is touched');

  // The person signs in again and is on the fresh account.
  const onFresh = harness({ user: googleUser({ uid: 'fresh-1' }), entries: { [EMAIL]: { ...e } } });
  check(await bindGoogle(onFresh.deps, claims({ uid: 'fresh-1' })) === 'bound', 'from the account on file: "bound"');
  check(!onFresh.log.some(l => l.startsWith('replace') || l.startsWith('tie')), 'and nothing is replaced or written');
  check(await bindGoogle(onFresh.deps, { ...claims({ uid: undefined }), sub: 'fresh-1' }) === 'bound', 'the account id is read from sub when uid is absent');

  // Tied, but this session is on some other account carrying the same Google id.
  const elsewhere = harness({ user: googleUser({ uid: 'acct-9' }), entries: { [EMAIL]: { ...e } } });
  check(await bindGoogle(elsewhere.deps, claims({ uid: 'acct-9' })) === 'again', 'tied, but not on the account on file: made afresh again, never adopted as it is');
  check(elsewhere.entries.get(EMAIL)!.boundUid === 'fresh-1' && elsewhere.log.includes('replace acct-9 g-pat'), 'the account it arrived on is replaced');

  const caps = harness({ user: googleUser({ email: 'Pat@School.test', providerData: [{ providerId: 'google.com', uid: 'g-pat', email: 'PAT@school.test' }] }) });
  check(await bindGoogle(caps.deps, claims({ email: 'Pat@School.test' })) === 'again' && caps.entries.get(EMAIL)!.googleSub === 'g-pat', 'capitals in what the sign-in service reports do not matter');

  const gone = harness({ user: null });
  check(await bindGoogle(gone.deps, claims()) === 'again' && !gone.log.some(l => l.startsWith('list')), 'a session whose account is gone is told to sign in again, and nothing is read or written');

  const off = harness({ fresh: null });
  check(await bindGoogle(off.deps, claims()) === 'mismatch' && off.entries.get(EMAIL)!.googleSub === undefined, 'when the fresh account must not be made, nothing is tied');
}

// ── Any other account ───────────────────────────────────────────────────────
for (const [label, user] of [
  ['Google\'s own address for the account is a different one', googleUser({ providerData: [{ providerId: 'google.com', uid: 'g-pat', email: 'someone@gmail.test' }] })],
  ['Google reports no address for the account', googleUser({ providerData: [{ providerId: 'google.com', uid: 'g-pat' }] })],
  ['the Google identity on the account is not the one that signed in', googleUser({ providerData: [{ providerId: 'google.com', uid: 'g-other', email: EMAIL }] })],
  ['the account has a different address from the token', googleUser({ email: 'other@school.test' })],
  ['the account\'s address is not verified', googleUser({ emailVerified: false })],
  ['the account is switched off', googleUser({ disabled: true })],
  ['the account has no Google identity', googleUser({ providerData: [{ providerId: 'password', email: EMAIL }] })],
] as const) {
  const h = harness({ user });
  check(await bindGoogle(h.deps, claims()) === 'mismatch', `${label}: refused`);
  check(!h.log.some(l => l.startsWith('list') || l.startsWith('replace')) && h.entries.get(EMAIL)!.googleSub === undefined, `${label}: the list is not looked at, nothing is replaced or tied`);
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
  ['an address with a slash in it', claims({ email: 'a/b@school.test' })],
] as const) {
  const h = harness();
  check(await bindGoogle(h.deps, c) === 'mismatch' && h.log.length === 0, `${label}: refused before anything is read`);
}
check(googleSubOf(claims()) === 'g-pat' && googleSubOf(claims({ firebase: { sign_in_provider: 'google.com', identities: { 'google.com': [7] } } })) === '', 'Google\'s id is read only from a plain Google sign-in');

// ── A tie is never moved, and an entry is never made ────────────────────────
{
  const tied = harness({ entries: { [EMAIL]: { roles: ['director'], googleSub: 'g-someone-else', boundUid: 'acct-7', boundAt: 5 } } });
  check(await bindGoogle(tied.deps, claims()) === 'other-account', 'an entry tied to a different Google account: refused');
  const e = tied.entries.get(EMAIL)!;
  check(e.googleSub === 'g-someone-else' && e.boundUid === 'acct-7' && e.boundAt === 5, 'and the tie that was there is untouched');
  check(!tied.log.some(l => l.startsWith('replace')), 'and no account is replaced for it');
  const none = harness({ entries: {} });
  check(await bindGoogle(none.deps, claims()) === 'not-listed' && none.entries.size === 0, 'an address that is not listed: said so, and no entry is created');
  check(!none.log.some(l => l.startsWith('replace')), 'and the account of someone who is not listed is left alone');
}

// ── A failure is not an answer ──────────────────────────────────────────────
{
  const h = harness();
  const deps: BindDeps = { ...h.deps, async getUser() { throw Object.assign(new Error('down'), { code: 'auth/internal-error' }); } };
  let threw = false;
  try { await bindGoogle(deps, claims()); } catch { threw = true; }
  check(threw, 'an outage throws instead of answering "mismatch"');
  const deps2: BindDeps = { ...h.deps, async replaceAccount() { throw new Error('half way'); } };
  threw = false;
  try { await bindGoogle(deps2, claims()); } catch { threw = true; }
  check(threw && h.entries.get(EMAIL)!.googleSub === undefined, 'a replacement that fails writes no tie');
}

// ── The fresh account ───────────────────────────────────────────────────────
{
  function fakeAuth(start: AccountRecord[], opts: { squatters?: number; failLink?: boolean } = {}) {
    const accounts = new Map(start.map(a => [a.uid, a]));
    const log: string[] = [];
    let n = 0;
    let squatters = opts.squatters ?? 0;
    const notFound = () => Object.assign(new Error('nf'), { code: 'auth/user-not-found' });
    const auth: AccountAuth = {
      async getUserByEmail(email) {
        const u = [...accounts.values()].find(a => a.email === email);
        if (!u) throw notFound();
        return u;
      },
      async createUser(props) {
        if (squatters > 0) {
          squatters--;
          const s: AccountRecord = { uid: `squat-${squatters}`, email: props.email, emailVerified: false, disabled: false, providerData: [] };
          accounts.set(s.uid, s);
        }
        if ([...accounts.values()].some(a => a.email === props.email)) throw Object.assign(new Error('exists'), { code: 'auth/email-already-exists' });
        const u: AccountRecord = { uid: `new-${++n}`, email: props.email, emailVerified: props.emailVerified, disabled: false, displayName: props.displayName, providerData: props.password ? [{ providerId: 'password', email: props.email }] : [] };
        accounts.set(u.uid, u);
        log.push(`create ${u.uid}`);
        return u;
      },
      async updateUser(uid, props) {
        if (opts.failLink) throw new Error('link failed');
        const u = accounts.get(uid)!;
        u.providerData.push(props.providerToLink);
        log.push(`link ${uid} ${props.providerToLink.uid}`);
        return u;
      },
      async deleteUser(uid) {
        if (!accounts.delete(uid)) throw notFound();
        log.push(`delete ${uid}`);
      },
    };
    return { auth, accounts, log };
  }
  const old: AccountRecord = googleUser({ uid: 'old-1', displayName: 'Pat Example' });
  const google = { providerId: 'google.com', uid: 'g-pat', email: EMAIL };

  const a = fakeAuth([old]);
  const uid = await freshAccount(a.auth, { email: EMAIL, alsoDelete: 'old-1', google, displayName: old.displayName });
  check(uid === 'new-1' && !a.accounts.has('old-1'), 'the account that stood on the address is deleted, and a new one is made');
  const made = a.accounts.get('new-1')!;
  check(made.emailVerified && made.displayName === 'Pat Example' && made.providerData.length === 1 && made.providerData[0].uid === 'g-pat', 'the new one has the address, the name, and only the one Google identity');
  check(a.log.indexOf('delete old-1') < a.log.indexOf('create new-1'), 'the delete comes first');

  const moved = fakeAuth([googleUser({ uid: 'caller', email: 'elsewhere@school.test' }), googleUser({ uid: 'holder' })]);
  await freshAccount(moved.auth, { email: EMAIL, alsoDelete: 'caller', google });
  check(!moved.accounts.has('caller') && !moved.accounts.has('holder'), 'both the named account and whatever holds the address are deleted');

  const none = fakeAuth([]);
  check(await freshAccount(none.auth, { email: EMAIL, alsoDelete: 'not-there' }) === 'new-1', 'nothing standing there, and a named account already gone: still made');

  const off = fakeAuth([googleUser({ uid: 'off-1', disabled: true })]);
  check(await freshAccount(off.auth, { email: EMAIL, alsoDelete: 'off-1', google }) === null && off.accounts.has('off-1') && off.log.length === 0,
    'an account switched off on purpose is left exactly as it is');

  const raced = fakeAuth([old], { squatters: FRESH_ACCOUNT_TRIES - 1 });
  check(await freshAccount(raced.auth, { email: EMAIL, google }) !== null && [...raced.accounts.values()].filter(x => x.email === EMAIL).length === 1,
    'an account that keeps appearing in the gap is deleted and the create tried again');
  const swamped = fakeAuth([old], { squatters: FRESH_ACCOUNT_TRIES });
  let threw = false;
  try { await freshAccount(swamped.auth, { email: EMAIL, google }); } catch { threw = true; }
  check(threw, 'and after a bounded number of tries it gives up rather than loop');

  const half = fakeAuth([old], { failLink: true });
  threw = false;
  try { await freshAccount(half.auth, { email: EMAIL, google }); } catch { threw = true; }
  check(threw && half.accounts.size === 0, 'if the Google identity cannot be attached, the half-made account is removed');
}

// ── The wiring, read from the source ────────────────────────────────────────
{
  const here = dirname(fileURLToPath(import.meta.url));
  const repo = resolve(here, '../..');
  const noComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
  const index = noComments(readFileSync(resolve(repo, 'functions/src/index.ts'), 'utf8'));
  const at = index.indexOf('export const bindGoogle');
  const handler = index.slice(at, index.indexOf('\n});', at));
  check(at > 0, 'index.ts exports bindGoogle');
  check(/verifyIdToken\(idToken\)/.test(handler) && handler.indexOf('verifyIdToken(idToken)') < handler.indexOf('runBindGoogle('), 'the caller\'s token is verified before anything else');
  check(!/req\.body/.test(handler), 'it reads nothing from the request body: who to tie comes from the verified token alone');
  const logged = [...handler.matchAll(/console\.\w+\(([^;]*)\);/g)].map(m => m[1].replace(/'[^']*'|`[^`]*`/g, ''));
  check(logged.length === 1 && !/email|token|claims|err\)|err,/.test(logged[0]), 'it logs an error code and nothing else');

  const store = noComments(readFileSync(resolve(here, 'googleBindingStore.ts'), 'utf8'));
  check(/runTransaction/.test(store) && /tx\.update\(ref, \{ googleSub, boundUid, boundAt: now, passwordSet: false \}\)/.test(store) && !/\.set\(/.test(store),
    'the tie is written with update() inside one transaction, so it can never put anyone on the list, and it clears the password mark (the fresh account has none)');
  check(/if \(typeof existing === 'string' && existing && existing !== googleSub\) return 'other-account'/.test(store), 'and never over a tie to a different Google account');
  check(/replaceAccount\(user, google\) \{ return freshAccount\(auth, \{/.test(squash(store)) && /alsoDelete: user\.uid/.test(store), 'the store makes the account through freshAccount, deleting the caller\'s own');
  const core = noComments(readFileSync(resolve(here, 'googleBinding.ts'), 'utf8'));
  check(!/boundUid: uid|tie\(email, googleSub, uid/.test(core), 'bindGoogle never records the account the caller arrived on');
  for (const file of ['googleBinding.ts', 'googleBindingStore.ts', 'freshAccount.ts']) {
    check(!/console\./.test(noComments(readFileSync(resolve(here, file), 'utf8'))), `${file} logs nothing`);
  }

  const workflow = readFileSync(resolve(repo, '.github/workflows/deploy-functions.yml'), 'utf8');
  check(/functions:bindGoogle\b/.test(workflow.split('\n').filter(l => !l.trim().startsWith('#')).join('\n')), 'bindGoogle is in the deploy list');

  // The record is the server's alone: the Directors rules, word for word.
  // Exact text on purpose. A pattern cannot see how the conditions are
  // grouped, and the grouping is the rule.
  const rules = noComments(readFileSync(resolve(repo, 'firestore.rules'), 'utf8'));
  const fn = (name: string) => {
    const at2 = rules.indexOf(`function ${name}(`);
    return at2 < 0 ? '' : squash(rules.slice(at2, rules.indexOf('\n    }', at2)));
  };
  const KEYS = "['googleSub', 'boundUid', 'boundAt', 'passwordSet']";
  check(fn('bindingKept') === `function bindingKept() { return !request.resource.data.diff(resource.data).affectedKeys().hasAny(${KEYS});`,
    'bindingKept: none of the record\'s fields is touched');
  check(fn('bindingOnlyRemoved') === `function bindingOnlyRemoved() { return !request.resource.data.diff(resource.data).addedKeys().hasAny(${KEYS}) && !request.resource.data.diff(resource.data).changedKeys().hasAny(${KEYS});`,
    'bindingOnlyRemoved: fields may go, none may appear or change');
  check(fn('bindingGuard') === 'function bindingGuard(email) { return bindingKept() || (bindingOnlyRemoved() && isOwner() && request.auth.token.email != email);',
    'bindingGuard: untouched, or the Owner removing someone ELSE\'s');
  const directors = rules.slice(rules.indexOf('match /directors/{email} {'));
  const block = squash(directors.slice(0, directors.indexOf('\n    }')));
  check(block.includes(`allow create: if isOwner() && !request.resource.data.keys().hasAny(${KEYS});`), 'no create may carry the record');
  check(block.includes("allow update: if directorEditAllowed(email) && bindingGuard(email);"), 'every update goes through the guard: two named conditions, joined once');
  check((block.match(/allow update/g) ?? []).length === 1 && (block.match(/allow create/g) ?? []).length === 1 && !/allow write/.test(block), 'and there is exactly one update rule and one create rule for an entry');
  check((rules.match(/match \/directors\//g) ?? []).length === 1, 'and exactly one place that matches an entry');
  const selfList = fn('directorEditAllowed').match(/hasOnly\(\[([^\]]*)\]\)/)?.[1] ?? 'googleSub';
  check(!/googleSub|boundUid|boundAt|passwordSet/.test(selfList), 'the self-service key list does not name the record');
}

if (failures) {
  console.error(`google binding self-check: ${failures} failure(s)`);
  process.exit(1);
}
console.log('google binding self-check: ok');
