#!/usr/bin/env node
/**
 * bulletin-local.mjs — apply the daily Attendance Bulletin from Grant's Mac.
 *
 * Reads the bulletin PDF straight out of Apple Mail. Nothing here touches
 * Outlook, Power Automate, OneDrive Online, or Microsoft Graph:
 *
 *   Mail.app INBOX ("Attendance Bulletin" + PDF attachment)
 *     → launchd (weekdays 12:45 PM + 3:15 PM) → apply-attendance-bulletin.mjs
 *
 *   node scripts/bulletin-local.mjs              run once, now
 *   node scripts/bulletin-local.mjs --install    load the LaunchAgent
 *   node scripts/bulletin-local.mjs --grant      settle the Mail permission up front
 *   node scripts/bulletin-local.mjs --find-mail  where is the bulletin, really?
 *   node scripts/bulletin-local.mjs --status     loaded? creds? what would it read?
 *   node scripts/bulletin-local.mjs --uninstall  unload and remove it
 *   node scripts/bulletin-local.mjs --self-check
 *
 * Credentials: ~/.config/nwsa-hub/service-account.json (chmod 600, never committed).
 * Log: ~/Library/Logs/nwsa-bulletin.log, trimmed to the last 800 lines.
 * No mail, no bulletin, or missing credentials all log and exit 0.
 *
 * Why Mail and not the OneDrive drop it used to read: ~/Library/CloudStorage
 * is TCC-protected in a way that denied the SCHEDULED job the file while
 * manual runs succeeded, and it surfaced as the misleading "Need pdftotext
 * (poppler) or pymupdf to read PDF" — so every cron run failed looking like a
 * missing dependency. The OneDrive path survives only as a fallback.
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
const MAIL_FETCHER = join(HERE, 'lib/mail-bulletin-fetch.jxa.js');
/** Legacy OneDrive drop. Only consulted if Mail yields nothing (see run()). */
const BULLETIN_DIR = process.env.BULLETIN_DIR
  || join(HOME, 'Library/CloudStorage/OneDrive-MiamiDadeCollege/Hub/attendance-bulletins');
const CRED = process.env.NWSA_SERVICE_ACCOUNT || join(HOME, '.config/nwsa-hub/service-account.json');
const LOG = join(HOME, 'Library/Logs/nwsa-bulletin.log');
const PLIST = join(HOME, 'Library/LaunchAgents', `${LABEL}.plist`);
const SAVE_DIR = join(tmpdir(), 'nwsa-hub-bulletins');
/** Subject text that identifies the daily bulletin mail. */
const MAIL_SUBJECT = process.env.BULLETIN_MAIL_SUBJECT || 'attendance bulletin';
/** Exact Mail.app account name (Mail ▸ Settings ▸ Accounts); blank = all. */
const ACCOUNT_FILTER = process.env.MDC_MAIL_ACCOUNT_NAME || '';

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

function mailDenialHelp(stderr) {
  return `Mail.app automation was denied (macOS privacy): ${String(stderr).trim()}\n`
    + '  System Settings → Privacy & Security → Automation → Terminal (or node) → allow "Mail"\n'
    + '  Then re-run: node scripts/bulletin-local.mjs --grant';
}

/**
 * Pull the newest bulletin PDF out of Apple Mail.
 *
 * This is the primary source. The old path read a OneDrive folder that Power
 * Automate filled, but ~/Library/CloudStorage is TCC-protected in a way that
 * denied the SCHEDULED job the file while manual runs succeeded — and it
 * surfaced as the misleading "Need pdftotext (poppler) or pymupdf to read
 * PDF", so every cron run failed while looking like a missing dependency.
 * Attachments saved to an ordinary temp dir have no such problem.
 *
 * @returns {{ ok: true, path: string | null } | { ok: false, denied: boolean, error: string }}
 */
function fetchBulletinFromMail() {
  mkdirSync(SAVE_DIR, { recursive: true });
  const since = new Date(Date.now() - MAX_AGE_HOURS * 3600_000).toISOString();
  const args = ['-l', 'JavaScript', MAIL_FETCHER, since, SAVE_DIR, MAIL_SUBJECT];
  if (ACCOUNT_FILTER) args.push(ACCOUNT_FILTER);

  const r = spawnSync('osascript', args, { encoding: 'utf8', maxBuffer: 20_000_000, timeout: 120_000 });
  if (r.status !== 0) {
    const denied = /not authorized|-1743|not allowed/i.test(r.stderr || '');
    return { ok: false, denied, error: r.stderr || `osascript exited ${r.status}` };
  }

  let found;
  try { found = JSON.parse(r.stdout || '[]'); }
  catch { return { ok: false, denied: false, error: `Could not parse mail-bulletin-fetch output: ${r.stdout?.slice(0, 200)}` }; }

  // Newest message wins; the apply step re-reads the date from the PDF itself.
  const newest = found
    .filter(m => m.files?.length)
    .sort((a, b) => Date.parse(b.receivedDate) - Date.parse(a.receivedDate))[0];
  return { ok: true, path: newest ? newest.files[newest.files.length - 1] : null };
}

