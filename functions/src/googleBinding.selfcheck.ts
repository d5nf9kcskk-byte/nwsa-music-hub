/**
 * Each listed person is tied to their own Google account (#google-binding).
 * Run:
 *   node --experimental-strip-types functions/src/googleBinding.selfcheck.ts
 *
 * Drives bindGoogle, freshAccount and the Google-token check with stand-ins
 * and pins:
 *   • a record is made only from a token Google signed, for this project,
 *     naming a verified address that is the listed one;
 *   • the account it records is always a fresh one, made before anything
 *     that exists is touched;
 *   • asking again from the recorded account changes nothing;
 *   • a record is never moved to another Google account, an entry is never
 *     created, and one request at a time is served per address;
 *   • every other kind of sign-in is refused;
 *   • the function verifies the caller's token, logs nothing personal, and
 *     the store writes with update() inside one transaction;
 *   • the Directors rules let no browser set or alter the record;
 *   • the checks themselves stay wired into the deploys.
 */
import { readFileSync } from 'node:fs';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { bindGoogle, googleSubOf, type BindClaims, type BindDeps, type BindUser } from './googleBinding.ts';
import { freshAccount, FRESH_ACCOUNT_TRIES, type AccountAuth, type AccountRecord } from './freshAccount.ts';
import { isProjectClientId, verifyGoogleIdToken, type GoogleIdentity, type GoogleJwk } from './googleIdToken.ts';

let failures = 0;
function check(cond: unknown, msg: string) {
  if (!cond) { failures++; console.error(`  ✗ ${msg}`); }
}

const EMAIL = 'pat@school.test';
const googleUser = (over: Partial<BindUser> = {}): BindUser => ({
  uid: 'acct-1', email: EMAIL, emailVerified: true, disabled: false, displayName: 'Pat Example',
  providerData: [{ providerId: 'google.com', uid: 'g-pat', email: EMAIL }], ...over,
});
const claims = (over: Partial<BindClaims> = {}): BindClaims => ({
  uid: 'acct-1', email: EMAIL, email_verified: true,
  firebase: { sign_in_provider: 'google.com', identities: { 'google.com': ['g-pat'], email: [EMAIL] } }, ...over,
});
/** What Google's token says. The stand-in "token" here is just that, as an object. */
const saysGoogle = (over: Partial<GoogleIdentity> = {}): GoogleIdentity => ({ sub: 'g-pat', email: EMAIL, emailVerified: true, ...over });

function harness(opts: { user?: BindUser | null; entries?: Record<string, Record<string, unknown>>; fresh?: string | null } = {}) {
  const entries = new Map(Object.entries(opts.entries ?? { [EMAIL]: { roles: ['director'] } }));
  const log: string[] = [];
  let made = 0;
  let held = false;
  const deps: BindDeps = {
    async verifyGoogle(token) { log.push('google'); return (token as GoogleIdentity | null) ?? null; },
    async lock(email, fn) {
      if (held) throw new Error('the lock was taken twice at once');
      held = true; log.push(`lock ${email}`);
      try { return await fn(); } finally { held = false; log.push('unlock'); }
    },
    async getUser(uid) { log.push(`getUser ${uid}`); return opts.user === undefined ? googleUser() : opts.user; },
    async getEntry(email) {
      log.push(`list ${email}`);
      const e = entries.get(email);
      return e ? { googleSub: e.googleSub as string | undefined, boundUid: e.boundUid as string | undefined } : null;
    },
    async replaceAccount(spec) {
      log.push(`replace ${spec.alsoDelete} ${spec.google.uid}`);
      return opts.fresh === undefined ? `fresh-${++made}` : opts.fresh;
    },
    async tie(email, googleSub, boundUid, now) {
      const e = entries.get(email);
      if (!e) return 'not-listed';
      if (typeof e.googleSub === 'string' && e.googleSub && e.googleSub !== googleSub) return 'other-account';
      e.googleSub = googleSub; e.boundUid = boundUid; e.boundAt = now; e.passwordSet = false;
      log.push(`tie ${email} ${googleSub} ${boundUid}`);
      return 'tied';
    },
    now: () => 1_700_000_000_000,
  };
  return { deps, entries, log };
}
const inside = (log: string[], what: string) => {
  const at = log.findIndex(l => l.startsWith(what));
  return at > log.findIndex(l => l.startsWith('lock')) && at < log.lastIndexOf('unlock');
};

