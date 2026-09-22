/**
 * mail-delivery-audit.mjs — did the Hub's email actually leave?
 *
 * READ-ONLY. It sends nothing and writes nothing.
 *
 * Every email the Hub produces — sign-up confirmations, lesson-log summaries,
 * grade emails — ends as a `mail` doc that the Trigger Email extension picks
 * up. The extension stamps its own `delivery` field as it works, and that
 * field is the ONLY place the answer lives: the function that wrote the doc
 * has long since returned, its log says "queued", and a queued email that the
 * extension then failed to send looks exactly like a sent one from every
 * screen in the app.
 *
 * Found 2026-09-22 by a test send: `delivery.state: ERROR — Missing
 * credentials for "PLAIN"`, meaning the extension has no SMTP login. That
 * fails EVERY message equally, so this prints the history rather than just
 * the latest — how long it has been broken, and which real messages were lost
 * to it.
 *
 *   FIREBASE_SERVICE_ACCOUNT_JSON=… node scripts/mail-delivery-audit.mjs [--limit 50]
 */
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!raw) { console.error('FIREBASE_SERVICE_ACCOUNT_JSON is not set — aborting.'); process.exit(1); }
const i = process.argv.indexOf('--limit');
const LIMIT = i >= 0 ? Math.min(Number(process.argv[i + 1]) || 50, 300) : 50;

if (getApps().length === 0) initializeApp({ credential: cert(JSON.parse(raw)) });
const db = getFirestore();

const snap = await db.collection('mail').limit(LIMIT).get();
if (snap.empty) { console.log('No mail docs at all.'); process.exit(0); }

const rows = snap.docs.map(d => {
  const m = d.data();
  const del = m.delivery ?? {};
  const when = del.endTime?.toDate?.() ?? del.startTime?.toDate?.() ?? null;
  return {
    id: d.id,
    state: del.state ?? '(never picked up)',
    error: del.error ? String(del.error).slice(0, 90) : '',
    when,
    subject: String(m.message?.subject ?? '').slice(0, 58),
  };
}).sort((a, b) => (a.when?.getTime() ?? 0) - (b.when?.getTime() ?? 0));

const tally = {};
for (const r of rows) tally[r.state] = (tally[r.state] ?? 0) + 1;

console.log(`${rows.length} mail docs examined\n`);
for (const r of rows) {
  const stamp = r.when ? r.when.toISOString().slice(0, 16).replace('T', ' ') : '     (no time)  ';
  console.log(`${stamp}  ${r.state.padEnd(10)}  ${r.subject}`);
  if (r.error) console.log(`${' '.repeat(20)}↳ ${r.error}`);
}

console.log('\n── totals ───────────────────────────────');
for (const [state, n] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${state}`);
}
const failed = rows.filter(r => r.state !== 'SUCCESS');
if (failed.length > 0) {
  const first = failed.find(r => r.when);
  console.log(`\n⚠ ${failed.length} message${failed.length === 1 ? '' : 's'} did not send.`);
  if (first?.when) console.log(`  Earliest failure seen: ${first.when.toISOString()}`);
  console.log('  Nothing in the app shows this — the delivery field is the only record.');
}
