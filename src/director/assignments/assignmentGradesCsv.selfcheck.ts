/**
 * Runnable: npx tsx src/director/assignments/assignmentGradesCsv.selfcheck.ts
 *
 * Pins the assignment grade export. The column order is not the point; four
 * promises are, and every one of them changes what a district gradebook is
 * told about a real student:
 *
 *   1. A hostile name is QUOTED and NEUTRALISED. Both halves — a comma cannot
 *      invent a column, and a leading `=` cannot become a formula in a sheet a
 *      director opens.
 *   2. Rubric points land under the line they were given for, matched by
 *      criterion ID rather than by position.
 *   3. A grade snapshotted on an EARLIER rubric never misaligns. Its
 *      non-matching lines stay blank, its true total still rides along, and
 *      the row says so.
 *   4. An ungraded student exports BLANK, not zero. An unscored line is not a
 *      zero anywhere in this app, and a row of zeros would be averaged in as a
 *      failure nobody gave.
 *
 * Every name below is fictional.
 */
import {
  assignmentGradesToCsv, gradeCsvHeaders, gradeCsvRow, criterionHeader,
  gradesExportSlug, gradesCsvFilename,
  type GradeCsvPerson,
} from './assignmentGradesCsv.ts';
import type { RubricCriterion, RubricScore } from '../examRubric.ts';
import type { AssignmentResult } from '../types.ts';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

/** Split one CSV line back into cells, honouring RFC 4180 quoting — so the
 *  checks below read what a SPREADSHEET reads, not what the string looks like. */
function parseLine(line: string): string[] {
  const out: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { out.push(cell); cell = ''; }
    else cell += ch;
  }
  out.push(cell);
  return out;
}

const CRITERIA: RubricCriterion[] = [
  { id: 'intonation', label: 'Intonation', max: 25 },
  { id: 'rhythm',     label: 'Rhythm',     max: 20 },
  { id: 'musicality', label: 'Musicality', max: 20 },
];

const person = (o: Partial<GradeCsvPerson> & { studentId: string }): GradeCsvPerson => ({
  name: 'Ana Ruiz', instrument: 'Violin', onRoster: true, ...o,
});

const result = (o: Partial<AssignmentResult> & { studentId: string }): AssignmentResult => ({
  id: `res_${o.studentId}`, assignmentId: 'exam1', status: 'Pass', ...o,
});

const cellAt = (headers: string[], row: string[], header: string): string => {
  const i = headers.indexOf(header);
  assert(i >= 0, `no "${header}" column`);
  return row[i];
};

/* ── Headers say what a line is worth ── */

const headers = gradeCsvHeaders(CRITERIA);
assert(criterionHeader(CRITERIA[0]) === 'Intonation /25',
  'a rubric column names the line AND its worth — "Intonation" alone does not say out of what');
assert(headers.filter(h => h === 'Intonation /25').length === 1, 'one column per rubric line');
assert(headers.indexOf('Rubric points') > headers.indexOf('Musicality /20'),
  'the raw total sits after the lines it adds up');

/* ── 2. Points land under the line they were given for ── */

const gradedRow = gradeCsvRow(
  person({ studentId: 'ana' }),
  result({
    studentId: 'ana', score: '82', gradedAt: '2026-09-08',
    rubric: [
      // Deliberately NOT in the assignment's order: the export must match by
      // id, so shuffling the snapshot changes nothing.
      { id: 'musicality', label: 'Musicality', max: 20, points: 15 },
      { id: 'intonation', label: 'Intonation', max: 25, points: 22 },
      { id: 'rhythm',     label: 'Rhythm',     max: 20, points: 18 },
    ],
  }),
  CRITERIA,
);
assert(cellAt(headers, gradedRow, 'Intonation /25') === '22', 'intonation points under Intonation');
assert(cellAt(headers, gradedRow, 'Rhythm /20') === '18', 'rhythm points under Rhythm');
assert(cellAt(headers, gradedRow, 'Musicality /20') === '15', 'musicality points under Musicality');
assert(cellAt(headers, gradedRow, 'Score') === '82', 'the filed percent rides along');
assert(cellAt(headers, gradedRow, 'Rubric points') === '55'
  && cellAt(headers, gradedRow, 'Rubric out of') === '65',
  'and the raw total, which a percent cannot stand in for when the rubric is not out of 100');
assert(cellAt(headers, gradedRow, 'Flags') === '', 'a current-rubric grade flags nothing');

/* ── 3. An earlier rubric must not misalign ──
   Bo was graded before the exam was re-weighted: Rhythm was worth 25 then, and
   there was a "Tempo" line that no longer exists. Laying this out by POSITION
   would file 19 Character points in the Musicality column. */

