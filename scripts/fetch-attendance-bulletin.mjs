#!/usr/bin/env node
/**
 * Pull today's MDC "Attendance Bulletin" for apply-attendance-bulletin.mjs.
 *
 * Preferred: Graph Mail.Read on ggilman@mdc.edu → PDF → caller runs pdftotext.
 * Holding: OneDrive /Hub/attendance-bulletins (Power Automate Create file).
 *
 * Auth (delegated refresh token, Grant's mailbox only):
 *   MS_GRAPH_TENANT_ID  MS_GRAPH_CLIENT_ID  MS_GRAPH_REFRESH_TOKEN
 *   MS_GRAPH_CLIENT_SECRET  optional (confidential client)
 *   MS_GRAPH_MAILBOX        default ggilman@mdc.edu (app-only path)
 *
 * App-only (client credentials, needs IT admin consent on Mail.Read):
 *   omit REFRESH_TOKEN, set CLIENT_SECRET. Uses /users/{mailbox}/...
 *
 * --login      device-code; prints refresh token for the GitHub secret
 * --self-check no network
 *
 * Writes BULLETIN_OUT + .pdf/.txt (default tmp). GitHub: found/kind/path outputs.
 * Exit 0 if skipped or nothing today (cron stays green until mail arrives).
 */
import { appendFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MAILBOX = (process.env.MS_GRAPH_MAILBOX || 'ggilman@mdc.edu').trim();
const ONEDRIVE_FOLDER = '/Hub/attendance-bulletins';
const SCOPE = 'offline_access https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Files.Read https://graph.microsoft.com/User.Read';
const GRAPH = 'https://graph.microsoft.com/v1.0';

function todayEt(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

function sinceIso(hours = 48, now = new Date()) {
  return new Date(now.getTime() - hours * 3600 * 1000).toISOString();
}

function isBulletinSubject(subject) {
  return /attendance\s+bulletin/i.test(String(subject || ''));
}

function pickPdfAttachment(attachments) {
  return (attachments || []).find(a =>
    /pdf/i.test(a?.contentType || '') || /\.pdf$/i.test(a?.name || ''));
}

/** Prefer today's dated pdf, then txt, then newest pdf/txt in the window. */
function pickOneDriveFile(items, today, now = new Date()) {
  const list = (items || []).filter(f => f?.name && !f.folder);
  const datedPdf = list.find(f => f.name.toLowerCase() === `${today}.pdf`);
  if (datedPdf) return datedPdf;
  const datedTxt = list.find(f => f.name.toLowerCase() === `${today}.txt`);
  if (datedTxt) return datedTxt;
  const cutoff = now.getTime() - 48 * 3600 * 1000;
  const recent = list
    .filter(f => /\.(pdf|txt)$/i.test(f.name) && Date.parse(f.lastModifiedDateTime || 0) >= cutoff)
    .sort((a, b) => Date.parse(b.lastModifiedDateTime || 0) - Date.parse(a.lastModifiedDateTime || 0));
  return recent.find(f => /\.pdf$/i.test(f.name)) || recent[0] || null;
}

function kindFromName(name) {
  return /\.pdf$/i.test(name || '') ? 'pdf' : 'txt';
}

function emitOutput(found, kind, path) {
  const line = `found=${found}\nkind=${kind}\npath=${path}\n`;
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, line);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function graphJson(url, token, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`Graph ${res.status} ${url}: ${text.slice(0, 400)}`);
    err.status = res.status;
    throw err;
  }
  return text ? JSON.parse(text) : {};
}

async function tokenFromRefresh() {
  const tenant = process.env.MS_GRAPH_TENANT_ID;
  const clientId = process.env.MS_GRAPH_CLIENT_ID;
  const refresh = process.env.MS_GRAPH_REFRESH_TOKEN;
  const secret = process.env.MS_GRAPH_CLIENT_SECRET;
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    refresh_token: refresh,
    scope: SCOPE,
  });
  if (secret) body.set('client_secret', secret);
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = await res.json();
  if (!json.access_token) {
    throw new Error(`token refresh failed: ${json.error || res.status} ${json.error_description || ''}`);
  }
  if (json.refresh_token && json.refresh_token !== refresh) {
    console.warn('Graph issued a new refresh token. If the next run is 401, re-run --login and update MS_GRAPH_REFRESH_TOKEN.');
  }
  return json.access_token;
}

