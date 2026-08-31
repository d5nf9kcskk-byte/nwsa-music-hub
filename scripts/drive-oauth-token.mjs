#!/usr/bin/env node
/**
 * One-time helper: get a Drive refresh token for the account that OWNS the
 * Concert Attendance folder (#concert-checkin).
 *
 * Run it on your own machine, never in CI — it opens a Google consent screen
 * and the token it prints is a long-lived credential for that account's Drive.
 *
 *   node scripts/drive-oauth-token.mjs <client-id> <client-secret>
 *
 * Zero dependencies on purpose: node's own http and fetch are enough, so this
 * works in a fresh clone with nothing installed. Full setup: docs/drive-oauth-setup.md
 *
 * The token is printed to YOUR terminal and nowhere else. It is not written to
 * a file, and it must never be committed — it goes straight into the
 * repository secret DRIVE_OAUTH_REFRESH_TOKEN.
 */
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';

const [clientId, clientSecret] = process.argv.slice(2);
if (!clientId || !clientSecret) {
  console.error('Usage: node scripts/drive-oauth-token.mjs <client-id> <client-secret>');
  console.error('Create the OAuth client (type: Desktop app) in the nwsa-hub Google Cloud project.');
  process.exit(1);
}

// Loopback redirect: Google retired the copy-paste "oob" flow, so the consent
// screen has to hand the code back to a server on this machine.
const state = randomBytes(16).toString('hex');

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  if (url.pathname !== '/') { res.writeHead(404).end(); return; }
  const code = url.searchParams.get('code');
  const ok = code && url.searchParams.get('state') === state;
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(ok
    ? '<p>Done — back to your terminal.</p>'
    : '<p>Something went wrong. Check the terminal.</p>');
  server.close();
  if (!ok) {
    console.error(`\nConsent failed: ${url.searchParams.get('error') ?? 'state mismatch'}`);
    process.exit(1);
  }
  void exchange(code);
});

let port;
server.listen(0, '127.0.0.1', () => {
  port = server.address().port;
  const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  auth.searchParams.set('client_id', clientId);
  auth.searchParams.set('redirect_uri', `http://localhost:${port}`);
  auth.searchParams.set('response_type', 'code');
  auth.searchParams.set('scope', 'https://www.googleapis.com/auth/drive');
  // Both are required to be HANDED a refresh token: offline asks for one,
  // and consent forces a fresh one even if this account already approved.
  auth.searchParams.set('access_type', 'offline');
  auth.searchParams.set('prompt', 'consent');
  auth.searchParams.set('state', state);
  console.log('\nOpen this in a browser, signed in as the account that owns the folder:\n');
  console.log(auth.toString());
  console.log('\nWaiting for the consent screen…');
});

async function exchange(code) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: `http://localhost:${port}`,
      grant_type: 'authorization_code',
    }),
  });
  const body = await res.json();
  if (!res.ok || !body.refresh_token) {
    console.error('\nGoogle did not return a refresh token:', body.error_description ?? body.error ?? body);
    console.error('If the account has approved this client before, revoke it at'
      + ' myaccount.google.com/permissions and run this again.');
    process.exit(1);
  }
  console.log('\nRefresh token (treat it like a password — it is Drive access to that account):\n');
  console.log(body.refresh_token);
  console.log('\nAdd these three as repository secrets (Settings → Secrets and variables → Actions):');
  console.log('  DRIVE_OAUTH_CLIENT_ID');
  console.log('  DRIVE_OAUTH_CLIENT_SECRET');
  console.log('  DRIVE_OAUTH_REFRESH_TOKEN');
  console.log('\nThen: gh workflow run "Sync concert photos to Drive"');
}