const EARLIER: RubricScore[] = [
  { id: 'intonation', label: 'Intonation', max: 25, points: 20 },
  { id: 'rhythm',     label: 'Rhythm',     max: 25, points: 19 },
  { id: 'tempo',      label: 'Tempo',      max: 10, points: 8 },
];
const oldRow = gradeCsvRow(
  person({ studentId: 'bo', name: 'Bo Nakamura', instrument: 'Cello' }),
  result({ studentId: 'bo', score: '78', gradedAt: '2026-09-01', rubric: EARLIER }),
  CRITERIA,
);
assert(cellAt(headers, oldRow, 'Intonation /25') === '20',
  'a line whose id AND worth still match keeps its cell');
assert(cellAt(headers, oldRow, 'Rhythm /20') === '',
  'a line worth 25 then and 20 now is BLANK — 19 under "/20" would read as a number nobody gave');
assert(cellAt(headers, oldRow, 'Musicality /20') === '',
  'and the Tempo points never slide into the Musicality column');
assert(!oldRow.includes('8'), 'a dropped line lands in no column at all');
assert(cellAt(headers, oldRow, 'Rubric points') === '47'
  && cellAt(headers, oldRow, 'Rubric out of') === '60',
  'but the row still carries what it actually earned, on the rubric it was given');
assert(cellAt(headers, oldRow, 'Flags') === 'Scored on an earlier rubric',
  'and the row SAYS so, so blank cells are never read as "not scored"');

/* ── 3b. A line ADDED after the fact is the other direction of the same bug ──
   Every line Ada was graded on still matches, so nothing is left over — but
   the exam has since gained a line she was never scored for. Counting only
   leftover snapshot lines missed this, and her blank Tempo cell read as
   "skipped" rather than "graded before this line existed". */

const WITH_TEMPO: RubricCriterion[] = [...CRITERIA, { id: 'tempo', label: 'Tempo', max: 10 }];
const addedHeaders = gradeCsvHeaders(WITH_TEMPO);
const addedRow = gradeCsvRow(
  person({ studentId: 'ada', name: 'Ada Kemper' }),
  result({
    studentId: 'ada', score: '86', gradedAt: '2026-09-08',
    rubric: [
      { id: 'intonation', label: 'Intonation', max: 25, points: 22 },
      { id: 'rhythm',     label: 'Rhythm',     max: 20, points: 17 },
      { id: 'musicality', label: 'Musicality', max: 20, points: 17 },
    ],
  }),
  WITH_TEMPO,
);
assert(cellAt(addedHeaders, addedRow, 'Intonation /25') === '22'
  && cellAt(addedHeaders, addedRow, 'Rhythm /20') === '17'
  && cellAt(addedHeaders, addedRow, 'Musicality /20') === '17',
  'the lines she WAS graded on keep their cells');
assert(cellAt(addedHeaders, addedRow, 'Tempo /10') === '',
  'the line added later is blank — she was never scored for it');
assert(cellAt(addedHeaders, addedRow, 'Flags') === 'Scored on an earlier rubric',
  'and the row SAYS so — an unflagged blank reads as "skipped", which is a different story');
assert(cellAt(addedHeaders, addedRow, 'Rubric out of') === '65',
  'her total is still out of the 65 she was actually graded on, not the 75 the exam now carries');

// The flag must not fire when nothing drifted, in either direction — including
// on a snapshot that says the same thing in a different ORDER, since the cells
// are matched by id and the flag is answered the same way.
assert(cellAt(headers, gradedRow, 'Flags') === '',
  'a shuffled but otherwise identical snapshot is NOT an earlier rubric');
const exactRow = gradeCsvRow(
  person({ studentId: 'eve', name: 'Eve Larsen' }),
  result({
    studentId: 'eve', score: '90',
    rubric: CRITERIA.map(c => ({ ...c, points: c.max })),
  }),
  CRITERIA,
);
assert(cellAt(headers, exactRow, 'Flags') === '', 'and neither is an exact match');

/* ── 4. Ungraded is blank, never zero ── */

const blankRow = gradeCsvRow(person({ studentId: 'cy', name: 'Cy Delgado' }), undefined, CRITERIA);
assert(cellAt(headers, blankRow, 'Status') === 'Pending', 'no result reads as Pending');
for (const c of CRITERIA) {
  assert(cellAt(headers, blankRow, criterionHeader(c)) === '',
    `an unscored ${c.label} is BLANK — not a zero a gradebook would average in`);
}
assert(cellAt(headers, blankRow, 'Score') === '', 'and no score');
assert(cellAt(headers, blankRow, 'Rubric points') === ''
  && cellAt(headers, blankRow, 'Rubric out of') === '',
  'and no total: zero out of zero is still a claim nobody made');