// ── Their own Google account: recorded, on a fresh account ──────────────────
{
  const h = harness();
  check(await bindGoogle(h.deps, claims(), saysGoogle()) === 'again', 'a Google sign-in Google vouches for, on a listed address, is recorded, and told to sign in with it again');
  const e = h.entries.get(EMAIL)!;
  check(e.googleSub === 'g-pat' && e.boundUid === 'fresh-1' && e.boundAt === 1_700_000_000_000, 'Google\'s id, the fresh account and the time are recorded');
  check(e.boundUid !== 'acct-1', 'the account on record is never the one the caller arrived on');
  check(h.log.includes('replace acct-1 g-pat') && h.log.indexOf('replace acct-1 g-pat') < h.log.indexOf(`tie ${EMAIL} g-pat fresh-1`), 'the account is made afresh BEFORE the record is written');
  check(e.roles !== undefined && Object.keys(e).length === 5, 'and nothing else on the entry is touched');
  check(h.log[0] === 'google' && inside(h.log, 'getUser') && inside(h.log, 'list') && inside(h.log, 'replace') && inside(h.log, 'tie'),
    'Google\'s token is read first; then everything that looks at or changes the account or the entry happens under the one-at-a-time claim');

  // The same Google sign-in opens the fresh account.
  const onFresh = harness({ user: googleUser({ uid: 'fresh-1' }), entries: { [EMAIL]: { ...e } } });
  check(await bindGoogle(onFresh.deps, claims({ uid: 'fresh-1' }), saysGoogle()) === 'bound', 'from the account on record: "bound"');
  check(!onFresh.log.some(l => l.startsWith('replace') || l.startsWith('tie')), 'and nothing is replaced or written');
  check(await bindGoogle(onFresh.deps, { ...claims({ uid: undefined }), sub: 'fresh-1' }, saysGoogle()) === 'bound', 'the account id is read from sub when uid is absent');

  // Recorded, but this session is on some other account with the same Google id.
  const elsewhere = harness({ user: googleUser({ uid: 'acct-9' }), entries: { [EMAIL]: { ...e } } });
  check(await bindGoogle(elsewhere.deps, claims({ uid: 'acct-9' }), saysGoogle()) === 'again', 'recorded, but not on the account on record: made afresh again, never adopted as it is');
  check(elsewhere.entries.get(EMAIL)!.boundUid === 'fresh-1' && elsewhere.log.includes('replace acct-9 g-pat'), 'the account it arrived on is replaced');

  const caps = harness();
  check(await bindGoogle(caps.deps, claims({ email: 'Pat@School.test' }), saysGoogle()) === 'again' && caps.entries.get(EMAIL)!.googleSub === 'g-pat', 'capitals in the session\'s address do not matter');

  const gone = harness({ user: null });
  check(await bindGoogle(gone.deps, claims(), saysGoogle()) === 'again' && !gone.log.some(l => l.startsWith('list') || l.startsWith('replace')), 'a session whose account is gone is told to sign in again, and nothing is read or written');

  const off = harness({ fresh: null });
  check(await bindGoogle(off.deps, claims(), saysGoogle()) === 'mismatch' && off.entries.get(EMAIL)!.googleSub === undefined, 'when the fresh account must not be made, nothing is recorded');
  const disabled = harness({ user: googleUser({ disabled: true }) });
  check(await bindGoogle(disabled.deps, claims(), saysGoogle()) === 'mismatch' && !disabled.log.some(l => l.startsWith('list')), 'an account switched off on purpose is refused, and the list is not looked at');
}

