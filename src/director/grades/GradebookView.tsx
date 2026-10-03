import { useMemo, useState } from 'react';
import { ClipboardCopy, Check, Wand2, X } from 'lucide-react';
import { ORG } from '../../org';
import {
  CONDUCT_GRADES, EFFORT_GRADES, EMPTY_ATTENDANCE, attendanceByStudent, commentReasons,
  concertItemScore, concertRoll, concertSuggestion, conductValue, effortValue, examEvidence, fillValueFor, gradeValue,
  ITEM_KIND_FOR, itemAverage, itemKey, meetingsHeld, parseItemKey, rollEffect, rowReadiness, tallyGrade,
  type AttendanceEvidence, type GradeCategory, type ItemKind,
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
import { useRosterOverrides } from '../hooks/useRosterOverrides';
import { pulledFromEvent } from '../rosterResolver';
import { gradeExcusedFromAudience } from '../../shared/audienceExcusal';
import { useAssignments, useAllAssignmentResults } from '../hooks/useAssignments';
import { useLessons } from '../hooks/useLessons';
import { useGradeMarks, type GradeMarks } from '../hooks/useGradeMarks';
import { useCurrentDirector } from '../currentDirector';
import { gradeSummary } from '../lessonGrades';
import { todayStr } from '../utils';
import type { CalendarEvent, Lesson, Student } from '../types';
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
  const reportSpan: ReportingWindow | null = period ? windowFor(period, kind, cutoff) : null;
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
  const { byGroup, saveMark, saveScore, saveScores } = useGradeMarks(period?.id ?? '');

  const groupKey = layout ? groupKeyFor(layout) : '';
  const marks: Record<string, GradeMarks> = useMemo(() => byGroup[groupKey] ?? {}, [byGroup, groupKey]);
  const ensembleId = layout?.source.kind === 'ensemble' ? layout.source.ensembleId : '';

  const plan: GradeCategory[] = useMemo(() => {
    if (!grading) return [];
    return grading.plans.byGroupKey?.[groupKey] ?? grading.plans.default;
  }, [grading, groupKey]);

  const roster: GroupRoster = useMemo(
    () => (layout && reportSpan
      ? rosterFor(layout, students, lessons, me?.email, me?.assignedStudentIds ?? [], reportSpan, hsOnly)
      : []),
    [layout, reportSpan, students, lessons, me, hsOnly],
  );

  /* ── the evidence, per student ──────────────────────────────────────── */
  // A concert takes roll now (#concert-roll). Its marks are the CONCERTS
  // category's evidence below, so they stay out of the rehearsal tally —
  // otherwise one absence would be counted twice.
  const concertIds = useMemo(
    () => new Set(events.filter(e => e.type === 'Concert').map(e => e.id)),
    [events],
  );
  const attendance = useMemo(
    () => (reportSpan && ensembleId ? attendanceByStudent(records, ensembleId, reportSpan, concertIds) : {}),
    [records, ensembleId, reportSpan, concertIds],
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

  const eventsById = useMemo(() => Object.fromEntries(events.map(e => [e.id, e])), [events]);

  /** Whether this student plays on this event (ensemble or named performer). */
  function performsOn(student: Student, ev: CalendarEvent): boolean {
    return ev.ensembleIds.some(e => student.ensembleIds?.includes(e))
      || (ev.studentIds ?? []).includes(student.id);
  }

  /**
   * Excused, or pulled for a trip (#concert-excusals): that concert leaves
   * THIS student's denominator. The director's call, 2026-09-24 — an excused
   * concert must not read as one they skipped. Seniors excused from an
   * audience requirement (#audience-excusal) are out too, unless they play on
   * it or were named.
   */
  function excusedFrom(student: Student, ev: CalendarEvent): boolean {
    const gradeExcused = !performsOn(student, ev)
      && !(ev.attendanceStudentIds ?? []).includes(student.id)
      && gradeExcusedFromAudience(student.grade, ev);
    return gradeExcused || pulledFromEvent(student, ev, overrides, eventsById);
  }

  /** Required concerts held in the window, and what each student was credited. */
  const concerts = useMemo(() => {
    const empty = {
      held: 0, heldFor: () => 0,
      credited: {} as Record<string, number>, incomplete: {} as Record<string, number>, excused: {} as Record<string, number>,
    };
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
    const scanCreditedKeys = new Set<string>();
    for (const p of pairs.values()) {
      if (scansCredited(p.in, p.out, entryOnly.has(p.eventId))) {
        credited[p.studentId] = (credited[p.studentId] ?? 0) + 1;
        scanCreditedKeys.add(`${p.eventId}__${p.studentId}`);
      } else {
        incomplete[p.studentId] = (incomplete[p.studentId] ?? 0) + 1;
      }
    }
    const excused: Record<string, number> = {};
    for (const id of required) {
      for (const { student } of roster) {
        if (excusedFrom(student, eventsById[id])) excused[student.id] = (excused[student.id] ?? 0) + 1;
      }
    }
    // What the concert's ROLL adds (#concert-roll): a performer who was there
    // is credited, one marked Absent (Excused) leaves their denominator, one
    // marked Absent earns nothing and stays in it. Scans already credited are
    // never counted twice. Roll is per ensemble, so a table with no ensemble
    // (the applied studio) has none to read.
    if (ensembleId) {
      const marks = new Map<string, string>();
      for (const r of records) {
        if (r.ensembleId === ensembleId && r.eventId && required.has(r.eventId)) marks.set(`${r.eventId}__${r.studentId}`, r.status);
      }
      for (const id of required) {
        const ev = eventsById[id];
        const rolled = !!ev.rollTaken?.[ensembleId];
        for (const { student } of roster) {
          if (excusedFrom(student, ev)) continue; // already out of their denominator
          const key = `${id}__${student.id}`;
          const effect = rollEffect({
            scanCredited: scanCreditedKeys.has(key),
            performs: performsOn(student, ev),
            roll: concertRoll(rolled, marks.get(key)),
          });
          if (effect === 'credit') credited[student.id] = (credited[student.id] ?? 0) + 1;
          else if (effect === 'excused') excused[student.id] = (excused[student.id] ?? 0) + 1;
        }
      }
    }
    const heldFor = (studentId: string) => required.size - (excused[studentId] ?? 0);
    return { held: required.size, heldFor, credited, incomplete, excused };
    // excusedFrom and performsOn read only overrides and eventsById, both listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, eventsById, checkins, records, ensembleId, reportSpan, roster, overrides]);

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

  /* ── item columns: one concert or one exam each (#gradebook-columns) ── */

  /** The columns already on this table, per kind, oldest first. */
  const itemColumns = useMemo(() => {
    const keys = new Set<string>();
    for (const m of Object.values(marks)) for (const k of Object.keys(m.scores ?? {})) keys.add(k);
    const out: Record<ItemKind, { key: string; id: string; label: string; date: string }[]> = { concert: [], exam: [] };
    for (const key of keys) {
      const p = parseItemKey(key);
      if (!p) continue;
      if (p.kind === 'concert') {
        const ev = eventsById[p.id];
        out.concert.push({ key, id: p.id, date: ev?.date ?? '', label: ev ? concertLabel(ev) : 'Deleted concert' });
      } else {
        const a = assignments.find(x => x.id === p.id);
        out.exam.push({ key, id: p.id, date: a?.dueDate ?? '', label: a?.title ?? 'Deleted exam' });
      }
    }
    out.concert.sort((a, b) => a.date.localeCompare(b.date));
    out.exam.sort((a, b) => a.date.localeCompare(b.date));
    return out;
  }, [marks, eventsById, assignments]);

  /** What can still be added as a column this quarter. */
  const addable = useMemo(() => {
    if (!period) return { concert: [] as CalendarEvent[], exam: [] as typeof assignments };
    const have = new Set([...itemColumns.concert, ...itemColumns.exam].map(c => c.key));
    const inPeriod = (d: string) => d >= period.start && d <= period.end;
    return {
      concert: events
        .filter(e => e.concertAttendance === 'required' && e.status !== 'Cancelled'
          && inPeriod(e.date) && e.date <= today && !have.has(itemKey('concert', e.id)))
        .sort((a, b) => a.date.localeCompare(b.date)),
      exam: ensembleId
        ? assignments
          .filter(a => a.type === 'Playing Exam' && a.ensembleIds?.includes(ensembleId)
            && inPeriod(a.dueDate) && !have.has(itemKey('exam', a.id)))
          .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
        : [],
    };
  }, [period, itemColumns, events, assignments, ensembleId, today]);

  /** This student's number for one concert, or null when they were excused. */
  function concertScoreFor(student: Student, ev: CalendarEvent): number | null {
    if (excusedFrom(student, ev)) return null;
    let hasIn = false;
    let hasOut = false;
    for (const c of checkins) {
      if (c.eventId !== ev.id || c.studentId !== student.id) continue;
      if (c.kind === 'out') hasOut = true; else hasIn = true;
    }
    const entryOnly = !!ev.checkin?.entryOnly;
    const performs = performsOn(student, ev);
    // The concert's roll (#concert-roll): marked Absent (Excused) is not a zero,
    // and marked Absent costs a performer the syllabus 100 they'd otherwise get.
    const roll = concertRoll(
      !!(ensembleId && ev.rollTaken?.[ensembleId]),
      ensembleId
        ? records.find(r => r.eventId === ev.id && r.studentId === student.id && r.ensembleId === ensembleId)?.status
        : undefined,
    );
    if (rollEffect({ scanCredited: scansCredited(hasIn, hasOut, entryOnly), performs, roll }) === 'excused') return null;
    return concertItemScore({ hasIn, hasOut, entryOnly, performs, roll });
  }

  /** This student's confirmed exam score, or null when nobody graded it. */
  function examScoreFor(studentId: string, assignmentId: string): number | null {
    const r = results.find(x => x.assignmentId === assignmentId && x.studentId === studentId);
    return gradeValue(r?.score);
  }

  /** The category a kind of column rolls up into on this table's plan. */
  function categoryFor(kind: ItemKind): GradeCategory | undefined {
    return plan.find(c => c.suggest && ITEM_KIND_FOR[c.suggest] === kind);
  }

  /**
   * Write one student's column changes AND the category they roll up into,
   * in one save. Once a category has columns, its box IS their average — so a
   * number typed into that box by hand is replaced the next time a column
   * changes. A student left with no column numbers keeps whatever the box had.
   */
  async function saveItems(studentId: string, kind: ItemKind, patch: Record<string, number | null>) {
    const cat = categoryFor(kind);
    const next: Record<string, unknown> = { ...(marks[studentId]?.scores ?? {}) };
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) delete next[k]; else next[k] = v;
    }
    const avg = itemAverage(next, kind);
    const full: Record<string, number | null> = { ...patch };
    if (cat && avg !== null) full[cat.id] = avg;
    await saveScores(groupKey, studentId, full);
  }

  /** The button: add one concert or exam as a column for everyone on this table. */
  async function addColumn(kind: ItemKind, id: string) {
    const key = itemKey(kind, id);
    const ev = kind === 'concert' ? eventsById[id] : undefined;
    for (const { student } of roster) {
      const v = kind === 'concert'
        ? (ev ? concertScoreFor(student, ev) : null)
        : examScoreFor(student.id, id);
      // Excused, or an exam nobody graded: no number at all, never a zero.
      if (v === null) continue;
      await saveItems(student.id, kind, { [key]: v });
    }
  }

  async function removeColumn(kind: ItemKind, key: string, label: string) {
    if (!window.confirm(`Remove the "${label}" column from this table?`)) return;
    for (const [studentId, m] of Object.entries(marks)) {
      if (m.scores && key in m.scores) await saveItems(studentId, kind, { [key]: null });
    }
  }

  /** What a category would suggest for this student, or null for nothing. */
  function suggestion(cat: GradeCategory, studentId: string): number | null {
    const kind = cat.suggest ? ITEM_KIND_FOR[cat.suggest] : undefined;
    if (kind && itemColumns[kind].length > 0) return itemAverage(marks[studentId]?.scores, kind);
    if (cat.suggest === 'exams') {
      return examEvidence(examsByStudent[studentId] ?? [], windowExams.length).suggested;
    }
    if (cat.suggest === 'concerts') {
      return concertSuggestion(concerts.credited[studentId] ?? 0, concerts.heldFor(studentId));
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
      const reportRows: ReportRow[] = rosterFor(
        r, students, lessons, me?.email, me?.assignedStudentIds ?? [], reportSpan, hsOnly,
      )
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

  /**
   * Fill every EMPTY box in one column: the computed suggestion where there is
   * one, full marks on the observed categories. Never overwrites a number
   * already in the box, so pressing it twice is safe and pressing it after you
   * have adjusted somebody does not undo the adjustment.
   */
  async function fillColumn(cat: GradeCategory) {
    for (const r of rows) {
      if (gradeValue(marks[r.student.id]?.scores?.[cat.id]) !== null) continue;
      const value = fillValueFor(cat, suggestion(cat, r.student.id));
      if (value !== null) await saveScore(groupKey, r.student.id, cat.id, value);
    }
  }

  function kindOf(c: GradeCategory): ItemKind | undefined {
    return c.suggest ? ITEM_KIND_FOR[c.suggest] : undefined;
  }

  function columnsUnder(c: GradeCategory) {
    const k = kindOf(c);
    return k ? itemColumns[k] : [];
  }

  /** Fill every empty box on the whole table, one press. */
  async function fillEverything() {
    for (const cat of plan) await fillColumn(cat);
  }

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

      <div className="dir-gb-note">
        Covering {reportSpan.label}, from <b>{period.start}</b> through <b>{reportSpan.through}</b>.
        {' '}An interim covers the whole quarter so far, never only the weeks since the last one.
        {kind === 'interim' && (
          <>
            {' '}The district publishes quarter boundaries and nothing else, so the cutoff is
            yours: set it to whatever you were asked for.
          </>
        )}
        {' '}<b>Fill</b> starts a column at full marks (or at the suggested number where there is
        one) and never overwrites a box you have already touched. Once a column is filled, a
        student you never looked at reads the same as one you considered and left alone.
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
              {plan.flatMap(c => [
                <th key={c.id}>
                  <div>{c.label}</div>
                  <div className="dir-gb-weight">{c.weight} pts</div>
                  <button
                    className="dir-gb-fill"
                    onClick={() => void fillColumn(c)}
                    title={c.suggest
                      ? 'Fill every empty box in this column with the suggested number'
                      : `Start every empty box in this column at ${c.fillWith ?? 100}, then adjust down`}
                  >
                    <Wand2 size={12} /> {c.suggest ? 'Fill' : `Fill ${c.fillWith ?? 100}`}
                  </button>
                  {kindOf(c) && (
                    <select
                      className="dir-gb-pick dir-gb-addcol"
                      value=""
                      aria-label={`Add a ${kindOf(c)} as its own column`}
                      onChange={e => { if (e.target.value) void addColumn(kindOf(c)!, e.target.value); }}
                    >
                      <option value="">+ Add {kindOf(c) === 'concert' ? 'a concert' : 'an exam'}…</option>
                      {kindOf(c) === 'concert'
                        ? addable.concert.map(ev => <option key={ev.id} value={ev.id}>{concertLabel(ev)}</option>)
                        : addable.exam.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
                    </select>
                  )}
                </th>,
                ...columnsUnder(c).map(col => (
                  <th key={col.key} className="dir-gb-itemcol">
                    <div>{col.label}</div>
                    <div className="dir-gb-weight">in {c.label}</div>
                    <button
                      className="dir-gb-fill"
                      onClick={() => void removeColumn(kindOf(c)!, col.key, col.label)}
                      title="Remove this column"
                    >
                      <X size={12} /> Remove
                    </button>
                  </th>
                )),
              ])}
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
                        {concerts.held > 0 && (
                          <span>
                            Concerts {r.creditedConcerts} of {concerts.heldFor(r.student.id)}
                            {concerts.excused[r.student.id] ? ` · ${concerts.excused[r.student.id]} excused` : ''}
                          </span>
                        )}
                        {r.incompleteConcerts > 0 && (
                          <span className="bad" title="Checked in but never out, so it earned no credit">
                            {r.incompleteConcerts} no check-out
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
                  const saved = marks[r.student.id]?.scores?.[c.id];
                  const sug = suggestion(c, r.student.id);
                  return [
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
                    </td>,
                    ...columnsUnder(c).map(col => {
                      const itemSaved = marks[r.student.id]?.scores?.[col.key];
                      return (
                        <td key={col.key} className="dir-gb-itemcol">
                          <input
                            className="dir-gb-score"
                            type="number"
                            min={0}
                            max={100}
                            inputMode="numeric"
                            aria-label={`${r.student.name}, ${col.label}`}
                            key={`${r.student.id}:${col.key}:${itemSaved ?? ''}`}
                            defaultValue={itemSaved ?? ''}
                            onBlur={e => {
                              const raw = e.target.value.trim();
                              const v = raw === '' ? null : gradeValue(raw);
                              if (raw !== '' && v === null) {
                                e.target.value = itemSaved === undefined ? '' : String(itemSaved);
                                return;
                              }
                              if (v === (itemSaved ?? null)) return;
                              void saveItems(r.student.id, kindOf(c)!, { [col.key]: v });
                            }}
                          />
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
          <button className="dir-tool-btn" onClick={() => void fillEverything()}>
            <Wand2 size={14} /> Fill every empty box
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

/** "Winter Concert · 12/10" — a concert column's heading. */
function concertLabel(ev: CalendarEvent): string {
  const [, m, d] = ev.date.split('-');
  return `${ev.title || 'Concert'} · ${Number(m)}/${Number(d)}`;
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
