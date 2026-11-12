#!/usr/bin/env node
/**
 * require-google-ties.mjs (#google-binding)
 *
 * The server's side of three things no browser may do:
 *
 *   on           require that a Google sign-in is on the account the
 *                person's Directors entry names
 *   off          stop requiring it (takes effect at once)
 *   clear-owner  clear that record on the Owner's own entry, for an Owner
 *                who can no longer get in; the Hub makes it again at the
 *                Owner's next sign-in
 *
 * The requirement is one field in one document, `serverConfig/signIn
 * .googleTieRequired`, which firestore.rules reads and no browser can write.
 *
 * Turning it ON is refused while any listed person has no record yet: anyone
 * on an old copy of the Hub would see an error until they refreshed. Ticking
 * the box turns it on anyway.
 *
 * IT SAYS NOTHING ABOUT THE RESULT. This repo and its Actions logs are
 * public, and neither whether the requirement is on nor how many people are
 * not confirmed belongs in them. It prints one fixed line. The result goes
 * into `serverConfig/signIn.lastRun`, which the Owner reads on the Directors
 * screen. For the same reason, inside GitHub Actions the choice is read from
 * the run's own event file rather than passed through the step's
 * environment, which the log would print.
 *
 * It refuses to run against a demo project: those have no server step to
 * make a record with, so requiring one there would lock everyone out.
 *
 * Env: FIREBASE_SERVICE_ACCOUNT_JSON (the service-account key JSON).
 *      By hand, outside Actions: MODE=on|off|clear-owner, FORCE=1.
 *   node scripts/require-google-ties.mjs --selfcheck   (no credentials)
 */
import { readFileSync } from 'node:fs';

export const RECORD_KEYS = ['googleSub', 'boundUid', 'boundAt', 'passwordSet'];

/** Has the server recorded this entry's sign-in account? */
export const confirmed = d => typeof d.googleSub === 'string' && !!d.googleSub && typeof d.boundUid === 'string' && !!d.boundUid;

/** Is this entry an Owner's? */
export const isOwnerEntry = d => (Array.isArray(d.roles) ? d.roles.includes('owner') : d.role === 'owner');

/**
 * What to do, given the mode and how many listed people are confirmed. Pure.
 * `write` is the new value of the switch, or null to leave it alone.
 * `result` is what the Owner's screen is told.
 */
export function decide(mode, listed, tied, force) {
  if (mode === 'off') return { write: false, result: 'off' };
  if (mode === 'clear-owner') return { write: null, result: 'cleared' };
  if (mode !== 'on') return { write: null, result: 'nothing' };
  if (listed === 0) return { write: null, result: 'refused' };
  if (tied < listed && !force) return { write: null, result: 'refused' };
  return { write: true, result: 'on' };
}

/** The mode and the box, from the run's event file inside Actions, else from the environment. */
export function choice(env, readFile) {
  if (env.GITHUB_EVENT_PATH) {
    try {
      const inputs = JSON.parse(readFile(env.GITHUB_EVENT_PATH)).inputs ?? {};
      return { mode: String(inputs.mode ?? '').trim().toLowerCase(), force: inputs.force === true || inputs.force === 'true' };
    } catch { return { mode: '', force: false }; }
  }
  return { mode: (env.MODE ?? '').trim().toLowerCase(), force: env.FORCE === '1' };
}

