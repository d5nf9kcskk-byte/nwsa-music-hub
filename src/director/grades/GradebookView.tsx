import { useMemo, useState } from 'react';
import { ClipboardCopy, Check, Wand2 } from 'lucide-react';
import { ORG } from '../../org';
import {
  CONDUCT_GRADES, EFFORT_GRADES, EMPTY_ATTENDANCE, attendanceByStudent, commentReasons,
  concertSuggestion, conductValue, effortValue, examEvidence, gradeValue, meetingsHeld,
  rowReadiness, tallyGrade,
  type AttendanceEvidence, type GradeCategory,
} from '../../shared/ensembleGrades';
import {
  currentGradingPeriod, defaultCutoff, sortPeriods, windowFor,
  type GradingPeriod, type ReportKind, type ReportingWindow,
} from '../../shared/gradingPeriods';
import {
  buildTable, introLine, subjectLine, tablesToHtml, tablesToText,
  type ReportLayout, type ReportRow, type ReportTable,
} from '../../shared/interimReport';
import { scansCredited } from '../../shared/concertCheckin';
import { useStudents } from '../hooks/useStudents';
import { useEvents } from '../hooks/useEvents';
import { useAllAttendance } from '../hooks/useAttendance';
import { useConcertCheckins } from '../hooks/useConcertCheckins';
import { useAssignments, useAllAssignmentResults } from '../hooks/useAssignments';
import { useLessons } from '../hooks/useLessons';
import { useGradeMarks, type GradeMarks } from '../hooks/useGradeMarks';
import { useCurrentDirector } from '../currentDirector';
import { gradeSummary } from '../lessonGrades';
import { todayStr } from '../utils';
import type { Lesson, Student } from '../types';
import './gradebook.css';

/**
 * The Gradebook (#gradebook) — where a quarter grade is decided, and where the
 * report the district collects is built.
 *
 * The shape of this screen follows one decision (the director, 2026-09-14):
 * **the Hub does not grade attendance, the director does.** An excused absence
 * costs nothing and is a record only; an unexcused absence or lateness informs
 * the Preparation mark, and by how much is a judgement. So every category is a
 * box a person fills in, with the Hub's own records printed on the same line:
 * unexcused absences, excused absences, lateness, meetings actually held,
 * playing exam scores, required concerts credited. Two categories arrive with
 * a computed SUGGESTION, shown as a placeholder, because they are countable
 * rather than observed.
 *
 * None of the arithmetic is in this file. It is in
 * `src/shared/ensembleGrades.ts`, and the tables are in
 * `src/shared/interimReport.ts` — both pure, both pinned by a self-check, so
 * what this screen shows and what the email carries cannot drift apart.
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

/**
 * Who belongs on one table.
 *
 * An ensemble table is its roster. The applied table is NOT a roster: it is
 * whoever this teacher actually gave a lesson to inside the window, which is
 * the only list that stays right when a student is picked up or handed on
 * mid-quarter. `lessons` is already scoped to the signed-in teacher by its
 * own query and rules, so this cannot reach another teacher's studio.
 */
