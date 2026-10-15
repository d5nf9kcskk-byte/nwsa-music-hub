import { useCallback, useMemo, useState } from 'react';
import { ClipboardCopy, Check, RotateCcw, Wand2, X } from 'lucide-react';
import { ORG } from '../../org';
import {
  CONDUCT_GRADES, EFFORT_GRADES, commentReasons, conductValue, effortValue, fillValueFor, gradeValue,
  itemKey, rowReadiness, tallyGrade, tallyCount, type GradeCategory,
} from '../../shared/ensembleGrades';
import {
  currentGradingPeriod, defaultCutoff, sortPeriods, windowFor,
  type GradingPeriod, type ReportKind, type ReportingWindow,
} from '../../shared/gradingPeriods';
import {
  buildTable, introLine, subjectLine, tablesToHtml, tablesToText,
  type ReportLayout, type ReportRow, type ReportTable,
} from '../../shared/interimReport';
import { useStudents } from '../hooks/useStudents';
import { useEvents } from '../hooks/useEvents';
import { useAllAttendance } from '../hooks/useAttendance';
import { useConcertCheckins } from '../hooks/useConcertCheckins';
import { useRosterOverrides } from '../hooks/useRosterOverrides';
import { pulledFromEvent } from '../rosterResolver';
import { useAssignments, useAllAssignmentResults } from '../hooks/useAssignments';
import { useLessons } from '../hooks/useLessons';
import { useGradeMarks, REMOVE, type CellPatch } from '../hooks/useGradeMarks';
import { useCurrentDirector } from '../currentDirector';
import { gradeSummary } from '../lessonGrades';
import { todayStr } from '../utils';
import type { CalendarEvent, Lesson, Student } from '../types';
import { AddColumnBar } from './AddColumnBar';
import { buildTable as buildGradeTable, concertLabel, type GradeColumn, type TableModel } from './gradeTable';
import './gradebook.css';

/**
 * The Gradebook (#gradebook) — where a quarter grade is decided, and where the
 * report the district collects is built.
 *
 * The shape of this screen follows two decisions from the director.
 *
 * 2026-09-14 — **the Hub does not grade attendance, the director does.** An
 * excused absence costs nothing and is a record only; an unexcused absence or
 * lateness informs the Preparation mark, and by how much is a judgement. So
 * the observed categories are boxes a person fills in, with the Hub's own
 * records printed on the same line.
 *
 * 2026-10-14 — **it is a spreadsheet, and a number the Hub can work out
 * follows the Hub.** Exams, concerts and lesson grades are live: they update
 * when an exam is graded, a roll is finished, or another lesson is logged,
 * and a number typed over one replaces it (↺ gives it back). Columns can be
 * added at will — an exam, a concert, a grade of one's own, or a thing that
 * costs points (a phone out, acting out). Before this, "Fill" and "Add" COPIED
 * the Hub's number into the box, a copy is a snapshot, and the lesson grades
 * logged after the interim never reached the final.
 *
 * None of the arithmetic is in this file. It is in `./gradeTable.ts` and
 * `src/shared/ensembleGrades.ts`, and the email's tables are in
 * `src/shared/interimReport.ts` — all pure, all pinned by a self-check, so what
 * this screen shows and what the email carries cannot drift apart.
 */

type GroupRoster = { student: Student; instrument: string }[];

const HS_ONLY_HINT = 'College students are on the MDC roll, not the district one.';

/** A college year is stored as "College Freshman" … "College Senior"
 *  (#signups), so a high schooler is anyone whose grade does not start there. */
function isCollegeStudent(s: Student): boolean {
  return (s.grade ?? '').trim().toLowerCase().startsWith('college');
}

/** The group key a report's marks are stored under: an ensemble id, or the
 *  report's own id for a table that is not an ensemble (the applied studio). */
function groupKeyFor(layout: ReportLayout): string {
  return layout.source.kind === 'ensemble' ? layout.source.ensembleId : layout.id;
}

/** Whole days from one YYYY-MM-DD to another (negative when `to` is earlier). */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/**
 * Who belongs on one table.
 *
 * An ensemble table is its roster. The applied table is the teacher's STUDIO,
 * and it is the union of two lists because neither one alone is right:
 *
 *   • `assignedStudentIds` on the teacher's own directors doc — everyone in
 *     the studio, whether or not a lesson has been logged yet. A student who
 *     has had no lesson this quarter still has to appear, or they are missing
 *     from the report entirely rather than showing an honest blank.
 *   • anyone this teacher actually gave a lesson to inside the window, which
 *     catches a student picked up mid-quarter before the assignment list
 *     caught up.
 *
 * Both are already scoped to the signed-in teacher (`lessons` by its own query
 * and rules, `assignedStudentIds` by being their own doc), so this can never
 * reach another teacher's studio.
 */
