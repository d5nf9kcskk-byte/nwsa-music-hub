#!/usr/bin/env node
/**
 * One-time helper: get a Drive refresh token for the account that OWNS the
 * Concert Attendance folder (#concert-checkin).
 *
 * Run it on your own machine, never in CI.
 *
 *   node scripts/drive-oauth-token.mjs ~/Downloads/client_secret_*.json
 *   node scripts/drive-oauth-token.mjs <client-id> <client-secret>
 *
 * The JSON form is the one to use: it is the file Google's "Download JSON"
 * button gives you when you create the OAuth client, so the client secret
 * goes from Google to this script without being retyped, pasted into a chat,
 * or left in shell history.
 *
 * By default the three values are written STRAIGHT INTO the repository
 * secrets with `gh secret set`, over stdin, and nothing is printed but a
 * confirmation. The token is a long-lived credential for that account's
 * Drive: it never touches the terminal, a file, or this repo. Pass --print to
 * see it instead, if you would rather paste it into GitHub by hand.
 *
 * Zero dependencies on purpose: node's own http, fetch and spawn are enough,
 * so this works in a fresh clone with nothing installed.
 * Full setup: docs/drive-oauth-setup.md
 */
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const printOnly = args.includes('--print');
const [first, second] = args.filter(a => a !== '--print');

let clientId, clientSecret;
if (first && first.endsWith('.json')) {
  // Google's downloaded client file: { installed: { client_id, client_secret } }
  const file = JSON.parse(readFileSync(first, 'utf8'));
  const c = file.installed ?? file.web ?? file;
  clientId = c.client_id;
  clientSecret = c.client_secret;
} else {
  clientId = first;
  clientSecret = second;
}

if (!clientId || !clientSecret) {
  console.error('Usage: node scripts/drive-oauth-token.mjs ~/Downloads/client_secret_*.json');
  console.error('   or: node scripts/drive-oauth-token.mjs <client-id> <client-secret>');
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
  if (printOnly) {
    console.log('\nRefresh token (treat it like a password — it is Drive access to that account):\n');
    console.log(body.refresh_token);
    console.log('\nAdd it, the client id and the client secret as repository secrets:');
    console.log('  DRIVE_OAUTH_CLIENT_ID / DRIVE_OAUTH_CLIENT_SECRET / DRIVE_OAUTH_REFRESH_TOKEN');
    return;
  }

  // Straight into GitHub over stdin: not an argument (process lists are
  // readable), not a file, not the screen.
  const secrets = {
    DRIVE_OAUTH_CLIENT_ID: clientId,
    DRIVE_OAUTH_CLIENT_SECRET: clientSecret,
    DRIVE_OAUTH_REFRESH_TOKEN: body.refresh_token,
  };
  for (const [name, value] of Object.entries(secrets)) {
    const r = spawnSync('gh', ['secret', 'set', name], { input: value, stdio: ['pipe', 'inherit', 'inherit'] });
    if (r.status !== 0) {
      console.error(`\nCould not set ${name}. Re-run with --print and add the three by hand.`);
      process.exit(1);
    }
    console.log(`  set ${name}`);
  }
  console.log('\nDone. Nothing was printed or saved anywhere else.');
  console.log('Next: gh workflow run "Sync concert photos to Drive"');
}