/** Saved attachments are disposable; don't let them pile up in temp forever. */
function pruneSaved() {
  try {
    const cutoff = Date.now() - MAX_AGE_HOURS * 3600_000;
    for (const name of readdirSync(SAVE_DIR)) {
      const p = join(SAVE_DIR, name);
      try { if (statSync(p).mtimeMs < cutoff) unlinkSync(p); } catch { /* raced */ }
    }
  } catch { /* nothing saved yet */ }
}

/** Keep the tail so an unattended agent cannot fill the disk. */
function trimLog() {
  try {
    if (statSync(LOG).size <= LOG_MAX_BYTES) return;
    writeFileSync(LOG, readFileSync(LOG, 'utf8').split('\n').slice(-LOG_KEEP_LINES).join('\n'));
  } catch { /* no log yet */ }
}

/** EnvironmentVariables the INSTALLED agent carries — not this shell's. */
function installedEnv() {
  const out = {};
  try {
    const plist = readFileSync(PLIST, 'utf8');
    const block = /<key>EnvironmentVariables<\/key>\s*<dict>([\s\S]*?)<\/dict>/.exec(plist)?.[1] ?? '';
    for (const m of block.matchAll(/<key>([^<]+)<\/key>\s*<string>([^<]*)<\/string>/g)) {
      out[m[1]] = m[2];
    }
  } catch { /* not installed yet */ }
  return out;
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
  pruneSaved();

  // Mail first. The OneDrive folder is only a fallback for a Mac that still
  // has the old Power Automate sync and no Mail access yet.
  let sourcePath = null;
  let sourceLabel = '';

  const mail = fetchBulletinFromMail();
  if (!mail.ok) {
    if (mail.denied) {
      log(mailDenialHelp(mail.error));
      notify('Bulletin agent needs Automation access for Mail. See the log.');
      return 0;
    }
    log(`Mail fetch failed: ${mail.error}`);
  } else if (mail.path) {
    sourcePath = mail.path;
    sourceLabel = `Mail: ${mail.path.split('/').pop()}`;
  } else {
    log(`No "${MAIL_SUBJECT}" mail with a PDF in the last ${MAX_AGE_HOURS}h.`);
  }

  if (!sourcePath) {
    const { files, denied } = listBulletins();
    if (denied) {
      log(denialHelp());
    } else {
      const pick = pickBulletin(files);
      if (pick) {
        sourcePath = join(BULLETIN_DIR, pick.name);
        sourceLabel = `OneDrive (legacy): ${pick.name}`;
      }
    }
  }

  if (!sourcePath) { log(`No bulletin from the last ${MAX_AGE_HOURS}h in Mail or ${BULLETIN_DIR}; skip.`); return 0; }

  const cred = readCred();
  if (!cred) log(`No usable service account at ${CRED}; parsing only. See docs/ATTENDANCE-BULLETIN.md.`);
  const dryRun = cred ? (process.env.DRY_RUN || DRY_RUN) : 'parse-only';
  log(`Reading ${sourceLabel} (DRY_RUN=${dryRun})`);

  const env = { ...process.env, DRY_RUN: dryRun, SKIP_IF_EMPTY: '1' };
  if (cred) env.FIREBASE_SERVICE_ACCOUNT_JSON = cred;
  env[/\.pdf$/i.test(sourcePath) ? 'BULLETIN_PDF_PATH' : 'BULLETIN_TEXT_PATH'] = sourcePath;

  const code = spawnSync(process.execPath, [APPLY], { cwd: dirname(HERE), env, stdio: 'inherit' }).status ?? 1;
  if (code !== 0) {
    log(`apply-attendance-bulletin exited ${code}`);
    notify(`Bulletin apply failed (exit ${code}). See ${LOG}`);
  }
  return code;
}