function rosterFor(
  layout: ReportLayout,
  students: Student[],
  lessons: Lesson[],
  myEmail: string | undefined,
  assignedStudentIds: string[],
  reportSpan: ReportingWindow,
  hsOnly: boolean,
): GroupRoster {
  const active = students.filter(s => s.status === 'Active' && (!hsOnly || !isCollegeStudent(s)));
  if (layout.source.kind === 'ensemble') {
    const id = layout.source.ensembleId;
    return active
      .filter(s => s.ensembleIds?.includes(id))
      .map(s => ({ student: s, instrument: s.instrument ?? '' }));
  }
  const pattern = layout.source.instrumentPattern?.toLowerCase() ?? '';
  const matches = (instrument: string) => !pattern || instrument.toLowerCase().includes(pattern);
  const byId = new Map<string, string>();

  // Everyone assigned to this teacher, lesson or no lesson.
  for (const id of assignedStudentIds) {
    const student = students.find(s => s.id === id);
    const instrument = (student?.instrument ?? '').trim();
    if (!matches(instrument)) continue;
    byId.set(id, instrument);
  }
  // Plus anyone they actually taught in the window. A lesson's own instrument
  // wins over the roster's, since it is what was taught on the day.
  for (const l of lessons) {
    if (myEmail && l.teacherEmail !== myEmail) continue;
    if (l.date < reportSpan.from || l.date > reportSpan.through) continue;
    if (l.status === 'Cancelled') continue;
    const student = students.find(s => s.id === l.studentId);
    const instrument = (l.instrument || student?.instrument || '').trim();
    if (!matches(instrument)) continue;
    byId.set(l.studentId, instrument);
  }

  return active
    .filter(s => byId.has(s.id))
    .map(s => ({ student: s, instrument: byId.get(s.id) || (s.instrument ?? '') }));
}