function rosterFor(
  layout: ReportLayout,
  students: Student[],
  lessons: Lesson[],
  myEmail: string | undefined,
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
  const byId = new Map<string, string>();
  for (const l of lessons) {
    if (myEmail && l.teacherEmail !== myEmail) continue;
    if (l.date < reportSpan.from || l.date > reportSpan.through) continue;
    if (l.status === 'Cancelled') continue;
    const student = students.find(s => s.id === l.studentId);
    const instrument = (l.instrument || student?.instrument || '').trim();
    if (pattern && !instrument.toLowerCase().includes(pattern)) continue;
    if (!byId.has(l.studentId)) byId.set(l.studentId, instrument);
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
  const reportSpan: ReportingWindow | null = period ? windowFor(period, kind, cutoff) : null;
  const layout: ReportLayout | undefined =
    grading?.reports.find(r => r.id === reportId) ?? grading?.reports[0];

  /* ── everything the evidence is read from ───────────────────────────── */
  const { students } = useStudents();
  const { events } = useEvents();
  const { records } = useAllAttendance();
  const { checkins } = useConcertCheckins();
  const { assignments } = useAssignments();
  const { results } = useAllAssignmentResults();
  const { lessons } = useLessons();
  const { byGroup, saveMark, saveScore } = useGradeMarks(period?.id ?? '');

  const groupKey = layout ? groupKeyFor(layout) : '';
  const marks: Record<string, GradeMarks> = useMemo(() => byGroup[groupKey] ?? {}, [byGroup, groupKey]);
  const ensembleId = layout?.source.kind === 'ensemble' ? layout.source.ensembleId : '';

  const plan: GradeCategory[] = useMemo(() => {
    if (!grading) return [];
    return grading.plans.byGroupKey?.[groupKey] ?? grading.plans.default;
  }, [grading, groupKey]);

  const roster: GroupRoster = useMemo(
    () => (layout && reportSpan ? rosterFor(layout, students, lessons, me?.email, reportSpan, hsOnly) : []),
    [layout, reportSpan, students, lessons, me, hsOnly],
  );

  /* ── the evidence, per student ──────────────────────────────────────── */
  const attendance = useMemo(
    () => (reportSpan && ensembleId ? attendanceByStudent(records, ensembleId, reportSpan) : {}),
    [records, ensembleId, reportSpan],
  );
  const meetings = useMemo(
    () => (reportSpan && ensembleId ? meetingsHeld(events, ensembleId, reportSpan) : 0),
    [events, ensembleId, reportSpan],
  );

  /** Playing exams for this group whose due date falls inside the window. */
  const windowExams = useMemo(() => {
    if (!reportSpan || !ensembleId) return [];
    return assignments.filter(a =>
      a.type === 'Playing Exam'
      && a.ensembleIds?.includes(ensembleId)
      && a.dueDate >= reportSpan.from && a.dueDate <= reportSpan.through);
  }, [assignments, ensembleId, reportSpan]);

  const examsByStudent = useMemo(() => {
    const ids = new Set(windowExams.map(a => a.id));
    const out: Record<string, { score?: unknown }[]> = {};
    for (const r of results) {
      if (!ids.has(r.assignmentId)) continue;
      (out[r.studentId] ??= []).push({ score: r.score });
    }
    return out;
  }, [results, windowExams]);

  /** Required concerts held in the window, and what each student was credited. */
  const concerts = useMemo(() => {
    const empty = { held: 0, credited: {} as Record<string, number>, incomplete: {} as Record<string, number> };
    if (!reportSpan) return empty;
    const entryOnly = new Set(events.filter(e => e.checkin?.entryOnly).map(e => e.id));
    const required = new Set(
      events
        .filter(e => e.concertAttendance === 'required'
          && e.date >= reportSpan.from && e.date <= reportSpan.through
          && e.status !== 'Cancelled')
        .map(e => e.id),
    );
    const pairs = new Map<string, { in: boolean; out: boolean; studentId: string; eventId: string }>();
    for (const c of checkins) {
      if (!required.has(c.eventId)) continue;
      const key = `${c.eventId}__${c.studentId}`;
      const p = pairs.get(key) ?? { in: false, out: false, studentId: c.studentId, eventId: c.eventId };
      if (c.kind === 'out') p.out = true; else p.in = true;
      pairs.set(key, p);
    }
    const credited: Record<string, number> = {};
    const incomplete: Record<string, number> = {};
    for (const p of pairs.values()) {
      if (scansCredited(p.in, p.out, entryOnly.has(p.eventId))) {
        credited[p.studentId] = (credited[p.studentId] ?? 0) + 1;
      } else {
        incomplete[p.studentId] = (incomplete[p.studentId] ?? 0) + 1;
      }
    }
    return { held: required.size, credited, incomplete };
  }, [events, checkins, reportSpan]);

  /** This teacher's own lesson average per student, inside the window. */
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

  /** What a category would suggest for this student, or null for nothing. */
  function suggestion(cat: GradeCategory, studentId: string): number | null {
    if (cat.suggest === 'exams') {
      return examEvidence(examsByStudent[studentId] ?? [], windowExams.length).suggested;
    }
    if (cat.suggest === 'concerts') {
      return concertSuggestion(concerts.credited[studentId] ?? 0, concerts.held);
    }
    if (cat.suggest === 'lessons') return lessonAverages[studentId] ?? null;
    return null;
  }

  /* ── the rows on screen ─────────────────────────────────────────────── */
  const rows = useMemo(() => roster.map(({ student, instrument }) => {
    const mark = marks[student.id];
    const tally = tallyGrade(plan, mark?.scores);
    const effort = effortValue(mark?.effort);
    const conduct = conductValue(mark?.conduct);
    const codes = mark?.codes ?? [];
    const att: AttendanceEvidence = { ...(attendance[student.id] ?? EMPTY_ATTENDANCE), meetings };
    return {
      student,
      instrument,
      att,
      exams: examEvidence(examsByStudent[student.id] ?? [], windowExams.length),
      creditedConcerts: concerts.credited[student.id] ?? 0,
      incompleteConcerts: concerts.incomplete[student.id] ?? 0,
      tally,
      effort,
      conduct,
      codes,
      reasons: commentReasons({ percent: tally.percent, effort, conduct }, grading?.commentRules),
      readiness: rowReadiness({ percent: tally.percent, effort, conduct, codes }, grading?.commentRules),
    };
  }), [roster, marks, plan, attendance, meetings, examsByStudent, windowExams, concerts, grading]);

  /* ── the email: every table, not just the one on screen ─────────────── */
  const tables: ReportTable[] = useMemo(() => {
    if (!grading || !reportSpan) return [];
    return grading.reports.map(r => {
      const key = groupKeyFor(r);
      const cats = grading.plans.byGroupKey?.[key] ?? grading.plans.default;
      const groupMarks = byGroup[key] ?? {};
      const reportRows: ReportRow[] = rosterFor(r, students, lessons, me?.email, reportSpan, hsOnly)
        .map(({ student, instrument }) => {
          const m = groupMarks[student.id];
          const t = tallyGrade(cats, m?.scores);
          return {
            studentId: student.id,
            name: student.name,
            instrument,
            percent: t.percent,
            effort: effortValue(m?.effort),
            conduct: conductValue(m?.conduct),
            codes: m?.codes ?? [],
          };
        });
      return buildTable(r, reportSpan.prefix, reportRows);
    });
  }, [grading, reportSpan, byGroup, students, lessons, me, hsOnly]);

  if (!grading || !period || !reportSpan || !layout) {
    return (
      <div className="dir-empty">
        <p>No grading periods are set up for this organization yet.</p>
      </div>
    );
  }

  const notReady = rows.filter(r => r.readiness !== 'ok');
  const intro = introLine(reportSpan, grading.email.intro);
  const subject = subjectLine(reportSpan, grading.email.subjectSuffix);

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

  /** Fill every EMPTY box in one column with its suggestion. Never overwrites
   *  a number the director already typed. */
  async function fillColumn(cat: GradeCategory) {
    for (const r of rows) {
      if (gradeValue(marks[r.student.id]?.scores?.[cat.id]) !== null) continue;
      const s = suggestion(cat, r.student.id);
      if (s !== null) await saveScore(groupKey, r.student.id, cat.id, s);
    }
  }

  return (
    <div className="dir-gradebook">
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

      <div className="dir-gb-note">
        Covering {reportSpan.label}, from <b>{period.start}</b> through <b>{reportSpan.through}</b>.
        {' '}An interim covers the whole quarter so far, never only the weeks since the last one.
        {kind === 'interim' && (
          <>
            {' '}The district publishes quarter boundaries and nothing else, so the cutoff is
            yours: set it to whatever you were asked for.
          </>
        )}
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

      <div className="dir-gb-scroll">
        <table className="dir-gb-table">
          <thead>
            <tr>
              <th className="dir-gb-name">Student</th>
              {plan.map(c => (
                <th key={c.id}>
                  <div>{c.label}</div>
                  <div className="dir-gb-weight">{c.weight} pts</div>
                  {c.suggest && (
                    <button
                      className="dir-gb-fill"
                      onClick={() => void fillColumn(c)}
                      title="Fill every empty box in this column with the suggested number"
                    >
                      <Wand2 size={12} /> Fill
                    </button>
                  )}
                </th>
              ))}
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
                        {concerts.held > 0 && <span>Concerts {r.creditedConcerts} of {concerts.held}</span>}
                        {r.incompleteConcerts > 0 && (
                          <span className="bad" title="Checked in but never out, so it earned no credit">
                            {r.incompleteConcerts} no check-out
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        <span>{r.instrument}</span>
                        {lessonAverages[r.student.id] !== undefined && (
                          <span>Lesson average {lessonAverages[r.student.id]}</span>
                        )}
                      </>
                    )}
                  </div>
                </td>

                {plan.map(c => {
                  const saved = marks[r.student.id]?.scores?.[c.id];
                  const sug = suggestion(c, r.student.id);
                  return (
                    <td key={c.id}>
                      <input
                        className="dir-gb-score"
                        type="number"
                        min={0}
                        max={100}
                        inputMode="numeric"
                        key={`${r.student.id}:${c.id}:${saved ?? ''}`}
                        defaultValue={saved ?? ''}
                        placeholder={sug === null ? '' : String(sug)}
                        onBlur={e => {
                          const raw = e.target.value.trim();
                          const v = gradeValue(raw);
                          if (raw === '') void saveScore(groupKey, r.student.id, c.id, null);
                          else if (v !== null) void saveScore(groupKey, r.student.id, c.id, v);
                          // Anything else is not a grade: put the stored value
                          // back rather than saving something unreadable.
                          else e.target.value = saved === undefined ? '' : String(saved);
                        }}
                      />
                    </td>
                  );
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
        <button className="dir-tool-btn" onClick={() => setShowEmail(s => !s)}>
          {showEmail ? 'Hide the email' : 'Build the email'}
        </button>
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