async function tokenFromClientCredentials() {
  const tenant = process.env.MS_GRAPH_TENANT_ID;
  const clientId = process.env.MS_GRAPH_CLIENT_ID;
  const secret = process.env.MS_GRAPH_CLIENT_SECRET;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: secret,
    scope: 'https://graph.microsoft.com/.default',
  });
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = await res.json();
  if (!json.access_token) {
    throw new Error(`client_credentials failed: ${json.error || res.status} ${json.error_description || ''}`);
  }
  return json.access_token;
}

function rootPath(delegated) {
  return delegated ? `${GRAPH}/me` : `${GRAPH}/users/${encodeURIComponent(MAILBOX)}`;
}

async function fetchMailPdf(token, delegated) {
  const since = sinceIso(48);
  const url = `${rootPath(delegated)}/messages`
    + `?$filter=${encodeURIComponent(`receivedDateTime ge ${since} and hasAttachments eq true`)}`
    + `&$orderby=receivedDateTime%20desc&$top=25`
    + `&$select=id,subject,receivedDateTime,hasAttachments`;
  const { value: messages = [] } = await graphJson(url, token);
  for (const msg of messages) {
    if (!isBulletinSubject(msg.subject) || msg.hasAttachments === false) continue;
    const { value: atts = [] } = await graphJson(
      `${rootPath(delegated)}/messages/${msg.id}/attachments?$select=id,name,contentType,contentBytes,@odata.type`,
      token,
    );
    const pdf = pickPdfAttachment(atts);
    if (!pdf) continue;
    let bytes;
    if (pdf.contentBytes) bytes = Buffer.from(pdf.contentBytes, 'base64');
    else {
      const res = await fetch(
        `${rootPath(delegated)}/messages/${msg.id}/attachments/${pdf.id}/$value`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) continue;
      bytes = Buffer.from(await res.arrayBuffer());
    }
    console.log(`Graph mail: ${msg.subject} (${bytes.length} bytes)`);
    return bytes;
  }
  return null;
}