export function GradebookView() {
  const grading = ORG.grading;
  const me = useCurrentDirector();
  const today = todayStr();

  const periods = useMemo(() => sortPeriods(grading?.periods ?? []), [grading]);
  const [periodId, setPeriodId] = useState(() => currentGradingPeriod(periods, today)?.id ?? '');
  const [kind, setKind] = useState<ReportKind>('interim');
  const [cutoffEdit, setCutoffEdit] = useState<string | null>(null);
  const [reportId, setReportId] = useState(grading?.reports[0]?.id ?? '');
  const [hsOnly, setHsOnly] = useState(true);
  const [showEmail, setShowEmail] = useState(false);
  const [copied, setCopied] = useState(false);

  const period: GradingPeriod | undefined = periods.find(p => p.id === periodId) ?? periods[0];
  const cutoff = cutoffEdit ?? (period ? defaultCutoff(period, kind, today) : today);
  const reportSpan: ReportingWindow | null = useMemo(
    () => (period ? windowFor(period, kind, cutoff) : null),
    [period, kind, cutoff],
  );
  const layout: ReportLayout | undefined =
    grading?.reports.find(r => r.id === reportId) ?? grading?.reports[0];

  /* ── everything the evidence is read from ───────────────────────────── */
  const { students } = useStudents();
  const { events } = useEvents();
  const { records } = useAllAttendance();
  const { checkins } = useConcertCheckins();
  const { overrides } = useRosterOverrides();
  const { assignments } = useAssignments();
  const { results } = useAllAssignmentResults();
  const { lessons } = useLessons();
  const { byGroup, saveMark, saveScore, writeCells } = useGradeMarks(period?.id ?? '');

  const eventsById = useMemo(() => Object.fromEntries(events.map(e => [e.id, e])), [events]);
  const pulledFrom = useCallback(
    (s: Student, ev: CalendarEvent) => pulledFromEvent(s, ev, overrides, eventsById),
    [overrides, eventsById],
  );

  /** This teacher's own lesson average per student, through the cutoff. It is
   *  LIVE: another graded lesson moves it, nothing is copied into a box. */
  const lessonAverages = useMemo(() => {
    const out: Record<string, number> = {};
    if (!reportSpan) return out;
    const byStudent = new Map<string, Lesson[]>();
    for (const l of lessons) {
      if (me?.email && l.teacherEmail !== me.email) continue;
      if (l.date < reportSpan.from || l.date > reportSpan.through) continue;
      const list = byStudent.get(l.studentId) ?? [];
      list.push(l);
      byStudent.set(l.studentId, list);
    }
    for (const [studentId, list] of byStudent) {
      const s = gradeSummary(list, reportSpan.through);
      if (s) out[studentId] = s.rounded;
    }
    return out;
  }, [lessons, me, reportSpan]);

  /**
   * Every table's arithmetic, built the same way for the table on screen and
   * for each table the email carries. Before this the email was built from
   * whatever had been TYPED, so a number that was only ever a suggestion on
   * screen never reached it.
   */
  const models = useMemo(() => {
    const out: Record<string, TableModel> = {};
    if (!grading || !period || !reportSpan) return out;
    for (const r of grading.reports) {
      const key = groupKeyFor(r);
      out[r.id] = buildGradeTable({
        ensembleId: r.source.kind === 'ensemble' ? r.source.ensembleId : '',
        plan: grading.plans.byGroupKey?.[key] ?? grading.plans.default,
        span: { from: reportSpan.from, through: reportSpan.through },
        period: { start: period.start, end: period.end },
        today,
        roster: rosterFor(r, students, lessons, me?.email, me?.assignedStudentIds ?? [], reportSpan, hsOnly),
        marks: byGroup[key] ?? {},
        events, records, checkins, assignments, results, lessonAverages, pulledFrom,
      });
    }
    return out;
  }, [grading, period, reportSpan, today, students, lessons, me, hsOnly, byGroup, events, records,
    checkins, assignments, results, lessonAverages, pulledFrom]);

  const groupKey = layout ? groupKeyFor(layout) : '';
  const model: TableModel | undefined = layout ? models[layout.id] : undefined;
  const marks = useMemo(() => byGroup[groupKey] ?? {}, [byGroup, groupKey]);
  const plan: GradeCategory[] = useMemo(() => {
    if (!grading) return [];
    return grading.plans.byGroupKey?.[groupKey] ?? grading.plans.default;
  }, [grading, groupKey]);
  const ensembleId = layout?.source.kind === 'ensemble' ? layout.source.ensembleId : '';

  /* ── the rows on screen ─────────────────────────────────────────────── */
  const rows = useMemo(() => (model?.rows ?? []).map(r => {
    const mark = marks[r.student.id];
    const tally = tallyGrade(plan, r.scores);
    const effort = effortValue(mark?.effort);
    const conduct = conductValue(mark?.conduct);
    const codes = mark?.codes ?? [];
    return {
      ...r,
      tally,
      effort,
      conduct,
      codes,
      reasons: commentReasons({ percent: tally.percent, effort, conduct }, grading?.commentRules),
      readiness: rowReadiness({ percent: tally.percent, effort, conduct, codes }, grading?.commentRules),
    };
  }), [model, marks, plan, grading]);

  /* ── the email: every table, not just the one on screen ─────────────── */
  const tables: ReportTable[] = useMemo(() => {
    if (!grading || !reportSpan) return [];
    return grading.reports.map(r => {
      const key = groupKeyFor(r);
      const cats = grading.plans.byGroupKey?.[key] ?? grading.plans.default;
      const groupMarks = byGroup[key] ?? {};
      const reportRows: ReportRow[] = (models[r.id]?.rows ?? []).map(row => {
        const m = groupMarks[row.student.id];
        return {
          studentId: row.student.id,
          name: row.student.name,
          instrument: row.instrument,
          percent: tallyGrade(cats, row.scores).percent,
          effort: effortValue(m?.effort),
          conduct: conductValue(m?.conduct),
          codes: m?.codes ?? [],
        };
      });
      return buildTable(r, reportSpan.prefix, reportRows);
    });
  }, [grading, reportSpan, byGroup, models]);

  if (!grading || !period || !reportSpan || !layout || !model) {
    return (
      <div className="dir-empty">
        <p>No grading periods are set up for this organization yet.</p>
      </div>
    );
  }

  const notReady = rows.filter(r => r.readiness !== 'ok');
  const intro = introLine(reportSpan, grading.email.intro);
  const subject = subjectLine(reportSpan, grading.email.subjectSuffix);
  const quarterEndsSoon = kind === 'interim' && daysBetween(today, period.end) >= 0
    && daysBetween(today, period.end) <= 7;

  const examCat = plan.find(c => c.suggest === 'exams');
  const concertCat = plan.find(c => c.suggest === 'concerts');

  async function copyEmail() {
    const html = tablesToHtml(tables, intro);
    const text = tablesToText(tables, intro);
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        }),
      ]);
    } catch {
      // Any refusal of the rich flavour: plain text still pastes into a
      // spreadsheet, which beats the button appearing to do nothing.
      try { await navigator.clipboard.writeText(text); } catch { /* nothing left to try */ }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  /* ── columns ────────────────────────────────────────────────────────── */

  /** Add columns for everyone on the table. A column exists because some doc
   *  holds its key, so each gets a literal null — never over a number already
   *  there, which is why only keys that are not columns yet are written. */
  async function addColumns(keys: string[]) {
    const fresh = keys.filter(k => !model!.columns.some(c => c.key === k));
    if (fresh.length === 0) return;
    const patch = Object.fromEntries(fresh.map(k => [k, null]));
    await writeCells(groupKey, model!.rows.map(r => ({ studentId: r.student.id, patch })));
  }

  async function removeColumn(col: GradeColumn) {
    if (!window.confirm(`Remove the "${col.label}" column from this table? Any numbers typed into it are deleted.`)) return;
    const ops: { studentId: string; patch: CellPatch }[] = Object.entries(marks)
      .filter(([, m]) => m.scores && col.key in m.scores)
      .map(([studentId]) => ({ studentId, patch: { [col.key]: REMOVE } }));
    await writeCells(groupKey, ops);
  }

  /** Put the Hub's live number back wherever a typed one is covering it. */
  async function followHub(c: GradeCategory) {
    const pins = model!.pinned[c.id];
    const total = pins.students.length + pins.cells.length;
    if (total === 0) return;
    if (!window.confirm(
      `Switch ${total} typed number${total === 1 ? '' : 's'} in "${c.label}" back to `
      + `${c.suggest ? 'the Hub’s live numbers' : 'the average of its columns'}? What you typed there is replaced.`,
    )) return;
    const byStudent = new Map<string, CellPatch>();
    for (const id of pins.students) byStudent.set(id, { ...(byStudent.get(id) ?? {}), [c.id]: REMOVE });
    for (const { studentId, key } of pins.cells) byStudent.set(studentId, { ...(byStudent.get(studentId) ?? {}), [key]: null });
    await writeCells(groupKey, [...byStudent].map(([studentId, patch]) => ({ studentId, patch })));
  }

  /** A judgement category is fillable when nothing in the Hub can speak for it. */
  const fillable = (c: GradeCategory) =>
    !c.suggest && !model.columns.some(col => col.categoryId === c.id && col.kind === 'custom');

  /**
   * Fill every EMPTY box in the fillable categories at full marks (or the
   * category's own starting value), in ONE save. Never overwrites a number
   * already in a box, so pressing it twice is safe and pressing it after you
   * have adjusted somebody does not undo the adjustment.
   */
  async function fill(cats: GradeCategory[]) {
    const ops = rows
      .map(r => {
        const patch: Record<string, number | null> = {};
        for (const c of cats) {
          const v = fillValueFor(c, null);
          if (r.cats[c.id].typed === null && v !== null) patch[c.id] = v;
        }
        return { studentId: r.student.id, patch };
      })
      .filter(op => Object.keys(op.patch).length > 0);
    await writeCells(groupKey, ops);
  }

  /** Save one cell of a column; blank goes back to following the Hub. */
  async function saveCell(studentId: string, key: string, raw: string, current: number | null, input: HTMLInputElement) {
    const text = raw.trim();
    const v = text === '' ? null : gradeValue(text);
    if (text !== '' && v === null) { input.value = current === null ? '' : String(current); return; }
    if (v === current) return;
    await writeCells(groupKey, [{ studentId, patch: { [key]: v } }]);
  }

  /* ── what is counting, in words ─────────────────────────────────────── */
  const examCols = model.columns.filter(c => c.kind === 'exam');
  const concertCols = model.columns.filter(c => c.kind === 'concert');
  const requiredIds = new Set(model.requiredConcerts.map(e => e.id));
  const windowExamIds = new Set(model.windowExams.map(o => o.assignment.id));
  const examsLeftOut = examCols.length > 0
    ? model.examOptions
    : model.examOptions.filter(o => !windowExamIds.has(o.assignment.id));
  const concertsLeftOut = model.concertOptions.filter(o =>
    o.relation !== 'other' && (concertCols.length > 0 || !requiredIds.has(o.event.id)));
  const ownColumns = model.columns.filter(c => c.kind === 'custom' || c.kind === 'tally');
  const catLabel = (id: string) => plan.find(c => c.id === id)?.label ?? id;

  return (
    <div className="dir-gradebook">
      {grading.instructions && (
        <details className="dir-gb-brief" open>
          <summary>{grading.instructions.title}</summary>
          <ol className="dir-gb-brief-list">
            {grading.instructions.items.map(item => <li key={item}>{item}</li>)}
          </ol>
          {grading.instructions.note && (
            <p className="dir-gb-brief-note">{grading.instructions.note}</p>
          )}
          <details className="dir-gb-codes-ref">
            <summary>Comment codes ({Object.keys(grading.commentCodes).length})</summary>
            <ul>
              {Object.entries(grading.commentCodes).map(([code, text]) => (
                <li key={code}><b>{code}</b> {text}</li>
              ))}
            </ul>
          </details>
        </details>
      )}

      <div className="dir-filter-bar dir-gb-controls">
        <select
          className="dir-input"
          value={period.id}
          onChange={e => { setPeriodId(e.target.value); setCutoffEdit(null); }}
        >
          {periods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select
          className="dir-input"
          value={kind}
          onChange={e => { setKind(e.target.value as ReportKind); setCutoffEdit(null); }}
        >
          <option value="interim">Interim</option>
          <option value="quarter">End of quarter</option>
        </select>
        <label className="dir-gb-cutoff">
          As of
          <input
            className="dir-input"
            type="date"
            value={cutoff}
            min={period.start}
            max={period.end}
            onChange={e => setCutoffEdit(e.target.value)}
          />
        </label>
        <label className="dir-gb-hsonly" title={HS_ONLY_HINT}>
          <input type="checkbox" checked={hsOnly} onChange={e => setHsOnly(e.target.checked)} />
          High school only
        </label>
      </div>

      {quarterEndsSoon && (
        <div className="dir-gb-nudge" role="status">
          {period.name} ends {period.end}. For the final grades choose <b>End of quarter</b> above — the
          column heading and the subject line then read “{period.short}” instead of “{period.short}i”.
          Everything you have entered for the interim carries straight over: it is the same grades.
        </div>
      )}

      <div className="dir-gb-note">
        Covering {reportSpan.label}, from <b>{period.start}</b> through <b>{reportSpan.through}</b>.
        {' '}A report covers the whole quarter so far, never only the weeks since the last one.
        {kind === 'interim' && (
          <>
            {' '}The district publishes quarter boundaries and nothing else, so the cutoff is
            yours: set it to whatever you were asked for.
          </>
        )}
        {' '}<i>Slanted grey numbers</i> are the Hub’s own and update by themselves as you grade
        lessons and exams and finish roll. Type over one to replace it; <b>↺</b> brings the Hub’s
        number back. <b>Fill</b> starts a judgement box at full marks and never overwrites one you
        have touched.
      </div>

      <div className="dir-segment dir-gb-tabs">
        {grading.reports.map(r => (
          <button
            key={r.id}
            className={r.id === layout.id ? 'active' : ''}
            onClick={() => setReportId(r.id)}
          >
            {r.title}
          </button>
        ))}
      </div>

      <AddColumnBar
        key={layout.id}
        plan={plan}
        groupTitle={layout.title}
        concertOptions={model.concertOptions}
        examOptions={model.examOptions}
        canLinkExams={!!examCat && !!ensembleId}
        canLinkConcerts={!!concertCat && !!ensembleId}
        existing={model.columns}
        onAdd={addColumns}
      />

      <details className="dir-gb-counting" open>
        <summary>What is counting toward each box</summary>
        <ul>
          {examCat && ensembleId && (
            <li>
              <b>{examCat.label}</b>:{' '}
              {examCols.length > 0
                ? <>the average of the {examCols.length} exam column{examCols.length === 1 ? '' : 's'} below.</>
                : model.windowExams.length === 0
                  ? <>no Playing Exam has come due yet this quarter.</>
                  : <>the average of every graded Playing Exam so far —{' '}
                    {model.windowExams.map((o, n) => (
                      <span key={o.assignment.id}>
                        {n > 0 && '; '}{o.assignment.title} ({o.graded} of {o.of} graded)
                      </span>
                    ))}.</>}
              {model.windowExams.some(o => o.graded < o.of) && examCols.length === 0 && (
                <> Where an exam was not graded in the Hub, add it as a column and type the scores.</>
              )}
              {model.windowExams.filter(o => o.unreadable > 0).map(o => (
                <span key={o.assignment.id} className="dir-gb-warn">
                  {' '}{o.unreadable} score{o.unreadable === 1 ? '' : 's'} on {o.assignment.title} can’t be
                  read — the Hub needs a whole number from 0 to 100.
                </span>
              ))}
              {examsLeftOut.length > 0 && (
                <span className="dir-gb-warn">
                  {' '}Not counting yet: {examsLeftOut.map(o => o.assignment.title).join(', ')}.{' '}
                  <button
                    className="dir-gb-inline"
                    onClick={() => void addColumns(examsLeftOut.map(o => itemKey('exam', o.assignment.id)))}
                  >
                    Add {examsLeftOut.length === 1 ? 'it' : `all ${examsLeftOut.length}`} as a column
                  </button>
                </span>
              )}
            </li>
          )}
          {concertCat && ensembleId && (
            <li>
              <b>{concertCat.label}</b>:{' '}
              {concertCols.length > 0
                ? <>the average of the {concertCols.length} concert column{concertCols.length === 1 ? '' : 's'} below.</>
                : model.requiredConcerts.length === 0
                  ? <>no concert is required of this group yet this quarter.</>
                  : <>the average over the {model.requiredConcerts.length} concert
                    {model.requiredConcerts.length === 1 ? '' : 's'} required of this group —{' '}
                    {model.requiredConcerts.map(concertLabel).join('; ')}. A performer is credited unless
                    roll marks them absent; someone in the audience is credited by the door check-in.</>}
              {concertsLeftOut.length > 0 && (
                <span className="dir-gb-warn">
                  {' '}Not counting yet: {concertsLeftOut.map(o => concertLabel(o.event)).join('; ')}.{' '}
                  <button
                    className="dir-gb-inline"
                    onClick={() => void addColumns(concertsLeftOut.map(o => itemKey('concert', o.event.id)))}
                  >
                    Add {concertsLeftOut.length === 1 ? 'it' : `all ${concertsLeftOut.length}`} as a column
                  </button>
                </span>
              )}
            </li>
          )}
          {!ensembleId && plan.some(c => c.suggest === 'lessons') && (
            <li>
              <b>{plan.find(c => c.suggest === 'lessons')!.label}</b>: the average of every graded
              lesson through {reportSpan.through}. It moves by itself each time you grade another lesson.
            </li>
          )}
          {ownColumns.map(col => (
            <li key={col.key}>
              <b>{col.label}</b>:{' '}
              {col.kind === 'tally'
                ? <>each one takes {col.points} point{col.points === 1 ? '' : 's'} off {catLabel(col.categoryId)}.</>
                : <>a grade of your own, averaged into {catLabel(col.categoryId)}.</>}
            </li>
          ))}
        </ul>
      </details>

      <div className="dir-gb-scroll">
        <table className="dir-gb-table">
          <thead>
            <tr>
              <th className="dir-gb-name">Student</th>
              {plan.flatMap(c => {
                const cols = model.columns.filter(col => col.categoryId === c.id);
                const pins = model.pinned[c.id];
                const pinned = pins.students.length + pins.cells.length;
                const caption = boxCaption(c, cols);
                return [
                  <th key={c.id} className="dir-gb-cat">
                    <div>{c.label}</div>
                    <div className="dir-gb-weight">{c.weight} pts</div>
                    {caption && <div className="dir-gb-avg">= {caption}</div>}
                    {fillable(c) && (
                      <button
                        className="dir-gb-fill"
                        onClick={() => void fill([c])}
                        title={`Start every empty box in this column at ${c.fillWith ?? 100}, then adjust down`}
                      >
                        <Wand2 size={12} /> Fill {c.fillWith ?? 100}
                      </button>
                    )}
                    {pinned > 0 && (
                      <button
                        className="dir-gb-fill"
                        onClick={() => void followHub(c)}
                        title={c.suggest
                          ? 'Replace the numbers you typed in this box with the Hub’s live ones'
                          : 'Replace the numbers you typed in this box with the average of its columns'}
                      >
                        <RotateCcw size={12} /> {c.suggest ? 'Follow the Hub' : 'Use the average'} ({pinned})
                      </button>
                    )}
                  </th>,
                  ...cols.map(col => (
                    <th key={col.key} className="dir-gb-itemcol">
                      <div>{col.label}</div>
                      <div className="dir-gb-weight">
                        {col.kind === 'tally'
                          ? `each one takes ${col.points} off ${c.label}`
                          : `averaged into ${c.label}`}
                      </div>
                      <button
                        className="dir-gb-fill"
                        onClick={() => void removeColumn(col)}
                        title="Remove this column"
                      >
                        <X size={12} /> Remove
                      </button>
                    </th>
                  )),
                ];
              })}
              <th>{reportSpan.prefix} Grade</th>
              <th>Effort</th>
              <th>{layout.conductLabel}</th>
              <th className="dir-gb-codes-col">Comment codes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.student.id} className={r.readiness === 'ok' ? '' : 'dir-gb-todo'}>
                <td className="dir-gb-name">
                  <div className="dir-gb-student">{r.student.name}</div>
                  <div className="dir-gb-evidence">
                    {ensembleId ? (
                      <>
                        <span className={r.att.absent ? 'bad' : ''}>{r.att.absent} unexcused</span>
                        <span>{r.att.excused} excused</span>
                        <span className={r.att.late ? 'bad' : ''}>{r.att.late} late</span>
                        {r.att.lateExcused > 0 && <span>{r.att.lateExcused} late exc</span>}
                        {r.att.lesson > 0 && <span>{r.att.lesson} lesson</span>}
                        <span>{r.att.meetings} meetings</span>
                        {r.exams.of > 0 && (
                          <span>
                            Exams {r.exams.scores.join(', ') || 'none'}
                            {' '}({r.exams.scores.length} of {r.exams.of})
                          </span>
                        )}
                        {model.requiredConcerts.length > 0 && (
                          <span>
                            Concerts {r.concerts.credited} of {r.concerts.held}
                            {r.concerts.excused ? ` · ${r.concerts.excused} excused` : ''}
                          </span>
                        )}
                        {r.concerts.incomplete > 0 && (
                          <span className="bad" title="Checked in but never out, so it earned half credit">
                            {r.concerts.incomplete} no check-out
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        <span>{r.instrument}</span>
                        {lessonAverages[r.student.id] !== undefined
                          ? <span>Lesson average {lessonAverages[r.student.id]}</span>
                          : <span>No graded lessons this quarter yet</span>}
                      </>
                    )}
                  </div>
                </td>

                {plan.flatMap(c => {
                  const res = r.cats[c.id];
                  const cols = model.columns.filter(col => col.categoryId === c.id);
                  return [
                    <td key={c.id} className="dir-gb-cat">
                      <div className="dir-gb-cellwrap">
                        <input
                          className={`dir-gb-score${res.typed === null && res.derived !== null ? ' auto' : ''}`}
                          type="number"
                          min={0}
                          max={100}
                          inputMode="numeric"
                          aria-label={`${r.student.name}, ${c.label}`}
                          key={`${r.student.id}:${c.id}:${res.typed ?? ''}`}
                          defaultValue={res.typed ?? ''}
                          placeholder={res.derived === null ? '' : String(res.derived)}
                          title={res.typed === null && res.derived !== null
                            ? 'The Hub’s own number. Type to replace it.'
                            : undefined}
                          onBlur={e => {
                            const raw = e.target.value.trim();
                            const v = gradeValue(raw);
                            if (raw === '') {
                              if (res.typed !== null) void saveScore(groupKey, r.student.id, c.id, null);
                            } else if (v !== null) {
                              if (v !== res.typed) void saveScore(groupKey, r.student.id, c.id, v);
                            } else {
                              // Not a grade: put the stored value back rather
                              // than saving something unreadable.
                              e.target.value = res.typed === null ? '' : String(res.typed);
                            }
                          }}
                        />
                        {res.typed !== null && res.derived !== null && (
                          <button
                            className="dir-gb-follow"
                            title={`You typed ${res.typed}; ${c.suggest ? 'the Hub says' : 'its columns average'} ${res.derived}. Click to use ${res.derived}.`}
                            aria-label={`Use ${res.derived} for ${r.student.name}, ${c.label}`}
                            onClick={() => void saveScore(groupKey, r.student.id, c.id, null)}
                          >
                            ↺ {res.derived}
                          </button>
                        )}
                        {res.penalty > 0 && res.base !== null && (
                          <div className="dir-gb-penalty" title={`${res.base} less ${res.penalty} points for the incidents logged`}>
                            −{res.penalty} → {res.value}
                          </div>
                        )}
                        {res.penalty > 0 && res.base === null && (
                          <div className="dir-gb-penalty" title="Incidents are logged, but there is no number in this box to take points off">
                            −{res.penalty}, no score yet
                          </div>
                        )}
                      </div>
                    </td>,
                    ...cols.map(col => {
                      if (col.kind === 'tally') {
                        const count = r.counts[col.key] ?? 0;
                        return (
                          <td key={col.key} className="dir-gb-itemcol">
                            <div className="dir-gb-cellwrap">
                              <input
                                className="dir-gb-score"
                                type="number"
                                min={0}
                                max={100}
                                inputMode="numeric"
                                aria-label={`${r.student.name}, ${col.label}`}
                                key={`${r.student.id}:${col.key}:${count}`}
                                defaultValue={count || ''}
                                placeholder="0"
                                onBlur={e => {
                                  const raw = e.target.value.trim();
                                  const v = raw === '' ? 0 : tallyCount(raw);
                                  if (raw !== '' && gradeValue(raw) === null) { e.target.value = count ? String(count) : ''; return; }
                                  if (v === count) return;
                                  void writeCells(groupKey, [{ studentId: r.student.id, patch: { [col.key]: v === 0 ? null : v } }]);
                                }}
                              />
                              <button
                                className="dir-gb-plus"
                                title={`One more: ${col.label}`}
                                aria-label={`Add one ${col.label} for ${r.student.name}`}
                                onClick={() => void writeCells(groupKey, [{
                                  studentId: r.student.id,
                                  patch: { [col.key]: Math.min(100, count + 1) },
                                }])}
                              >
                                +1
                              </button>
                            </div>
                          </td>
                        );
                      }
                      const cell = r.cells[col.key];
                      const linked = col.kind === 'concert' || col.kind === 'exam';
                      return (
                        <td key={col.key} className="dir-gb-itemcol">
                          <div className="dir-gb-cellwrap">
                            <input
                              className={`dir-gb-score${cell.typed === null && cell.live !== null ? ' auto' : ''}`}
                              type="number"
                              min={0}
                              max={100}
                              inputMode="numeric"
                              aria-label={`${r.student.name}, ${col.label}`}
                              key={`${r.student.id}:${col.key}:${cell.typed ?? ''}`}
                              defaultValue={cell.typed ?? ''}
                              placeholder={cell.live !== null ? String(cell.live) : linked ? '—' : ''}
                              title={linked && cell.live === null && cell.typed === null
                                ? 'Nothing counted here: excused, not required of this student, or not graded in the Hub yet. Type a number to give one.'
                                : undefined}
                              onBlur={e => void saveCell(r.student.id, col.key, e.target.value, cell.typed, e.target)}
                            />
                            {cell.typed !== null && cell.live !== null && (
                              <button
                                className="dir-gb-follow"
                                title={`You typed ${cell.typed}; the Hub says ${cell.live}. Click to use the Hub’s number.`}
                                aria-label={`Use the Hub’s ${cell.live} for ${r.student.name}, ${col.label}`}
                                onClick={() => void writeCells(groupKey, [{ studentId: r.student.id, patch: { [col.key]: null } }])}
                              >
                                ↺ {cell.live}
                              </button>
                            )}
                          </div>
                        </td>
                      );
                    }),
                  ];
                })}

                <td className="dir-gb-grade">
                  {r.tally.percent === null ? (
                    <span
                      className="dir-gb-nograde"
                      title={`Only ${r.tally.scoredWeight} of ${r.tally.totalWeight} points are scored.`
                        + ' A grade built on less than half the plan is not a grade.'}
                    >
                      &mdash;
                    </span>
                  ) : r.tally.percent}
                </td>

                <td>
                  <select
                    className="dir-gb-pick"
                    value={r.effort ?? ''}
                    onChange={e => void saveMark(groupKey, r.student.id, { effort: e.target.value })}
                  >
                    <option value="" />
                    {EFFORT_GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </td>

                <td>
                  <select
                    className="dir-gb-pick"
                    value={r.conduct ?? ''}
                    onChange={e => void saveMark(groupKey, r.student.id, { conduct: e.target.value })}
                  >
                    <option value="" />
                    {CONDUCT_GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </td>

                <td className="dir-gb-codes-col">
                  <div className="dir-gb-chips">
                    {r.codes.map(code => (
                      <button
                        key={code}
                        className="dir-gb-chip"
                        title={`${grading.commentCodes[code] ?? code} — tap to remove`}
                        onClick={() => void saveMark(groupKey, r.student.id, {
                          codes: r.codes.filter(c => c !== code),
                        })}
                      >
                        {code} &times;
                      </button>
                    ))}
                  </div>
                  <select
                    className="dir-gb-pick dir-gb-codepick"
                    value=""
                    onChange={e => {
                      const code = e.target.value;
                      if (!code || r.codes.includes(code)) return;
                      void saveMark(groupKey, r.student.id, { codes: [...r.codes, code] });
                    }}
                  >
                    <option value="">Add a code…</option>
                    {Object.entries(grading.commentCodes).map(([code, text]) => (
                      <option key={code} value={code}>{code} — {text}</option>
                    ))}
                  </select>
                  {r.reasons.length > 0 && (
                    <div className={`dir-gb-why${r.codes.length === 0 ? ' bad' : ''}`}>
                      Comment required: {r.reasons.join(', ')}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length === 0 && (
        <div className="dir-empty"><p>Nobody is on this list for {reportSpan.label}.</p></div>
      )}

      <div className="dir-gb-foot">
        <div className="dir-gb-status">
          {notReady.length === 0
            ? <>Every row on this table is ready to submit.</>
            : <><b>{notReady.length}</b> of {rows.length} rows still need something: {summarize(notReady)}.</>}
        </div>
        <div className="dir-gb-actions">
          <button className="dir-tool-btn" onClick={() => void fill(plan.filter(fillable))}>
            <Wand2 size={14} /> Fill every empty judgement box
          </button>
          <button className="dir-tool-btn" onClick={() => setShowEmail(s => !s)}>
            {showEmail ? 'Hide the email' : 'Build the email'}
          </button>
        </div>
      </div>

      {showEmail && (
        <div className="dir-gb-email">
          <div className="dir-gb-subject">
            <span className="dir-gb-label">Subject</span>
            <code>{subject}</code>
          </div>
          <button className="dir-tool-btn dir-gb-copy" onClick={() => void copyEmail()}>
            {copied
              ? <><Check size={14} /> Copied</>
              : <><ClipboardCopy size={14} /> Copy all {tables.length} tables</>}
          </button>
          <p className="dir-gb-hint">
            Paste straight into the email to {grading.email.recipientName}. The tables carry their
            own borders and header colours, so they arrive looking like this. A student with no
            grade comes across as a BLANK cell, never a zero.
          </p>
          <div className="dir-gb-preview">
            <p>{intro}</p>
            {tables.map(t => (
              <div key={t.id}>
                <p><b>{t.title}:</b></p>
                <table className="dir-gb-out">
                  <thead>
                    <tr>
                      {t.headers.map(h => <th key={h} style={{ background: t.headerColor }}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {t.rows.map((row, i) => (
                      <tr key={i}>{row.map((c, j) => <td key={j}>{c}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * One line under a box's heading saying what the box IS — so nobody has to
 * guess that the concert columns beside "Required Performance Attendance" are
 * the pieces it averages, not categories of their own.
 */
function boxCaption(c: GradeCategory, cols: GradeColumn[]): string {
  const graded = cols.filter(col => col.kind !== 'tally').length;
  const parts: string[] = [];
  if (graded > 0) parts.push(`average of the ${graded} column${graded === 1 ? '' : 's'} on its right`);
  else if (c.suggest === 'exams') parts.push('average of every graded exam');
  else if (c.suggest === 'concerts') parts.push('average of every concert required');
  else if (c.suggest === 'lessons') parts.push('average of every graded lesson');
  if (cols.some(col => col.kind === 'tally')) parts.push('minus the points for incidents');
  return parts.join(', ');
}

/** "4 with no grade yet, 2 with a comment code the district requires". */
function summarize(rows: { readiness: string }[]): string {
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.readiness] = (counts[r.readiness] ?? 0) + 1;
  const say: Record<string, string> = {
    'no-grade': 'no grade yet',
    'missing-effort-conduct': 'no effort or conduct grade',
    'needs-code': 'a comment code the district requires',
  };
  return Object.entries(counts).map(([k, n]) => `${n} with ${say[k] ?? k}`).join(', ');
}