// ── Only what Google says counts ────────────────────────────────────────────
for (const [label, google] of [
  ['no Google token at all', null],
  ['Google has NOT verified the address', saysGoogle({ emailVerified: false })],
  ['Google\'s token is for a different Google identity than the session\'s', saysGoogle({ sub: 'g-other' })],
  ['Google\'s address for the person is a different one from the session\'s', saysGoogle({ email: 'someone@gmail.test' })],
] as const) {
  const h = harness();
  check(await bindGoogle(h.deps, claims(), google) === 'mismatch', `${label}: refused`);
  check(!h.log.some(l => l.startsWith('lock') || l.startsWith('getUser') || l.startsWith('list') || l.startsWith('replace')) && h.entries.get(EMAIL)!.googleSub === undefined,
    `${label}: nothing is looked at, replaced or recorded`);
}
{
  // The sign-in service saying "verified" is not what counts, either way.
  const h = harness({ user: googleUser({ emailVerified: false }) });
  check(await bindGoogle(h.deps, claims({ email_verified: false }), saysGoogle()) === 'again', 'Google vouches, the sign-in service has not marked the address verified: still recorded (the fresh account is made verified)');
  const core = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'googleBinding.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  check(!/emailVerified(?!\))/.test(core.replace(/google\.emailVerified/g, '')) && !/email_verified ===|email_verified !==/.test(core) && !/providerData/.test(core),
    'bindGoogle reads "verified" from Google\'s token and from nowhere else');
}

// ── Other kinds of sign-in ──────────────────────────────────────────────────
for (const [label, c] of [
  ['a password sign-in', claims({ firebase: { sign_in_provider: 'password', identities: { 'google.com': ['g-pat'] } } })],
  ['an anonymous sign-in', claims({ firebase: { sign_in_provider: 'anonymous', identities: {} } })],
  ['a Google sign-in with no Google identity in the token', claims({ firebase: { sign_in_provider: 'google.com', identities: {} } })],
  ['a token with two Google identities', claims({ firebase: { sign_in_provider: 'google.com', identities: { 'google.com': ['g-pat', 'g-2'] } } })],
  ['a token with no firebase claim', { uid: 'acct-1', email: EMAIL, email_verified: true }],
  ['no account id', claims({ uid: undefined })],
] as const) {
  const h = harness();
  check(await bindGoogle(h.deps, c, saysGoogle()) === 'mismatch' && h.log.length === 0, `${label}: refused before anything is read`);
}
{
  const h = harness();
  check(await bindGoogle(h.deps, claims({ email: 'a/b@school.test' }), saysGoogle({ email: 'a/b@school.test' })) === 'mismatch' && !h.log.some(l => l.startsWith('lock')), 'an address with a slash in it: refused, and nothing is looked at');
  check(await bindGoogle(h.deps, claims({ email: undefined }), saysGoogle()) === 'mismatch', 'a session with no address: refused');
}
check(googleSubOf(claims()) === 'g-pat' && googleSubOf(claims({ firebase: { sign_in_provider: 'google.com', identities: { 'google.com': [7] } } })) === '', 'Google\'s id is read only from a plain Google sign-in');

// ── A record is never moved, and an entry is never made ─────────────────────
{
  const tied = harness({ entries: { [EMAIL]: { roles: ['director'], googleSub: 'g-someone-else', boundUid: 'acct-7', boundAt: 5 } } });
  check(await bindGoogle(tied.deps, claims(), saysGoogle()) === 'other-account', 'an entry that names a different Google account: refused');
  const e = tied.entries.get(EMAIL)!;
  check(e.googleSub === 'g-someone-else' && e.boundUid === 'acct-7' && e.boundAt === 5, 'and the record that was there is untouched');
  check(!tied.log.some(l => l.startsWith('replace')), 'and no account is replaced, because the caller is not on the recorded account');

  // The same, but the caller IS on the recorded account.
  const onIt = harness({ user: googleUser({ uid: 'acct-7' }), entries: { [EMAIL]: { roles: ['director'], googleSub: 'g-someone-else', boundUid: 'acct-7', boundAt: 5, passwordSet: true } } });
  check(await bindGoogle(onIt.deps, claims({ uid: 'acct-7' }), saysGoogle()) === 'other-account', 'a Google identity the entry does not name, ON the recorded account: still refused');
  const e2 = onIt.entries.get(EMAIL)!;
  check(onIt.log.includes('replace acct-7 g-someone-else') && e2.googleSub === 'g-someone-else' && e2.boundUid === 'fresh-1' && e2.passwordSet === false,
    'and the account is made afresh for the Google identity the ENTRY names: everyone on it is signed out, and any password on it is gone');

  const none = harness({ entries: {} });
  check(await bindGoogle(none.deps, claims(), saysGoogle()) === 'not-listed' && none.entries.size === 0, 'an address that is not listed: said so, and no entry is created');
  check(!none.log.some(l => l.startsWith('replace')), 'and the account of someone who is not listed is left alone');
}

