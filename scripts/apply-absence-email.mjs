#!/usr/bin/env node
/**
 * apply-absence-email.mjs
 *
 * Ingest for parent/student "not going to be there" emails, read locally
 * from Apple Mail (see absence-email-local.mjs — that script fetches the
 * messages; this one only parses + writes):
 *
 *   Mail.app inbox → absence-email-local.mjs (osascript) → this script → Firestore
 *
 * A confident match (exactly one roster name, exactly one date) writes a
 * plannedAbsences doc — the SAME collection and shape the public "Report a
 * planned absence" button writes, so it shows up in Who's Out identically.
 * Anything less confident goes to absenceEmailQueue for a director to read
 * the actual email and resolve by hand.
 *
 * Env:
 *   FIREBASE_SERVICE_ACCOUNT_JSON  (required unless DRY_RUN=parse-only)
 *   ABSENCE_EMAILS_JSON            JSON array of { subject, body, from, receivedDate, messageId }
 *   ABSENCE_EMAILS_JSON_PATH       utf8 file holding that same JSON
 *   DRY_RUN                        "1"/"true" → match + log, no writes (default true)
 *   SKIP_IF_EMPTY                  "1" → exit 0 when no emails given (cron)
 */

import { readFileSync } from 'node:fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { parseAbsenceEmail, easternDateStr } from './lib/absenceEmailParse.mjs';

const DRY_RUN = !/^(0|false|no)$/i.test(String(process.env.DRY_RUN ?? 'true').trim() || 'true');
const PARSE_ONLY = /^parse-only$/i.test(String(process.env.DRY_RUN || '').trim());
const CI = Boolean(process.env.GITHUB_ACTIONS);

function loadEmails() {
  const raw = process.env.ABSENCE_EMAILS_JSON?.trim()
    || (process.env.ABSENCE_EMAILS_JSON_PATH ? readFileSync(process.env.ABSENCE_EMAILS_JSON_PATH, 'utf8') : '');
  if (!raw) {
    if (/^(1|true|yes)$/i.test(String(process.env.SKIP_IF_EMPTY || '').trim())) {
      console.log('No emails to check; skip.');
      process.exit(0);
    }
    console.error('Provide ABSENCE_EMAILS_JSON or ABSENCE_EMAILS_JSON_PATH.');
    process.exit(1);
  }
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch { console.error('ABSENCE_EMAILS_JSON is not valid JSON.'); process.exit(1); }
  if (!Array.isArray(parsed)) { console.error('ABSENCE_EMAILS_JSON must be an array.'); process.exit(1); }
  return parsed;
}

const emails = loadEmails();
console.log(`${emails.length} new email(s) to check; DRY_RUN=${DRY_RUN}`);

if (PARSE_ONLY) {
  console.log('Parse only; no credentials read, nothing matched.');
  process.exit(0);
}

const sa = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!sa) { console.error('FIREBASE_SERVICE_ACCOUNT_JSON not set.'); process.exit(1); }
let serviceAccount;
try { serviceAccount = JSON.parse(sa); }
catch { console.error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.'); process.exit(1); }
if (getApps().length === 0) initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const studentsSnap = await db.collection('students').get();
const students = studentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

const results = emails.map(email => ({ email, parsed: parseAbsenceEmail(email, students) }));
const matched = results.filter(r => r.parsed.status === 'matched');
const ambiguous = results.filter(r => r.parsed.status === 'ambiguous');
const ignored = results.length - matched.length - ambiguous.length;

console.log(`Matched: ${matched.length}; ambiguous: ${ambiguous.length}; ignored (not absence-shaped): ${ignored}`);

if (DRY_RUN) {
  if (!CI) {
    for (const { parsed } of matched) console.log(`  would report ${parsed.studentName} out ${parsed.date}`);
    for (const { parsed } of ambiguous) console.log(`  queue: ${parsed.reason} — "${parsed.snippet}"`);
    // The soft launch exists to catch a MISS, and a miss looks like nothing
    // at all: an absence worded outside ABSENCE_PHRASES is counted as
    // "ignored" and never mentioned again. Name them while dry-running, so
    // a real absence that slipped through is visible in the log rather than
    // silent. Local staff log only — never in CI.
    for (const { email, parsed } of results) {
      if (parsed.status !== 'ignored') continue;
      const subject = (email.subject || '(no subject)').slice(0, 80);
      console.log(`  ignored: "${subject}"  — from ${email.from || 'unknown'}`);
    }
  }
  console.log('Dry run complete; no writes.');
  process.exit(0);
}

let wrote = 0;
for (const { parsed } of matched) {
  await db.collection('plannedAbsences').add({
    studentId: parsed.studentId,
    studentName: parsed.studentName,
    date: parsed.date,
    reason: 'Reported by email (parent/student)',
    submittedAt: Date.now(),
    status: 'pending',
  });
  wrote += 1;
}

let queued = 0;
for (const { email, parsed } of ambiguous) {
  // Who's Out is date-scoped (array-contains on `dates`); a row with no
  // parsed date would otherwise never surface anywhere for a director to
  // see, so it falls back to the day the email itself arrived.
  const dates = parsed.dates.length > 0 ? parsed.dates
    : email.receivedDate ? [easternDateStr(email.receivedDate)] : [];
  await db.collection('absenceEmailQueue').add({
    from: email.from ?? '',
    subject: email.subject ?? '',
    receivedDate: email.receivedDate ?? '',
    snippet: parsed.snippet,
    candidateIds: parsed.candidateIds,
    candidateNames: parsed.candidateNames,
    dates,
    reason: parsed.reason,
    status: 'pending',
    createdAt: Date.now(),
  });
  queued += 1;
}

console.log(`Wrote ${wrote} planned absence(s); queued ${queued} for review.`);
