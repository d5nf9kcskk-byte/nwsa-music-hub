#!/usr/bin/env node
/**
 * cco-dress-2026-09-29.mjs
 *
 * Tue Sept 29, 2026, the College Chamber Orchestra concert day. The
 * director's list (2026-09-29):
 *
 *   - The CCO dress rehearsal is 2:30 to 5:00 in Wolfson Auditorium. The notes
 *     say the four CCO pieces go first and the Tchaikovsky Souvenir de
 *     Florence sextet with faculty rehearses second. Repertoire = the
 *     concert's own, in concert order.
 *   - The concert: call time 6:00, starts 6:30, ends 8:00.
 *   - The violin masterclass meets in Wolfson to watch the dress rehearsal,
 *     straight from Symphony rehearsal.
 *   - The director's own 4:00 lesson is cancelled (the dress runs to 5:00).
 *   - Two announcements: Symphony (urgent: attendance is mandatory, how to
 *     check in and out with no QR codes) and CCO (today's schedule).
 *
 * What was live before this: NO dress rehearsal doc at all. CCO's only
 * rehearsals are Thursdays (`meetingDays: [4]`), so a Tuesday dress had never
 * been created. It is created here under the same id shape the seed uses
 * (`reh-<date>-<group>-<HHMM>`), so an ICS UID is stable from the first feed.
 *
 * What this writes, in ONE batch so the day is either the old shape or the
 * new one:
 *
 *   events/reh-2026-09-29-college-chamber-orchestra-1430   created 2:30-5:00
 *   events/oc26-cco-concert-sep        callTime 18:00, start 18:30, end 20:00.
 *      The end time also moves the check-in window: it closes an hour after
 *      the END, and before this it fell back to start + 3 hours.
 *   events/class-2026-09-29-masterclass-violin-1430   location, changeNote and
 *      a note that LEADS the existing notes (the "People performing today"
 *      list stays, verbatim). `changeFrom` snapshots the old room so "Back to
 *      normal" can put it back. No venueAddress: a revert would restore the
 *      room and strand a stale address.
 *   lessons/<one lesson> + lessonsPublic mirror   cancelled exactly as
 *      `useLessons.cancelLesson` does it: status only, no `changeFrom`, because
 *      this is the teacher cancelling their own lesson, not a day plan.
 *   announcements/…  two posts under fixed doc ids, so a re-run updates
 *      rather than double-posting.
 *
 * The lesson is named by its doc id and pinned by teacher, date and time. The
 * student's name is deliberately NOT written here: this repo is public
 * (#student-data). Times only in the log.
 *
 * NOT done: the urgent post does not queue the Teams / parent-email relay
 * (`notifyQueue`) that an urgent post made in the Hub queues. That is an
 * outward blast to families and was not asked for; the post is live in the app
 * either way.
 *
 * Guards: refuses after the date has passed, refuses if the concert is
 * cancelled or its program is no longer the five pieces the notes describe,
 * refuses if roll was already taken on the dress, refuses if some OTHER live
 * CCO rehearsal has appeared on the date, and refuses if the lesson is no
 * longer the one that was looked up. Idempotent: a doc already in its target
 * state is skipped, so a re-run writes nothing.
 *
 * Preview needs no credentials (`events`, `lessonsPublic` and `repertoire` are
 * world reads):
 *   node scripts/cco-dress-2026-09-29.mjs --dry-run
 * Apply:
 *   FIREBASE_SERVICE_ACCOUNT_JSON=… node scripts/cco-dress-2026-09-29.mjs
 */

const DATE = '2026-09-29';
const BY = 'cco-dress-2026-09-29';
const AUTHOR = 'Dr. Grant Gilman';
const CCO = 'college-chamber-orchestra';
const SYM = 'symphony-orchestra';

const WOLFSON = 'MDC Wolfson Auditorium'; // the concert's own spelling
const WOLFSON_ADDRESS = '300 NE 2 Avenue, Room 1261, Miami'; // the concert's own

const ID = {
  dress: `reh-${DATE}-college-chamber-orchestra-1430`,
  concert: 'oc26-cco-concert-sep',
  violin: `class-${DATE}-masterclass-violin-1430`,
};
const SOUVENIR = 'rp26-souvenir-de-florence';

