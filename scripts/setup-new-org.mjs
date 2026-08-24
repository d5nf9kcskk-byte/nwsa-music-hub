#!/usr/bin/env node
/**
 * setup-new-org.mjs — one-command infrastructure setup for a new demo org
 * (#org-config).
 *
 * Automates the per-org console clickwork that docs/demo-asyo-setup.md and
 * docs/demo-as-setup.md walk through by hand (~45 minutes each):
 *
 *   1. Firebase project  `<org>-hub-demo`  (Spark, no Analytics)
 *   2. Firestore database (nam5, production mode)
 *   3. Web app `<org>-hub-demo-web` + its six SDK config values
 *   4. Service-account key (the Admin SDK account the console button uses)
 *   5. GitHub Pages repo `<org>-music-hub` with a write-enabled deploy key
 *   6. The <ORG>_* Actions secrets on the source repo
 *   7. Dispatches the seed workflow, then the deploy workflow, then turns
 *      on Pages for the target repo once gh-pages exists
 *
 * ONE step stays manual — enabling the Google sign-in provider (and its
 * support email) in the Firebase console. The public Identity Toolkit admin
 * API can only enable google.com as an IdP when handed an existing OAuth
 * client id/secret, and there is no public API that creates the OAuth
 * consent screen or client for an external app; the console does it through
 * a private provisioning endpoint. The script tells you exactly when and
 * where to click (~2 minutes), then finishes the part of Auth setup that IS
 * automatable: adding the github.io Pages domain to authorized domains.
 *
 * Prerequisites (one-time, on your Mac — see docs/new-org-setup.md):
 *   gcloud auth login;  firebase login;  gh auth login
 * Per-org code must already be on main before running this: the org config,
 * seed script, and deploy/seed workflows (see PREREQ FILES below).
 *
 * Run:
 *   node scripts/setup-new-org.mjs <org> [--dry-run] [--owner-email a@b.c]
 *                                        [--location nam5] [--rotate-key]
 *                                        [--finish-auth] [--yes]
 *
 * Idempotent: every create step checks for the thing first and skips it if
 * it already exists, so a failed run can simply be re-run. It only ever
 * CREATES; nothing here deletes or modifies existing projects, and it
 * hard-refuses to touch `nwsa` / `nwsa-hub` / `nwsa-music-hub`.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

// ── Fixed identities (match docs/demo-asyo-setup.md / demo-as-setup.md) ──
const SOURCE_REPO = 'd5nf9kcskk-byte/nwsa-music-hub';
const PAGES_OWNER = 'd5nf9kcskk-byte';
const PAGES_DOMAIN = 'd5nf9kcskk-byte.github.io';
const FORBIDDEN_ORGS = new Set(['nwsa']);
const FORBIDDEN_PROJECTS = new Set(['nwsa-hub']);
const FORBIDDEN_REPOS = new Set(['nwsa-music-hub']);

// The first two orgs predate the <org>-suffixed naming convention.
const WORKFLOW_NAMES = {
  asyo: { deploy: 'deploy-demo.yml', seed: 'seed-demo.yml', seedScript: 'seed-demo-org.mjs' },
};
function workflowsFor(org) {
  return WORKFLOW_NAMES[org] ?? {
    deploy: `deploy-${org}.yml`,
    seed: `seed-${org}.yml`,
    seedScript: `seed-${org}-org.mjs`,
  };
}

// ── CLI args ─────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--') && !a.includes('=')));
function flagValue(name) {
  const eq = argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const i = argv.indexOf(`--${name}`);
  if (i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--')) {
    flags.delete(`--${name}`);
    return argv[i + 1];
  }
  return undefined;
}
const OWNER_EMAIL = flagValue('owner-email');
const LOCATION = flagValue('location') ?? 'nam5';
const DRY_RUN = flags.has('--dry-run');
const ROTATE_KEY = flags.has('--rotate-key');
const FINISH_AUTH_ONLY = flags.has('--finish-auth');
const ASSUME_YES = flags.has('--yes');

const positional = argv.filter(
  (a) => !a.startsWith('--') && a !== OWNER_EMAIL && a !== LOCATION,
);
const org = positional[0];

if (!org || flags.has('--help')) {
  console.log('Usage: node scripts/setup-new-org.mjs <org> [options]\n');
  console.log('  <org>            short lowercase org id, e.g. "as" (see config/orgs/)');
  console.log('  --dry-run        print the full plan; change nothing anywhere');
  console.log('  --owner-email E  Google account to seed as demo owner (must be able');
  console.log('                   to complete a GOOGLE sign-in — see the setup docs)');
  console.log('  --location L     Firestore location (default nam5)');
  console.log('  --rotate-key     mint a new service-account key even if the secret exists');
  console.log('  --finish-auth    only run the post-manual-step part: add the Pages');
  console.log('                   domain to Firebase Auth authorized domains');
  console.log('  --yes            skip confirmation prompts (except the manual-step wait)');
  process.exit(org ? 0 : 1);
}

if (!/^[a-z][a-z0-9]{1,19}$/.test(org)) {
  fail(`org id "${org}" is invalid — expected 2-20 chars, lowercase letters/digits, like "as" or "asyo".`);
}
if (FORBIDDEN_ORGS.has(org)) {
  fail(`REFUSING to run for org "${org}" — this script provisions DEMO orgs only and never touches the NWSA production stack.`);
}

const PROJECT_ID = `${org}-hub-demo`;
const WEB_APP_NAME = `${PROJECT_ID}-web`;
const PAGES_REPO = `${PAGES_OWNER}/${org}-music-hub`;
const SECRET_PREFIX = org.toUpperCase();
const DEPLOY_KEY_TITLE = `${org}-demo-deploy`;
const DEMO_URL = `https://${PAGES_DOMAIN}/${org}-music-hub/`;
const WF = workflowsFor(org);

if (FORBIDDEN_PROJECTS.has(PROJECT_ID) || FORBIDDEN_REPOS.has(`${org}-music-hub`)) {
  fail('Derived a forbidden production identifier — aborting.');
}

// ── Small helpers ────────────────────────────────────────────────────────
function fail(msg) {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
}

function banner(msg) {
  console.log(`\n── ${msg} ${'─'.repeat(Math.max(2, 68 - msg.length))}`);
}

/**
 * Run a command (argv array — never a shell string, so values with spaces or
 * key material can't be misparsed). Secrets are passed via stdin, never argv.
 */
