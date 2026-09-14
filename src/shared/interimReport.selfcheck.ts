/**
 * Pins the submitted report (#gradebook). Run:
 *   npx tsx src/shared/interimReport.selfcheck.ts
 *
 * This is the only module whose output leaves the building, so the things it
 * must not do are specific: put a zero where nobody gave a grade, print the
 * rows in an order the district did not ask for, call the behaviour column by
 * the other section's name, or let a typed name break the email it lands in.
 */
import type { ConductGrade, EffortGrade } from './ensembleGrades.ts';
import { windowFor, type GradingPeriod } from './gradingPeriods.ts';
import {
  buildTable, cell, columnHeader, esc, introLine, subjectLine, tablesToHtml, tablesToText,
  type ReportLayout, type ReportRow,
} from './interimReport.ts';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

const Q1: GradingPeriod = {
  id: 'q1', name: 'Quarter 1', ordinal: '1st Quarter', short: 'Q1',
  start: '2026-08-13', end: '2026-10-16', interim: '2026-09-15',
};
const INTERIM = windowFor(Q1, 'interim', '2026-09-15');
const QUARTER = windowFor(Q1, 'quarter', '2026-10-16');

const CAMERATA: ReportLayout = {
  id: 'camerata',
  title: 'Camerata',
  source: { kind: 'ensemble', ensembleId: 'camerata-string-orchestra' },
  headerColor: '#548235',
  conductLabel: 'Behavior',
  columns: ['fullName', 'lastName', 'grade', 'effort', 'conduct', 'codes'],
};
const ORCHESTRA: ReportLayout = {
  id: 'orchestra',
  title: 'Orchestra',
  source: { kind: 'ensemble', ensembleId: 'symphony-orchestra' },
  headerColor: '#4472c4',
  conductLabel: 'Conduct',
  columns: ['fullName', 'grade', 'effort', 'conduct', 'codes'],
};
const APPLIED: ReportLayout = {
  id: 'applied',
  title: 'Applied',
  source: { kind: 'appliedLessons', instrumentPattern: 'violin' },
  headerColor: '#a6a6a6',
  conductLabel: 'Behavior',
  columns: ['lastFirst', 'instrument', 'grade', 'effort', 'conduct'],
};

const row = (
  name: string,
  percent: number | null,
  effort: EffortGrade | null = '2',
  conduct: ConductGrade | null = 'A',
  codes: string[] = [],
  instrument = 'Violin',
): ReportRow => ({ studentId: name, name, instrument, percent, effort, conduct, codes });

/* ── the column headings carry the period, and the SECTION's own word ──── */

assert(columnHeader('grade', 'Q1i', 'Behavior') === 'Q1i Grade', 'the interim prefixes its columns');
assert(columnHeader('grade', 'Q1', 'Behavior') === 'Q1 Grade', 'the quarter report drops the i');
assert(
  columnHeader('conduct', 'Q1i', 'Behavior') === 'Q1i Behavior'
  && columnHeader('conduct', 'Q1i', 'Conduct') === 'Q1i Conduct',
  'Camerata says Behavior and Orchestra says Conduct — that is a fact about the course section, '
  + 'not a preference, so it travels on the layout',
);
assert(columnHeader('codes', 'Q1i', 'Behavior') === 'Comment Codes', 'the codes column is not prefixed');

/* ── a missing value is blank, never a zero and never a dash ───────────── */

assert(cell('grade', row('A B', null)) === '', 'no grade prints as an EMPTY cell');
assert(cell('grade', row('A B', 0)) === '0', 'a real zero still prints');
assert(cell('effort', row('A B', 90, null)) === '', 'no effort prints blank');
assert(cell('conduct', row('A B', 90, '2', null)) === '', 'no conduct prints blank');
assert(cell('codes', row('A B', 90, '2', 'A', ['14', '20'])) === '14, 20', 'codes are comma separated');
assert(cell('codes', row('A B', 90)) === '', 'no codes prints blank');

/* ── the rows come out alphabetical by surname, always ─────────────────── */

const table = buildTable(CAMERATA, INTERIM.prefix, [
  row('Ryu Chan', 70, '3', 'B', ['14']),
  row('David Antia', 89),
  row('Emily Block', 86),
]);
assert(
  table.rows.map(r => r[1]).join(',') === 'Antia,Block,Chan',
  'alphabetical by surname is the district requirement, and it is done HERE so no caller can '
  + 'forget it',
);
assert(
  table.headers.join(' | ') === 'Full Name | Last Name | Q1i Grade | Q1i Effort | Q1i Behavior | Comment Codes',
  'the Camerata layout, column for column',
);

const orch = buildTable(ORCHESTRA, INTERIM.prefix, [row('Emily Block', 89)]);
assert(
  orch.headers.join(' | ') === 'Full Name | Q1i Grade | Q1i Effort | Q1i Conduct | Comment Codes',
  'the Orchestra layout drops Last Name and says Conduct',
);

const applied = buildTable(APPLIED, INTERIM.prefix, [row('Isabella Chander', 95)]);
assert(
  applied.headers.join(' | ') === 'Name | Instrument | Q1i Grade | Q1i Effort | Q1i Behavior',
  'the Applied layout leads with Last, First and carries the instrument',
);
assert(applied.rows[0][0] === 'Chander, Isabella', 'and its name column is Last, First');

/* ── the same student, two sections, two grades ────────────────────────── */

assert(
  buildTable(CAMERATA, INTERIM.prefix, [row('Emily Block', 86)]).rows[0][2] === '86'
  && orch.rows[0][1] === '89',
  'a student in both sections carries a separate grade in each — they are two course sections, '
  + 'not one student listed twice',
);

/* ── the subject and intro lines the district has always seen ──────────── */

assert(
  subjectLine(INTERIM, 'Grades (HS)') === '1st Quarter Interim Grades (HS)',
  'the interim subject line',
);
assert(subjectLine(QUARTER, 'Grades (HS)') === '1st Quarter Grades (HS)', 'the quarter subject line');
assert(
  subjectLine({ ...INTERIM, period: { ...Q1, ordinal: undefined } }, 'Grades (HS)')
    === 'Quarter 1 Interim Grades (HS)',
  'a period with no ordinal spelled out falls back to its name rather than printing undefined',
);
assert(
  introLine(INTERIM, 'Orchestra, Camerata, and Applied grades:')
    === 'Q1i Orchestra, Camerata, and Applied grades:',
  'the body line carries the short prefix',
);

/* ── the paste survives a typed name ───────────────────────────────────── */

assert(esc('Tom & Jerry <b>') === 'Tom &amp; Jerry &lt;b&gt;', 'names are escaped');
const html = tablesToHtml([buildTable(CAMERATA, 'Q1i', [row('A & B <script>x</script>', 86)])], 'x');
assert(html.includes('A &amp; B'), 'and the escape reaches the rendered table');
assert(
  !html.includes('<script>') && html.includes('&lt;script&gt;'),
  'nothing a person typed can open a tag in the email body',
);
assert(html.includes('background:#548235'), 'the header fill is inline, because mail clients drop a stylesheet');
assert(html.includes('border-collapse:collapse'), 'and so are the borders');

const text = tablesToText([buildTable(ORCHESTRA, 'Q1i', [row('Emily Block', 89)])], 'Q1i grades:');
assert(text.split('\n')[0] === 'Q1i grades:', 'the text flavour leads with the same line');
assert(text.includes('Emily Block\t89\t2\tA\t'), 'and is tab separated for a spreadsheet paste');

console.log('interimReport.selfcheck: all assertions passed');
