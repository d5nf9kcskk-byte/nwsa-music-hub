import { useCallback, useMemo, useState } from 'react';
import { ORG } from '../../org';
import {
  CONDUCT_GRADES, EFFORT_GRADES, FULL_MARKS, byLastName, commentReasons, conductValue, effortValue,
  fillValueFor, gradeValue, lastFirst, rowReadiness, tallyCount, type GradeCategory,
} from '../../shared/ensembleGrades';
import {
  currentGradingPeriod, defaultCutoff, sortPeriods, windowFor, type GradingPeriod, type ReportKind,
} from '../../shared/gradingPeriods';
import {
  buildTable as buildReportTable, esc, introLine, subjectLine, tablesToHtml, tablesToText,
  type ReportRow, type ReportTable,
} from '../../shared/interimReport';
import { useStudents } from '../hooks/useStudents';
import { useEvents } from '../hooks/useEvents';
import { useEnsembles } from '../hooks/useEnsembles';
import { useAllAttendance } from '../hooks/useAttendance';
import { useConcertCheckins } from '../hooks/useConcertCheckins';
import { useRosterOverrides } from '../hooks/useRosterOverrides';
import { pulledFromEvent } from '../rosterResolver';
import { useAssignments, useAllAssignmentResults } from '../hooks/useAssignments';
import { useLessons } from '../hooks/useLessons';
import { useGradeMarks, REMOVE, type CellPatch, type GradeMarks } from '../hooks/useGradeMarks';
import { useCurrentDirector } from '../currentDirector';
import { gradeSummary } from '../lessonGrades';
import { todayStr } from '../utils';
import type { CalendarEvent, Lesson, Student } from '../types';
import { OwnColumnForm } from './OwnColumnForm';
import {
  TABLE_DOC, buildTable, gridRows, offKey, rosterFor, rowsToTsv, tabLabel, tableSpecs,
  type CellResult, type GradeColumn, type TableModel, type TableSpec,
} from './gradeTable';
import './gradebook.css';

/**
 * The Gradebook (#gradebook) — one spreadsheet per class, read at a glance.
 *
 * Every grade in the Hub is already in it: each graded assignment, required
 * concert and lesson average is its own column, filled in automatically and
 * updated live. A blank is "not graded yet", never a zero. A number typed over
 * the Hub's is bold with a dot, and says what the Hub's number was.
 *
 * None of the arithmetic is here: it is in `./gradeTable.ts` and
 * `src/shared/ensembleGrades.ts`, which the email and the college export read
 * too, so the screen and what is copied cannot disagree.
 */

const TAB_MEMORY = 'gb.lastTab';
const readTab = () => { try { return localStorage.getItem(TAB_MEMORY) ?? ''; } catch { return ''; } };
const rememberTab = (id: string) => { try { localStorage.setItem(TAB_MEMORY, id); } catch { /* private window */ } };

const BLANK_WORDS: Record<string, string> = {
  'not-graded': 'Not graded yet. A blank never counts as a zero.',
  'not-theirs': 'Not assigned to this student.',
  excused: 'Excused, so it does not count.',
};