async function fetchOneDrive(token, delegated, today) {
  const path = `${rootPath(delegated)}/drive/root:${ONEDRIVE_FOLDER}:/children`
    + `?$select=id,name,lastModifiedDateTime,folder,file`;
  let data;
  try {
    data = await graphJson(path, token);
  } catch (e) {
    if (e.status === 404) {
      console.log(`OneDrive ${ONEDRIVE_FOLDER} not found yet.`);
      return null;
    }
    throw e;
  }
  const file = pickOneDriveFile(data.value, today);
  if (!file) return null;
  const res = await fetch(
    `${rootPath(delegated)}/drive/items/${file.id}/content`,
    { headers: { Authorization: `Bearer ${token}` }, redirect: 'follow' },
  );
  if (!res.ok) throw new Error(`OneDrive download ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  console.log(`Graph OneDrive: ${file.name} (${bytes.length} bytes)`);
  return { bytes, kind: kindFromName(file.name) };
}

function configured() {
  return Boolean(process.env.MS_GRAPH_TENANT_ID && process.env.MS_GRAPH_CLIENT_ID
    && (process.env.MS_GRAPH_REFRESH_TOKEN || process.env.MS_GRAPH_CLIENT_SECRET));
}

async function login() {
  const tenant = process.env.MS_GRAPH_TENANT_ID;
  const clientId = process.env.MS_GRAPH_CLIENT_ID;
  if (!tenant || !clientId) {
    console.error('Set MS_GRAPH_TENANT_ID and MS_GRAPH_CLIENT_ID, then re-run --login.');
    process.exit(1);
  }
  const dcRes = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/devicecode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, scope: SCOPE }),
  });
  const dc = await dcRes.json();
  if (!dc.device_code) {
    console.error('Device code failed:', dc.error, dc.error_description || '');
    process.exit(1);
  }
  console.log(dc.message || `Open ${dc.verification_uri} and enter ${dc.user_code}`);
  const secret = process.env.MS_GRAPH_CLIENT_SECRET;
  for (;;) {
    await sleep((dc.interval || 5) * 1000);
    const body = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      client_id: clientId,
      device_code: dc.device_code,
    });
    if (secret) body.set('client_secret', secret);
    const tokRes = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const tok = await tokRes.json();
    if (tok.refresh_token) {
      console.log('\nPaste this as GitHub secret MS_GRAPH_REFRESH_TOKEN:\n');
      console.log(tok.refresh_token);
      return;
    }
    if (tok.error === 'authorization_pending' || tok.error === 'slow_down') continue;
    console.error('Login failed:', tok.error, tok.error_description || '');
    process.exit(1);
  }
}

function selfCheck() {
  const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } };
  assert(isBulletinSubject('Attendance Bulletin 8.14.26'), 'subject match');
  assert(!isBulletinSubject('Weekly newsletter'), 'subject reject');
  assert(pickPdfAttachment([
    { name: 'note.txt', contentType: 'text/plain' },
    { name: 'Attendance Bulletin.pdf', contentType: 'application/pdf' },
  ])?.name === 'Attendance Bulletin.pdf', 'pdf att');
  const today = '2026-08-14';
  const now = new Date('2026-08-14T18:00:00Z');
  assert(todayEt(now) === '2026-08-14', `todayEt ${todayEt(now)}`);
  assert(sinceIso(48, now) === '2026-08-12T18:00:00.000Z', 'sinceIso');
  const items = [
    { name: '2026-08-13.txt', lastModifiedDateTime: '2026-08-13T16:00:00Z' },
    { name: '2026-08-14.pdf', lastModifiedDateTime: '2026-08-14T16:00:00Z' },
  ];
  assert(pickOneDriveFile(items, today, now)?.name === '2026-08-14.pdf', 'dated pdf');
  assert(pickOneDriveFile(
    [{ name: '2026-08-14.txt', lastModifiedDateTime: '2026-08-14T16:00:00Z' }],
    today,
    now,
  )?.name === '2026-08-14.txt', 'dated txt');
  assert(!pickOneDriveFile(
    [{ name: 'old.pdf', lastModifiedDateTime: '2026-01-01T00:00:00Z' }],
    today,
    now,
  ), 'stale ignored');
  assert(kindFromName('x.pdf') === 'pdf' && kindFromName('x.txt') === 'txt', 'kind');
  console.log('fetch-attendance-bulletin.selfcheck: ok');
}

async function main() {
  if (process.argv.includes('--self-check')) { selfCheck(); return; }
  if (process.argv.includes('--login')) { await login(); return; }

  if (!configured()) {
    console.log('Graph secrets not set. Skip fetch (add MS_GRAPH_* when ready).');
    emitOutput('0', '', '');
    return;
  }

  const delegated = Boolean(process.env.MS_GRAPH_REFRESH_TOKEN);
  const token = delegated ? await tokenFromRefresh() : await tokenFromClientCredentials();
  const today = todayEt();
  const outBase = process.env.BULLETIN_OUT || join(tmpdir(), 'bulletin');

  const pdf = await fetchMailPdf(token, delegated);
  if (pdf) {
    const path = `${outBase}.pdf`;
    writeFileSync(path, pdf);
    emitOutput('1', 'pdf', path);
    return;
  }

  const od = await fetchOneDrive(token, delegated, today);
  if (od) {
    const path = `${outBase}.${od.kind}`;
    writeFileSync(path, od.bytes);
    emitOutput('1', od.kind, path);
    return;
  }

  console.log('No bulletin in recent mail or OneDrive.');
  emitOutput('0', '', '');
}

main().catch(err => {
  console.error(err.message || err);
  emitOutput('0', '', '');
  process.exit(1);
});
