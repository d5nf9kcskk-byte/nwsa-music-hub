#!/usr/bin/env node
/**
 * Self-check for the Drive credential choice (#concert-checkin).
 * Run: node scripts/drive-auth.selfcheck.mjs
 *
 * The one thing worth pinning is the HALF-configured case. A silent fallback
 * there would put the sync back on the service account, which cannot write to
 * a personal My Drive folder — and the run would report a storage quota error
 * rather than the secret nobody set.
 */
import { driveAuthMode, driveAccountLabel, DRIVE_OAUTH_VARS } from './lib/driveAuth.mjs';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const all = { DRIVE_OAUTH_CLIENT_ID: 'id', DRIVE_OAUTH_CLIENT_SECRET: 'secret', DRIVE_OAUTH_REFRESH_TOKEN: 'token' };

assert(driveAuthMode(all).mode === 'oauth', 'all three set → oauth');
assert(driveAuthMode({}).mode === 'service-account', 'none set → service account');
assert(driveAuthMode({ FOO: '1' }).mode === 'service-account', 'unrelated vars are not OAuth');

for (const k of DRIVE_OAUTH_VARS) {
  const partial = { ...all, [k]: '' };
  const got = driveAuthMode(partial);
  assert(got.mode === 'incomplete', `missing ${k} → incomplete, never a silent fallback`);
  assert(got.missing.join() === k, `names the missing var: ${k}`);
}

// Whitespace is not configuration — a secret pasted as a blank line must read
// as missing, not as a credential that fails at the API.
assert(driveAuthMode({ ...all, DRIVE_OAUTH_REFRESH_TOKEN: '   ' }).mode === 'incomplete', 'blank token is missing');

/* driveAccountLabel — a verified address always wins, and an unverified one is
 * never guessed at. The bug this pins is the one that shipped: a message that
 * named a ROLE ("the folder owner") read as fact and sent an operator to fix
 * an account that was never involved. */
const SA = 'firebase-adminsdk@nwsa-hub.iam.gserviceaccount.com';

assert(driveAccountLabel('oauth', 'a@b.com', SA) === 'a@b.com', 'verified address wins under oauth');
assert(driveAccountLabel('service-account', 'a@b.com', SA) === 'a@b.com', 'verified address wins under sa too');

// Unverified: describe the credential, never assert whose it is.
const unknown = driveAccountLabel('oauth', null, SA);
assert(unknown.includes('DRIVE_OAUTH_'), 'unverified oauth points at the secrets');
assert(!/owner/i.test(unknown), 'unverified oauth never claims to be the folder owner');
assert(driveAccountLabel('service-account', null, SA).includes(SA), 'unverified sa still names its real address');

// A blank/whitespace address is not an address — it must not print as one.
for (const empty of [undefined, null, '', '   ']) {
  const got = driveAccountLabel('oauth', empty, SA);
  assert(got === unknown, `blank address (${JSON.stringify(empty)}) falls back, not prints`);
  assert(!/undefined|null/.test(got), 'never interpolates a missing address');
}

console.log('drive-auth.selfcheck: all assertions passed');