// ── A failure is not an answer ──────────────────────────────────────────────
{
  const h = harness();
  const deps: BindDeps = { ...h.deps, async getUser() { throw Object.assign(new Error('down'), { code: 'auth/internal-error' }); } };
  let threw = false;
  try { await bindGoogle(deps, claims(), saysGoogle()); } catch { threw = true; }
  check(threw && h.log[h.log.length - 1] === 'unlock', 'an outage throws instead of answering "mismatch", and lets the claim go');
  const deps2: BindDeps = { ...h.deps, async replaceAccount() { throw new Error('half way'); } };
  threw = false;
  try { await bindGoogle(deps2, claims(), saysGoogle()); } catch { threw = true; }
  check(threw && h.entries.get(EMAIL)!.googleSub === undefined, 'a replacement that fails writes no record');
  const deps3: BindDeps = { ...h.deps, async verifyGoogle() { throw new Error('keys unreachable'); } };
  threw = false;
  try { await bindGoogle(deps3, claims(), saysGoogle()); } catch { threw = true; }
  check(threw, 'not being able to check Google\'s token throws; it is never treated as a yes');
}

// ── Google's own token, checked against keys ────────────────────────────────
{
  const PROJECT = '123456789012';
  const AUD = `${PROJECT}-abc123def.apps.googleusercontent.com`;
  const NOW = 1_800_000_000_000;
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const keys: GoogleJwk[] = [{ ...(publicKey.export({ format: 'jwk' }) as GoogleJwk), kid: 'key-1' }];
  const b64 = (v: unknown) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');
  const good = { iss: 'https://accounts.google.com', aud: AUD, sub: 'g-pat', email: 'Pat@School.test', email_verified: true, iat: NOW / 1000 - 10, exp: NOW / 1000 + 3000 };
  const token = (payload: Record<string, unknown> = good, header: Record<string, unknown> = { alg: 'RS256', kid: 'key-1', typ: 'JWT' }, key = privateKey) => {
    const body = `${b64(header)}.${b64(payload)}`;
    return `${body}.${createSign('RSA-SHA256').update(body).sign(key).toString('base64url')}`;
  };
  const read = (t: unknown, over: Partial<{ keys: GoogleJwk[]; projectNumber: string; now: number }> = {}) =>
    verifyGoogleIdToken(t, { keys, projectNumber: PROJECT, now: NOW, ...over });

  const ok = read(token());
  check(ok?.sub === 'g-pat' && ok.email === 'pat@school.test' && ok.emailVerified === true, 'a token Google signed for this project is read: who, their address (lowercased), verified');
  check(read(token({ ...good, iss: 'accounts.google.com' })) !== null, 'both spellings of Google as the issuer are accepted');
  check(read(token({ ...good, email_verified: false }))?.emailVerified === false, 'an address Google has not verified comes back as not verified');
  check(read(token({ ...good, email_verified: 'true' }))?.emailVerified === false, '"verified" must be exactly true');
  for (const [label, t] of [
    ['signed by some other key', token(good, undefined, other.privateKey)],
    ['a key id that is not one of Google\'s', token(good, { alg: 'RS256', kid: 'key-2' })],
    ['no key id', token(good, { alg: 'RS256' })],
    ['an "alg" of none', `${b64({ alg: 'none', kid: 'key-1' })}.${b64(good)}.`],
    ['signed another way with the public key', token(good, { alg: 'HS256', kid: 'key-1' })],
    ['its contents changed after signing', (() => { const [h, , s] = token().split('.'); return `${h}.${b64({ ...good, email: 'someone@gmail.test' })}.${s}`; })()],
    ['issued by someone else', token({ ...good, iss: 'https://example.test' })],
    ['issued for another project\'s sign-in', token({ ...good, aud: '999999999999-abc.apps.googleusercontent.com' })],
    ['issued for something that only starts like this project\'s number', token({ ...good, aud: `${PROJECT}9-abc.apps.googleusercontent.com` })],
    ['an audience that is a list', token({ ...good, aud: [AUD] })],
    ['expired', token({ ...good, exp: NOW / 1000 - 1 })],
    ['no expiry', token({ ...good, exp: undefined })],
    ['issued in the future', token({ ...good, iat: NOW / 1000 + 4000 })],
    ['no Google id', token({ ...good, sub: '' })],
    ['no address', token({ ...good, email: undefined })],
    ['not three parts', 'abc.def'],
    ['not text', 42],
    ['nothing', undefined],
    ['far too long', `${token()}${'x'.repeat(5000)}`],
  ] as const) {
    check(read(t) === null, `a token that is ${label}: not read`);
  }
  check(read(token(), { keys: [] }) === null && read(token(), { projectNumber: '' }) === null, 'with no keys, or no project number, nothing is read');
  check(isProjectClientId(AUD, PROJECT) && !isProjectClientId(`x${AUD}`, PROJECT) && !isProjectClientId(`${AUD}.evil.test`, PROJECT) && !isProjectClientId(AUD, '12'), 'a sign-in client id is this project\'s only when it is exactly the project number, a dash, letters and digits, and Google\'s ending');
}

