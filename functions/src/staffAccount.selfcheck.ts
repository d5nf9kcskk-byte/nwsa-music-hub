/**
 * The Hub makes the sign-in account (#password-sign-in). Run:
 *   node --experimental-strip-types functions/src/staffAccount.selfcheck.ts
 *
 * Drives ensureStaffAccount with a fake sign-in service and pins:
 *   • a listed address with no account gets an EMPTY one: no password, and
 *     never marked verified by the Hub;
 *   • an account with no password (everyone who only uses Google) is left
 *     exactly as it is;
 *   • a password never survives being listed, whatever else is on the account;
 *   • the backfill's ordinary run never takes a password away, and a dry run
 *     changes nothing;
 *   • a document id that is not a lowercased email is not acted on;
 *   • the trigger is wired to a directors doc being CREATED, with replacement
 *     on, and no client code creates an account or sends the verification
 *     email on its own.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  carriesPassword, ensureStaffAccount, isListedEmail, type StaffAuth, type StaffUser,
} from './staffAccount.ts';

let failures = 0;
function check(cond: unknown, msg: string) {
  if (!cond) { failures++; console.error(`  ✗ ${msg}`); }
}

interface FakeUser extends StaffUser { email: string; emailVerified: boolean }

function fakeAuth(seed: FakeUser[] = [], opts: { racer?: FakeUser } = {}) {
  const users = new Map(seed.map(u => [u.email, u]));
  const calls: string[] = [];
  let n = 0;
  let racer = opts.racer;
  const auth: StaffAuth = {
    async getUserByEmail(email) {
      calls.push(`get ${email}`);
      const u = users.get(email);
      if (!u) throw Object.assign(new Error('no user'), { code: 'auth/user-not-found' });
      return u;
    },
    async createUser(props) {
      calls.push(`create ${JSON.stringify(props)}`);
      if (racer) { // someone makes an account at the same instant, once
        users.set(racer.email, racer);
        racer = undefined;
      }
      if (users.has(props.email)) throw Object.assign(new Error('exists'), { code: 'auth/email-already-exists' });
      const u: FakeUser = { uid: `hub-${++n}`, email: props.email, emailVerified: props.emailVerified, providerData: [] };
      users.set(props.email, u);
      return u;
    },
    async deleteUser(uid) {
      calls.push(`delete ${uid}`);
      for (const [email, u] of users) if (u.uid === uid) users.delete(email);
    },
  };
  return { auth, users, calls };
}

const google = (email: string): FakeUser => ({ uid: `g-${email}`, email, emailVerified: true, providerData: [{ providerId: 'google.com' }] });
const password = (email: string, emailVerified: boolean): FakeUser => ({ uid: `p-${email}`, email, emailVerified, passwordHash: 'x', providerData: [{ providerId: 'password' }] });
const both = (email: string): FakeUser => ({ uid: `b-${email}`, email, emailVerified: true, passwordHash: 'x', providerData: [{ providerId: 'google.com' }, { providerId: 'password' }] });

const LISTING = { replacePassworded: true };
const SWEEP = { replacePassworded: false };

// ── A listed address with no account ────────────────────────────────────────
{
  const { auth, users, calls } = fakeAuth();
  check(await ensureStaffAccount(auth, 'new@school.test', LISTING) === 'created', 'no account → created');
  const made = users.get('new@school.test') as FakeUser;
  check(made && !carriesPassword(made), 'the account the Hub makes carries no password');
  check(made && made.emailVerified === false, 'the Hub never marks an address verified');
  check(calls.some(c => c === 'create {"email":"new@school.test","emailVerified":false}'), 'createUser is passed the email and nothing else of substance');
  check(await ensureStaffAccount(auth, 'new@school.test', LISTING) === 'exists', 'running it twice leaves the empty account alone');
  check(users.get('new@school.test')?.uid === made.uid, 'and it is still the same account');
}

// ── An account with no password is left alone ───────────────────────────────
{
  const g = google('ann@school.test');
  const { auth, users, calls } = fakeAuth([g]);
  check(await ensureStaffAccount(auth, 'ann@school.test', LISTING) === 'exists', 'Google-only account → exists');
  check(users.get('ann@school.test') === g, 'a Google-only account is untouched');
  check(!calls.some(c => c.startsWith('delete') || c.startsWith('create')), 'and nothing was deleted or created');
}

// ── A password never survives being listed ──────────────────────────────────
for (const [label, existing] of [
  ['password only, unverified', password('x@school.test', false)],
  ['password only, verified', password('x@school.test', true)],
  ['Google and a password', both('x@school.test')],
] as const) {
  const { auth, users } = fakeAuth([existing]);
  check(await ensureStaffAccount(auth, 'x@school.test', LISTING) === 'replaced', `${label} → replaced`);
  const now = users.get('x@school.test') as FakeUser;
  check(now && now.uid !== existing.uid, `${label}: the old account is gone`);
  check(now && !carriesPassword(now) && now.emailVerified === false, `${label}: what stands in its place is empty and unverified`);
}

// ── An account appearing at the same instant is looked at again, not trusted ─
{
  const { auth, users } = fakeAuth([], { racer: password('race@school.test', false) });
  check(await ensureStaffAccount(auth, 'race@school.test', LISTING) === 'replaced', 'an account that appears mid-run is replaced too');
  const now = users.get('race@school.test') as FakeUser;
  check(now && !carriesPassword(now), 'and the address ends with an empty account');
}

// ── The backfill's ordinary run, and a dry run ──────────────────────────────
{
  const p = password('kept@school.test', true);
  const { auth, users, calls } = fakeAuth([p]);
  check(await ensureStaffAccount(auth, 'kept@school.test', SWEEP) === 'has-password', 'sweep: a password is reported, not removed');
  check(users.get('kept@school.test') === p && !calls.some(c => c.startsWith('delete')), 'sweep: the account is untouched');
  check(await ensureStaffAccount(auth, 'none@school.test', { ...SWEEP, dryRun: true }) === 'missing', 'dry run: a missing account is reported');
  check(!users.has('none@school.test'), 'dry run: and not created');
  check(await ensureStaffAccount(auth, 'kept@school.test', { ...LISTING, dryRun: true }) === 'has-password', 'dry run: never replaces, even with replacement on');
  check(users.get('kept@school.test') === p, 'dry run: the account is untouched');
  check(await ensureStaffAccount(auth, 'none@school.test', SWEEP) === 'created', 'sweep: a missing account is made');
}

// ── Ids that are not ours ───────────────────────────────────────────────────
{
  const { auth, calls } = fakeAuth();
  for (const id of ['', 'not-an-email', 'Mixed@School.test', 'a b@school.test', 'x@nodot']) {
    check(!isListedEmail(id), `"${id}" is not a listed email`);
    check(await ensureStaffAccount(auth, id, LISTING) === 'skipped', `"${id}" → skipped`);
  }
  check(calls.length === 0, 'and the sign-in service was never called for them');
  check(isListedEmail('first.last+tag@school.example.org'), 'an ordinary lowercased address is accepted');
}

// ── A failure that is not "no such user" is not swallowed ───────────────────
{
  let wrote = false;
  const auth: StaffAuth = {
    async getUserByEmail() { throw Object.assign(new Error('down'), { code: 'auth/internal-error' }); },
    async createUser(props) { wrote = true; return { uid: 'x', providerData: [], ...props }; },
    async deleteUser() { wrote = true; },
  };
  let threw = false;
  try { await ensureStaffAccount(auth, 'a@school.test', LISTING); } catch { threw = true; }
  check(threw, 'an outage throws (so the run is logged as failed) instead of pretending the account is missing');
  check(!wrote, 'and nothing is created or deleted on the strength of a failed look');
}

// ── The wiring, read from the source ────────────────────────────────────────
{
  const here = dirname(fileURLToPath(import.meta.url));
  const repo = resolve(here, '../..');
  const index = readFileSync(resolve(repo, 'functions/src/index.ts'), 'utf8');
  const block = index.slice(index.indexOf('export const staffAccountOnListing'));
  const body = block.slice(0, block.indexOf('\n  });') + 1);
  check(index.includes('export const staffAccountOnListing'), 'index.ts exports staffAccountOnListing');
  check(/\.document\('directors\/\{email\}'\)\s*\.onCreate\(/.test(body), 'it fires when a directors doc is CREATED');
  check(/replacePassworded:\s*true/.test(body), 'with replacement on');
  check(!/console\.(log|error|warn)\([^)]*params\.email/.test(body) && !/\$\{email\}/.test(body), 'and it logs no address (function logs are not for staff emails)');

  const core = readFileSync(resolve(here, 'staffAccount.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  check(!/password\s*:/.test(core), 'the core never sets a password');
  check(!/emailVerified:\s*true/.test(core), 'the core never marks an address verified');

  // The app side of the same promise: it never creates an account, and the
  // verification email goes out on a person's press, never from an effect.
  const gate = readFileSync(resolve(repo, 'src/director/components/AuthGate.tsx'), 'utf8');
  check(!gate.includes('createUserWithEmailAndPassword'), 'AuthGate never creates an account');
  const sends = [...gate.matchAll(/sendEmailVerification\(/g)].length;
  check(sends <= 1, 'AuthGate sends the verification email from at most one place');
  if (sends === 1) {
    const fn = gate.slice(gate.lastIndexOf('async function', gate.indexOf('sendEmailVerification(')), gate.indexOf('sendEmailVerification('));
    check(/async function sendVerifyLink\(/.test(fn), 'and that place is the button handler sendVerifyLink, not an effect');
    // Every mention of it in code is its own definition or a button's onClick.
    const code = gate.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    const elsewhere = code
      .replace(/async function sendVerifyLink\(/g, '')
      .replace(/onClick=\{sendVerifyLink\}/g, '');
    check(!elsewhere.includes('sendVerifyLink'), 'which nothing calls but a button press');
  }
}

if (failures) {
  console.error(`staff account self-check: ${failures} failure(s)`);
  process.exit(1);
}
console.log('staff account self-check: ok');
