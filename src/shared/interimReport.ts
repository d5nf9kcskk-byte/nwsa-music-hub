/**
 * The interim / quarter report the teacher of record receives (#gradebook) —
 * the ONE definition of what those tables look like and what goes in them.
 *
 * This is a translation job, not a design one. The district collects grades
 * by email, in tables whose columns and headings are fixed by the course
 * section rather than by anybody's preference: the Camerata section carries a
 * Last Name column and calls the behaviour column "Behavior", the Symphony
 * section drops the extra column and calls it "Conduct". So the layouts are
 * DATA (`ORG.grading.reports`), never spelled out in `src/` — the same rule
 * that keeps org names and contact emails out of the code (#org-config).
 *
 * Pure: no ORG import, no DOM, explicit `.ts` on relative imports, so the
 * screen, the clipboard, and the self-check all build the same tables under
 * plain Node.
 *
 * The output is HTML on purpose. These tables are pasted into an email, and a
 * plain-text paste arrives as a wall of tab characters that the recipient has
 * to rebuild by hand. `tablesToHtml` writes the borders and header fills
 * inline, because a mail client strips a stylesheet and keeps an attribute.
 */
import {
  byLastName, lastFirst, lastName,
  type ConductGrade, type EffortGrade,
} from './ensembleGrades.ts';
import type { ReportingWindow } from './gradingPeriods.ts';

/** Every column the district's three tables are built from. */
export const REPORT_COLUMNS = [
  'fullName', 'lastName', 'lastFirst', 'instrument', 'grade', 'effort', 'conduct', 'codes',
] as const;
export type ReportColumn = (typeof REPORT_COLUMNS)[number];

/** Where a table's people come from. */
export type ReportSource =
  | { kind: 'ensemble'; ensembleId: string }
  /** The report-runner's own applied studio, optionally one instrument of it.
   *  Its own kind because a studio is not a roster: it is derived from the
   *  lessons this teacher actually gave, and `lessons` is scoped to them. */
  | { kind: 'appliedLessons'; instrumentPattern?: string };

export interface ReportLayout {
  id: string;
  /** "Camerata" — the heading printed above the table. */
  title: string;
  source: ReportSource;
  /** Header fill, as the district's own sheet colours it. */
  headerColor: string;
  /** What THIS section calls the behaviour column: "Behavior" or "Conduct". */
  conductLabel: string;
  columns: ReportColumn[];
}

/** One person's line, already graded. */
export interface ReportRow {
  studentId: string;
  /** "Emily Block", as the roster spells it. */
  name: string;
  instrument?: string;
  percent: number | null;
  effort: EffortGrade | null;
  conduct: ConductGrade | null;
  /** District comment codes, e.g. ['14', '20']. */
  codes: string[];
}

export interface ReportTable {
  id: string;
  title: string;
  headers: string[];
  rows: string[][];
  headerColor: string;
}

/** The heading for one column, with this period's prefix applied. */
export function columnHeader(
  column: ReportColumn,
  prefix: string,
  conductLabel: string,
): string {
  switch (column) {
    case 'fullName':   return 'Full Name';
    case 'lastName':   return 'Last Name';
    case 'lastFirst':  return 'Name';
    case 'instrument': return 'Instrument';
    case 'grade':      return `${prefix} Grade`;
    case 'effort':     return `${prefix} Effort`;
    case 'conduct':    return `${prefix} ${conductLabel}`;
    case 'codes':      return 'Comment Codes';
  }
}

/** One cell. A missing value is BLANK, never a zero and never a dash: the
 *  recipient pastes these into a gradebook, and a zero is a grade nobody
 *  gave. */
export function cell(column: ReportColumn, row: ReportRow): string {
  switch (column) {
    case 'fullName':   return row.name;
    case 'lastName':   return lastName(row.name);
    case 'lastFirst':  return lastFirst(row.name);
    case 'instrument': return row.instrument ?? '';
    case 'grade':      return row.percent === null ? '' : String(row.percent);
    case 'effort':     return row.effort ?? '';
    case 'conduct':    return row.conduct ?? '';
    case 'codes':      return row.codes.join(', ');
  }
}

/**
 * Build one table. Rows come out ALPHABETICAL BY SURNAME, which is the
 * district's first stated requirement and not something the caller should be
 * able to forget.
 */
export function buildTable(
  layout: ReportLayout,
  prefix: string,
  rows: ReportRow[],
): ReportTable {
  const sorted = [...rows].sort((a, b) => byLastName(a.name, b.name));
  return {
    id: layout.id,
    title: layout.title,
    headerColor: layout.headerColor,
    headers: layout.columns.map(c => columnHeader(c, prefix, layout.conductLabel)),
    rows: sorted.map(r => layout.columns.map(c => cell(c, r))),
  };
}

/** Names are typed by people and land in an email body. */
export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** "1st Quarter Interim Grades (HS)" — the subject line, as it has always
 *  read. Falls back to the period's plain name when no ordinal is set. */
export function subjectLine(w: ReportingWindow, suffix: string): string {
  const base = w.period.ordinal ?? w.period.name;
  return w.kind === 'interim' ? `${base} Interim ${suffix}` : `${base} ${suffix}`;
}

/** "Q1i Orchestra, Camerata, and Applied grades:" — the one line above the
 *  tables, with this period's prefix on the front. */
export function introLine(w: ReportingWindow, intro: string): string {
  return `${w.prefix} ${intro}`;
}

/**
 * The email body, as HTML. Borders and header fills are inline attributes
 * rather than CSS because mail clients keep the first and drop the second.
 */
export function tablesToHtml(tables: ReportTable[], intro: string): string {
  const parts: string[] = [`<p>${esc(intro)}</p>`];
  for (const t of tables) {
    parts.push(`<p><b>${esc(t.title)}:</b></p>`);
    const head = t.headers
      .map(h => `<th style="background:${esc(t.headerColor)};color:#ffffff;border:1px solid #808080;`
        + `padding:4px 8px;text-align:left;font-weight:bold;">${esc(h)}</th>`)
      .join('');
    const body = t.rows
      .map((r, i) => {
        const zebra = i % 2 === 1 ? 'background:#f2f2f2;' : '';
        const tds = r
          .map(c => `<td style="border:1px solid #808080;padding:4px 8px;${zebra}">${esc(c)}</td>`)
          .join('');
        return `<tr>${tds}</tr>`;
      })
      .join('');
    parts.push(
      `<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;`
      + `font-family:Calibri,Arial,sans-serif;font-size:11pt;">`
      + `<thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`,
    );
  }
  return parts.join('\n');
}

/** The same thing as tab-separated text, for the clipboard's plain flavour
 *  and for anyone pasting into a spreadsheet instead of an email. */
export function tablesToText(tables: ReportTable[], intro: string): string {
  const out: string[] = [intro, ''];
  for (const t of tables) {
    out.push(`${t.title}:`);
    out.push(t.headers.join('\t'));
    for (const r of t.rows) out.push(r.join('\t'));
    out.push('');
  }
  return out.join('\n');
}
