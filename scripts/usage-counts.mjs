#!/usr/bin/env node
/**
 * usage-counts.mjs — how much the Hub is being used this term, as NUMBERS.
 *
 * Read-only. Prints, for the current term (ORG.terms; outside a term, the most
 * recent one that started):
 *   - per concert to date: door arrivals, departures, students with both,
 *     guest (college-door) check-ins, and the size of the expected roster;
 *   - absence reports about days in the term, by status;
 *   - sign-up (form) responses submitted in the term;
 *   - music copy requests submitted in the term, by status.
 *
 * The Actions log is PUBLIC (#student-data). Nothing here prints a name, a
 * doc id, an email or any free text: the lines are built by
 * scripts/lib/usageCounts.mjs and checked by `assertSafeReport()` before the
 * first one is written. Concert titles are printed because `events` is
 * already a world read. scripts/usage-counts.selfcheck.mjs pins the format.
 *
 * Env: FIREBASE_SERVICE_ACCOUNT_JSON (same secret as the backfill workflow) —
 * check-ins, absences, sign-up responses and copy requests are staff-only.
 * VITE_ORG picks config/orgs/<org>.json (default nwsa).
 *
 * Usage: node scripts/usage-counts.mjs [--today=YYYY-MM-DD]
 */
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { buildReport, formatReport, assertSafeReport, pickTerm, localDate } from './lib/usageCounts.mjs';

const org = process.env.VITE_ORG || 'nwsa';
const config = JSON.parse(readFileSync(new URL(`../config/orgs/${org}.json`, import.meta.url), 'utf8'));
const timeZone = config.timezone || 'America/New_York';

const arg = process.argv.find(a => a.startsWith('--today='));
const today = arg ? arg.slice('--today='.length) : localDate(Date.now(), timeZone);
if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) {
  console.error('--today must be YYYY-MM-DD.');
  process.exit(1);
}

const term = pickTerm(config.terms, today);
if (!term) {
  console.error(`No terms configured for org "${org}"; nothing to count.`);
  process.exit(1);
}

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!raw) {
  console.error('FIREBASE_SERVICE_ACCOUNT_JSON is not set; aborting.');
  process.exit(1);
}
initializeApp({ credential: cert(JSON.parse(raw)) });
const db = getFirestore();

const docs = snap => snap.docs.map(d => ({ id: d.id, ...d.data() }));
// submittedAt is epoch ms; widen by a day each side and let the pure layer
// cut it to the term's local dates exactly.
const DAY = 86_400_000;
const fromMs = Date.parse(`${term.start}T00:00:00Z`) - DAY;
const toMs = Date.parse(`${term.end}T23:59:59Z`) + DAY;

try {
  const [events, checkins, students, absences, signupResponses, copyRequests] = await Promise.all([
    db.collection('events').where('date', '>=', term.start).where('date', '<=', term.end).get().then(docs),
    db.collection('concertCheckins').where('termId', '==', term.id).get().then(docs),
    // The public projection is enough: status + ensembleIds is all `expected` needs.
    db.collection('studentsPublic').get().then(docs),
    db.collection('plannedAbsences').where('date', '>=', term.start).where('date', '<=', term.end).get().then(docs),
    db.collection('signupResponses').where('submittedAt', '>=', fromMs).where('submittedAt', '<=', toMs).get().then(docs),
    db.collection('copyRequests').where('submittedAt', '>=', fromMs).where('submittedAt', '<=', toMs).get().then(docs),
  ]);

  const report = buildReport({ term, today, timeZone, events, checkins, students, absences, signupResponses, copyRequests });
  const lines = formatReport(report);
  assertSafeReport(lines, { termName: report.term.name, allowedTitles: report.concerts.map(c => c.title) });
  for (const line of lines) console.log(line);
} catch (err) {
  // A Firestore error can quote a document path, and a path holds a doc id.
  // Print the code only.
  console.error(`usage-counts failed (${err?.code ?? err?.name ?? 'error'}).`);
  process.exit(1);
}