// ── The fresh account ───────────────────────────────────────────────────────
{
  function fakeAuth(start: AccountRecord[], opts: { squatters?: number; failLink?: 'placeholder' | 'real'; failEmail?: boolean } = {}) {
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
        const u: AccountRecord = { uid: `new-${++n}`, emailVerified: false, disabled: false, displayName: props.displayName, providerData: [] };
        accounts.set(u.uid, u);
        log.push(`create ${u.uid}`);
        return u;
      },
      async updateUser(uid, props) {
        const u = accounts.get(uid);
        if (!u) throw notFound();
        if (props.providerToLink) {
          const placeholder = props.providerToLink.uid.startsWith('placeholder-');
          if (opts.failLink === (placeholder ? 'placeholder' : 'real')) throw Object.assign(new Error('refused'), { code: 'auth/insufficient-permission' });
          if ([...accounts.values()].some(a => a.providerData.some(p => p.providerId === 'google.com' && p.uid === props.providerToLink!.uid))) throw Object.assign(new Error('linked'), { code: 'auth/provider-already-linked' });
          u.providerData.push(props.providerToLink);
          log.push(`link ${uid} ${placeholder ? 'placeholder' : props.providerToLink.uid}`);
        }
        if (props.providersToUnlink) {
          u.providerData = u.providerData.filter(p => !props.providersToUnlink!.includes(p.providerId));
          log.push(`unlink ${uid}`);
        }
        if (props.email) {
          if (opts.failEmail) throw Object.assign(new Error('down'), { code: 'auth/internal-error' });
          if (squatters > 0) {
            squatters--;
            const s: AccountRecord = { uid: `squat-${squatters}`, email: props.email, emailVerified: false, disabled: false, providerData: [] };
            accounts.set(s.uid, s);
          }
          if ([...accounts.values()].some(a => a.email === props.email && a.uid !== uid)) throw Object.assign(new Error('exists'), { code: 'auth/email-already-exists' });
          u.email = props.email; u.emailVerified = props.emailVerified === true;
          if (props.password) u.providerData.push({ providerId: 'password', email: props.email });
          log.push(`address ${uid}`);
        }
        return u;
      },
      async deleteUser(uid) {
        if (!accounts.delete(uid)) throw notFound();
        log.push(`delete ${uid}`);
      },
    };
    return { auth, accounts, log };
  }
  const old: AccountRecord = googleUser({ uid: 'old-1' });
  const google = { providerId: 'google.com', uid: 'g-pat', email: EMAIL };
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

  const a = fakeAuth([old]);
  const uid = await freshAccount(a.auth, { email: EMAIL, alsoDelete: 'old-1', google, displayName: old.displayName });
  check(uid === 'new-1' && !a.accounts.has('old-1'), 'the account that stood on the address is deleted, and a new one is made');
  const made = a.accounts.get('new-1')!;
  check(made.email === EMAIL && made.emailVerified && made.displayName === 'Pat Example' && made.providerData.length === 1 && made.providerData[0].uid === 'g-pat', 'the new one has the address, the name, and only the one Google identity');
  check(same(a.log, ['create new-1', 'link new-1 placeholder', 'unlink new-1', 'delete old-1', 'address new-1', 'link new-1 g-pat']),
    'in this order: the new account is made and the attach step proven on it BEFORE the old account is deleted');

  // The project does not allow the attach step: found out before anything is touched.
  const refused = fakeAuth([old], { failLink: 'placeholder' });
  let threw = false;
  try { await freshAccount(refused.auth, { email: EMAIL, alsoDelete: 'old-1', google }); } catch { threw = true; }
  check(threw && refused.accounts.size === 1 && same(refused.accounts.get('old-1'), old) && !refused.log.some(l => l.startsWith('delete old')), 'if attaching a Google identity is refused here, the person still has the account they had, untouched, and nothing new is left behind');

  const moved = fakeAuth([googleUser({ uid: 'caller', email: 'elsewhere@school.test' }), googleUser({ uid: 'holder', providerData: [] })]);
  await freshAccount(moved.auth, { email: EMAIL, alsoDelete: 'caller', google });
  check(!moved.accounts.has('caller') && !moved.accounts.has('holder'), 'both the named account and whatever holds the address are deleted');

  const none = fakeAuth([]);
  check(await freshAccount(none.auth, { email: EMAIL, alsoDelete: 'not-there' }) === 'new-1', 'nothing standing there, and a named account already gone: still made');
  const withPassword = fakeAuth([]);
  await freshAccount(withPassword.auth, { email: EMAIL, password: 'a long enough password' });
  check(same(withPassword.accounts.get('new-1')!.providerData.map(p => p.providerId), ['password']) && !withPassword.log.some(l => l.startsWith('link')), 'with a password and no Google identity: the password, and no attach step at all');

  const off = fakeAuth([googleUser({ uid: 'off-1', disabled: true })]);
  check(await freshAccount(off.auth, { email: EMAIL, alsoDelete: 'off-1', google }) === null && off.accounts.has('off-1') && off.log.length === 0,
    'an account switched off on purpose is left exactly as it is, and nothing is made');

  const raced = fakeAuth([old], { squatters: FRESH_ACCOUNT_TRIES - 1 });
  check(await freshAccount(raced.auth, { email: EMAIL, google }) !== null && [...raced.accounts.values()].filter(x => x.email === EMAIL).length === 1,
    'an account that keeps appearing on the address in the gap is deleted and the move tried again');
  const swamped = fakeAuth([old], { squatters: FRESH_ACCOUNT_TRIES });
  threw = false;
  try { await freshAccount(swamped.auth, { email: EMAIL, google }); } catch { threw = true; }
  check(threw && !swamped.accounts.has('new-1'), 'and after a bounded number of tries it gives up rather than loop, leaving nothing half-made');

  const half = fakeAuth([old], { failLink: 'real' });
  threw = false;
  try { await freshAccount(half.auth, { email: EMAIL, google }); } catch { threw = true; }
  check(threw && half.accounts.size === 0, 'if the real Google identity cannot be attached at the end, the half-made account is removed (the address is free for the person\'s next sign-in)');
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
  check((handler.match(/req\.body/g) ?? []).length === 1 && /runBindGoogle\(googleBindingStore\(getFirestore\(\), getAuth\(\), verifyGoogleLive\), claims, req\.body\?\.googleIdToken\)/.test(handler),
    'the one thing it reads from the request body is Google\'s token, which the real check then verifies; who to record comes from the two verified tokens alone');
  const logged = [...handler.matchAll(/console\.\w+\(([^;]*)\);/g)].map(m => m[1].replace(/'[^']*'|`[^`]*`/g, ''));
  check(logged.length === 1 && !/email|token|claims|body|err\)|err,/.test(logged[0]), 'it logs an error code and nothing else');

  const store = noComments(readFileSync(resolve(here, 'googleBindingStore.ts'), 'utf8'));
  check(/runTransaction/.test(store) && /tx\.update\(ref, \{ googleSub, boundUid, boundAt: now, passwordSet: false \}\)/.test(store) && !/\.set\(/.test(store),
    'the record is written with update() inside one transaction, so it can never put anyone on the list, and it marks the fresh account as having no password');
  check(/if \(typeof existing === 'string' && existing && existing !== googleSub\) return 'other-account'/.test(store), 'and never over a record of a different Google account');
  check(/replaceAccount\(spec\) \{ return freshAccount\(auth, spec\); \}/.test(squash(store)) && /lock: entryLock\(db\)/.test(store), 'the store makes the account through freshAccount and takes its claim through entryLock');
  const storeRaw = readFileSync(resolve(here, 'googleBindingStore.ts'), 'utf8');
  check(/verifyGoogleIdToken\(token, \{ keys: await googleKeys\(false\), projectNumber: number, now: Date\.now\(\) \}\)/.test(storeRaw)
    && storeRaw.includes("const KEYS_URL = 'https://www.googleapis.com/oauth2/v3/certs';") && /numeric-project-id/.test(storeRaw),
  'the deployed check uses Google\'s published keys and this project\'s own number');
  const core = noComments(readFileSync(resolve(here, 'googleBinding.ts'), 'utf8'));
  check(!/boundUid: uid|tie\(email, google\.sub, uid|tie\(email, entry\.googleSub, uid/.test(core), 'bindGoogle never records the account the caller arrived on');
  check(core.indexOf('deps.verifyGoogle(') < core.indexOf('deps.lock(') && core.indexOf('deps.lock(') < core.indexOf('deps.getUser('), 'Google\'s token is checked before the claim is taken, and the account is looked at only under it');
  const lock = noComments(readFileSync(resolve(here, 'entryLock.ts'), 'utf8'));
  check(/db\.doc\(`signInLocks\/\$\{email\}`\)/.test(lock) && /runTransaction/.test(lock) && /finally \{ await ref\.delete\(\)/.test(squash(lock)), 'the claim is one document per address, taken in a transaction and always let go');
  for (const file of ['googleBinding.ts', 'googleBindingStore.ts', 'freshAccount.ts', 'entryLock.ts', 'googleIdToken.ts']) {
    check(!/console\./.test(noComments(readFileSync(resolve(here, file), 'utf8'))), `${file} logs nothing`);
  }

  const lines = (f: string) => readFileSync(resolve(repo, f), 'utf8').split('\n').filter(l => !l.trim().startsWith('#')).join('\n');
  const deployFunctions = lines('.github/workflows/deploy-functions.yml');
  check(/functions:bindGoogle\b/.test(deployFunctions), 'bindGoogle is in the deploy list');
  // The checks themselves stay wired in: no run would notice if these two lines went.
  check(/\n +npm --prefix functions run selfcheck\n/.test(deployFunctions), 'the functions deploy still runs the self-check chain first');
  const deployRules = lines('.github/workflows/deploy-rules.yml');
  check(/\n {2}rules-checks:\n {4}uses: \.\/\.github\/workflows\/rules-checks\.yml\n/.test(deployRules) && /\n {2}deploy-rules:\n {4}needs: rules-checks\n/.test(deployRules),
    'the rules deploy still waits on the rules checks');
  check(/\n {2}rules-checks:\n {4}uses: \.\/\.github\/workflows\/rules-checks\.yml\n/.test(deployFunctions) && /\n {2}deploy:\n {4}needs: rules-checks\n/.test(deployFunctions),
    'and so does the functions deploy');
  const rulesChecks = lines('.github/workflows/rules-checks.yml');
  check(/"node scripts\/google-binding\.emulator-proof\.mjs"/.test(rulesChecks) && /"node scripts\/rules-verdicts\.emulator-check\.mjs visitor"/.test(rulesChecks),
    'and the rules checks still ask the real rules on the emulators');
  // The server's notes for the Owner: read by the Owner, written by no browser.
  const allRules = readFileSync(resolve(repo, 'firestore.rules'), 'utf8');
  check(/match \/serverConfig\/\{doc\}\s*\{ allow read: if isOwner\(\); allow write: if false; \}/.test(allRules)
    && (allRules.match(/match \/serverConfig/g) ?? []).length === 1,
  'serverConfig: the Owner may read, no browser may write, and one rule names it');
  const pkg = readFileSync(resolve(repo, 'functions/package.json'), 'utf8');
  check(/src\/googleBinding\.selfcheck\.ts/.test(pkg), 'and this file is in the functions self-check chain');
  const action = readFileSync(resolve(repo, '.github/actions/self-checks/action.yml'), 'utf8');
  check(/run: node --experimental-strip-types functions\/src\/googleBinding\.selfcheck\.ts/.test(action), 'and in the shared self-check list every build runs');

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
  check(block.includes('allow update: if directorEditAllowed(email) && bindingGuard(email);'), 'every update goes through the guard: two named conditions, joined once');
  check((block.match(/allow update/g) ?? []).length === 1 && (block.match(/allow create/g) ?? []).length === 1 && !/allow write/.test(block), 'and there is exactly one update rule and one create rule for an entry');
  check((rules.match(/match \/directors\//g) ?? []).length === 1, 'and exactly one place that matches an entry');
  check(!/match \/signInLocks/.test(rules), 'no rule matches the one-at-a-time claims: they are the server\'s alone');
  const selfList = fn('directorEditAllowed').match(/hasOnly\(\[([^\]]*)\]\)/)?.[1] ?? 'googleSub';
  check(!/googleSub|boundUid|boundAt|passwordSet/.test(selfList), 'the self-service key list does not name the record');

  // The hand tool that writes one field refuses the places the server keeps for itself.
  const tool = readFileSync(resolve(repo, 'scripts/set-doc-field.mjs'), 'utf8');
  for (const col of ['directors', 'serverConfig', 'signInLocks', 'passwordSetup', 'passwordSetupLimits', 'feedSecrets']) {
    check(new RegExp(`'${col}'`).test(tool.slice(tool.indexOf('const REFUSED'), tool.indexOf('const REFUSED') + 600)), `Fix One Field refuses ${col}`);
  }

  // The app's side.
  const gate = noComments(readFileSync(resolve(repo, 'src/director/components/AuthGate.tsx'), 'utf8'));
  check((gate.match(/bindGoogleAccount\(/g) ?? []).length === 1, 'the app asks the server in exactly one place');
  const record = gate.slice(gate.indexOf('async function recordWith('), gate.indexOf('async function confirmGoogle('));
  check(/GoogleAuthProvider\.credentialFromResult\(result\)/.test(record) && /if \(!cred\?\.idToken \|\| !asksServer\(email\)\) return/.test(squash(record)),
    'and only with Google\'s token from a real sign-in, and only when asksServer() says so');
  check(/const asksServer = \(email: string\) => BREAK_GLASS_EMAILS\.includes\(email\);/.test(gate), 'FIRST LIVE RUN: only the founding addresses ask (remove this line\'s condition in the follow-up change, and this check with it)');
  check(!/googleSub:|boundUid:|boundAt:/.test(gate), 'the app never writes the record');
}

if (failures) {
  console.error(`google binding self-check: ${failures} failure(s)`);
  process.exit(1);
}
console.log('google binding self-check: ok');
