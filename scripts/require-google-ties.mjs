#!/usr/bin/env node
/**
 * require-google-ties.mjs (#google-binding)
 *
 * Turns ON, or back OFF, the requirement that a Google sign-in belongs to
 * the Google account a person's Directors entry is tied to. It is one field
 * in one server-only document, `serverConfig/signIn.googleTieRequired`, which
 * firestore.rules reads. No browser can read or write that document, so this
 * (run through the *Require Google Ties* workflow) is the only switch.
 *
 * Turning it ON is refused while any listed person is not tied yet: they
 * would be asked to sign in again, and anyone on an old copy of the Hub
 * would see an error until they refreshed. `FORCE=1` turns it on anyway.
 * Turning it OFF is always allowed and takes effect at once.
 *
 *   MODE=status   (default) say where things stand; change nothing
 *   MODE=on       require the tie
 *   MODE=off      stop requiring it
 *
 * It prints COUNTS ONLY. This repo and its Actions logs are public, and
 * nobody's address belongs in either.
 *
 * It refuses to run against a demo project: those have no server step to tie
 * anyone with, so requiring the tie there would lock everyone out.
 *
 * Env: FIREBASE_SERVICE_ACCOUNT_JSON (the service-account key JSON).
 *   node scripts/require-google-ties.mjs --selfcheck   (no credentials)
 */

/** What to do, given the mode and how many listed people are tied. Pure. */
export function decide(mode, listed, tied, force) {
  if (mode === 'off') return { write: false, say: 'The tie is no longer required.' };
  if (mode !== 'on') return { write: null, say: 'Nothing changed.' };
  if (listed === 0) return { write: null, say: 'REFUSED: there is nobody on the list.' };
  if (tied < listed && !force) {
    return { write: null, say: `REFUSED: ${listed - tied} listed ${listed - tied === 1 ? 'person is' : 'people are'} not confirmed yet. Wait for them, or run again with "even if some are not confirmed".` };
  }
  return { write: true, say: 'The tie is now required.' };
}

if (process.argv.includes('--selfcheck')) {
  const cases = [
    [decide('status', 5, 5, false).write === null, 'status changes nothing'],
    [decide('bogus', 5, 5, false).write === null, 'an unknown mode changes nothing'],
    [decide('on', 5, 5, false).write === true, 'on, everyone tied: turned on'],
    [decide('on', 5, 4, false).write === null && /REFUSED: 1 listed person is/.test(decide('on', 5, 4, false).say), 'on, one not tied: refused, with a count'],
    [decide('on', 5, 0, false).write === null, 'on, nobody tied: refused'],
    [decide('on', 5, 4, true).write === true, 'on, forced: turned on'],
    [decide('on', 0, 0, true).write === null, 'on with an empty list is refused even when forced'],
    [decide('off', 5, 0, false).write === false, 'off is always allowed'],
  ];
  const failed = cases.filter(([ok]) => !ok);
  for (const [, label] of failed) console.error(`  ✗ ${label}`);
  const src = (await import('node:fs')).readFileSync(new URL(import.meta.url), 'utf8');
  const live = src.slice(src.lastIndexOf('// ── The real run'));
  const leaks = /console\.\w+\([^)]*(\.id\b|email|googleSub\b)/.test(live);
  if (leaks) console.error('  ✗ the real run prints counts only');
  const bad = failed.length + (leaks ? 1 : 0);
  console.log(bad ? `require-google-ties self-check: ${bad} failure(s)` : 'require-google-ties self-check: ok');
  process.exit(bad ? 1 : 0);
}

// ── The real run ────────────────────────────────────────────────────────────
const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!raw) {
  console.error('FIREBASE_SERVICE_ACCOUNT_JSON is not set. Aborting.');
  process.exit(1);
}
const account = JSON.parse(raw);
if (/demo/i.test(account.project_id ?? '')) {
  console.error('This is a demo project. It has no server step to tie anyone, so the tie must never be required here. Aborting.');
  process.exit(1);
}
const mode = (process.env.MODE ?? 'status').trim().toLowerCase();
const force = process.env.FORCE === '1';

const { initializeApp, cert } = await import('firebase-admin/app');
const { getFirestore } = await import('firebase-admin/firestore');
initializeApp({ credential: cert(account) });
const db = getFirestore();

const listed = await db.collection('directors').get();
const tied = listed.docs.filter(d => typeof d.get('googleSub') === 'string' && d.get('googleSub')).length;
const ref = db.doc('serverConfig/signIn');
const before = (await ref.get()).get('googleTieRequired') === true;

console.log(`Listed: ${listed.size}. Google account confirmed: ${tied}. Not confirmed yet: ${listed.size - tied}.`);
console.log(`The tie was ${before ? 'required' : 'not required'} before this run.`);

const { write, say } = decide(mode, listed.size, tied, force);
if (write !== null) await ref.set({ googleTieRequired: write, changedAt: Date.now() }, { merge: true });
console.log(say);
if (say.startsWith('REFUSED')) process.exit(1);