/** @param {Record<string,string>} [installed] env already on the installed agent */
function plistXml(installed = installedEnv()) {
  const calendar = RUN_TIMES.flatMap(([h, m]) => [1, 2, 3, 4, 5].map(wd =>
    `    <dict><key>Weekday</key><integer>${wd}</integer>`
    + `<key>Hour</key><integer>${h}</integer>`
    + `<key>Minute</key><integer>${m}</integer></dict>`)).join('\n');
  // launchd does NOT source a shell profile, so everything the scheduled job
  // needs from the environment is baked in HERE, at install time.
  //
  // DRY_RUN especially. It used to be hand-added to this plist after install,
  // which meant the next --install silently wiped it and reverted a LIVE
  // pipeline to dry run — no error, attendance just quietly stops. Carrying
  // the live value forward makes reinstalling safe.
  const envEntries = [['PATH', process.env.PATH || '']];
  const dryRun = process.env.DRY_RUN ?? installed.DRY_RUN;
  if (dryRun != null) envEntries.push(['DRY_RUN', dryRun]);
  const account = ACCOUNT_FILTER || installed.MDC_MAIL_ACCOUNT_NAME;
  if (account) envEntries.push(['MDC_MAIL_ACCOUNT_NAME', account]);
  const envXml = envEntries
    .map(([k, v]) => `    <key>${xml(k)}</key><string>${xml(v)}</string>`)
    .join('\n');
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
  <dict>
${envXml}
  </dict>
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
  // The installed plist is the authority: this shell's constant says nothing
  // about what the scheduled job is actually doing.
  const installed = installedEnv();
  const effective = installed.DRY_RUN ?? DRY_RUN;
  console.log(`mode:     ${effective === 'false' ? 'LIVE, writes to Firestore' : 'dry run, no writes'}`
    + `${installed.DRY_RUN == null ? ' (from this script; agent plist sets none)' : ' (from the agent plist)'}`);
  console.log(`creds:    ${readCred() ? CRED : `missing — put the key at ${CRED}`}`);
  console.log(`account:  ${installed.MDC_MAIL_ACCOUNT_NAME || ACCOUNT_FILTER
    || 'ALL Mail.app accounts — set MDC_MAIL_ACCOUNT_NAME, then re-run --install'}`);
  const mail = fetchBulletinFromMail();
  console.log(`mail:     ${mail.ok
    ? (mail.path ? mail.path.split('/').pop() : `no "${MAIL_SUBJECT}" mail with a PDF in ${MAX_AGE_HOURS}h`)
    : (mail.denied ? 'DENIED — run --grant' : `error: ${String(mail.error).trim().slice(0, 80)}`)}`);
  let pick = null;
  try { pick = pickBulletin(listBulletins().files); } catch { /* folder missing */ }
  console.log(`onedrive: ${pick
    ? `${pick.name}, ${Math.round((Date.now() - pick.mtime) / 3600_000)}h old (legacy fallback)`
    : 'nothing recent (legacy fallback, fine to be empty)'}`);
  console.log(`log:      ${LOG}`);
  return 0;
}

/**
 * Diagnostic: why did the fetch find nothing? Looks in EVERY mailbox of the
 * account with a loose subject match and prints what it sees, so the two
 * plausible causes separate cleanly — a filing rule hiding the message, or an
 * attachment that was never downloaded and so cannot be saved.
 */
