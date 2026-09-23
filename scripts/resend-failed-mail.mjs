/**
 * resend-failed-mail.mjs — re-send the emails that never left.
 *
 * On 2026-09-22 an audit found that EVERY `mail` doc the Hub had ever written
 * failed with `Missing credentials for "PLAIN"`: the Trigger Email extension
 * was installed but never given an SMTP login. Among the losses were lesson-log
 * summaries a teacher had pressed Send on, whose rows in the app say "Emailed".
 *
 * This re-sends the ORIGINAL docs rather than composing new ones. The Trigger
 * Email extension re-processes a doc whose `delivery.state` is set to `RETRY`,
 * so the message a family receives is byte-for-byte the one that was written
 * at the time — the right lesson, the right marks, the right date — and there
 * is no second doc to become a duplicate.
 *
 * THE CANARY. The failure this exists to repair is invisible from every screen
 * in the app, so running it while SMTP is still unconfigured would quietly
 * produce fifteen more failures and look like it worked. So it retries ONE
 * message first, waits for the extension's own verdict on it, and refuses to
 * touch the rest unless that one actually sent. There is no --force.
 *
 *   FIREBASE_SERVICE_ACCOUNT_JSON=… node scripts/resend-failed-mail.mjs --dry-run
 *   FIREBASE_SERVICE_ACCOUNT_JSON=… node scripts/resend-failed-mail.mjs
 *
 * Options:
 *   --match <text>   Only subjects containing this. Default "Lesson log —".
 *                    Pass "" for every failed message.
 *   --since <date>   Only messages FIRST ATTEMPTED on or after this
 *                    YYYY-MM-DD. This is when the teacher pressed Send, not
 *                    the lesson's own date — "re-send what I sent this week"
 *                    is a question about the press, and one press can carry a
 *                    catch-up log for an earlier lesson.
 *   --limit <n>      Cap the number re-sent (default 100).
 */
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!raw) { console.error('FIREBASE_SERVICE_ACCOUNT_JSON is not set — aborting.'); process.exit(1); }

const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const DRY = process.argv.includes('--dry-run');
const MATCH = arg('match') ?? 'Lesson log —';
const LIMIT = Math.min(Number(arg('limit')) || 100, 300);
const SINCE = arg('since') || '';
if (SINCE && !/^\d{4}-\d{2}-\d{2}$/.test(SINCE)) {
  console.error('--since must be YYYY-MM-DD.'); process.exit(1);
}
// Local midnight, matching how a person means "since Monday".
const SINCE_MS = SINCE ? new Date(`${SINCE}T00:00:00`).getTime() : 0;

if (getApps().length === 0) initializeApp({ credential: cert(JSON.parse(raw)) });
const db = getFirestore();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/** Wait for the extension to reach a verdict on one doc. */
async function verdict(id, tries = 40) {
  for (let i = 0; i < tries; i++) {
    await sleep(2000);
    const d = (await db.doc(`mail/${id}`).get()).data()?.delivery;
    if (d?.state === 'SUCCESS' || d?.state === 'ERROR') return d;
    process.stdout.write('.');
  }
  console.log('');
  return null;
}

const snap = await db.collection('mail').get();
const failed = snap.docs
  .map(d => ({ id: d.id, ref: d.ref, data: d.data() }))
  .filter(m => {
    const state = m.data.delivery?.state;
    // ERROR, or never picked up at all. SUCCESS and PROCESSING are left alone.
    if (state === 'SUCCESS' || state === 'PROCESSING' || state === 'PENDING') return false;
    const subject = String(m.data.message?.subject ?? '');
    if (MATCH !== '' && !subject.includes(MATCH)) return false;
    if (SINCE_MS) {
      // When it was first ATTEMPTED — the moment the teacher pressed Send.
      // A message with no timestamp at all was never picked up, so its send
      // date is unknown; it is EXCLUDED rather than guessed at, because the
      // cost of guessing wrong is a family getting mail nobody meant to send.
      const t = m.data.delivery?.startTime?.toDate?.()?.getTime?.();
      if (!t || t < SINCE_MS) return false;
    }
    return true;
  })
  .sort((a, b) => {
    const t = (m) => m.data.delivery?.startTime?.toDate?.()?.getTime?.() ?? 0;
    return t(a) - t(b);
  })
  .slice(0, LIMIT);

console.log(`Matching "${MATCH || '(everything failed)'}"${SINCE ? `, sent on/after ${SINCE}` : ''}: ${failed.length} message(s)\n`);
for (const m of failed) {
  const t = m.data.delivery?.startTime?.toDate?.();
  console.log(`  ${m.id}  →  ${(m.data.to ?? []).join(', ')}`);
  console.log(`      ${String(m.data.message?.subject ?? '').slice(0, 76)}`);
  console.log(`      sent ${t ? t.toISOString().slice(0, 16).replace('T', ' ') : '(unknown)'}`);
}
if (failed.length === 0) { console.log('\nNothing to re-send.'); process.exit(0); }

if (DRY) {
  console.log(`\nDry run — would re-send ${failed.length}. Re-run without --dry-run to send.`);
  console.log('A real run tries ONE first and stops unless it actually arrives.');
  process.exit(0);
}

/* ── the canary ────────────────────────────────────────────────────────── */

const canary = failed[0];
console.log(`\nCanary: re-sending ONE first — ${canary.id}`);
console.log(`  to ${(canary.data.to ?? []).join(', ')}`);
await canary.ref.update({ 'delivery.state': 'RETRY' });
const result = await verdict(canary.id);

if (!result) {
  console.error('\n⚠ No verdict after 80s. The extension did not pick it up.');
  console.error('  Nothing else has been touched.');
  process.exit(1);
}
if (result.state !== 'SUCCESS') {
  console.error(`\n⚠ The canary FAILED again: ${result.error ?? result.state}`);
  console.error('  SMTP is still not working, so nothing else has been touched.');
  console.error('  Fix the Trigger Email extension\'s SMTP configuration, then re-run.');
  process.exit(1);
}
console.log(`\n✓ Canary delivered. Re-sending the remaining ${failed.length - 1}.\n`);

/* ── the rest ──────────────────────────────────────────────────────────── */

let sent = 1;
for (const m of failed.slice(1)) {
  await m.ref.update({ 'delivery.state': 'RETRY' });
  console.log(`  retried ${m.id}  ${String(m.data.message?.subject ?? '').slice(0, 60)}`);
  sent++;
  // Gently — a burst of retries against one SMTP account is how an account
  // gets rate-limited, and a rate-limited retry is a message lost twice.
  await sleep(1500);
}

console.log(`\n${sent} queued for re-send. Confirming…`);
await sleep(8000);

let ok = 0; const bad = [];
for (const m of failed) {
  const d = (await db.doc(`mail/${m.id}`).get()).data()?.delivery;
  if (d?.state === 'SUCCESS') ok++;
  else bad.push(`${m.id} — ${d?.state ?? 'no state'}${d?.error ? `: ${d.error}` : ''}`);
}
console.log(`\n${ok} of ${sent} confirmed delivered.`);
if (bad.length) {
  console.log('Not confirmed (some may still be in flight — re-run the audit in a minute):');
  for (const b of bad) console.log(`  ${b}`);
}
