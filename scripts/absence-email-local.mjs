#!/usr/bin/env node
/**
 * absence-email-local.mjs — pick up "not going to be there" parent/student
 * emails from Apple Mail and feed them into Who's Out.
 *
 * Mac-native by design (no Gmail/Graph API — MDC mail lives in Mail.app):
 *
 *   Mail.app INBOX → launchd (hourly) → osascript/JXA fetch → apply-absence-email.mjs
 *
 *   node scripts/absence-email-local.mjs              run once, now
 *   node scripts/absence-email-local.mjs --install    load the LaunchAgent
 *   node scripts/absence-email-local.mjs --grant      settle the Mail permission up front
 *   node scripts/absence-email-local.mjs --status     loaded? creds? Mail reachable?
 *   node scripts/absence-email-local.mjs --uninstall  unload and remove it
 *   node scripts/absence-email-local.mjs --self-check
 *
 * Credentials: ~/.config/nwsa-hub/service-account.json (shared with the
 * attendance-bulletin pipeline; chmod 600, never committed).
 * State (last-checked watermark + recently-handled message ids), so a run
 * missed while the Mac was asleep is caught by the next one instead of
 * lost: ~/.config/nwsa-hub/absence-email-state.json
 * Log: ~/Library/Logs/nwsa-absence-email.log, trimmed to the last 800 lines.
 */

import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

/** Writes are off until this says 'false'. That flip is the whole soft launch. */
const DRY_RUN = 'true';

const HOME = homedir();
const LABEL = 'com.nwsa.hub.absence-email';
const HERE = dirname(fileURLToPath(import.meta.url));
const RUNNER = join(HERE, 'absence-email-local.mjs');
const APPLY = join(HERE, 'apply-absence-email.mjs');
const FETCHER = join(HERE, 'lib/mail-fetch.jxa.js');
const CRED = process.env.NWSA_SERVICE_ACCOUNT || join(HOME, '.config/nwsa-hub/service-account.json');
const STATE_FILE = join(HOME, '.config/nwsa-hub/absence-email-state.json');
const LOG = join(HOME, 'Library/Logs/nwsa-absence-email.log');
const PLIST = join(HOME, 'Library/LaunchAgents', `${LABEL}.plist`);
/** Set to the exact Mail.app account name (see Mail ▸ Settings ▸ Accounts) to
 * only watch the MDC mailbox instead of every account on the Mac. */
const ACCOUNT_FILTER = process.env.MDC_MAIL_ACCOUNT_NAME || '';

/** Local clock on this Mac is Eastern, so launchd times are school times. */
const RUN_MINUTES_PAST_HOUR = 5;
const RUN_HOURS = Array.from({ length: 12 }, (_, i) => 7 + i); // 7am–6pm
const DEFAULT_LOOKBACK_HOURS = 24; // first-ever run, or state file missing
const MAX_LOOKBACK_HOURS = 168; // don't reprocess a week-old backlog if paused
const QUERY_OVERLAP_HOURS = 2; // re-asks Mail for a window it already saw,
// covering IMAP sync lag; MAX_PROCESSED_IDS below is what keeps that safe.
const MAX_PROCESSED_IDS = 500;
const LOG_MAX_BYTES = 256 * 1024;
const LOG_KEEP_LINES = 800;

const uid = () => process.getuid();
const nodeBin = () => spawnSync('/usr/bin/which', ['node'], { encoding: 'utf8' }).stdout?.trim()
  || process.execPath;
const stamp = () => new Date().toLocaleString('en-US', {
  timeZone: 'America/New_York', dateStyle: 'short', timeStyle: 'short',
});
const log = (msg) => console.log(`[${stamp()}] ${msg}`);
const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

function trimLog() {
  try {
    if (statSync(LOG).size <= LOG_MAX_BYTES) return;
    writeFileSync(LOG, readFileSync(LOG, 'utf8').split('\n').slice(-LOG_KEEP_LINES).join('\n'));
  } catch { /* no log yet */ }
}

function readCred() {
  try {
    const raw = readFileSync(CRED, 'utf8').trim();
    JSON.parse(raw); // catches a half-downloaded key before Firestore does
    return raw;
  } catch { return null; }
}

function readState() {
  try { return JSON.parse(readFileSync(STATE_FILE, 'utf8')); }
  catch { return { lastCheckedAt: null, processedIds: [] }; }
}

