#!/usr/bin/env node
/**
 * hub-mac-setup.mjs — one command to get both Mac-local pipelines running.
 *
 *   node scripts/hub-mac-setup.mjs            check everything, report
 *   node scripts/hub-mac-setup.mjs --apply    also install/reinstall the agents
 *   node scripts/hub-mac-setup.mjs --self-check
 *
 * Covers the two launchd jobs that read Apple Mail:
 *   com.nwsa.hub.bulletin        daily office Attendance Bulletin PDF
 *   com.nwsa.hub.absence-email   parent "not going to be there" emails
 *
 * Read-only by default. Nothing here rewrites git state or edits a plist by
 * hand — destructive or ambiguous steps are REPORTED with the exact command
 * to run, never guessed at. --apply is limited to (re)installing the agents,
 * which is idempotent and carries existing plist env forward.
 */

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HOME = homedir();
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = dirname(HERE);
const CRED = process.env.NWSA_SERVICE_ACCOUNT || join(HOME, '.config/nwsa-hub/service-account.json');

const AGENTS = [
  { label: 'com.nwsa.hub.bulletin', script: 'bulletin-local.mjs', what: 'office Attendance Bulletin' },
  { label: 'com.nwsa.hub.absence-email', script: 'absence-email-local.mjs', what: 'parent absence emails' },
];

const APPLY = process.argv.includes('--apply');
const problems = [];
const notes = [];
/** Set when the shell's account filter is missing or names no real account. */
let badAccountFilter = false;

const ok = (s) => `  ok    ${s}`;
const bad = (s) => `  FIX   ${s}`;
const info = (s) => `        ${s}`;
const sh = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', ...opts });

function head(t) { console.log(`\n${t}\n${'-'.repeat(t.length)}`); }

/** Repo state. Reported only — resetting a branch can discard work. */
function checkGit() {
  head('Repository');
  const branch = sh('git', ['-C', REPO, 'branch', '--show-current']).stdout?.trim();
  const dirty = sh('git', ['-C', REPO, 'status', '--porcelain']).stdout?.trim();
  sh('git', ['-C', REPO, 'fetch', 'origin', 'main', '-q']);
  const ahead = sh('git', ['-C', REPO, 'log', '--oneline', 'origin/main..HEAD']).stdout?.trim();
  const behind = sh('git', ['-C', REPO, 'log', '--oneline', 'HEAD..origin/main']).stdout?.trim();

  console.log(info(`branch: ${branch || '(detached)'}`));
  if (dirty) {
    console.log(bad('uncommitted changes present — commit or stash before switching branches'));
    problems.push('uncommitted changes');
  } else {
    console.log(ok('working tree clean'));
  }

  if (!behind && !ahead) {
    console.log(ok('up to date with origin/main'));
    return;
  }
  if (behind) console.log(bad(`${behind.split('\n').length} commit(s) behind origin/main — the agents would run OLD code`));
  if (ahead) console.log(info(`${ahead.split('\n').length} local commit(s) not on origin/main`));
  problems.push('not on current origin/main');
  console.log(info('to get current (only if the local commits above are already merged):'));
  console.log(info('  git checkout -B main origin/main'));
}

function checkCred() {
  head('Firebase service account');
  if (!existsSync(CRED)) {
    console.log(bad(`missing at ${CRED}`));
    console.log(info('see docs/ABSENCE-EMAIL.md → "Getting the service account key"'));
    problems.push('no service account');
    return;
  }
  try {
    JSON.parse(readFileSync(CRED, 'utf8'));
    console.log(ok(CRED));
  } catch {
    console.log(bad(`${CRED} is not valid JSON (half-downloaded?)`));
    problems.push('bad service account');
  }
}

/**
 * Ask Mail for its account names. Doubles as the permission probe: if this is
 * denied, every scheduled run is denied too.
 * @returns {{ ok: boolean, accounts: string[], denied: boolean, error: string }}
 */
function mailAccounts() {
  const r = sh('osascript', ['-l', 'JavaScript', '-e',
    'Application("Mail").accounts().map(function(a){return a.name()}).join("\\n")'], { timeout: 120_000 });
  if (r.status !== 0) {
    return {
      ok: false, accounts: [], error: r.stderr || `osascript exited ${r.status}`,
      denied: /not authorized|-1743|not allowed/i.test(r.stderr || ''),
    };
  }
  return { ok: true, accounts: (r.stdout || '').split('\n').map(s => s.trim()).filter(Boolean), denied: false, error: '' };
}