// The lesson the director named, found on 2026-09-29 by reading `lessonsPublic`
// and `studentsPublic`. Pinned so a re-run after the day moves on cancels
// nothing else.
const LESSON = { id: 'M7hPp8VskFXlUMuFFU5h', teacherName: 'Dr. Grant Gilman', startTime: '16:00', endTime: '16:50' };

const DRESS_NOTES = [
  'Dress rehearsal in Wolfson Auditorium, 2:30 to 5:00 PM.',
  'Rehearsal order: the College Chamber Orchestra will do their four pieces first. Then the Tchaikovsky Souvenir de Florence string sextet with faculty will rehearse second.',
  'Tonight: call time is 6:00 PM and the concert starts at 6:30 PM.',
].join('\n\n');

const VIOLIN_NOTE = [
  'The Violin Masterclass is meeting in Wolfson Auditorium today, not Room 4210. We are there to watch the College Chamber Orchestra dress rehearsal.',
  'Go straight to Wolfson Auditorium from Symphony rehearsal. Do not stop at Room 4210 first.',
].join('\n\n');
const VIOLIN_CHANGE = 'Meeting in Wolfson Auditorium to watch the College Chamber Orchestra dress rehearsal';

const ANNOUNCEMENTS = [
  {
    id: 'cco-2026-09-29-symphony-required',
    ensembleId: SYM,
    priority: 'urgent',
    title: 'Required tonight: College Chamber Orchestra concert, 6:30 PM',
    body: [
      'Attendance at tonight\'s College Chamber Orchestra concert is **mandatory** for everyone in Symphony, and it will be recorded. 6:30 PM at MDC Wolfson Auditorium.',
      'The only students excused are seniors who have another event at the school tonight.',
      'Check in and check out in the Hub. There will be **NO QR codes** posted in the hall. Open the Hub on your phone, go to the concert card (link below), and check in when you arrive: pick your name, enter your school email, and take a photo. Check-in is open from 6:00 to 6:40 PM, so do not be late.',
      'When the concert ends, check out the same way, with a photo. Check-out opens at 8:00 PM. You need both check-in and check-out for the concert to count.',
    ].join('\n\n'),
    links: [{ label: 'College Chamber Orchestra Concert', url: `/event/${ID.concert}` }],
  },
  {
    id: 'cco-2026-09-29-cco-schedule',
    ensembleId: CCO,
    priority: 'important',
    title: 'College Chamber Orchestra: today\'s schedule',
    body: [
      'Here is today, Tuesday, Sept 29, at MDC Wolfson Auditorium:',
      [
        '- 2:30 to 5:00 PM: Dress rehearsal. We run the four College Chamber Orchestra pieces first, then the Tchaikovsky Souvenir de Florence string sextet with faculty rehearses second.',
        '- 6:00 PM: Concert call time.',
        '- 6:30 PM: Concert starts.',
      ].join('\n'),
      'Use the buttons below for the rehearsal card and the concert card.',
    ].join('\n\n'),
    links: [
      { label: 'Dress Rehearsal', url: `/event/${ID.dress}` },
      { label: 'Concert', url: `/event/${ID.concert}` },
    ],
  },
];

const DRY = process.argv.includes('--dry-run');
const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!DRY && !raw) {
  console.error('FIREBASE_SERVICE_ACCOUNT_JSON is not set. Pass --dry-run to preview without it.');
  process.exit(1);
}

const fail = (msg) => { console.error(`ABORT: ${msg}`); process.exit(1); };

const todayNY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
if (todayNY > DATE) fail(`${DATE} has passed (today is ${todayNY}). A past day is a record, not a schedule.`);

// ── Read the day ─────────────────────────────────────────────────────
let db = null;
if (raw) {
  const { initializeApp, cert, getApps } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  if (getApps().length === 0) initializeApp({ credential: cert(JSON.parse(raw)) });
  db = getFirestore();
}

const PROJECT = process.env.VITE_FIREBASE_PROJECT_ID || 'nwsa-hub';
const REST = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

const val = (v) => {
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(val);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, val(x)]));
  return undefined;
};
const fromRest = (doc) => ({
  id: doc.name.split('/').pop(),
  ...Object.fromEntries(Object.entries(doc.fields ?? {}).map(([k, v]) => [k, val(v)])),
});

/** Every doc in `collection` dated DATE. With a credential that is the real
 *  collection; without one, unauthenticated REST, so only world-readable
 *  collections (`events`, `lessonsPublic`). */