assert(cellAt(headers, blankRow, 'Graded') === '', 'and no grading date');
assert(!blankRow.includes('0'), 'nothing on an ungraded row is a zero');

// A student marked Pass with no rubric is the same story: a quick mark is not
// a breakdown, and the lines stay empty rather than filling in as full marks.
const quickMark = gradeCsvRow(
  person({ studentId: 'di', name: 'Di Okonkwo' }),
  result({ studentId: 'di', status: 'Pass', gradedAt: '2026-09-08' }),
  CRITERIA,
);
assert(cellAt(headers, quickMark, 'Status') === 'Pass', 'the quick mark is filed');
assert(CRITERIA.every(c => cellAt(headers, quickMark, criterionHeader(c)) === ''),
  'a Pass without a rubric fills no rubric cells');
assert(cellAt(headers, quickMark, 'Flags') === '',
  'and it is not an earlier-rubric row — there was no rubric to be earlier');

/* ── 1. A hostile name is quoted AND neutralised ── */

const HOSTILE = '=HYPERLINK("http://evil.example","Click"),Ruiz';
const csv = assignmentGradesToCsv({
  criteria: CRITERIA,
  people: [person({ studentId: 'ev', name: HOSTILE, instrument: 'Viola' })],
  resultMap: {
    ev: result({
      studentId: 'ev', status: 'Fail', score: '41', gradedAt: '2026-09-08',
      notes: 'Left early;\nre-take, per the "plan"',
    }),
  },
});
const lines = csv.split('\r\n');
assert(lines.length === 2, 'a name carrying a newline in its notes is still ONE row');
const hostileCells = parseLine(lines[1]);
assert(hostileCells.length === headers.length,
  'a comma inside a name cannot invent a column');
assert(hostileCells[0] === `'${HOSTILE}`,
  'a leading = is neutralised with the spreadsheet’s own text marker, not merely quoted');
assert(lines[1].startsWith('"\'=HYPERLINK'), 'and the cell is quoted, because it holds a comma');
assert(cellAt(headers, hostileCells, 'Notes').includes('"plan"'),
  'a doubled quote unescapes back to one');
assert(cellAt(headers, hostileCells, 'Notes').includes('\n'),
  'and the newline survives inside the quoted cell');

/* ── The whole roster exports, finished or not ── */

const sheet = assignmentGradesToCsv({
  criteria: CRITERIA,
  people: [
    person({ studentId: 'ana' }),
    person({ studentId: 'cy', name: 'Cy Delgado' }),
    person({ studentId: 'zed', name: 'Zed Farouk', instrument: 'Bass', onRoster: false }),
  ],
  resultMap: { ana: result({ studentId: 'ana', score: '91' }) },
});
const sheetLines = sheet.split('\r\n');
assert(sheetLines.length === 4, 'header plus every person — ungraded students included');
assert(parseLine(sheetLines[2])[0] === 'Cy Delgado', 'the ungraded student is still on the sheet');
assert(cellAt(headers, parseLine(sheetLines[3]), 'Flags') === 'Not on this list',
  'a submitter who has left the roster is marked, never silently mixed in');
assert(parseLine(sheetLines[3])[0] === 'Zed Farouk',
  'and their name comes off their own submission — no roster row is invented');

/* ── An assignment with no rubric still exports ── */

const plain = assignmentGradesToCsv({
  criteria: [],
  people: [person({ studentId: 'ana' })],
  resultMap: {
    ana: result({ studentId: 'ana', score: '88', gradedAt: '2026-09-08', notes: 'Solid' }),
  },
});
const plainHeaders = parseLine(plain.split('\r\n')[0]);
assert(plainHeaders.join(',') === 'Student,Instrument,Status,Score,Graded,Notes,Flags',
  'a written test carries no rubric columns and no rubric totals');
const plainRow = parseLine(plain.split('\r\n')[1]);
assert(cellAt(plainHeaders, plainRow, 'Score') === '88'
  && cellAt(plainHeaders, plainRow, 'Notes') === 'Solid',
  'but it still carries the grade, the date and the notes');

/* ── The filename is org-neutral ── */

assert(gradesCsvFilename('Fall Playing Exam — Scales!', '2026-09-08')
  === 'grades-fall-playing-exam-scales-2026-09-08.csv',
  'the filename slugs the assignment title and dates the file');
assert(!gradesCsvFilename('Anything', '2026-09-08').includes('nwsa'),
  'and hardcodes no org — this codebase builds more than one school’s site');
assert(gradesExportSlug('') === 'assignment', 'an untitled assignment still gets a filename');
assert(gradesExportSlug('!!!') === 'assignment', 'and so does one titled only in punctuation');

console.log('assignmentGradesCsv.selfcheck: OK');