if (process.argv.includes('--selfcheck')) {
  const cases = [
    [decide('', 5, 5, false).write === null && decide('', 5, 5, false).result === 'nothing', 'no mode changes nothing'],
    [decide('bogus', 5, 5, false).write === null, 'an unknown mode changes nothing'],
    [decide('on', 5, 5, false).write === true, 'on, everyone confirmed: turned on'],
    [decide('on', 5, 4, false).write === null && decide('on', 5, 4, false).result === 'refused', 'on, one not confirmed: refused'],
    [decide('on', 5, 0, false).write === null, 'on, nobody confirmed: refused'],
    [decide('on', 5, 4, true).write === true, 'on, forced: turned on'],
    [decide('on', 0, 0, true).write === null, 'on with an empty list is refused even when forced'],
    [decide('off', 5, 0, false).write === false, 'off is always allowed'],
    [decide('clear-owner', 5, 5, false).write === null && decide('clear-owner', 5, 5, false).result === 'cleared', 'clear-owner leaves the switch alone'],
    [confirmed({ googleSub: 'g', boundUid: 'u' }) && !confirmed({ googleSub: 'g' }) && !confirmed({ boundUid: 'u' }) && !confirmed({ googleSub: '', boundUid: 'u' }), 'confirmed means both halves of the record'],
    [isOwnerEntry({ roles: ['director', 'owner'] }) && isOwnerEntry({ role: 'owner' }) && !isOwnerEntry({ roles: ['director'] }) && !isOwnerEntry({}), 'an Owner entry is told by its roles'],
    [choice({ GITHUB_EVENT_PATH: '/e', MODE: 'off' }, () => '{"inputs":{"mode":"on","force":"true"}}').mode === 'on', 'inside Actions the choice comes from the event file, not the environment'],
    [choice({ GITHUB_EVENT_PATH: '/e' }, () => '{"inputs":{"mode":"on","force":"true"}}').force === true, 'and so does the box'],
    [choice({ GITHUB_EVENT_PATH: '/e' }, () => 'not json').mode === '', 'an unreadable event file is "no mode"'],
    [choice({ MODE: ' Clear-Owner ', FORCE: '1' }, () => '').mode === 'clear-owner', 'by hand, the mode comes from the environment'],
  ];
  const failed = cases.filter(([ok]) => !ok);
  for (const [, label] of failed) console.error(`  ✗ ${label}`);
  // Nothing about the result reaches the log: every line the real run can
  // print is a fixed piece of text with nothing put into it.
  const src = readFileSync(new URL(import.meta.url), 'utf8');
  const live = src.slice(src.lastIndexOf('// ── The real run'));
  const prints = [...live.matchAll(/console\.\w+\(([^;]*)\);/g)].map(m => m[1]);
  const fixed = prints.length > 0 && prints.every(p => /^'[^'$]*'$/.test(p));
  if (!fixed) console.error('  ✗ the real run prints fixed lines only');
  const quiet = !/process\.exit\((?!1\)|0\))/.test(live) && !/process\.exitCode/.test(live);
  if (!quiet) console.error('  ✗ the real run exits the same way whatever it decided');
  const workflow = readFileSync(new URL('../.github/workflows/require-google-ties.yml', import.meta.url), 'utf8');
  const noInputs = !/\$\{\{\s*(inputs|github\.event\.inputs)\./.test(workflow);
  if (!noInputs) console.error('  ✗ the workflow never puts the choice where the log would print it');
  const bad = failed.length + (fixed ? 0 : 1) + (quiet ? 0 : 1) + (noInputs ? 0 : 1);
  console.log(bad ? `require-google-ties self-check: ${bad} failure(s)` : 'require-google-ties self-check: ok');
  process.exit(bad ? 1 : 0);
}

// ── The real run ────────────────────────────────────────────────────────────
// Every line printed below is fixed text. Only a failure to RUN (no
// credentials, a demo project, the database unreachable) exits non-zero;
// what was decided never changes the exit code.
const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!raw) {
  console.error('FIREBASE_SERVICE_ACCOUNT_JSON is not set. Aborting.');
  process.exit(1);
}
const account = JSON.parse(raw);
if (/demo/i.test(account.project_id ?? '')) {
  console.error('This is a demo project. It has no server step, so this must never be required here. Aborting.');
  process.exit(1);
}
const { mode, force } = choice(process.env, p => readFileSync(p, 'utf8'));

const { initializeApp, cert } = await import('firebase-admin/app');
const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
initializeApp({ credential: cert(account) });
const db = getFirestore();

const listed = await db.collection('directors').get();
const tied = listed.docs.filter(d => confirmed(d.data())).length;
const { write, result } = decide(mode, listed.size, tied, force);

let cleared = 0;
if (result === 'cleared') {
  for (const d of listed.docs.filter(x => isOwnerEntry(x.data()))) {
    await d.ref.update(Object.fromEntries(RECORD_KEYS.map(k => [k, FieldValue.delete()])));
    cleared++;
  }
}
await db.doc('serverConfig/signIn').set({
  ...(write === null ? {} : { googleTieRequired: write }),
  // For the Owner's screen only (the Owner can read this document; nobody
  // else can, and no browser can write it).
  lastRun: { mode, result, at: Date.now(), listed: listed.size, notConfirmed: listed.size - tied, cleared },
}, { merge: true });
console.log('Done. The result is on the Directors screen, for the Owner.');
