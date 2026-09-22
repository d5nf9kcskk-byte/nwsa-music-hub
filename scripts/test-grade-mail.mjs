/**
 * test-grade-mail.mjs — one real grade email, end to end, to a named address.
 *
 * The only thing the self-checks cannot prove is that mail actually LEAVES:
 * that the `gradeMailSend` trigger fires, that the Trigger Email extension
 * picks the `mail` doc up, and that what arrives reads correctly. This drives
 * exactly that path and then removes everything it made.
 *
 * WHAT IT TOUCHES, and why so little:
 *
 *   • `studentsPublic/__gradeMailTest`  — the function reads the student's
 *     NAME from here, so a doc is unavoidable. Written `status: 'Inactive'`
 *     with no `ensembleIds`, so no ensemble page, roster or filter lists it;
 *     it exists for the seconds between create and delete. This collection is
 *     world-readable, which is the one genuinely public thing here.
 *   • `contacts/__gradeMailTest`        — staff-only. Carries ONLY the address
 *     passed on the command line. No real family is ever read or written.
 *   • `assignmentResults/__gradeMailTest` — staff-only, a fake grade.
 *   • `gradeMailQueue/<auto>`           — the request itself.
 *
 * It points at a REAL assignment (read-only) so the email reads exactly like
 * the ones a class would get, rather than inventing a fake exam.
 *
 * NO REAL STUDENT IS READ, WRITTEN OR EMAILED. The fake student id is fixed
 * and obviously not a Firestore auto-id, so a leftover is recognisable.
 *
 *   FIREBASE_SERVICE_ACCOUNT_JSON=… node scripts/test-grade-mail.mjs \
 *     --to someone@example.com --assignment <assignmentId> [--keep]
 */
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!raw) { console.error('FIREBASE_SERVICE_ACCOUNT_JSON is not set — aborting.'); process.exit(1); }

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const TO = arg('to');
const ASSIGNMENT_ID = arg('assignment');
const KEEP = process.argv.includes('--keep');

if (!TO || !/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(TO)) {
  console.error('--to must be a single email address.'); process.exit(1);
}
if (!ASSIGNMENT_ID || !/^[A-Za-z0-9_-]{1,128}$/.test(ASSIGNMENT_ID)) {
  console.error('--assignment must be an assignment doc id.'); process.exit(1);
}

if (getApps().length === 0) initializeApp({ credential: cert(JSON.parse(raw)) });
const db = getFirestore();

const ID = '__gradeMailTest';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const assignmentSnap = await db.doc(`assignments/${ASSIGNMENT_ID}`).get();
if (!assignmentSnap.exists) { console.error(`No assignment ${ASSIGNMENT_ID}.`); process.exit(1); }
console.log(`Exam:      ${assignmentSnap.data().title}`);
console.log(`Recipient: ${TO}`);
console.log(`Fixture:   ${ID} (Inactive, no ensembles)\n`);

// A rubric that is obviously a sample, and does not total 100 — so the email
// exercises the percent line too.
const RUBRIC = [
  { id: 'intonation', label: 'Intonation', max: 25, points: 21 },
  { id: 'rhythm', label: 'Rhythm', max: 20, points: 17 },
  { id: 'musicality', label: 'Musicality', max: 20, points: 16 },
];

async function cleanup() {
  await Promise.all([
    db.doc(`studentsPublic/${ID}`).delete(),
    db.doc(`contacts/${ID}`).delete(),
    db.doc(`assignmentResults/${ID}`).delete(),
  ]);
}

let queueRef;
try {
  await db.doc(`studentsPublic/${ID}`).set({
    name: 'Hub Email Test (ignore)',
    instrument: 'Violin',
    status: 'Inactive',
    ensembleIds: [],
  });
  await db.doc(`contacts/${ID}`).set({ email: TO });
  await db.doc(`assignmentResults/${ID}`).set({
    assignmentId: ASSIGNMENT_ID,
    studentId: ID,
    status: 'Pass',
    score: '82',
    rubric: RUBRIC,
    notes: 'STAFF-ONLY — if this sentence is in the email you receive, that is a bug.',
  });
  console.log('Fixture written. Queueing…');

  queueRef = await db.collection('gradeMailQueue').add({
    assignmentId: ASSIGNMENT_ID,
    studentId: ID,
    resultId: ID,
    byEmail: 'test@nwsa-hub.invalid',
    queuedAt: Date.now(),
  });
  console.log(`Queued ${queueRef.id}. Waiting for gradeMailSend…\n`);

  // The mail doc's id IS the queue doc's id, by design.
  let mail = null;
  for (let i = 0; i < 30; i++) {
    await sleep(2000);
    const snap = await db.doc(`mail/${queueRef.id}`).get();
    if (snap.exists) { mail = snap.data(); break; }
    process.stdout.write('.');
  }
  console.log('');

  if (!mail) {
    console.error('No mail doc after 60s. The trigger did not fire, or it refused the request.');
    console.error('Check the function log:  firebase functions:log --only gradeMailSend');
    process.exitCode = 1;
  } else {
    console.log('── mail doc written by the function ─────────────────────');
    console.log(`To:      ${(mail.to ?? []).join(', ')}`);
    console.log(`Subject: ${mail.message?.subject}`);
    console.log('');
    console.log(mail.message?.text);
    console.log('─────────────────────────────────────────────────────────');
    const leaked = (mail.message?.text ?? '').includes('STAFF-ONLY');
    console.log(`staff note leaked?  ${leaked ? 'YES — BUG' : 'no'}`);
    if (leaked) process.exitCode = 1;

    // The extension stamps `delivery` as it works. This is the only proof the
    // mail really left rather than merely being queued.
    for (let i = 0; i < 30; i++) {
      await sleep(2000);
      const d = (await db.doc(`mail/${queueRef.id}`).get()).data()?.delivery;
      if (d?.state) {
        console.log(`delivery.state:     ${d.state}${d.error ? ` — ${d.error}` : ''}`);
        if (d.state === 'SUCCESS' || d.state === 'ERROR') break;
      } else {
        process.stdout.write('.');
      }
    }
    console.log('');

    const receipt = (await db.doc(`assignmentResults/${ID}`).get()).data()?.gradeMailedAt;
    console.log(`gradeMailedAt receipt written? ${receipt ? new Date(receipt).toISOString() : 'NO — BUG'}`);
  }
} finally {
  if (KEEP) {
    console.log(`\n--keep: fixture LEFT IN PLACE as ${ID}. Delete it.`);
  } else {
    await cleanup();
    console.log('\nFixture removed (studentsPublic, contacts, assignmentResults).');
    console.log(`The queue and mail docs are left as a record: gradeMailQueue/${queueRef?.id ?? '—'}`);
  }
}
