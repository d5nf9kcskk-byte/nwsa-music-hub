import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { addedText, placedText, readFields, type FieldSpot, type PlacedText } from '../../shared/pdfFieldRead';
import { csvEscape as esc } from '../../shared/csv.ts';
import { byLastName } from './signupsExport';
import type { SignupForm, SignupResponse } from '../types';

/**
 * The emergency-contacts spreadsheet for a sign-the-PDF sign-up (#sign-pdf):
 * one row per student, one column per blank the form asks for, read out of
 * each signed PDF in the director's own browser (see pdfFieldRead.ts for why
 * the answers live nowhere else). Lazy-loaded — it brings pdf.js.
 */

GlobalWorkerOptions.workerSrc = workerUrl;

async function textOf(bytes: Uint8Array): Promise<PlacedText[]> {
  const task = getDocument({ data: bytes });
  try { return await placedText(await task.promise); } finally { void task.destroy(); }
}

const FIXED_LABEL: Record<string, string> = { studentName: 'Name on form', studentId: 'Student ID', grade: 'Grade on form' };

export async function emergencyContactsCsv(
  form: SignupForm,
  responses: SignupResponse[],
  signedPdf: (path: string) => Promise<Blob>,
): Promise<string> {
  const spots: FieldSpot[] = (form.signPdfFields ?? []).map(f => ({
    ...f, key: f.source === 'question' ? `q:${f.questionId}` : f.source,
  }));
  const fixedKeys = [...new Set(spots.map(s => s.key).filter(k => !k.startsWith('q:')))];
  const questions = form.signPdfQuestions ?? [];
  const blank = await textOf(new Uint8Array(await (await fetch(form.signPdf!.url)).arrayBuffer()));

  const headers = ['Student', 'Grade', ...fixedKeys.map(k => FIXED_LABEL[k] ?? k), ...questions.map(q => q.label), 'Submitted', 'Note'];
  const rows: string[] = [];
  for (const r of [...responses].sort(byLastName)) {
    let read: Record<string, string> = {};
    let note = '';
    if (!r.signedPdfPath) {
      note = 'No signed PDF';
    } else {
      try {
        const bytes = new Uint8Array(await (await signedPdf(r.signedPdfPath)).arrayBuffer());
        read = readFields(addedText(await textOf(bytes), blank), spots);
        if (!Object.keys(read).length) note = 'Nothing readable — open the signed form';
      } catch {
        note = 'Could not open the signed form';
      }
    }
    rows.push([
      r.studentName,
      r.grade,
      ...fixedKeys.map(k => read[k] ?? ''),
      ...questions.map(q => read[`q:${q.id}`] ?? ''),
      new Date(r.submittedAt).toLocaleString(),
      note,
    ].map(esc).join(','));
  }
  return [headers.map(esc).join(','), ...rows].join('\r\n');
}
