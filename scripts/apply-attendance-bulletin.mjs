#!/usr/bin/env node
/**
 * apply-attendance-bulletin.mjs
 *
 * Cloud ingest for the daily MDC Outlook "Attendance Bulletin" PDF:
 *   GitHub cron → Graph mail/OneDrive fetch → this script → Firestore
 *
 * Writes office-sourced attendance for Active Hub (music) students only.
 * Other departments on the school-wide bulletin are ignored.
 * Ambiguous name matches go to bulletinQueue for Who's Out review.
 *
 * Env:
 *   FIREBASE_SERVICE_ACCOUNT_JSON  (required unless DRY_RUN=parse-only)
 *   BULLETIN_TEXT                  plain layout text (preferred for tests)
 *   BULLETIN_TEXT_PATH             utf8 file of that text
 *   BULLETIN_PDF_PATH              local PDF path
 *   BULLETIN_PDF_BASE64            PDF bytes
 *   BULLETIN_DATE                  optional YYYY-MM-DD override
 *   DRY_RUN                        "1" / "true" → match + log, no writes (default true)
 *   SKIP_IF_EMPTY                  "1" → exit 0 when no bulletin input (cron)
 */

import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
  parseAttendanceBulletinText,
  matchBulletinRows,
  mergeBulletinMarks,
  schoolDayTardyRows,
} from './lib/attendanceBulletinParse.mjs';

const DRY_RUN = !/^(0|false|no)$/i.test(String(process.env.DRY_RUN ?? 'true').trim() || 'true');
const PARSE_ONLY = /^parse-only$/i.test(String(process.env.DRY_RUN || '').trim());
const CI = Boolean(process.env.GITHUB_ACTIONS);

function loadText() {
  if (process.env.BULLETIN_TEXT?.trim()) return process.env.BULLETIN_TEXT;
  if (process.env.BULLETIN_TEXT_PATH) return readFileSync(process.env.BULLETIN_TEXT_PATH, 'utf8');
  if (process.env.BULLETIN_PDF_PATH) return pdfToText(process.env.BULLETIN_PDF_PATH);
  if (process.env.BULLETIN_PDF_BASE64) {
    const path = join(tmpdir(), `bulletin-${Date.now()}.pdf`);
    writeFileSync(path, Buffer.from(process.env.BULLETIN_PDF_BASE64, 'base64'));
    try { return pdfToText(path); }
    finally { try { unlinkSync(path); } catch { /* */ } }
  }
  if (/^(1|true|yes)$/i.test(String(process.env.SKIP_IF_EMPTY || '').trim())) {
    console.log('No bulletin input; skip.');
    process.exit(0);
  }
  console.error('Provide BULLETIN_TEXT, BULLETIN_TEXT_PATH, BULLETIN_PDF_PATH, or BULLETIN_PDF_BASE64.');
  process.exit(1);
}

function pdfToText(pdfPath) {
  const r = spawnSync('pdftotext', ['-layout', pdfPath, '-'], { encoding: 'utf8', maxBuffer: 10_000_000 });
  if (r.status === 0 && r.stdout) return r.stdout;
  // Fallback: pymupdf if poppler missing
  const py = spawnSync('python3', ['-c', `
import sys
try:
  import fitz
except ImportError:
  sys.exit(2)
doc = fitz.open(sys.argv[1])
print("\\n".join(p.get_text("text") for p in doc))
`, pdfPath], { encoding: 'utf8', maxBuffer: 10_000_000 });
  if (py.status === 0 && py.stdout) return py.stdout;
  console.error('Need pdftotext (poppler) or pymupdf to read PDF.');
  if (r.stderr) console.error(r.stderr);
  process.exit(1);
}

const text = loadText();
const parsed = parseAttendanceBulletinText(text);
const date = (process.env.BULLETIN_DATE || parsed.date || '').trim();
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error(`Bad/missing bulletin date (${date}). Set BULLETIN_DATE or fix PDF.`);
  process.exit(1);
}

console.log(`Bulletin date ${date}; ${parsed.rows.length} roll rows; DRY_RUN=${DRY_RUN}`);

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
const { matched, ambiguous, ignored } = matchBulletinRows(parsed.rows, students);

console.log(`Matched music: ${matched.length}; ambiguous: ${ambiguous.length}; ignored (other depts / unknown): ${ignored}`);