const shortDate = (iso: string) => {
  if (!iso) return '';
  const [, m, d] = iso.split('-');
  return new Date(2000, Number(m) - 1, Number(d)).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

export function GradebookView() {
  const grading = ORG.grading;
  const me = useCurrentDirector();
  const today = todayStr();

  const periods = useMemo(() => sortPeriods(grading?.periods ?? []), [grading]);
  const [periodId, setPeriodId] = useState(() => currentGradingPeriod(periods, today)?.id ?? '');
  const [kind, setKind] = useState<ReportKind>('interim');
  const [cutoffEdit, setCutoffEdit] = useState<string | null>(null);
  const [tabId, setTabId] = useState(readTab);
  const [adding, setAdding] = useState<'grade' | 'penalty' | null>(null);
  const [copied, setCopied] = useState('');

  const period: GradingPeriod | undefined = periods.find(p => p.id === periodId) ?? periods[0];
  const cutoff = cutoffEdit ?? (period ? defaultCutoff(period, kind, today) : today);
  const span = useMemo(() => (period ? windowFor(period, kind, cutoff) : null), [period, kind, cutoff]);

  const { students, loading: l1 } = useStudents();
  const { events, loading: l2 } = useEvents();
  const { ensembles, loading: l3 } = useEnsembles();
  const { records, loading: l4 } = useAllAttendance();
  const { checkins, loading: l5 } = useConcertCheckins();
  const { overrides, loading: l6 } = useRosterOverrides();
  const { assignments, loading: l7 } = useAssignments();
  const { results, loading: l8 } = useAllAssignmentResults();
  const { lessons, loading: l9 } = useLessons();
  const { byGroup, loading: l10, saveMark, writeCells } = useGradeMarks(period?.id ?? '');
  /** Until every record has arrived a table is incomplete (a missing check-in
   *  reads as a concert not attended), so nothing writes or copies from it. */
  const loading = l1 || l2 || l3 || l4 || l5 || l6 || l7 || l8 || l9 || l10;

  const eventsById = useMemo(() => Object.fromEntries(events.map(e => [e.id, e])), [events]);
  const pulledFrom = useCallback(
    (s: Student, ev: CalendarEvent) => pulledFromEvent(s, ev, overrides, eventsById),
    [overrides, eventsById],
  );

  const specs = useMemo(() => (grading && period ? tableSpecs({
    reports: grading.reports, ensembles, students, assignments, results,
    period: { start: period.start, end: period.end },
    assigned: me?.assignedEnsembleIds?.length ? me.assignedEnsembleIds : null,
  }) : []), [grading, period, ensembles, students, assignments, results, me]);
  const spec: TableSpec | undefined = specs.find(t => t.id === tabId) ?? specs[0];

  const planFor = useCallback((t: TableSpec): GradeCategory[] => {
    if (!grading) return [];
    return grading.plans.byGroupKey?.[t.groupKey]
      ?? (t.world === 'college' ? grading.plans.college ?? grading.plans.default : grading.plans.default);
  }, [grading]);

  /** A table's docs: its own, or (college) the student's old HS doc for the
   *  same group until the first save on this table files one of its own. */
  const marksFor = useCallback((t: TableSpec): Record<string, GradeMarks> => {
    const own = byGroup[t.groupKey] ?? {};
    if (!t.legacyGroupKey) return own;
    return { ...(byGroup[t.legacyGroupKey] ?? {}), ...own, [TABLE_DOC]: own[TABLE_DOC] } as Record<string, GradeMarks>;
  }, [byGroup]);

  const modelFor = useCallback((t: TableSpec): { model: TableModel; plan: GradeCategory[] } | null => {
    if (!period || !span) return null;
    const applied = !t.ensembleId;
    const roster = rosterFor({
      spec: t, students, lessons, myEmail: me?.email, assignedStudentIds: me?.assignedStudentIds ?? [], span,
    });
    // The applied studio is the signed-in teacher's own lessons; a college
    // table carries the student's lesson average from every lesson they had.
    const lessonAverages: Record<string, number> = {};
    const byStudent = new Map<string, Lesson[]>();
    for (const l of lessons) {
      if (applied && me?.email && l.teacherEmail !== me.email) continue;
      if (l.date < span.from || l.date > span.through) continue;
      byStudent.set(l.studentId, [...(byStudent.get(l.studentId) ?? []), l]);
    }
    for (const [id, list] of byStudent) {
      const s = gradeSummary(list, span.through);
      if (s) lessonAverages[id] = s.rounded;
    }
    const plan = planFor(t);
    const model = buildTable({
      ensembleId: t.ensembleId, plan,
      span: { from: span.from, through: span.through },
      period: { start: period.start, end: period.end },
      today, roster, marks: marksFor(t),
      events, records, checkins, assignments, results, lessonAverages, pulledFrom,
    });
    model.rows.sort((a, b) => byLastName(a.student.name, b.student.name));
    return { model, plan };
  }, [period, span, students, lessons, me, planFor, today, marksFor, events, records, checkins,
    assignments, results, pulledFrom]);

  const current = useMemo(() => (spec ? modelFor(spec) : null), [spec, modelFor]);

  /** The district email: every configured report, built from the same math. */
  const emailTables: ReportTable[] = useMemo(() => {
    if (!grading || !span) return [];
    return specs.filter(t => t.layout).map(t => {
      const built = modelFor(t)!;
      const m = marksFor(t);
      const rows: ReportRow[] = built.model.rows.map(r => ({
        studentId: r.student.id, name: r.student.name, instrument: r.instrument, percent: r.final,
        effort: effortValue(m[r.student.id]?.effort), conduct: conductValue(m[r.student.id]?.conduct),
        codes: m[r.student.id]?.codes ?? [],
      }));
      return buildReportTable(t.layout!, span.prefix, rows);
    });
  }, [grading, span, specs, modelFor, marksFor]);

  if (!grading || !period || !span || !spec || !current) {
    return <div className="dir-empty"><p>No grading periods are set up for this organization yet.</p></div>;
  }

  const { model, plan } = current;
  const hs = spec.world === 'hs';
  const marks = marksFor(spec);
  const groupKey = spec.groupKey;

  /* ── writes ─────────────────────────────────────────────────────────── */

  /** A college student's first save on a college table carries their old HS
   *  marks across, so nothing typed before the split is lost. */
  async function seed(studentIds: string[]) {
    if (!spec?.legacyGroupKey) return;
    const own = byGroup[spec.groupKey] ?? {};
    const old = byGroup[spec.legacyGroupKey] ?? {};
    for (const id of studentIds) {
      const o = old[id];
      if (own[id] || !o) continue;
      const carry = Object.fromEntries(Object.entries({
        scores: o.scores, effort: o.effort, conduct: o.conduct, codes: o.codes, note: o.note,
      }).filter(([, v]) => v !== undefined));
      await saveMark(spec.groupKey, id, carry);
    }
  }
  async function cells(ops: { studentId: string; patch: CellPatch }[]) {
    await seed(ops.map(o => o.studentId).filter(id => id !== TABLE_DOC));
    await writeCells(groupKey, ops);
  }
  async function mark(studentId: string, patch: Partial<GradeMarks>) {
    await seed([studentId]);
    await saveMark(groupKey, studentId, patch);
  }

  const fillable = plan.filter(c => model.judgement.has(c.id));
  async function fillEmpty() {
    const ops = model.rows.map(r => {
      const patch: CellPatch = {};
      for (const c of fillable) {
        const v = fillValueFor(c, null);
        if (r.cats[c.id].typed === null && v !== null) patch[c.id] = v;
      }
      return { studentId: r.student.id, patch };
    }).filter(op => Object.keys(op.patch).length > 0);
    await cells(ops);
  }

  async function addOwnColumn(key: string) {
    setAdding(null);
    if (model.columns.some(c => c.key === key)) return;
    await cells([{ studentId: TABLE_DOC, patch: { [key]: null } }]);
  }

  async function removeColumn(col: GradeColumn) {
    if (!window.confirm(`Remove the column "${col.label}"? The numbers typed into it are deleted.`)) return;
    const ops = Object.entries(marks)
      .filter(([, m]) => m?.scores && col.key in m.scores)
      .map(([studentId]) => ({ studentId, patch: { [col.key]: REMOVE } as CellPatch }));
    await cells(ops);
  }

  async function setCounting(col: GradeColumn, counts: boolean) {
    await writeCells(groupKey, [{ studentId: TABLE_DOC, patch: { [offKey(col.key)]: counts ? REMOVE : 1 } }]);
  }

  /* ── the result ─────────────────────────────────────────────────────── */
  const rows = model.rows.map(r => {
    const m = marks[r.student.id];
    const effort = effortValue(m?.effort);
    const conduct = conductValue(m?.conduct);
    const codes = m?.codes ?? [];
    const rules = grading.commentRules;
    return {
      ...r, effort, conduct, codes,
      reasons: hs ? commentReasons({ percent: r.final, effort, conduct }, rules) : [],
      readiness: hs ? rowReadiness({ percent: r.final, effort, conduct, codes }, rules)
        : r.final === null ? 'no-grade' as const : 'ok' as const,
    };
  });
  const notReady = rows.filter(r => r.readiness !== 'ok');
  const emptyJudgement = rows.some(r => fillable.some(c => r.cats[c.id].typed === null));
  const step = emptyJudgement ? 3 : notReady.length ? 4 : 5;

  async function copy(html: string, text: string) {
    try {
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      })]);
    } catch {
      try { await navigator.clipboard.writeText(text); } catch { /* nothing left to try */ }
    }
    setCopied(spec!.id);
    setTimeout(() => setCopied(''), 3000);
  }
  const intro = introLine(span, grading.email.intro);
  const copyEmail = () => copy(tablesToHtml(emailTables, intro), tablesToText(emailTables, intro));
  const copyTable = () => {
    const grid = gridRows(model, plan, s => lastFirst(s.name));
    const html = `<table style="border-collapse:collapse;font-family:Calibri,Arial,sans-serif;font-size:11pt;">${
      grid.map((r, n) => `<tr>${r.map(c => (n === 0
        ? `<th style="border:1px solid #808080;padding:4px 8px;text-align:left;">${esc(c)}</th>`
        : `<td style="border:1px solid #808080;padding:4px 8px;">${esc(c)}</td>`)).join('')}</tr>`).join('')
    }</table>`;
    return copy(html, rowsToTsv(grid));
  };

  /* ── layout of the grid ─────────────────────────────────────────────── */
  const rollCat = spec.ensembleId ? plan.find(c => c.showsRoll) : undefined;
  const groups = plan
    .map(c => ({ c, cols: model.columns.filter(col => col.categoryId === c.id), roll: rollCat?.id === c.id }))
    .filter(g => g.cols.length > 0 || g.roll);
  const hubKinds = new Set(['exam', 'concert', 'lessons']);
  const hsTabs = specs.filter(t => t.world === 'hs');
  const collegeTabs = specs.filter(t => t.world === 'college');

  const pickTab = (id: string) => { setTabId(id); rememberTab(id); setAdding(null); };

  return (
    <div className="dir-gradebook">
      <div className="gb-top">
        <label className="gb-field">
          <span>Quarter</span>
          <select className="dir-input" value={period.id} onChange={e => { setPeriodId(e.target.value); setCutoffEdit(null); }}>
            {periods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="gb-field">
          <span>Report</span>
          <select className="dir-input" value={kind} onChange={e => { setKind(e.target.value as ReportKind); setCutoffEdit(null); }}>
            <option value="interim">Interim grades</option>
            <option value="quarter">End-of-quarter grades</option>
          </select>
        </label>
        <label className="gb-field">
          <span>Grades as of this date</span>
          <input className="dir-input" type="date" value={cutoff} min={period.start} max={period.end}
            onChange={e => setCutoffEdit(e.target.value)} />
        </label>
      </div>

      <ol className="gb-steps" aria-label="Where you are">
        {['Pick the class', 'Hub grades are already in', 'Fill the judgement boxes', 'Fix the flagged rows', 'Copy the result']
          .map((label, n) => (
            <li key={label} className={n + 1 === step ? 'now' : n + 1 < step ? 'done' : ''} aria-current={n + 1 === step ? 'step' : undefined}>
              <b>{n + 1}</b> {label}
            </li>
          ))}
      </ol>

      <div className="gb-tabs">
        {[['High school', hsTabs], ['College', collegeTabs]].map(([title, list]) => (list as TableSpec[]).length > 0 && (
          <div key={title as string} className="gb-tabrow" role="tablist" aria-label={title as string}>
            <span className="gb-tabrow-label">{title as string}</span>
            {(list as TableSpec[]).map(t => (
              <button key={t.id} role="tab" aria-selected={t.id === spec.id}
                className={`gb-tab${t.id === spec.id ? ' active' : ''}`} onClick={() => pickTab(t.id)}>
                {tabLabel(t)}
              </button>
            ))}
          </div>
        ))}
      </div>

      <p className="gb-explain">
        Grades from the Hub fill in by themselves and change when you regrade. A blank box is not graded yet and
        never counts as a zero. A number you typed over the Hub&rsquo;s is <b className="gb-typed-sample">bold with
        a dot</b>; click it to see the Hub&rsquo;s number and to undo.
        {' '}Concerts, lessons and roll count through {shortDate(span.through)}; assignment grades count whenever you enter them.
      </p>

      {loading && <p className="gb-loading" role="status">Loading the Hub&rsquo;s grades. The buttons wait until everything has arrived.</p>}

      <div className="gb-actions">
        {fillable.length > 0 && (
          <button className="dir-tool-btn" disabled={loading} onClick={() => void fillEmpty()}
            title={`Puts ${FULL_MARKS} in every empty box under ${fillable.map(c => c.label).join(', ')}. Never changes a box that already has a number.`}>
            Fill empty boxes with 100
          </button>
        )}
        <button className="dir-tool-btn" disabled={loading} onClick={() => setAdding(adding === 'grade' ? null : 'grade')}>
          Add my own column
        </button>
        <button className="dir-tool-btn" disabled={loading} onClick={() => setAdding(adding === 'penalty' ? null : 'penalty')}>
          Add a penalty
        </button>
        {spec.layout ? (
          <button className="dir-tool-btn primary" disabled={loading} onClick={() => void copyEmail()}>Copy the email</button>
        ) : (
          <button className="dir-tool-btn primary" disabled={loading} onClick={() => void copyTable()}>Copy the table</button>
        )}
        {copied === spec.id && <span className="gb-copied" role="status">Copied. Paste it {spec.layout ? `into the email to ${grading.email.recipientName}` : 'into your spreadsheet'}.</span>}
      </div>
      {fillable.length > 0 && (
        <p className="gb-hint">
          &ldquo;Fill empty boxes with 100&rdquo; fills only {fillable.map(c => c.label).join(', ')}, and never overwrites a box that already has a number.
        </p>
      )}

      {adding && (
        <OwnColumnForm mode={adding} plan={plan} onAdd={k => void addOwnColumn(k)} onCancel={() => setAdding(null)} />
      )}

      <div className="gb-scroll">
        <table className="gb-grid">
          <thead>
            <tr>
              <th rowSpan={2} className="gb-name">Student</th>
              {groups.map(g => (
                <th key={g.c.id} colSpan={g.cols.length + (g.roll ? 1 : 0)} className="gb-group">{g.c.label}</th>
              ))}
              <th colSpan={plan.length} className="gb-group gb-avg-group">Category averages</th>
              <th rowSpan={2} className="gb-final">{span.prefix} Final grade</th>
              {hs && <th rowSpan={2}>Effort</th>}
              {hs && <th rowSpan={2}>{spec.layout?.conductLabel ?? 'Conduct'}</th>}
              {hs && <th rowSpan={2}>Comment codes</th>}
            </tr>
            <tr>
              {groups.flatMap(g => [
                ...(g.roll ? [
                  <th key={`${g.c.id}-roll`} className="gb-col">
                    <div className="gb-colname">Roll this quarter</div>
                    <div className="gb-colmeta">Not a grade. {model.meetings} rehearsals with roll taken.</div>
                  </th>,
                ] : []),
                ...g.cols.map(col => (
                  <th key={col.key} className={`gb-col${col.counting ? '' : ' off'}`}>
                    <div className="gb-colname">{col.label}</div>
                    <div className="gb-colmeta">
                      {col.kind === 'tally'
                        ? `Each one takes ${col.points} point${col.points === 1 ? '' : 's'} off ${g.c.label}`
                        : col.kind === 'custom'
                          ? `Your own column · graded ${col.graded} of ${col.of}`
                          : `${col.date ? `${shortDate(col.date)} · ` : ''}Graded ${col.graded} of ${col.of}`}
                    </div>
                    {hubKinds.has(col.kind) ? (
                      <label className="gb-switch">
                        <input type="checkbox" checked={col.counting} disabled={loading}
                          onChange={e => void setCounting(col, e.target.checked)} />
                        {col.counting ? `Counts toward ${g.c.label}` : 'Not counting'}
                      </label>
                    ) : (
                      <button className="gb-link" disabled={loading} onClick={() => void removeColumn(col)}>Remove this column</button>
                    )}
                  </th>
                )),
              ])}
              {plan.map(c => (
                <th key={c.id} className="gb-col gb-avg">
                  <div className="gb-colname">{c.label}</div>
                  <div className="gb-colmeta">
                    {c.weight} of {plan.reduce((s, x) => s + x.weight, 0)} points
                    {model.judgement.has(c.id) ? ' · you fill this in' : ' · average of its columns'}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const name = lastFirst(r.student.name);
              return (
                <tr key={r.student.id} className={r.readiness === 'ok' ? '' : 'flag'}>
                  <th scope="row" className="gb-name">
                    {name}
                    {r.readiness !== 'ok' && <span className="gb-flag"> Needs attention</span>}
                  </th>
                  {groups.flatMap(g => [
                    ...(g.roll ? [
                      <td key={`${g.c.id}-roll`} className="gb-roll">
                        {r.att.absent} absent · {r.att.late} late{r.att.excused ? ` · ${r.att.excused} excused` : ''}
                      </td>,
                    ] : []),
                    ...g.cols.map(col => (col.kind === 'tally' ? (
                      <td key={col.key} className="gb-cell">
                        <input className="gb-input" inputMode="numeric" aria-label={`${name}, ${col.label}, how many`}
                          key={`${r.student.id}:${col.key}:${r.counts[col.key]}`} defaultValue={r.counts[col.key] || ''}
                          disabled={loading}
                          onBlur={e => {
                            const raw = e.target.value.trim();
                            if (raw !== '' && gradeValue(raw) === null) { e.target.value = r.counts[col.key] ? String(r.counts[col.key]) : ''; return; }
                            const v = raw === '' ? 0 : tallyCount(raw);
                            if (v !== r.counts[col.key]) void cells([{ studentId: r.student.id, patch: { [col.key]: v || null } }]);
                          }} />
                      </td>
                    ) : (
                      <ScoreCell key={col.key} name={name} label={col.label} cell={r.cells[col.key]}
                        hub={hubKinds.has(col.kind)} off={!col.counting} disabled={loading}
                        onSave={v => cells([{ studentId: r.student.id, patch: { [col.key]: v } }])} />
                    ))),
                  ])}
                  {plan.map(c => {
                    const res = r.cats[c.id];
                    const judged = model.judgement.has(c.id);
                    return (
                      <ScoreCell key={c.id} name={name} label={c.label} avg
                        cell={{ typed: res.typed, live: judged ? null : res.derived, value: res.base }}
                        hub={!judged} disabled={loading} penalty={res.penalty} after={res.value}
                        onSave={v => cells([{ studentId: r.student.id, patch: { [c.id]: v === null ? REMOVE : v } }])} />
                    );
                  })}
                  <td className="gb-final">
                    {r.final === null
                      ? <span title="Less than half of the grade's points have a number yet, so there is no grade.">No grade yet</span>
                      : <b>{r.final}</b>}
                  </td>
                  {hs && (
                    <td>
                      <select className="gb-pick" aria-label={`${name}, effort`} value={r.effort ?? ''} disabled={loading}
                        onChange={e => void mark(r.student.id, { effort: e.target.value })}>
                        <option value="" />
                        {EFFORT_GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </td>
                  )}
                  {hs && (
                    <td>
                      <select className="gb-pick" aria-label={`${name}, conduct`} value={r.conduct ?? ''} disabled={loading}
                        onChange={e => void mark(r.student.id, { conduct: e.target.value })}>
                        <option value="" />
                        {CONDUCT_GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </td>
                  )}
                  {hs && (
                    <td className="gb-codes">
                      {r.codes.map(code => (
                        <button key={code} className="gb-chip" disabled={loading}
                          aria-label={`Remove code ${code} from ${name}`} title={grading.commentCodes[code] ?? code}
                          onClick={() => void mark(r.student.id, { codes: r.codes.filter(x => x !== code) })}>
                          {code} &times;
                        </button>
                      ))}
                      <select className="gb-pick" aria-label={`${name}, add a comment code`} value="" disabled={loading}
                        onChange={e => {
                          const code = e.target.value;
                          if (code && !r.codes.includes(code)) void mark(r.student.id, { codes: [...r.codes, code] });
                        }}>
                        <option value="">Add a code</option>
                        {Object.entries(grading.commentCodes).map(([code, text]) => (
                          <option key={code} value={code}>{code} {text}</option>
                        ))}
                      </select>
                      {r.reasons.length > 0 && (
                        <div className={`gb-why${r.codes.length ? '' : ' bad'}`}>Comment required: {r.reasons.join(', ')}</div>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {rows.length === 0 && <div className="dir-empty"><p>Nobody is on {tabLabel(spec)} for {span.label}.</p></div>}

      <section className="gb-ready" aria-label="Ready check">
        {notReady.length === 0
          ? <p><b>Ready.</b> Every row on {tabLabel(spec)} has what it needs.</p>
          : (
            <>
              <p><b>{notReady.length} of {rows.length} rows need something</b> before you copy:</p>
              <ul>
                {(['no-grade', 'missing-effort-conduct', 'needs-code'] as const).map(k => {
                  const who = notReady.filter(r => r.readiness === k);
                  if (!who.length) return null;
                  const what = { 'no-grade': 'No grade yet', 'missing-effort-conduct': 'Needs an effort and a conduct grade', 'needs-code': 'Needs a comment code' }[k];
                  return <li key={k}><b>{what}:</b> {who.map(r => lastFirst(r.student.name)).join('; ')}</li>;
                })}
              </ul>
            </>
          )}
      </section>

      {hs && grading.instructions && (
        <details className="gb-district">
          <summary>District requirements</summary>
          <p>{grading.instructions.title}</p>
          <ol>{grading.instructions.items.map(item => <li key={item}>{item}</li>)}</ol>
          {grading.instructions.note && <p>{grading.instructions.note}</p>}
          <p><b>Comment codes</b></p>
          <ul className="gb-codelist">
            {Object.entries(grading.commentCodes).map(([code, text]) => <li key={code}><b>{code}</b> {text}</li>)}
          </ul>
          <p><b>The email</b> goes to {grading.email.recipientName} with the subject
            {' '}<code>{subjectLine(span, grading.email.subjectSuffix)}</code> and carries {emailTables.map(t => t.title).join(', ')}.
            College students are never in it.</p>
        </details>
      )}
    </div>
  );
}

/**
 * One grade cell. Shows the number in use; a number typed over the Hub's is
 * bold with a dot and explains itself. Clearing the box, or typing the Hub's
 * own number, goes back to following the Hub.
 */
function ScoreCell({ name, label, cell, hub, off, avg, disabled, penalty = 0, after, onSave }: {
  name: string; label: string; cell: CellResult; hub: boolean; off?: boolean; avg?: boolean;
  disabled?: boolean; penalty?: number; after?: number | null;
  onSave: (v: number | null) => Promise<void>;
}) {
  const overridden = hub && cell.typed !== null;
  const shown = cell.typed ?? cell.live;
  const explain = overridden
    ? `You typed ${cell.typed}. ${cell.live === null ? 'The Hub has no grade here.' : `The Hub says ${cell.live}.`}`
    : cell.value === null
      ? cell.raw ? `The Hub holds "${cell.raw}", which is not a number from 0 to 100, so it does not count.`
        : BLANK_WORDS[cell.blank ?? 'not-graded'] ?? ''
      : hub ? 'From the Hub. Type a number to replace it.' : '';
  return (
    <td className={`gb-cell${avg ? ' gb-avgcell' : ''}${off ? ' off' : ''}${overridden ? ' typed' : ''}`} title={explain}>
      <input
        className="gb-input"
        inputMode="numeric"
        aria-label={`${name}, ${label}`}
        aria-description={explain || undefined}
        key={`${cell.typed ?? ''}|${cell.live ?? ''}`}
        defaultValue={shown ?? ''}
        placeholder={cell.raw ?? ''}
        disabled={disabled}
        onBlur={e => {
          const raw = e.target.value.trim();
          const v = raw === '' ? null : gradeValue(raw);
          const reset = () => { e.target.value = shown === null ? '' : String(shown); };
          if (raw !== '' && v === null) return reset();          // not a grade: put it back
          if (v === null || (hub && v === cell.live)) {           // cleared, or the Hub's own number
            if (cell.typed !== null) void onSave(null); else reset();
            return;
          }
          if (v !== cell.typed) void onSave(v);
        }}
      />
      {overridden && <span className="gb-dot" aria-hidden="true">&bull;</span>}
      {overridden && (
        <button className="gb-undo" disabled={disabled} title={cell.live === null ? 'Clears your number' : `Goes back to ${cell.live}`}
          onMouseDown={e => e.preventDefault()} onClick={() => void onSave(null)}>
          Undo: use the Hub number
        </button>
      )}
      {off && <div className="gb-offnote">Not counting</div>}
      {penalty > 0 && (
        <div className="gb-penalty">
          {after === null || after === undefined ? `−${penalty} for penalties, no grade yet` : `−${penalty} for penalties = ${after}`}
        </div>
      )}
    </td>
  );
}