function run(cmd, args, { input, allowFail = false, quiet = false } = {}) {
  const shown = `${cmd} ${args.join(' ')}`;
  if (!quiet) console.log(`  $ ${shown}`);
  const res = spawnSync(cmd, args, {
    encoding: 'utf8',
    input,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (res.error?.code === 'ENOENT') fail(`"${cmd}" is not installed (or not on PATH). See docs/new-org-setup.md for the one-time tool setup.`);
  if (res.status !== 0 && !allowFail) {
    fail(`command failed (exit ${res.status}): ${shown}\n${(res.stderr || res.stdout || '').trim()}`);
  }
  return res;
}

/** A mutation: printed-but-skipped under --dry-run. */
function mutate(desc, cmd, args, opts = {}) {
  if (DRY_RUN) {
    console.log(`  [dry-run] would ${desc}:`);
    console.log(`            $ ${cmd} ${args.join(' ')}${opts.input ? '   (value via stdin)' : ''}`);
    return null;
  }
  return run(cmd, args, opts);
}

/** Depth-first search of parsed JSON for the first object matching `pred`. */
function deepFind(node, pred) {
  if (node && typeof node === 'object') {
    if (!Array.isArray(node) && pred(node)) return node;
    for (const v of Object.values(node)) {
      const hit = deepFind(v, pred);
      if (hit) return hit;
    }
  }
  return null;
}

function parseJsonLoose(text, what) {
  try {
    return JSON.parse(text);
  } catch {
    // firebase-tools sometimes prefixes update-notifier noise; take the
    // first { … last }.
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try { return JSON.parse(text.slice(start, end + 1)); } catch { /* fall through */ }
    }
    fail(`could not parse JSON output of ${what}:\n${text.slice(0, 500)}`);
  }
}

async function pressEnter(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise((resolve) => rl.question(prompt, resolve));
  rl.close();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── The firebase CLI may be a global binary or an npx shim ───────────────
let FIREBASE = ['firebase'];
function fb(args, opts = {}) {
  return run(FIREBASE[0], [...FIREBASE.slice(1), ...args], opts);
}
function fbMutate(desc, args, opts = {}) {
  if (DRY_RUN) {
    console.log(`  [dry-run] would ${desc}:`);
    console.log(`            $ ${FIREBASE.join(' ')} ${args.join(' ')}`);
    return null;
  }
  return fb(args, opts);
}

// ── Preflight ────────────────────────────────────────────────────────────
function preflight() {
  banner('Preflight: tools, auth, and per-org code');

  // gcloud
  const gv = run('gcloud', ['--version'], { allowFail: true, quiet: true });
  if (gv.error || gv.status !== 0) fail('gcloud is not installed. Install the Google Cloud CLI (brew install google-cloud-sdk) then run: gcloud auth login');
  const acct = run('gcloud', ['auth', 'list', '--filter=status:ACTIVE', '--format=value(account)'], { quiet: true, allowFail: true });
  const gcloudAccount = (acct.stdout || '').trim().split('\n')[0];
  if (!gcloudAccount) fail('gcloud has no active account. Run: gcloud auth login');
  console.log(`  ✓ gcloud authenticated as ${gcloudAccount}`);

  // firebase-tools (global binary, or an installed npx package)
  let f = run('firebase', ['--version'], { allowFail: true, quiet: true });
  if (f.error || f.status !== 0) {
    f = run('npx', ['--no-install', 'firebase-tools', '--version'], { allowFail: true, quiet: true });
    if (f.error || f.status !== 0) {
      fail('firebase-tools is not installed. Run: npm install -g firebase-tools && firebase login');
    }
    FIREBASE = ['npx', '--no-install', 'firebase-tools'];
  }
  const login = fb(['login:list'], { allowFail: true, quiet: true });
  const loginOut = `${login.stdout}\n${login.stderr}`;
  if (login.status !== 0 || /No authorized accounts|not logged in/i.test(loginOut)) {
    fail('firebase-tools is not logged in. Run: firebase login');
  }
  console.log(`  ✓ firebase-tools ${(f.stdout || '').trim().split('\n').pop()} logged in`);

  // gh
  const ghs = run('gh', ['auth', 'status'], { allowFail: true, quiet: true });
  if (ghs.error || ghs.status !== 0) {
    fail(`gh is not installed or not logged in. Run: gh auth login\n${(ghs.stderr || '').trim()}`);
  }
  console.log('  ✓ gh authenticated');

  // ssh-keygen
  const sk = run('ssh-keygen', ['-h'], { allowFail: true, quiet: true });
  if (sk.error) fail('ssh-keygen is not available on PATH.');
  console.log('  ✓ ssh-keygen available');

  // PREREQ FILES: the per-org CODE must already exist on main — this script
  // provisions infrastructure, it does not write app code.
  const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const missing = [];
  if (!fs.existsSync(path.join(repoRoot, 'config', 'orgs', `${org}.json`))) {
    missing.push(`config/orgs/${org}.json (the org config)`);
  }
  for (const wfFile of [WF.deploy, WF.seed]) {
    if (!fs.existsSync(path.join(repoRoot, '.github', 'workflows', wfFile))) {
      missing.push(`.github/workflows/${wfFile}`);
    }
  }
  if (!fs.existsSync(path.join(repoRoot, 'scripts', WF.seedScript))) {
    missing.push(`scripts/${WF.seedScript} (the org's seeder — MUST hard-abort unless its service account's project is exactly "${PROJECT_ID}")`);
  }
  if (missing.length) {
    fail(
      `the per-org code for "${org}" is not in this checkout yet. Missing:\n`
      + missing.map((m) => `    - ${m}`).join('\n')
      + '\n  Land that first (model the files on an existing org\'s — deploy-demo.yml / '
      + 'seed-demo.yml / seed-demo-org.mjs for ASYO — see docs/new-org-setup.md), '
      + 'merge to main, then run this script.',
    );
  }
  console.log(`  ✓ per-org code present: config/orgs/${org}.json, ${WF.deploy}, ${WF.seed}, scripts/${WF.seedScript}`);
}

// ── Auth REST helpers (Identity Toolkit admin API) ───────────────────────
function gcloudAccessToken() {
  const res = run('gcloud', ['auth', 'print-access-token'], { quiet: true });
  return res.stdout.trim();
}

async function identityConfigRequest(method, body) {
  const token = gcloudAccessToken();
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT_ID}/config`
    + (method === 'PATCH' ? '?updateMask=authorizedDomains' : ''),
    {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Goog-User-Project': PROJECT_ID,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    },
  );
  const text = await res.text();
  return { ok: res.ok, status: res.status, body: text ? JSON.parse(text) : null };
}

/**
 * The automatable half of Auth setup: add the Pages domain to authorized
 * domains. Only works AFTER the manual console step has initialized Auth.
 */
async function finishAuth() {
  banner(`Auth: authorize ${PAGES_DOMAIN} for sign-in`);
  if (DRY_RUN) {
    console.log(`  [dry-run] would PATCH identitytoolkit admin/v2/projects/${PROJECT_ID}/config`);
    console.log(`            adding "${PAGES_DOMAIN}" to authorizedDomains`);
    return;
  }
  mutate('enable the Identity Toolkit API', 'gcloud', ['services', 'enable', 'identitytoolkit.googleapis.com', `--project=${PROJECT_ID}`]);
  const current = await identityConfigRequest('GET');
  if (!current.ok) {
    console.log(`  ✖ could not read the Auth config (HTTP ${current.status}).`);
    console.log('    This usually means the manual console step has not been done yet');
    console.log('    (Authentication → Get started → Google → Enable). Do that, then run:');
    console.log(`      node scripts/setup-new-org.mjs ${org} --finish-auth`);
    return false;
  }
  const domains = current.body.authorizedDomains ?? [];
  if (domains.includes(PAGES_DOMAIN)) {
    console.log(`  ✓ ${PAGES_DOMAIN} already authorized — nothing to do`);
    return true;
  }
  const patched = await identityConfigRequest('PATCH', { authorizedDomains: [...domains, PAGES_DOMAIN] });
  if (!patched.ok) {
    console.log(`  ✖ PATCH failed (HTTP ${patched.status}): ${JSON.stringify(patched.body).slice(0, 300)}`);
    console.log('    Add it by hand: Authentication → Settings → Authorized domains.');
    return false;
  }
  console.log(`  ✓ added ${PAGES_DOMAIN} to authorized domains`);
  return true;
}

// ── Step 1-2: Firebase project + Firestore ───────────────────────────────
function ensureProject() {
  banner(`Firebase project: ${PROJECT_ID}`);
  const exists = run('gcloud', ['projects', 'describe', PROJECT_ID, '--format=value(projectId)'], { allowFail: true, quiet: true });
  if (exists.status === 0) {
    console.log(`  ✓ GCP project ${PROJECT_ID} already exists — reusing it`);
  } else {
    const created = fbMutate(
      `create Firebase project ${PROJECT_ID} (Spark plan, no Analytics — same as the console flow)`,
      ['projects:create', PROJECT_ID, '--display-name', PROJECT_ID, '--non-interactive'],
      { allowFail: true },
    );
    if (created && created.status !== 0) {
      const out = `${created.stdout}\n${created.stderr}`;
      if (/already exists|unavailable|taken/i.test(out)) {
        fail(`the project id "${PROJECT_ID}" is taken globally (project ids are unique across ALL of Google Cloud, not just your account). Pick a different org id, or if the project is yours under another account, switch gcloud/firebase to that account.\n${out.trim()}`);
      }
      fail(`firebase projects:create failed:\n${out.trim()}`);
    }
    if (created) console.log(`  ✓ created ${PROJECT_ID}`);
  }

  // If the GCP project predates Firebase (e.g. a partial earlier run via
  // gcloud), make sure Firebase is attached. Harmless if already attached.
  if (!DRY_RUN && exists.status === 0) {
    const add = fb(['projects:addfirebase', PROJECT_ID, '--non-interactive'], { allowFail: true, quiet: true });
    if (add.status !== 0 && !/already/i.test(`${add.stdout}${add.stderr}`)) {
      console.log('  (projects:addfirebase reported an error — fine if Firebase is already attached)');
    }
  }
}

function ensureFirestore() {
  banner(`Firestore database (${LOCATION}, production mode)`);
  mutate('enable the Firestore API', 'gcloud', ['services', 'enable', 'firestore.googleapis.com', `--project=${PROJECT_ID}`]);
  const list = DRY_RUN
    ? { stdout: '' }
    : run('gcloud', ['firestore', 'databases', 'list', `--project=${PROJECT_ID}`, '--format=value(name)'], { allowFail: true, quiet: true });
  if ((list.stdout || '').trim()) {
    console.log('  ✓ Firestore database already exists — reusing it');
    return;
  }
  mutate(
    `create the (default) Firestore database in ${LOCATION}`,
    'gcloud',
    ['firestore', 'databases', 'create', `--location=${LOCATION}`, '--type=firestore-native', `--project=${PROJECT_ID}`],
  );
  if (!DRY_RUN) console.log('  ✓ Firestore database created (production mode is the API default — no open rules window)');
}

// ── Step 3: web app + SDK config ─────────────────────────────────────────
function ensureWebApp() {
  banner(`Web app: ${WEB_APP_NAME}`);
  if (DRY_RUN) {
    console.log(`  [dry-run] would create web app ${WEB_APP_NAME} (firebase apps:create WEB) unless one exists,`);
    console.log('            then read its SDK config (firebase apps:sdkconfig WEB <appId>)');
    return null;
  }
  const listRes = fb(['apps:list', 'WEB', '--project', PROJECT_ID, '--json'], { quiet: true });
  const listed = parseJsonLoose(listRes.stdout, 'firebase apps:list');
  let app = deepFind(listed, (o) => o.displayName === WEB_APP_NAME && typeof o.appId === 'string');
  if (app) {
    console.log(`  ✓ web app already registered (${app.appId}) — reusing it`);
  } else {
    const created = fb(['apps:create', 'WEB', WEB_APP_NAME, '--project', PROJECT_ID, '--json']);
    app = deepFind(parseJsonLoose(created.stdout, 'firebase apps:create'), (o) => typeof o.appId === 'string');
    if (!app) fail('could not find the new appId in firebase apps:create output.');
    console.log(`  ✓ registered web app ${app.appId}`);
  }

  const cfgRes = fb(['apps:sdkconfig', 'WEB', app.appId, '--project', PROJECT_ID, '--json'], { quiet: true });
  const parsed = parseJsonLoose(cfgRes.stdout, 'firebase apps:sdkconfig');
  let cfg = deepFind(parsed, (o) => o.apiKey && o.projectId && o.appId);
  if (!cfg) {
    // Older firebase-tools wrap the config in a fileContents JS snippet.
    const snippet = deepFind(parsed, (o) => typeof o.fileContents === 'string')?.fileContents
      ?? cfgRes.stdout;
    const m = snippet.match(/\{[^{}]*"apiKey"[\s\S]*?\}/);
    if (m) { try { cfg = JSON.parse(m[0]); } catch { /* handled below */ } }
  }
  if (!cfg) fail('could not extract the SDK config from firebase apps:sdkconfig output.');
  for (const k of ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId']) {
    if (!cfg[k]) fail(`SDK config is missing "${k}" — refusing to write incomplete secrets.`);
  }
  if (cfg.projectId !== PROJECT_ID) fail(`SDK config is for "${cfg.projectId}", expected "${PROJECT_ID}" — aborting.`);
  console.log('  ✓ fetched the six SDK config values');
  return cfg;
}

// ── Step 4: service-account key ──────────────────────────────────────────
function existingSourceSecrets() {
  const res = run('gh', ['api', `repos/${SOURCE_REPO}/actions/secrets`, '--paginate', '--jq', '.secrets[].name'], { quiet: true, allowFail: true });
  if (res.status !== 0) fail(`could not list Actions secrets on ${SOURCE_REPO} — does your gh token have access to it?\n${res.stderr}`);
  return new Set(res.stdout.split('\n').filter(Boolean));
}

async function ensureServiceAccountKey(tmpDir, secrets) {
  banner('Service-account key (Admin SDK)');
  const secretName = `${SECRET_PREFIX}_SERVICE_ACCOUNT_JSON`;
  if (!DRY_RUN && secrets.has(secretName) && !ROTATE_KEY) {
    console.log(`  ✓ ${secretName} already set on ${SOURCE_REPO} — keeping the existing key`);
    console.log('    (pass --rotate-key to mint a new one; the old key stays valid until');
    console.log('    revoked in IAM → Service accounts → Keys)');
    return null;
  }
  if (DRY_RUN) {
    console.log(`  [dry-run] would locate the firebase-adminsdk service account in ${PROJECT_ID}`);
    console.log('            and mint a key: gcloud iam service-accounts keys create …');
    console.log(`            (skipped if ${secretName} already exists, unless --rotate-key)`);
    return null;
  }

  // The console's "Generate new private key" button keys this account; it is
  // provisioned asynchronously when Firebase attaches, so poll briefly.
  let saEmail = null;
  for (let attempt = 0; attempt < 12 && !saEmail; attempt++) {
    const res = run('gcloud', [
      'iam', 'service-accounts', 'list',
      `--project=${PROJECT_ID}`,
      '--filter=email:firebase-adminsdk',
      '--format=value(email)',
    ], { quiet: true, allowFail: true });
    saEmail = (res.stdout || '').trim().split('\n').filter(Boolean)[0] || null;
    if (!saEmail) {
      if (attempt === 0) console.log('  … waiting for Firebase to provision the Admin SDK service account');
      await sleep(10_000);
    }
  }
  if (!saEmail) {
    fail(`the firebase-adminsdk service account never appeared in ${PROJECT_ID}. Open the console → Project settings → Service accounts once (that forces provisioning), then re-run this script.`);
  }
  const keyPath = path.join(tmpDir, `${PROJECT_ID}-sa-key.json`);
  const keyRes = run('gcloud', ['iam', 'service-accounts', 'keys', 'create', keyPath, `--iam-account=${saEmail}`, `--project=${PROJECT_ID}`], { allowFail: true });
  if (keyRes.status !== 0) {
    const out = `${keyRes.stdout}\n${keyRes.stderr}`;
    if (/disableServiceAccountKeyCreation|constraints\/iam/i.test(out)) {
      fail(`your Google Cloud organization policy blocks service-account key creation (constraints/iam.disableServiceAccountKeyCreation). Generate the key from the Firebase console instead (Project settings → Service accounts → Generate new private key) and set the ${secretName} secret by hand:\n  gh secret set ${secretName} --repo ${SOURCE_REPO} < key.json`);
    }
    fail(`key creation failed:\n${out.trim()}`);
  }
  const keyJson = fs.readFileSync(keyPath, 'utf8');
  const parsed = JSON.parse(keyJson);
  if (parsed.project_id !== PROJECT_ID) fail(`minted key is for "${parsed.project_id}" — expected ${PROJECT_ID}. Aborting.`);
  console.log(`  ✓ minted a key for ${saEmail} (file deleted after upload — the secret is its only home)`);
  return keyJson;
}

// ── Step 5: Pages repo + deploy key ──────────────────────────────────────
function ensurePagesRepo(orgDisplayName) {
  banner(`GitHub Pages repo: ${PAGES_REPO}`);
  const description = `Built output of the ${orgDisplayName} demo — source lives in nwsa-music-hub`;
  const view = run('gh', ['repo', 'view', PAGES_REPO, '--json', 'name'], { allowFail: true, quiet: true });
  if (view.status === 0) {
    console.log(`  ✓ ${PAGES_REPO} already exists — reusing it`);
    return;
  }
  mutate(`create public repo ${PAGES_REPO}`, 'gh', ['repo', 'create', PAGES_REPO, '--public', '--description', description]);
  const readme = `# ${org}-music-hub\n\n${description}.\n\nDeployed to ${DEMO_URL} by the "${WF.deploy.replace('.yml', '')}" workflow.\n`;
  mutate('add the README', 'gh', [
    'api', '-X', 'PUT', `repos/${PAGES_REPO}/contents/README.md`,
    '-f', 'message=Add README',
    '-f', `content=${Buffer.from(readme).toString('base64')}`,
  ]);
  if (!DRY_RUN) console.log(`  ✓ created ${PAGES_REPO} (public, README only)`);
}

function ensureDeployKey(tmpDir) {
  banner(`Deploy key on ${PAGES_REPO}`);
  if (!DRY_RUN) {
    const list = run('gh', ['api', `repos/${PAGES_REPO}/keys`, '--jq', '.[].title'], { allowFail: true, quiet: true });
    if (list.status === 0 && list.stdout.split('\n').includes(DEPLOY_KEY_TITLE)) {
      console.log(`  ✓ deploy key "${DEPLOY_KEY_TITLE}" already installed — keeping it`);
      console.log(`    (the matching private half must already be in the ${SECRET_PREFIX}_DEPLOY_KEY secret;`);
      console.log('    delete the key on the repo and re-run to rotate the pair)');
      return null;
    }
  }
  if (DRY_RUN) {
    console.log(`  [dry-run] would generate an ed25519 pair (ssh-keygen -t ed25519 -C "${DEPLOY_KEY_TITLE}")`);
    console.log(`            and install the public half with write access on ${PAGES_REPO}`);
    return null;
  }
  const keyFile = path.join(tmpDir, `${org}_deploy_key`);
  run('ssh-keygen', ['-t', 'ed25519', '-C', DEPLOY_KEY_TITLE, '-f', keyFile, '-N', '', '-q']);
  run('gh', ['repo', 'deploy-key', 'add', `${keyFile}.pub`, '--repo', PAGES_REPO, '--allow-write', '--title', DEPLOY_KEY_TITLE]);
  console.log('  ✓ installed the public half with write access');
  return fs.readFileSync(keyFile, 'utf8');
}

// ── Step 6: Actions secrets on the source repo ───────────────────────────
function setSecret(name, value) {
  if (DRY_RUN) {
    console.log(`  [dry-run] would set secret ${name} on ${SOURCE_REPO} (value via stdin)`);
    return;
  }
  if (value == null) return;
  run('gh', ['secret', 'set', name, '--repo', SOURCE_REPO], { input: value, quiet: true });
  console.log(`  ✓ ${name}`);
}

// ── Step 7: dispatch workflows, wait, enable Pages ───────────────────────
async function dispatchAndWait(workflowFile, inputs = [], { timeoutMin = 20 } = {}) {
  if (DRY_RUN) {
    console.log(`  [dry-run] would dispatch ${workflowFile} on ${SOURCE_REPO}${inputs.length ? ` with ${inputs.join(' ')}` : ''} and wait for it`);
    return true;
  }
  const args = ['workflow', 'run', workflowFile, '--repo', SOURCE_REPO];
  for (const inp of inputs) args.push('-f', inp);
  run('gh', args);
  await sleep(10_000); // give the run a moment to register
  const idRes = run('gh', ['run', 'list', '--repo', SOURCE_REPO, '--workflow', workflowFile, '--event', 'workflow_dispatch', '--limit', '1', '--json', 'databaseId,status'], { quiet: true });
  const runId = JSON.parse(idRes.stdout)[0]?.databaseId;
  if (!runId) fail(`dispatched ${workflowFile} but no run appeared — check the Actions tab.`);
  console.log(`  … waiting for run ${runId} (https://github.com/${SOURCE_REPO}/actions/runs/${runId})`);
  const deadline = Date.now() + timeoutMin * 60_000;
  for (;;) {
    await sleep(15_000);
    const view = run('gh', ['run', 'view', String(runId), '--repo', SOURCE_REPO, '--json', 'status,conclusion'], { quiet: true, allowFail: true });
    if (view.status !== 0) continue; // transient API hiccup — keep polling
    const { status, conclusion } = JSON.parse(view.stdout);
    if (status === 'completed') {
      if (conclusion === 'success') { console.log(`  ✓ ${workflowFile} succeeded`); return true; }
      console.log(`  ✖ ${workflowFile} finished with "${conclusion}" — inspect: gh run view ${runId} --repo ${SOURCE_REPO} --log-failed`);
      return false;
    }
    if (Date.now() > deadline) {
      console.log(`  ✖ timed out after ${timeoutMin} min waiting for ${workflowFile}; it may still be running.`);
      return false;
    }
  }
}

function enablePages() {
  banner(`GitHub Pages on ${PAGES_REPO} (gh-pages / root)`);
  if (DRY_RUN) {
    console.log(`  [dry-run] would POST repos/${PAGES_REPO}/pages with source gh-pages:/`);
    return;
  }
  const existing = run('gh', ['api', `repos/${PAGES_REPO}/pages`], { allowFail: true, quiet: true });
  if (existing.status === 0) {
    console.log('  ✓ Pages already enabled');
  } else {
    const res = run('gh', [
      'api', '-X', 'POST', `repos/${PAGES_REPO}/pages`,
      '--input', '-',
    ], { input: JSON.stringify({ source: { branch: 'gh-pages', path: '/' } }), allowFail: true });
    if (res.status !== 0) {
      console.log(`  ✖ could not enable Pages automatically:\n${(res.stderr || res.stdout).trim()}`);
      console.log(`    Enable by hand: ${PAGES_REPO} → Settings → Pages → Deploy from a branch → gh-pages / root.`);
      return;
    }
    console.log('  ✓ Pages enabled');
  }
  // Nudge a build so the site appears without waiting for the next push.
  run('gh', ['api', '-X', 'POST', `repos/${PAGES_REPO}/pages/builds`], { allowFail: true, quiet: true });
}

// ── Main ─────────────────────────────────────────────────────────────────
async function main() {
  console.log(`setup-new-org: provisioning demo org "${org}"${DRY_RUN ? '  [DRY RUN — nothing will be created]' : ''}`);
  console.log(`  Firebase project : ${PROJECT_ID}`);
  console.log(`  Web app          : ${WEB_APP_NAME}`);
  console.log(`  Pages repo       : ${PAGES_REPO}  →  ${DEMO_URL}`);
  console.log(`  Secrets prefix   : ${SECRET_PREFIX}_*  (on ${SOURCE_REPO})`);
  console.log(`  Workflows        : ${WF.seed}, ${WF.deploy}`);

  preflight();

  if (FINISH_AUTH_ONLY) {
    const ok = await finishAuth();
    process.exit(ok === false ? 1 : 0);
  }

  if (!DRY_RUN && !ASSUME_YES) {
    await pressEnter('\nProceed with the plan above? Press Enter to continue (Ctrl-C to abort) ');
  }

  // Read the org's display name for repo descriptions.
  const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  let orgDisplayName = org.toUpperCase();
  try {
    const orgCfg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'config', 'orgs', `${org}.json`), 'utf8'));
    orgDisplayName = orgCfg.shortName || orgCfg.name || orgDisplayName;
  } catch { /* display name is cosmetic — fall back to the uppercased id */ }

  const tmpDir = DRY_RUN ? null : fs.mkdtempSync(path.join(os.tmpdir(), `setup-${org}-`));
  if (tmpDir) fs.chmodSync(tmpDir, 0o700);
  try {
    ensureProject();
    ensureFirestore();
    const sdkConfig = ensureWebApp();
    const secrets = DRY_RUN ? new Set() : existingSourceSecrets();
    const saKeyJson = await ensureServiceAccountKey(tmpDir, secrets);
    ensurePagesRepo(orgDisplayName);
    const deployKeyPrivate = ensureDeployKey(tmpDir);

    banner(`Actions secrets on ${SOURCE_REPO}`);
    if (sdkConfig) {
      setSecret(`${SECRET_PREFIX}_FIREBASE_API_KEY`, sdkConfig.apiKey);
      setSecret(`${SECRET_PREFIX}_FIREBASE_AUTH_DOMAIN`, sdkConfig.authDomain);
      setSecret(`${SECRET_PREFIX}_FIREBASE_PROJECT_ID`, sdkConfig.projectId);
      setSecret(`${SECRET_PREFIX}_FIREBASE_STORAGE_BUCKET`, sdkConfig.storageBucket);
      setSecret(`${SECRET_PREFIX}_FIREBASE_MESSAGING_SENDER_ID`, String(sdkConfig.messagingSenderId));
      setSecret(`${SECRET_PREFIX}_FIREBASE_APP_ID`, sdkConfig.appId);
    } else if (DRY_RUN) {
      for (const s of ['API_KEY', 'AUTH_DOMAIN', 'PROJECT_ID', 'STORAGE_BUCKET', 'MESSAGING_SENDER_ID', 'APP_ID']) {
        setSecret(`${SECRET_PREFIX}_FIREBASE_${s}`, '(from sdkconfig)');
      }
    }
    setSecret(`${SECRET_PREFIX}_SERVICE_ACCOUNT_JSON`, saKeyJson ?? (DRY_RUN ? '(minted key)' : null));
    setSecret(`${SECRET_PREFIX}_DEPLOY_KEY`, deployKeyPrivate ?? (DRY_RUN ? '(private half)' : null));

    // ── THE one manual step ──────────────────────────────────────────────
    banner('MANUAL STEP: enable Google sign-in (~2 min)');
    console.log('  The Google auth provider cannot be enabled by API: the public Identity');
    console.log('  Toolkit admin API needs an existing OAuth client id/secret, and creating');
    console.log('  the OAuth consent screen/client for an external app has no public API —');
    console.log('  only the Firebase console can provision it. In the console:');
    console.log(`    https://console.firebase.google.com/project/${PROJECT_ID}/authentication/providers`);
    console.log('    1. Authentication → Get started (if shown)');
    console.log('    2. Sign-in method → Google → Enable; support email: your account → Save');
    if (!DRY_RUN) {
      await pressEnter('  Press Enter here once Google sign-in is enabled '
        + `(or Ctrl-C and later run: node scripts/setup-new-org.mjs ${org} --finish-auth) `);
    }
    await finishAuth();

    banner('Seed + deploy');
    const seedInputs = OWNER_EMAIL ? [`owner_email=${OWNER_EMAIL}`] : [];
    if (!OWNER_EMAIL) {
      console.log('  (no --owner-email given — the seed workflow default applies; it MUST be');
      console.log('  an address that can complete a GOOGLE sign-in, or the demo locks out)');
    }
    const seeded = await dispatchAndWait(WF.seed, seedInputs);
    const deployed = seeded && await dispatchAndWait(WF.deploy);
    if (deployed) enablePages();

    banner('Done');
    console.log(`  Demo URL: ${DEMO_URL}  (Pages can take a couple of minutes on first build)`);
    console.log('  Smoke test per the org setup doc: branding, sign-in at /director,');
    console.log('  feeds/all.ics downloads with the org PRODID.');
    console.log('  Rules note: deploy-rules.yml only ships rules to this project if it has');
    console.log(`  a per-org step keyed on ${SECRET_PREFIX}_SERVICE_ACCOUNT_JSON — the asyo/as steps`);
    console.log('  exist; a NEW org needs its step added there (see docs/new-org-setup.md),');
    console.log('  then dispatch that workflow once so the rules ship now, not on the next');
    console.log('  rules edit.');
    if (!seeded || !deployed) {
      console.log('\n  ⚠ a workflow did not finish green — fix and re-run this script;');
      console.log('  every completed step above will be skipped.');
      process.exitCode = 1;
    }
  } finally {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((err) => fail(err?.stack || String(err)));
