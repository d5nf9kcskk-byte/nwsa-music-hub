import { parseAnswers } from '../hooks/useSignups';
import { lastName } from '../scoreOrder';
import type { SignupForm, SignupResponse } from '../types';
import { csvEscape as esc } from '../../shared/csv.ts';

/**
 * Getting a sign-up back OUT of the Hub (#signups). The whole reason this
 * feature exists is the workflow the director described: collect names →
 * type them into the state's registration system → send everyone the form →
 * chase the signed copies. Three exports cover it —
 *
 *   • `namesList`  — plain text, one student per line, for pasting into
 *                    whatever system wants the names.
 *   • `responsesToCsv` — the whole thing, spreadsheet-shaped, one column per
 *                    question, for a records copy or a mail merge.
 *   • `emailList`  — every address collected, for one mail to the group.
 */


export function byLastName(a: SignupResponse, b: SignupResponse): number {
  return lastName(a.studentName).localeCompare(lastName(b.studentName))
    || a.studentName.localeCompare(b.studentName);
}

/** "Alvarez, Maria — 11th — Violin", one per line. */
export function namesList(responses: SignupResponse[]): string {
  return [...responses].sort(byLastName)
    .map(r => [r.studentName, r.grade, r.instrument].filter(Boolean).join(' — '))
    .join('\n');
}

/** Every address on these responses, de-duplicated, comma-separated. */
export function emailList(responses: SignupResponse[]): string {
  const seen = new Set<string>();
  for (const r of [...responses].sort(byLastName)) {
    for (const e of [r.email, r.guardianEmail]) {
      const v = (e ?? '').trim().toLowerCase();
      if (v) seen.add(v);
    }
  }
  return [...seen].join(', ');
}

export function responsesToCsv(form: SignupForm, responses: SignupResponse[]): string {
  const questions = form.questions ?? [];
  const headers = [
    'Student', 'Grade', 'Instrument', 'Email', 'Phone',
    ...questions.map(q => q.label),
    'Signed by student', 'Parent/guardian', 'Signed by parent/guardian', 'Parent/guardian email',
    'Submitted', 'Status',
  ];
  const rows = [...responses].sort(byLastName).map(r => {
    const answers = parseAnswers(r);
    return [
      r.studentName,
      r.grade,
      r.instrument ?? '',
      r.email ?? '',
      r.phone ?? '',
      ...questions.map(q => answers[q.id] ?? ''),
      r.signature ?? '',
      r.guardianName ?? '',
      r.guardianSignature ?? '',
      r.guardianEmail ?? '',
      new Date(r.submittedAt).toLocaleString(),
      r.status,
    ].map(esc).join(',');
  });
  return [headers.join(','), ...rows].join('\r\n');
}

/** A filename-safe slug of the sign-up's title. */
export function exportSlug(form: SignupForm): string {
  return (form.title || 'signup')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'signup';
}
