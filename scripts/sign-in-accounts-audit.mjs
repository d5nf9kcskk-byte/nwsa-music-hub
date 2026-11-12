#!/usr/bin/env node
/**
 * sign-in-accounts-audit.mjs (#google-binding)
 *
 * One question about the Hub's sign-in accounts, answered in one word:
 * is every account Google's own account for the address it carries?
 *
 *   OK             every sign-in account has exactly one Google identity, and
 *                  Google's own address for it is the account's address.
 *   REVIEW NEEDED  at least one account is something else: its address is
 *                  not the one Google has for it, or it is not a plain
 *                  Google account at all.
 *
 * An account that needs review cannot be tied to a Directors entry
 * (functions/src/googleBinding.ts refuses it), so the person behind it would
 * be asked to see the Owner once the rules require the tie. Run this before
 * that change is merged, and again any time.
 *
 * It prints THAT ONE WORD and nothing else. This repo and its Actions logs
 * are public, and an account's address has no business in either. To see
 * which accounts, run it on a private machine with DETAILS=1; it refuses to
 * print details inside GitHub Actions.
 *
 * Read-only: it lists accounts and changes nothing.
 *
 *   node scripts/sign-in-accounts-audit.mjs              (needs FIREBASE_SERVICE_ACCOUNT_JSON)
 *   node scripts/sign-in-accounts-audit.mjs --selfcheck  (no credentials; checks the rule below)
 */

/**
 * Is this account anything other than Google's own account for its address?
 * The same rule the server applies when it ties a person to their account.
 */
export function needsReview(user) {
  const email = (user.email ?? '').toLowerCase();
  const providers = user.providerData ?? [];
  const google = providers.filter(p => p.providerId === 'google.com');
  if (!email || providers.length !== 1 || google.length !== 1) return true;
  return (google[0].email ?? '').toLowerCase() !== email;
}

if (process.argv.includes('--selfcheck')) {
  const g = (email, googleEmail) => ({ email, providerData: [{ providerId: 'google.com', uid: 'g', email: googleEmail }] });
  const cases = [
    [g('pat@school.test', 'pat@school.test'), false, 'Google\'s own account for its address'],
    [g('Pat@School.test', 'pat@SCHOOL.test'), false, 'capitals do not matter'],
    [g('pat@school.test', 'someone@gmail.test'), true, 'Google has a different address for it'],
    [g('pat@school.test', undefined), true, 'Google reports no address for it'],
    [{ email: 'pat@school.test', providerData: [{ providerId: 'password', email: 'pat@school.test' }] }, true, 'not a Google account'],
    [{ email: 'pat@school.test', providerData: [] }, true, 'no sign-in identity at all'],
    [{ providerData: [] }, true, 'an account with no address'],
    [{ email: 'pat@school.test', providerData: [{ providerId: 'google.com', email: 'pat@school.test' }, { providerId: 'password', email: 'pat@school.test' }] }, true, 'a Google account with something else on it'],
  ];
  let failed = 0;
  for (const [user, want, label] of cases) {
    if (needsReview(user) !== want) { failed++; console.error(`  ✗ ${label}`); }
  }
  // The one-word promise: the only things this file can print about real
  // accounts are the two words, unless DETAILS is asked for outside Actions.
  const src = (await import('node:fs')).readFileSync(new URL(import.meta.url), 'utf8');
  const live = src.slice(src.lastIndexOf('// ── The real run'));
  const prints = [...live.matchAll(/console\.log\(([^)]*)\)/g)].map(m => m[1]);
  const ok = prints.every(p => p === "'OK'" || p === "'REVIEW NEEDED'" || p === 'line');
  if (!ok || !/process\.env\.GITHUB_ACTIONS/.test(live)) { failed++; console.error('  ✗ the real run prints only OK or REVIEW NEEDED, and refuses details inside Actions'); }
  console.log(failed ? `sign-in accounts audit self-check: ${failed} failure(s)` : 'sign-in accounts audit self-check: ok');
  process.exit(failed ? 1 : 0);
}

// ── The real run ────────────────────────────────────────────────────────────
const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!raw) {
  console.error('FIREBASE_SERVICE_ACCOUNT_JSON is not set. Aborting.');
  process.exit(1);
}
const details = process.env.DETAILS === '1';
if (details && process.env.GITHUB_ACTIONS) {
  console.error('DETAILS=1 is refused inside GitHub Actions: its logs are public. Run it on a private machine.');
  process.exit(1);
}
const { initializeApp, cert } = await import('firebase-admin/app');
const { getAuth } = await import('firebase-admin/auth');
initializeApp({ credential: cert(JSON.parse(raw)) });
const auth = getAuth();

const flagged = [];
let pageToken;
do {
  const page = await auth.listUsers(1000, pageToken);
  for (const user of page.users) if (needsReview(user)) flagged.push(user);
  pageToken = page.pageToken;
} while (pageToken);

if (details) {
  for (const user of flagged) {
    const line = `${user.email ?? '(no address)'}  |  ${(user.providerData ?? []).map(p => `${p.providerId}:${p.email ?? '-'}`).join(', ') || '(no identity)'}`;
    console.log(line);
  }
}
if (flagged.length) console.log('REVIEW NEEDED');
else console.log('OK');