async function onDate(collection) {
  if (db) {
    const snap = await db.collection(collection).where('date', '==', DATE).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
  const res = await fetch(`${REST}:runQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: collection }],
      where: { fieldFilter: { field: { fieldPath: 'date' }, op: 'EQUAL', value: { stringValue: DATE } } },
    } }),
  });
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error(`Firestore read failed: ${JSON.stringify(rows)}`);
  return rows.filter(r => r.document).map(r => fromRest(r.document));
}

/** Titles for the log only. `repertoire` is a world read either way. */
async function pieceTitle(id) {
  const res = await fetch(`${REST}/repertoire/${id}`);
  if (!res.ok) return `${id} (unreadable)`;
  const d = fromRest(await res.json());
  return `${d.composer ? `${d.composer}: ` : ''}${d.title ?? id}`;
}

const events = await onDate('events');
const byId = Object.fromEntries(events.map(e => [e.id, e]));
const lessons = await onDate(db ? 'lessons' : 'lessonsPublic');
const lesson = lessons.find(l => l.id === LESSON.id);

// ── Guards ───────────────────────────────────────────────────────────
const concert = byId[ID.concert];
if (!concert) fail(`${ID.concert} (the CCO concert) is missing from ${DATE}.`);
if (concert.status === 'Cancelled') fail('The concert is cancelled. Nothing here applies.');
const program = concert.pieceIds ?? [];
if (program.length !== 5 || !program.includes(SOUVENIR)) {
  fail(`the concert's program is no longer the five pieces this was written for (${program.length} pieces, Souvenir ${program.includes(SOUVENIR) ? 'in' : 'NOT in'} it). Look before writing.`);
}

const violin = byId[ID.violin];
if (!violin) fail(`${ID.violin} (the violin masterclass) is missing from ${DATE}.`);
if (violin.status === 'Cancelled') fail('The violin masterclass is cancelled. Nothing to move.');

const dress = byId[ID.dress];
if (dress && Object.keys(dress.rollTaken ?? {}).length > 0) fail(`${ID.dress} already has roll taken; rewriting it would orphan the receipt.`);
const strays = events.filter(e => e.id !== ID.dress && e.type === 'Rehearsal' && e.status !== 'Cancelled'
  && (e.ensembleIds ?? []).includes(CCO));
if (strays.length > 0) {
  fail(`another live CCO rehearsal is on ${DATE}: ${strays.map(e => `${e.id} ${e.startTime}-${e.endTime}`).join(', ')}. Resolve it in the app first.`);
}

if (!lesson) fail(`the lesson this was written to cancel is not on ${DATE} any more. Look before writing.`);
if (lesson.teacherName !== LESSON.teacherName || lesson.startTime !== LESSON.startTime || lesson.endTime !== LESSON.endTime) {
  fail(`lesson ${LESSON.id} is no longer the ${LESSON.teacherName} ${LESSON.startTime}-${LESSON.endTime} lesson it was looked up as.`);
}

// ── Plan ─────────────────────────────────────────────────────────────
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const withViolinNote = (notes) => {
  const cur = (notes ?? '').trim();
  return cur.includes(VIOLIN_NOTE) ? cur : [VIOLIN_NOTE, cur].filter(Boolean).join('\n\n');
};

const TARGET = {
  [ID.dress]: {
    type: 'Rehearsal', date: DATE, status: 'Scheduled',
    title: 'College Chamber Orchestra Dress Rehearsal',
    startTime: '14:30', endTime: '17:00',
    location: WOLFSON, venueAddress: WOLFSON_ADDRESS,
    ensembleIds: [CCO],
    pieceIds: program, // the concert's own list, so its order IS concert order
    notes: DRESS_NOTES,
  },
  [ID.concert]: { callTime: '18:00', startTime: '18:30', endTime: '20:00' },
  [ID.violin]: {
    location: WOLFSON,
    changeNote: VIOLIN_CHANGE,
    notes: withViolinNote(violin.notes),
    // Snapshot once: a second run must never overwrite the ORIGINAL room.
    changeFrom: violin.changeFrom ?? {
      status: violin.status, startTime: violin.startTime, endTime: violin.endTime, location: violin.location,
    },
  },
};

const writes = [];
for (const [id, target] of Object.entries(TARGET)) {
  const live = byId[id];
  const changed = Object.keys(target).filter(k => !same(live?.[k], target[k]));
  if (live && changed.length === 0) { console.log(`  ok      events/${id}`); continue; }
  writes.push({ id, create: !live, data: { ...target, updatedAt: Date.now(), updatedBy: BY } });
  console.log(`  ${live ? 'update' : 'create'}  events/${id}${live ? `  (${changed.join(', ')})` : ''}`);
}

// Times only in the log: a lesson is a record about a student.
let cancelLesson = false;
const when = `${LESSON.teacherName} lesson ${LESSON.startTime}-${LESSON.endTime}`;
if (lesson.status === 'Cancelled') console.log(`  ok      ${when} (already cancelled)`);
else if (String(lesson.grade ?? '').trim()) console.log(`  keep    ${when} (graded, so it happened)`);
else { cancelLesson = true; console.log(`  cancel  ${when}`); }

const annWrites = [];
for (const a of ANNOUNCEMENTS) {
  const existing = db ? await db.collection('announcements').doc(a.id).get() : null;
  const live = existing?.exists ? existing.data() : null;
  // Already posted and unchanged: leave it, so a re-run never overwrites an
  // edit the director made to the post in the app.
  if (live && ['ensembleId', 'title', 'body', 'priority', 'links'].every(k => same(live[k], a[k]))) {
    console.log(`  ok      announcements/${a.id}`);
    continue;
  }
  annWrites.push({ a, createdAt: live ? live.createdAt : Date.now() });
  console.log(`  ${live ? 'update' : 'post  '}  announcements/${a.id}  [${a.priority}] -> ${a.ensembleId}`);
}

// ── The day after ────────────────────────────────────────────────────
const t = (s) => { if (!s) return '?'; const [h, m] = s.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')}`; };
console.log('\nDress rehearsal repertoire, in order:');
for (const [i, id] of program.entries()) console.log(`  ${i + 1}. ${await pieceTitle(id)}`);

const after = events.map(e => ({ ...e }));
for (const w of writes) {
  const i = after.findIndex(e => e.id === w.id);
  if (i >= 0) after[i] = { ...after[i], ...w.data };
  else after.push({ id: w.id, ...w.data });
}
after.sort((a, b) => (a.startTime ?? '99').localeCompare(b.startTime ?? '99'));
console.log(`\n${DATE} after this runs (afternoon and evening):`);
for (const e of after.filter(e => e.id === ID.violin || ((e.startTime ?? '') >= '13:00' && e.status !== 'Cancelled' && e.type !== 'Class'))) {
  const call = e.callTime ? `  call ${t(e.callTime)}` : '';
  console.log(`  ${t(e.startTime)}-${t(e.endTime)}  ${e.title || (e.ensembleIds ?? []).join(' + ')}  @ ${e.location ?? ''}${call}`);
}

if (DRY) {
  console.log(`\nDry run: ${writes.length} event write(s), ${cancelLesson ? 1 : 0} lesson cancel(s), ${annWrites.length} announcement(s) planned, none made.`);
  process.exit(0);
}

// One batch: the day is either the old shape or the new one, never half.
const batch = db.batch();
for (const w of writes) {
  const ref = db.collection('events').doc(w.id);
  if (w.create) batch.set(ref, w.data);
  else batch.update(ref, w.data);
}
if (cancelLesson) {
  // Same write as useLessons.cancelLesson, and its mirror in the same batch so
  // the student's feed stops carrying the lesson at the same moment.
  batch.update(db.collection('lessons').doc(LESSON.id), { status: 'Cancelled', updatedAt: Date.now(), updatedBy: BY });
  batch.set(db.collection('lessonsPublic').doc(LESSON.id), { status: 'Cancelled' }, { merge: true });
}
for (const { a, createdAt } of annWrites) {
  batch.set(db.collection('announcements').doc(a.id), {
    ensembleId: a.ensembleId,
    title: a.title,
    body: a.body,
    priority: a.priority,
    createdAt,
    createdBy: AUTHOR,
    links: a.links,
    expiresOn: DATE,
  });
}
await batch.commit();
console.log(`\nApplied: ${writes.length} event write(s), ${cancelLesson ? 1 : 0} lesson cancel(s), ${annWrites.length} announcement(s).`);
