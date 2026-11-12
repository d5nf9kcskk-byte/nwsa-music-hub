#!/usr/bin/env node
/**
 * sign-in-accounts-audit.mjs (#google-binding)
 *
 * One question about the Hub's sign-in accounts, answered in one word:
 * is every account what the Hub expects it to be?
 *
 *   OK             every sign-in account has exactly one Google identity,
 *                  Google's own address for it is the account's address, and
 *                  where the Directors entry for that address records which
 *                  account is the person's, this is that account.
 *   REVIEW NEEDED  at least one account is something else.
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
 * Read-only: it lists accounts and entries and changes nothing.
 *
 *   node scripts/sign-in-accounts-audit.mjs              (needs FIREBASE_SERVICE_ACCOUNT_JSON)
 *   node scripts/sign-in-accounts-audit.mjs --selfcheck  (no credentials; checks the rule below)
 */

/**
 * Is this account anything other than what the Hub expects? `entry` is the
 * Directors entry for the account's address, when there is one.
 */
export function needsReview(user, entry) {
  const email = (user.email ?? '').toLowerCase();
  const providers = user.providerData ?? [];
  const google = providers.filter(p => p.providerId === 'google.com');
  if (!email || providers.length !== 1 || google.length !== 1) return true;
  if ((google[0].email ?? '').toLowerCase() !== email) return true;
  // The entry records which account is this person's: it must be this one.
  if (entry?.googleSub && google[0].uid !== entry.googleSub) return true;
  if (entry?.boundUid && user.uid !== entry.boundUid) return true;
  return false;
}

if (process.argv.includes('--selfcheck')) {
  const g = (email, googleEmail, over = {}) => ({ uid: 'u1', email, providerData: [{ providerId: 'google.com', uid: 'g1', email: googleEmail }], ...over });
  const tied = { googleSub: 'g1', boundUid: 'u1' };
  const cases = [
    [g('pat@school.test', 'pat@school.test'), undefined, false, 'Google\'s own account for its address'],
    [g('Pat@School.test', 'pat@SCHOOL.test'), undefined, false, 'capitals do not matter'],
    [g('pat@school.test', 'someone@gmail.test'), undefined, true, 'Google has a different address for it'],
    [g('pat@school.test', undefined), undefined, true, 'Google reports no address for it'],
    [{ email: 'pat@school.test', providerData: [{ providerId: 'password', email: 'pat@school.test' }] }, undefined, true, 'not a Google account'],
    [{ email: 'pat@school.test', providerData: [] }, undefined, true, 'no sign-in identity at all'],
    [{ providerData: [] }, undefined, true, 'an account with no address'],
    [{ email: 'pat@school.test', providerData: [{ providerId: 'google.com', email: 'pat@school.test' }, { providerId: 'password', email: 'pat@school.test' }] }, undefined, true, 'a Google account with something else on it'],
    [g('pat@school.test', 'pat@school.test'), tied, false, 'the account its entry records'],
    [g('pat@school.test', 'pat@school.test'), { googleSub: 'g-other', boundUid: 'u1' }, true, 'its Google id is not the one its entry records'],
    [g('pat@school.test', 'pat@school.test'), { googleSub: 'g1', boundUid: 'u-other' }, true, 'it is not the account its entry records'],
    [g('pat@school.test', 'pat@school.test'), {}, false, 'an entry that records nothing yet'],
  ];
  let failed = 0;
  for (const [user, entry, want, label] of cases) {
    if (needsReview(user, entry) !== want) { failed++; console.error(`  ✗ ${label}`); }
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
const { getFirestore } = await import('firebase-admin/firestore');
initializeApp({ credential: cert(JSON.parse(raw)) });
const auth = getAuth();

// What each Directors entry records about its person's account.
const entries = new Map();
for (const d of (await getFirestore().collection('directors').get()).docs) {
  const text = v => (typeof v === 'string' && v ? v : undefined);
  entries.set(d.id.toLowerCase(), { googleSub: text(d.get('googleSub')), boundUid: text(d.get('boundUid')) });
}

const flagged = [];
let pageToken;
do {
  const page = await auth.listUsers(1000, pageToken);
  for (const user of page.users) if (needsReview(user, entries.get((user.email ?? '').toLowerCase()))) flagged.push(user);
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
