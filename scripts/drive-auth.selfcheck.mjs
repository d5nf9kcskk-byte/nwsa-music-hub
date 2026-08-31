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
import { driveAuthMode, DRIVE_OAUTH_VARS } from './lib/driveAuth.mjs';

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

console.log('drive-auth.selfcheck: all assertions passed');