function writeState(state) {
  mkdirSync(dirname(STATE_FILE), { recursive: true, mode: 0o700 });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function notify(msg) {
  spawnSync('osascript', ['-e', `display notification ${JSON.stringify(msg)} with title "NWSA Hub absences"`]);
}

function denialHelp(stderr) {
  return `Mail.app automation was denied (macOS privacy): ${stderr.trim()}\n`
    + '  System Settings → Privacy & Security → Automation → Terminal (or node) → allow "Mail"\n'
    + '  Then re-run: node scripts/absence-email-local.mjs --grant';
}

/**
 * @param {string} sinceIso
 * @returns {{ ok: true, emails: any[] } | { ok: false, denied: boolean, error: string }}
 */
function fetchMail(sinceIso) {
  const args = ['-l', 'JavaScript', FETCHER, sinceIso];
  if (ACCOUNT_FILTER) args.push(ACCOUNT_FILTER);
  const r = spawnSync('osascript', args, { encoding: 'utf8', maxBuffer: 20_000_000, timeout: 60_000 });
  if (r.status !== 0) {
    const denied = /not authorized|-1743|not allowed/i.test(r.stderr || '');
    return { ok: false, denied, error: r.stderr || `osascript exited ${r.status}` };
  }
  try { return { ok: true, emails: JSON.parse(r.stdout || '[]') }; }
  catch { return { ok: false, denied: false, error: `Could not parse mail-fetch output: ${r.stdout?.slice(0, 200)}` }; }
}

function run() {
  trimLog();

  const state = readState();
  const now = Date.now();
  const floor = now - MAX_LOOKBACK_HOURS * 3600_000;
  const watermark = state.lastCheckedAt
    ? Math.max(Date.parse(state.lastCheckedAt), floor)
    : now - DEFAULT_LOOKBACK_HOURS * 3600_000;
  const queryFrom = new Date(watermark - QUERY_OVERLAP_HOURS * 3600_000).toISOString();

  const fetched = fetchMail(queryFrom);
  if (!fetched.ok) {
    if (fetched.denied) {
      log(denialHelp(fetched.error));
      notify('Absence-email agent needs Automation access for Mail. See the log.');
    } else {
      log(`Mail fetch failed: ${fetched.error}`);
      notify(`Absence-email fetch failed. See ${LOG}`);
    }
    return 0; // don't advance the watermark; the next run retries this window
  }

  const seen = new Set(state.processedIds || []);
  const fresh = fetched.emails.filter(e => !seen.has(e.messageId));
  log(`Fetched ${fetched.emails.length} message(s) since ${queryFrom}; ${fresh.length} new.`);

  if (fresh.length === 0) {
    writeState({ lastCheckedAt: new Date(now).toISOString(), processedIds: [...seen].slice(-MAX_PROCESSED_IDS) });
    return 0;
  }

  const cred = readCred();
  if (!cred) log(`No usable service account at ${CRED}; parsing only. See docs/ABSENCE-EMAIL.md.`);
  const dryRun = cred ? (process.env.DRY_RUN || DRY_RUN) : 'parse-only';

  const env = { ...process.env, DRY_RUN: dryRun, SKIP_IF_EMPTY: '1', ABSENCE_EMAILS_JSON: JSON.stringify(fresh) };
  if (cred) env.FIREBASE_SERVICE_ACCOUNT_JSON = cred;

  const code = spawnSync(process.execPath, [APPLY], { cwd: dirname(HERE), env, stdio: 'inherit' }).status ?? 1;
  if (code !== 0) {
    log(`apply-absence-email exited ${code}`);
    notify(`Absence-email apply failed (exit ${code}). See ${LOG}`);
    return 0; // don't mark these ids processed; retry next run
  }

  const processedIds = [...seen, ...fresh.map(e => e.messageId)].slice(-MAX_PROCESSED_IDS);
  writeState({ lastCheckedAt: new Date(now).toISOString(), processedIds });
  return 0;
}

function plistXml() {
  const calendar = RUN_HOURS.map(h =>
    `    <dict><key>Hour</key><integer>${h}</integer>`
    + `<key>Minute</key><integer>${RUN_MINUTES_PAST_HOUR}</integer></dict>`).join('\n');
  // Same TCC reasoning as bulletin-local.mjs: node runs through /bin/bash so
  // the child inherits whatever automation/Full Disk Access was granted to
  // the shell instead of a version-pinned node path that breaks on upgrade.
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${xml(LABEL)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>-c</string>
    <string>exec ${xml(`"${process.execPath}" "${RUNNER}"`)}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>${xml(process.env.PATH || '')}</string></dict>
  <key>StartCalendarInterval</key>
  <array>
${calendar}
  </array>
  <key>StandardOutPath</key><string>${xml(LOG)}</string>
  <key>StandardErrorPath</key><string>${xml(LOG)}</string>
  <key>ProcessType</key><string>Background</string>
</dict>
</plist>
`;
}

function install() {
  mkdirSync(dirname(PLIST), { recursive: true });
  mkdirSync(dirname(CRED), { recursive: true, mode: 0o700 });
  writeFileSync(PLIST, plistXml());
  spawnSync('launchctl', ['bootout', `gui/${uid()}/${LABEL}`], { stdio: 'ignore' });
  const r = spawnSync('launchctl', ['bootstrap', `gui/${uid()}`, PLIST], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(r.stderr?.trim() || 'launchctl bootstrap failed');
    return 1;
  }
  console.log(`Installed ${LABEL}: hourly, ${RUN_HOURS[0]}:00–${RUN_HOURS[RUN_HOURS.length - 1]}:00.`);
  console.log('Next: node scripts/absence-email-local.mjs --grant');
  console.log('  — settles the Mail permission now, instead of during an unattended run you would miss.');
  return status();
}

/**
 * Trigger the macOS "allow control of Mail" prompt ON PURPOSE, right now,
 * while a human is sitting in front of the machine.
 *
 * There is no way to grant this from a script — tccutil can only RESET
 * permissions, never grant them, and the TCC database is SIP-protected.
 * That is deliberate: a script that could self-approve Mail automation could
 * silently read and send a person's mail. The only no-prompt path is an MDM
 * PPPC profile pushed by whoever manages the Mac. So instead of removing the
 * prompt, this makes it happen at a predictable moment.
 *
 * macOS attributes automation to the RESPONSIBLE process, and a LaunchAgent
 * run is a different responsible process than a Terminal run — so approving
 * it here does not necessarily cover the background job. That's what the
 * kickstart below is for: it forces one real launchd run while you're still
 * here to answer a second prompt if macOS asks for that context too.
 */
function grant() {
  console.log('Asking macOS for permission to control Mail — approve the dialog if it appears.');
  console.log('(If Mail is not running, this launches it. That is expected.)\n');
  const probe = spawnSync('osascript', ['-l', 'JavaScript', '-e', 'Application("Mail").accounts().length'],
    { encoding: 'utf8', timeout: 120_000 });
  if (probe.status !== 0) {
    console.error(denialHelp(probe.stderr || `osascript exited ${probe.status}`));
    return 1;
  }
  console.log(`Foreground: OK — Mail answered (${probe.stdout.trim()} account(s) visible).`);

  if (spawnSync('launchctl', ['list', LABEL], { stdio: 'ignore' }).status !== 0) {
    console.log('\nAgent is not installed yet. Run --install, then --grant again to prove the background run.');
    return 0;
  }

  console.log('\nForcing one real background run — this is the context launchd will use...');
  const kick = spawnSync('launchctl', ['kickstart', '-k', `gui/${uid()}/${LABEL}`], { encoding: 'utf8' });
  if (kick.status !== 0) {
    console.error(kick.stderr?.trim() || 'launchctl kickstart failed');
    return 1;
  }
  console.log(`Kicked off. Confirm it actually read Mail:\n  tail -n 40 ${LOG}`);
  return 0;
}

function uninstall() {
  spawnSync('launchctl', ['bootout', `gui/${uid()}/${LABEL}`], { stdio: 'ignore' });
  try { unlinkSync(PLIST); } catch { /* already gone */ }
  console.log(`Removed ${LABEL}. Log kept at ${LOG}.`);
  return 0;
}

function status() {
  const list = spawnSync('launchctl', ['list', LABEL], { encoding: 'utf8' });
  const lastExit = list.stdout?.match(/"LastExitStatus"\s*=\s*(\d+)/)?.[1];
  console.log(`agent:    ${list.status === 0
    ? `loaded, hourly ${RUN_HOURS[0]}:00–${RUN_HOURS[RUN_HOURS.length - 1]}:00${lastExit ? ` (last exit ${lastExit})` : ''}`
    : 'not loaded — run: node scripts/absence-email-local.mjs --install'}`);
  console.log(`mode:     ${DRY_RUN === 'false' ? 'LIVE, writes to Firestore' : 'dry run, no writes'}`);
  console.log(`creds:    ${readCred() ? CRED : `missing — put the key at ${CRED}`}`);
  console.log(`account:  ${ACCOUNT_FILTER || 'all Mail.app accounts (set MDC_MAIL_ACCOUNT_NAME to narrow)'}`);
  const state = readState();
  console.log(`watched:  ${state.lastCheckedAt ? `since ${state.lastCheckedAt}` : `never run — first run looks back ${DEFAULT_LOOKBACK_HOURS}h`}`);
  console.log(`log:      ${LOG}`);
  return 0;
}

function selfCheck() {
  const assert = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); process.exit(1); } };

  assert(existsSync(APPLY), 'apply-absence-email.mjs is where this script expects');
  assert(existsSync(FETCHER), 'mail-fetch.jxa.js is where this script expects');

  const plist = plistXml();
  assert((plist.match(/<key>Hour<\/key>/g) || []).length === RUN_HOURS.length, 'one entry per run hour');
  assert(plist.includes(RUNNER) && plist.includes(LOG), 'plist points at this script and the log');
  if (process.platform === 'darwin') {
    const tmp = join(tmpdir(), `${LABEL}.selfcheck.plist`);
    writeFileSync(tmp, plist);
    const lint = spawnSync('plutil', ['-lint', tmp], { encoding: 'utf8' });
    unlinkSync(tmp);
    assert(lint.status === 0, `plutil -lint: ${lint.stdout || lint.stderr}`);
  }

  console.log('absence-email-local.selfcheck: ok');
  return 0;
}

const cmd = process.argv[2] || '';
if (cmd === '--self-check') process.exit(selfCheck());
if (cmd === '--install') process.exit(install());
if (cmd === '--grant') process.exit(grant());
if (cmd === '--uninstall') process.exit(uninstall());
if (cmd === '--status') process.exit(status());
process.exit(run());