// One mark per student per day. The bulletin can list the same student in
// two sections (tardy AND excused early), and the Hub stores a single status
// per student/ensemble/day — so collapse BEFORE writing, or the last row
// processed wins by accident. Most severe wins; reasons are preserved.
const marks = mergeBulletinMarks(matched, date);
// School-day tardies ride the same pull but are NOT attendance (#tardies):
// late to school is a fact about the day, not about any one class.
const tardies = schoolDayTardyRows(matched, date);
if (marks.length !== matched.length && !CI) {
  console.log(`Collapsed ${matched.length} rows into ${marks.length} student-day marks.`);
}

if (DRY_RUN) {
  if (!CI) {
    for (const { student, date: markDate, status, reason } of marks) {
      console.log(`  would mark ${student.name} (${student.id}) [${markDate}] → ${status} · ${reason}`);
    }
    for (const { student, date: tDate, time } of tardies) {
      console.log(`  would record school-day tardy for ${student.name} [${tDate}]${time ? ` at ${time}` : ''}`);
    }
    for (const { row, candidates } of ambiguous) {
      console.log(`  ambiguous ${row.rawName} → ${candidates.map(c => c.name).join(' | ')}`);
    }
  }
  console.log('Dry run complete; no writes.');
  process.exit(0);
}

let wrote = 0;
let skippedDirector = 0;

for (const { student, date: markDate, status, reason } of marks) {
  const ensembleIds = (student.ensembleIds ?? []).filter(Boolean);
  if (ensembleIds.length === 0) {
    if (!CI) console.log(`  skip ${student.name}: no ensembles`);
    continue;
  }

  for (const ensembleId of ensembleIds) {
    const existingSnap = await db.collection('attendance')
      .where('date', '==', markDate)
      .where('ensembleId', '==', ensembleId)
      .where('studentId', '==', student.id)
      .get();

    const dayLevel = existingSnap.docs.filter(d => d.data().eventId == null);
    const existing = dayLevel[0] ?? existingSnap.docs[0];

    if (existing) {
      const data = existing.data();
      if (data.source !== 'office') {
        skippedDirector += 1;
        if (!CI) console.log(`  keep director mark for ${student.name} / ${ensembleId}`);
        continue;
      }
      await existing.ref.update({
        status,
        reason,
        source: 'office',
        updatedAt: Date.now(),
        updatedBy: 'attendance-bulletin',
      });
    } else {
      await db.collection('attendance').add({
        studentId: student.id,
        ensembleId,
        date: markDate,
        status,
        reason,
        source: 'office',
        updatedAt: Date.now(),
        updatedBy: 'attendance-bulletin',
        createdAt: Date.now(),
      });
    }
    wrote += 1;
  }
}

// School-day tardies. The doc id is studentId_date, so re-running today's
// bulletin (the workflow runs more than once a day) updates the same record
// instead of stacking duplicates.
let tardyCount = 0;
for (const { student, date: tDate, time } of tardies) {
  await db.collection('schoolDayTardies').doc(`${student.id}_${tDate}`).set({
    studentId: student.id,
    studentName: student.name,
    date: tDate,
    time: time ?? null,
    source: 'office',
    updatedAt: Date.now(),
  }, { merge: true });
  tardyCount += 1;
}

// Replace pending queue rows for EVERY date this bulletin touches. A row can
// carry a prior day's date (a late EXCUSED EARLY update), so clearing only the
// bulletin's own date would leave those rows to pile up run after run — the
// same section re-emitted tomorrow would queue a second copy.
const queueDates = [...new Set([date, ...ambiguous.map(a => a.row.date || date)])];
const batch = db.batch();
for (const qd of queueDates) {
  const oldQ = await db.collection('bulletinQueue')
    .where('date', '==', qd).where('status', '==', 'pending').get();
  for (const d of oldQ.docs) batch.delete(d.ref);
}
await batch.commit();

for (const { row, candidates } of ambiguous) {
  await db.collection('bulletinQueue').add({
    date: row.date || date,
    category: row.category,
    bulletinName: row.rawName,
    grade: row.grade ?? null,
    districtId: row.districtId ?? null,
    time: row.time ?? null,
    candidateIds: candidates.map(c => c.id),
    status: 'pending',
    createdAt: Date.now(),
  });
}

console.log(`Wrote ${wrote} attendance docs; ${tardyCount} school-day tardies; ` +
  `skipped ${skippedDirector} director marks; queued ${ambiguous.length} ambiguous.`);
