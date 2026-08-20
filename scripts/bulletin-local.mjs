#!/usr/bin/env node
/**
 * bulletin-local.mjs — apply the daily Attendance Bulletin from Grant's Mac.
 *
 * Interim path. MDC blocked the Azure app registration that GitHub needs to
 * read the mailbox, so the apply step runs here instead of in the cloud:
 *
 *   Power Automate → OneDrive /Hub/attendance-bulletins (synced to this Mac)
 *     → launchd (weekdays 12:45 PM + 3:15 PM) → apply-attendance-bulletin.mjs
 *
 *   node scripts/bulletin-local.mjs              run once, now
 *   node scripts/bulletin-local.mjs --install    load the LaunchAgent
 *   node scripts/bulletin-local.mjs --status     loaded? creds? what would it read?
 *   node scripts/bulletin-local.mjs --uninstall  unload and remove it
 *   node scripts/bulletin-local.mjs --self-check
 *
 * Credentials: ~/.config/nwsa-hub/service-account.json (chmod 600, never committed).
 * Log: ~/Library/Logs/nwsa-bulletin.log, trimmed to the last 800 lines.
 * Missing folder, missing bulletin, or missing credentials all log and exit 0.
 *
 * macOS privacy: OneDrive lives under ~/Library/CloudStorage, which a launchd
 * job may not read until node has Full Disk Access. --install proves it with a
 * real launchd run instead of trusting the terminal, which is already allowed.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

/** Writes are off until this says 'false'. That flip is the whole soft launch. */
const DRY_RUN = 'true';

const HOME = homedir();
const LABEL = 'com.nwsa.hub.bulletin';
const HERE = dirname(fileURLToPath(import.meta.url));
const RUNNER = join(HERE, 'bulletin-local.mjs');
const APPLY = join(HERE, 'apply-attendance-bulletin.mjs');
const BULLETIN_DIR = process.env.BULLETIN_DIR
  || join(HOME, 'Library/CloudStorage/OneDrive-MiamiDadeCollege/Hub/attendance-bulletins');
const CRED = process.env.NWSA_SERVICE_ACCOUNT || join(HOME, '.config/nwsa-hub/service-account.json');
const LOG = join(HOME, 'Library/Logs/nwsa-bulletin.log');
const PLIST = join(HOME, 'Library/LaunchAgents', `${LABEL}.plist`);

/** Local clock on this Mac is Eastern, so launchd times are school times. */
const RUN_TIMES = [[12, 45], [15, 15]];
const MAX_AGE_HOURS = 48; // a Monday must not re-apply Friday's bulletin
const LOG_MAX_BYTES = 256 * 1024;
const LOG_KEEP_LINES = 800;

const uid = () => process.getuid();
/** The brew symlink, not the versioned Cellar path an upgrade would orphan. */
const nodeBin = () => spawnSync('/usr/bin/which', ['node'], { encoding: 'utf8' }).stdout?.trim()
  || process.execPath;
const stamp = () => new Date().toLocaleString('en-US', {
  timeZone: 'America/New_York', dateStyle: 'short', timeStyle: 'short',
});
const log = (msg) => console.log(`[${stamp()}] ${msg}`);
const hhmm = ([h, m]) => `${h}:${String(m).padStart(2, '0')}`;
const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

/**
 * Newest .pdf/.txt written in the last MAX_AGE_HOURS; PDF wins an exact tie.
 * The filename is the day the flow SENT it, which can be the day after the
 * bulletin covers, so the date always comes from the PDF header downstream.
 * @param {{ name: string, mtime: number }[]} files
 */
function pickBulletin(files, now = Date.now()) {
  const cutoff = now - MAX_AGE_HOURS * 3600_000;
  return files
    .filter(f => /\.(pdf|txt)$/i.test(f.name) && f.mtime >= cutoff)
    .sort((a, b) => b.mtime - a.mtime || (/\.pdf$/i.test(b.name) ? 1 : -1))[0] || null;
}

/**
 * Names first, then times. Node's readdirSync blocks forever on a File Provider
 * folder macOS has not cleared for this process; /bin/ls returns the refusal
 * right away, and stat on a known path is allowed either way.
 * @returns {{ files: { name: string, mtime: number }[], denied: boolean }}
 */
function listBulletins() {
  const ls = spawnSync('/bin/ls', ['-1', BULLETIN_DIR], { encoding: 'utf8', timeout: 15_000 });
  if (ls.status !== 0) {
    return { files: [], denied: /not permitted/i.test(ls.stderr || '') || ls.signal != null };
  }
  const files = [];
  for (const name of ls.stdout.split('\n').filter(Boolean)) {
    try { files.push({ name, mtime: statSync(join(BULLETIN_DIR, name)).mtimeMs }); }
    catch { /* vanished mid-sync */ }
  }
  return { files, denied: false };
}

function denialHelp() {
  return `Cannot read ${BULLETIN_DIR} from a background job (macOS privacy).\n`
    + '  System Settings → Privacy & Security → Full Disk Access → +\n'
    + `  Press Cmd+Shift+G, paste: ${nodeBin()}\n`
    + '  Turn it on, then re-run: node scripts/bulletin-local.mjs --install';
}

/** Keep the tail so an unattended agent cannot fill the disk. */
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

function notify(msg) {
  spawnSync('osascript', ['-e', `display notification ${JSON.stringify(msg)} with title "NWSA Hub bulletin"`]);
}