function checkMail() {
  head('Apple Mail access');
  if (process.platform !== 'darwin') {
    console.log(info('not macOS — skipping (this script is for the director\'s Mac)'));
    return [];
  }
  const m = mailAccounts();
  if (!m.ok) {
    if (m.denied) {
      console.log(bad('Mail automation is DENIED — every scheduled run will fail'));
      console.log(info('System Settings → Privacy & Security → Automation → allow "Mail"'));
      console.log(info('then: node scripts/bulletin-local.mjs --grant'));
      problems.push('Mail automation denied');
    } else {
      console.log(bad(`could not reach Mail: ${String(m.error).trim().slice(0, 100)}`));
      problems.push('Mail unreachable');
    }
    return [];
  }
  console.log(ok(`Mail answered — ${m.accounts.length} account(s):`));
  for (const a of m.accounts) console.log(info(`  "${a}"`));

  const want = process.env.MDC_MAIL_ACCOUNT_NAME || '';
  if (!want) {
    console.log(bad('MDC_MAIL_ACCOUNT_NAME is not set — the agents would read EVERY account above'));
    console.log(info('pick the MDC one from the list and re-run with it set, e.g.:'));
    console.log(info(`  export MDC_MAIL_ACCOUNT_NAME=${JSON.stringify(m.accounts[0] ?? 'Account Name')}`));
    problems.push('no account filter');
    badAccountFilter = true;
  } else if (!m.accounts.includes(want)) {
    console.log(bad(`MDC_MAIL_ACCOUNT_NAME="${want}" does not match any account above`));
    console.log(info('the name must match EXACTLY — the agents would find no mail at all'));
    const guess = m.accounts.find(a => /mdc/i.test(a));
    if (guess) console.log(info(`did you mean:  export MDC_MAIL_ACCOUNT_NAME=${JSON.stringify(guess)}`));
    problems.push('account filter does not match');
    badAccountFilter = true;
  } else {
    console.log(ok(`account filter matches: "${want}"`));
  }
  return m.accounts;
}

function agentSection() {
  for (const a of AGENTS) {
    head(`Agent: ${a.label}  (${a.what})`);
    const script = join(HERE, a.script);
    if (!existsSync(script)) {
      console.log(bad(`missing ${a.script} — repo is not current`));
      problems.push(`${a.script} missing`);
      continue;
    }
    // --install bakes the CURRENT shell's account filter into the plist. If
    // that value is wrong, installing replaces a good baked-in name with a
    // bad one and the agent silently stops finding mail. Refuse instead.
    if (APPLY && badAccountFilter) {
      console.log(bad('skipped --install: the account filter above is wrong'));
      console.log(info('installing now would overwrite the working value in the plist'));
      continue;
    }
    if (APPLY) {
      const r = sh(process.execPath, [script, '--install'], { cwd: REPO, stdio: 'inherit' });
      if (r.status !== 0) problems.push(`${a.label} install failed`);
    }
    const st = sh(process.execPath, [script, '--status'], { cwd: REPO });
    const out = (st.stdout || '') + (st.stderr || '');
    console.log(out.trimEnd().split('\n').map(l => `  ${l}`).join('\n'));
    if (/not loaded/.test(out)) problems.push(`${a.label} not installed`);
    if (/dry run/.test(out)) notes.push(`${a.label} is in DRY RUN — it will not write`);
    if (/DENIED/.test(out)) problems.push(`${a.label} cannot reach Mail`);
  }
}

function verdict() {
  head('Verdict');
  if (problems.length === 0) {
    console.log(ok('everything checks out'));
  } else {
    for (const p of problems) console.log(bad(p));
  }
  for (const n of notes) console.log(info(`note: ${n}`));
  if (!APPLY && problems.length) {
    console.log(info('\nre-run with --apply to (re)install the agents once the FIX items above are cleared'));
  }
  console.log('');
  return problems.length ? 1 : 0;
}

function selfCheck() {
  const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } };
  for (const a of AGENTS) assert(existsSync(join(HERE, a.script)), `${a.script} exists`);
  assert(typeof mailAccounts === 'function' && typeof checkGit === 'function', 'checks defined');
  console.log('hub-mac-setup.selfcheck: ok');
  return 0;
}

if (process.argv.includes('--self-check')) process.exit(selfCheck());

console.log('NWSA Hub — Mac pipeline setup check');
console.log(`repo: ${REPO}`);
checkGit();
checkCred();
checkMail();
agentSection();
process.exit(verdict());