function findMail() {
  const days = Number(process.env.FIND_DAYS || 14);
  const needle = process.env.FIND_NEEDLE || 'bulletin';
  const since = new Date(Date.now() - days * 24 * 3600_000).toISOString();
  console.log(`Searching every mailbox${ACCOUNT_FILTER ? ` in "${ACCOUNT_FILTER}"` : ''} `
    + `for subjects containing "${needle}", last ${days} days...\n`);

  const args = ['-l', 'JavaScript', join(HERE, 'lib/mail-bulletin-probe.jxa.js'), since, needle];
  if (ACCOUNT_FILTER) args.push(ACCOUNT_FILTER);
  const r = spawnSync('osascript', args, { encoding: 'utf8', maxBuffer: 20_000_000, timeout: 180_000 });
  if (r.status !== 0) {
    console.error(mailDenialHelp(r.stderr || `osascript exited ${r.status}`));
    return 1;
  }

  let hits;
  try { hits = JSON.parse(r.stdout || '[]'); }
  catch { console.error(`Could not parse probe output: ${r.stdout?.slice(0, 300)}`); return 1; }

  if (hits.length === 0) {
    console.log('Nothing matched. Either the mail is not in this account, or the');
    console.log('subject does not contain that word. Try widening:');
    console.log('  FIND_NEEDLE=attendance FIND_DAYS=30 node scripts/bulletin-local.mjs --find-mail');
    console.log(`  (drop MDC_MAIL_ACCOUNT_NAME to search all accounts)`);
    return 0;
  }

  for (const h of hits) {
    console.log(`  ${h.receivedDate?.slice(0, 16).replace('T', ' ') ?? '(no date)'}  [${h.account}] ${h.mailbox}`
      + `${h.skipped ? '   (SKIPPED — not received mail)' : ''}`);
    console.log(`    subject: ${h.subject}`);
    if (h.attachments.length === 0) {
      console.log('    attachments: NONE — nothing for the pipeline to read');
    } else {
      for (const a of h.attachments) {
        const dl = a.downloaded === false ? '  NOT DOWNLOADED — cannot be saved' : '';
        console.log(`    attachment: ${a.name}${dl}`);
      }
    }
    console.log('');
  }

  const pdfs = hits.filter(h => h.attachments.some(a => /\.pdf$/i.test(a.name)));
  const usable = pdfs.filter(h => !h.skipped);
  console.log(`${hits.length} matching message(s); ${pdfs.length} with a PDF; `
    + `${usable.length} the pipeline will actually read.`);
  if (pdfs.length && !usable.length) {
    console.log('Every hit is in a mailbox the pipeline skips (Sent/Drafts/Junk/Trash).');
    console.log('Those are copies you sent, not bulletins you received.');
  }
  if (pdfs.some(h => h.attachments.some(a => a.downloaded === false))) {
    console.log('At least one attachment is not downloaded. In Mail: Settings → Accounts');
    console.log('→ (account) → Account Information → Download Attachments: All.');
  }
  return 0;
}

/**
 * Settle the Mail permission deliberately, while someone is watching — same
 * reasoning as absence-email-local.mjs: macOS won't let a script grant this
 * to itself, and a LaunchAgent run is a different responsible process than a
 * Terminal run, so both get asked for here rather than during a silent cron.
 */
function grant() {
  console.log('Asking macOS for permission to control Mail — approve the dialog if it appears.\n');
  const probe = spawnSync('osascript', ['-l', 'JavaScript', '-e', 'Application("Mail").accounts().length'],
    { encoding: 'utf8', timeout: 120_000 });
  if (probe.status !== 0) {
    console.error(mailDenialHelp(probe.stderr || `osascript exited ${probe.status}`));
    return 1;
  }
  console.log(`Foreground: OK — Mail answered (${probe.stdout.trim()} account(s) visible).`);

  if (spawnSync('launchctl', ['list', LABEL], { stdio: 'ignore' }).status !== 0) {
    console.log('\nAgent is not installed yet. Run --install, then --grant again.');
    return 0;
  }
  console.log('\nForcing one real background run — the context launchd will use...');
  const kick = spawnSync('launchctl', ['kickstart', '-k', `gui/${uid()}/${LABEL}`], { encoding: 'utf8' });
  if (kick.status !== 0) {
    console.error(kick.stderr?.trim() || 'launchctl kickstart failed');
    return 1;
  }
  console.log(`Kicked off. Confirm it read Mail:\n  tail -n 40 ${LOG}`);
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

  // DRY_RUN used to be hand-added to the plist, so --install silently wiped it
  // and reverted a live pipeline to dry run. Reinstalling must carry it over.
  const withLive = plistXml({ DRY_RUN: 'false', MDC_MAIL_ACCOUNT_NAME: 'MDC & <Mail>' });
  assert(/<key>DRY_RUN<\/key><string>false<\/string>/.test(withLive), 'live DRY_RUN survives a reinstall');
  assert(withLive.includes('MDC &amp; &lt;Mail>'), 'account name is XML-escaped into the plist');
  const noEnv = plistXml({});
  assert(!noEnv.includes('MDC_MAIL_ACCOUNT_NAME'), 'no stale account filter when never set');

  assert(existsSync(APPLY), 'apply-attendance-bulletin.mjs is where the plist expects');
  assert(existsSync(MAIL_FETCHER), 'mail-bulletin-fetch.jxa.js is where this script expects');
  assert(existsSync(join(HERE, 'lib/mail-bulletin-probe.jxa.js')), 'mail-bulletin-probe.jxa.js exists');
  console.log('bulletin-local.selfcheck: ok');
  return 0;
}

const cmd = process.argv[2] || '';
if (cmd === '--self-check') process.exit(selfCheck());
if (cmd === '--install') process.exit(install());
if (cmd === '--grant') process.exit(grant());
if (cmd === '--find-mail') process.exit(findMail());
if (cmd === '--uninstall') process.exit(uninstall());
if (cmd === '--status') process.exit(status());
process.exit(run());