function run() {
  trimLog();

  const { files, denied } = listBulletins();
  if (denied) {
    log(denialHelp());
    notify('Bulletin agent needs Full Disk Access for node. See the log.');
    return 0;
  }

  const pick = pickBulletin(files);
  if (!pick) { log(`No bulletin from the last ${MAX_AGE_HOURS}h in ${BULLETIN_DIR}; skip.`); return 0; }

  const cred = readCred();
  if (!cred) log(`No usable service account at ${CRED}; parsing only. See docs/ATTENDANCE-BULLETIN.md.`);
  const dryRun = cred ? (process.env.DRY_RUN || DRY_RUN) : 'parse-only';
  log(`Reading ${pick.name} (DRY_RUN=${dryRun})`);

  const env = { ...process.env, DRY_RUN: dryRun, SKIP_IF_EMPTY: '1' };
  if (cred) env.FIREBASE_SERVICE_ACCOUNT_JSON = cred;
  env[/\.pdf$/i.test(pick.name) ? 'BULLETIN_PDF_PATH' : 'BULLETIN_TEXT_PATH'] = join(BULLETIN_DIR, pick.name);

  const code = spawnSync(process.execPath, [APPLY], { cwd: dirname(HERE), env, stdio: 'inherit' }).status ?? 1;
  if (code !== 0) {
    log(`apply-attendance-bulletin exited ${code}`);
    notify(`Bulletin apply failed (exit ${code}). See ${LOG}`);
  }
  return code;
}

function plistXml() {
  const calendar = RUN_TIMES.flatMap(([h, m]) => [1, 2, 3, 4, 5].map(wd =>
    `    <dict><key>Weekday</key><integer>${wd}</integer>`
    + `<key>Hour</key><integer>${h}</integer>`
    + `<key>Minute</key><integer>${m}</integer></dict>`)).join('\n');
  // PATH is captured from the installing shell so the child finds node, and
  // pdftotext or python3+pymupdf for the PDF.
  //
  // node runs *through* /bin/bash on purpose. The bulletins live in
  // ~/Library/CloudStorage (OneDrive), which is TCC-protected: a launchd job
  // reading it directly is denied, and the failure surfaces as the misleading
  // "Need pdftotext (poppler) or pymupdf to read PDF" -- the tool is present,
  // the file is unreadable. /bin/bash already holds Full Disk Access, and TCC
  // attributes a child's access to the responsible process, so node inherits
  // it. Granting FDA to node directly would work too, but its path carries a
  // version (.../node/26.5.1/bin/node) and breaks on every upgrade.
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
  console.log(`Installed ${LABEL}: weekdays at ${RUN_TIMES.map(hhmm).join(' and ')}.`);
  return status();
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
    ? `loaded, weekdays at ${RUN_TIMES.map(hhmm).join(' and ')}${lastExit ? ` (last exit ${lastExit})` : ''}`
    : 'not loaded — run: node scripts/bulletin-local.mjs --install'}`);
  console.log(`mode:     ${DRY_RUN === 'false' ? 'LIVE, writes to Firestore' : 'dry run, no writes'}`);
  console.log(`creds:    ${readCred() ? CRED : `missing — put the key at ${CRED}`}`);
  let pick = null;
  try { pick = pickBulletin(listBulletins()); } catch { /* folder missing */ }
  console.log(`bulletin: ${pick
    ? `${pick.name}, ${Math.round((Date.now() - pick.mtime) / 3600_000)}h old`
    : `nothing recent in ${BULLETIN_DIR}`}`);
  console.log(`log:      ${LOG}`);
  return 0;
}

function selfCheck() {
  const assert = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); process.exit(1); } };
  const now = Date.parse('2026-08-14T16:00:00Z');
  const hoursAgo = (h) => now - h * 3600_000;

  // Newest wins, whatever the filename says the date is.
  assert(pickBulletin([
    { name: '2026-08-13.pdf', mtime: hoursAgo(25) },
    { name: '2026-08-14.pdf', mtime: hoursAgo(4) },
  ], now)?.name === '2026-08-14.pdf', 'newest bulletin wins');

  // A weekend gap must not re-apply Friday's bulletin on Monday.
  assert(pickBulletin([{ name: '2026-08-07.pdf', mtime: hoursAgo(72) }], now) === null, 'stale skipped');
  assert(pickBulletin([], now) === null, 'empty folder skipped');
  assert(pickBulletin([{ name: '.DS_Store', mtime: now }], now) === null, 'non-bulletin skipped');
  assert(pickBulletin([{ name: 'a.txt', mtime: hoursAgo(3) }], now)?.name === 'a.txt', 'txt accepted');
  assert(pickBulletin([
    { name: 'a.txt', mtime: hoursAgo(3) },
    { name: 'a.pdf', mtime: hoursAgo(3) },
  ], now)?.name === 'a.pdf', 'pdf wins a tie');

  const plist = plistXml();
  assert((plist.match(/<key>Weekday<\/key>/g) || []).length === 10, 'weekdays x 2 run times');
  assert(plist.includes('<integer>12</integer><key>Minute</key><integer>45</integer>'), '12:45 entry');
  assert(plist.includes(RUNNER) && plist.includes(LOG), 'plist points at this script and the log');
  if (process.platform === 'darwin') {
    const tmp = join(tmpdir(), `${LABEL}.selfcheck.plist`);
    writeFileSync(tmp, plist);
    const lint = spawnSync('plutil', ['-lint', tmp], { encoding: 'utf8' });
    unlinkSync(tmp);
    assert(lint.status === 0, `plutil -lint: ${lint.stdout || lint.stderr}`);
  }

  assert(existsSync(APPLY), 'apply-attendance-bulletin.mjs is where the plist expects');
  console.log('bulletin-local.selfcheck: ok');
  return 0;
}

const cmd = process.argv[2] || '';
if (cmd === '--self-check') process.exit(selfCheck());
if (cmd === '--install') process.exit(install());
if (cmd === '--uninstall') process.exit(uninstall());
if (cmd === '--status') process.exit(status());
process.exit(run());
