import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Search, Plus, UserPlus, UserMinus, Trash2, CalendarClock, GraduationCap, Clock, FileText, Repeat, CornerUpRight, Pencil } from 'lucide-react';
import { ORG } from '../../org';
import { useStudents } from '../hooks/useStudents';
import { useEnsembles } from '../hooks/useEnsembles';
import { useEvents } from '../hooks/useEvents';
import { useRosterOverrides } from '../hooks/useRosterOverrides';
import { resolveRoster, rotationWrites } from '../rosterResolver';
import { ensembleColor, parseDate, todayStr, toDateStr, formatTimeRange, addMinutesToTime, EVENT_TYPE_ICON, musicEnsembles } from '../utils';
import { EnsembleFilter } from '../components/EnsembleFilter';
import { sortStudents, type StudentSort } from '../scoreOrder';
import { SortToggle } from '../components/SortToggle';
import type { DirNavigate } from '../types-nav';
import { useModalA11y } from '../../shared/useModalA11y';
import type { Student, Ensemble, RosterOverride } from '../types';

/** Prefill carried into the change form when arriving via the by-date flow. */
interface Prefill { ensembleId?: string; date?: string }

/**
 * A dedicated, clear home for changing a student's schedule:
 *   • PERMANENT — join/leave an ensemble (edits student.ensembleIds)
 *   • TEMPORARY — sub-in / pull-out for a day or date range (RosterOverride)
 *   • LESSON    — pulled out for PART of a rehearsal (override with a time window)
 * Everything feeds the existing rosterResolver, so attendance and every
 * schedule view update automatically.
 */
export function ScheduleChangeView({ initialEnsembleId = '', initialStudentId, initialMode, initialDate, initialEventId, onNavigate }: {
  initialEnsembleId?: string;
  /** Lets the ensemble headings here open their own hub. */
  onNavigate?: DirNavigate;
  /** Arrived from a lesson or pull-out shown elsewhere (Today, Who's Out) —
   *  open straight onto that student rather than the picker. */
  initialStudentId?: string;
  /** Embedded by the Schedule Changes screen (#schedule-ux-redesign):
   *  "Move a student" on a block lands directly on that block's roster. */
  initialMode?: 'student' | 'date';
  initialDate?: string;
  initialEventId?: string;
}) {
  const { students } = useStudents();
  const { ensembles } = useEnsembles();
  const { events } = useEvents();
  const { overrides } = useRosterOverrides();
  const [mode, setMode] = useState<'student' | 'date'>(initialMode ?? 'student');
  const [selectedId, setSelectedId] = useState<string | null>(initialStudentId ?? null);
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  const [query, setQuery] = useState('');
  const [ensembleId, setEnsembleId] = useState(initialEnsembleId);
  const [sort, setSort] = useState<StudentSort>('lastName');
  const [dateSel, setDateSel] = useState(initialDate ?? todayStr());
  const [calCursor, setCalCursor] = useState(() => parseDate(initialDate ?? todayStr()));
  const [dateEventId, setDateEventId] = useState<string | null>(initialEventId ?? null);

  const eventsById = useMemo(() => Object.fromEntries(events.map(e => [e.id, e])), [events]);
  const ensembleMap = useMemo(() => Object.fromEntries(ensembles.map(e => [e.id, e])), [ensembles]);
  // Month-picker data — must stay above the early return below (rules of hooks).
  const daysWithEvents = useMemo(() => new Set(events.filter(e => e.ensembleIds.length > 0).map(e => e.date)), [events]);
  const monthCells = useMemo(() => {
    const y = calCursor.getFullYear(), mo = calCursor.getMonth();
    const first = new Date(y, mo, 1).getDay();
    const n = new Date(y, mo + 1, 0).getDate();
    const out: (string | null)[] = [];
    for (let i = 0; i < first; i++) out.push(null);
    for (let d = 1; d <= n; d++) out.push(toDateStr(new Date(y, mo, d)));
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [calCursor]);

  const selected = students.find(s => s.id === selectedId) ?? null;

  if (selected) {
    return (
      <StudentPanel
        student={selected}
        ensembles={ensembles}
        prefill={prefill ?? undefined}
        autoOpenForm={!!prefill}
        onBack={() => { setSelectedId(null); setPrefill(null); }}
      />
    );
  }

  const q = query.trim().toLowerCase();
  const list = sortStudents(
    students
      .filter(s => s.status !== 'Graduated' && s.status !== 'Inactive')
      .filter(s => !ensembleId || s.ensembleIds?.includes(ensembleId))
      .filter(s => !q || s.name.toLowerCase().includes(q) || s.instrument?.toLowerCase().includes(q)),
    sort,
  );

  // By-date flow: that day's rehearsals/concerts → tap one → its expected roster.
  const dayEvents = events
    .filter(e => e.date === dateSel && e.ensembleIds.length > 0)
    .sort((a, b) => (a.startTime ?? '99').localeCompare(b.startTime ?? '99'));
  const dateEvent = dateEventId ? eventsById[dateEventId] : null;

  return (
    <div className="dir-tab-page">
      <div className="dir-sc-intro">
        <CalendarClock size={18} />
        {mode === 'student' ? 'Pick a student to change their schedule.' : 'Pick a day, then a rehearsal, then the student.'}
      </div>

      {/* Direction: start from a student, or start from a date on the schedule */}
      <div className="dir-mode-toggle" style={{ margin: '6px 16px 8px' }}>
        <button className={`dir-segment-btn ${mode === 'student' ? 'active' : ''}`} onClick={() => setMode('student')}>By student</button>
        <button className={`dir-segment-btn ${mode === 'date' ? 'active' : ''}`} onClick={() => setMode('date')}>By date</button>
      </div>

      {mode === 'student' ? (
        <>
          <div className="dir-sc-search">
            <Search size={16} />
            <input
              className="dir-sc-search-input"
              placeholder="Search students…"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>

          {/* Jump straight to one ensemble's assigned roster */}
          <EnsembleFilter ensembles={ensembles} value={ensembleId} onChange={setEnsembleId} allLabel="All students" />
          <div style={{ padding: '2px 16px 8px' }}>
            <SortToggle value={sort} onChange={setSort} />
          </div>

          <div className="dir-page-body">
            {list.length === 0 ? (
              <div className="dir-empty-inline">No students match.</div>
            ) : (
              list.map(s => (
                <button key={s.id} className="dir-ens-row dir-sc-pick" onClick={() => setSelectedId(s.id)}>
                  <span className="dir-ens-swatch" style={{ background: pickColor(s, ensembles) }} />
                  <div className="dir-ens-info">
                    <div className="dir-ens-name">{s.name}</div>
                    <div className="dir-ens-sub">{s.instrument || '—'}</div>
                  </div>
                  <ChevronRight size={18} style={{ opacity: 0.45, flexShrink: 0 }} />
                </button>
              ))
            )}
          </div>
        </>
      ) : (
        <div className="dir-page-body">
          <div className="dir-cal" style={{ marginBottom: 6 }}>
            <div className="dir-cal-nav" style={{ padding: '4px 0' }}>
              <button className="dir-date-nav-btn" onClick={() => setCalCursor(c => new Date(c.getFullYear(), c.getMonth() - 1, 1))} aria-label="Previous month"><ChevronLeft size={16} /></button>
              <span className="dir-cal-month">{calCursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
              <button className="dir-date-nav-btn" onClick={() => setCalCursor(c => new Date(c.getFullYear(), c.getMonth() + 1, 1))} aria-label="Next month"><ChevronRight size={16} /></button>
            </div>
            <div className="dir-cal-weekdays">{['S','M','T','W','T','F','S'].map((d, i) => <div key={i} className="dir-cal-weekday">{d}</div>)}</div>
            <div className="dir-cal-grid">
              {monthCells.map((d, i) => d === null ? <div key={i} className="dir-cal-cell empty" /> : (
                <button key={i} className={`dir-cal-cell ${d === dateSel ? 'selected' : ''} ${d === todayStr() ? 'today' : ''}`} onClick={() => { setDateSel(d); setDateEventId(null); }}>
                  <span className="dir-cal-day">{parseDate(d).getDate()}</span>
                  <span className="dir-cal-dots">{daysWithEvents.has(d) && <span className="dir-cal-dot" style={{ background: 'var(--dir-primary)' }} />}</span>
                </button>
              ))}
            </div>
          </div>

          {!dateEvent ? (
            dayEvents.length === 0 ? (
              <div className="dir-empty-inline">No rehearsals or concerts on this day.</div>
            ) : (
              dayEvents.map(e => (
                <button key={e.id} className="dir-ens-row dir-sc-pick" onClick={() => setDateEventId(e.id)}>
                  <span className="dir-ens-swatch" style={{ background: ensembleColor(ensembleMap[e.ensembleIds[0]]) }} />
                  <div className="dir-ens-info">
                    <div className="dir-ens-name">
                      {EVENT_TYPE_ICON[e.type]} {e.title || e.ensembleIds.map(id => ensembleMap[id]?.name).filter(Boolean).join(', ') || e.type}
                    </div>
                    <div className="dir-ens-sub">
                      {formatTimeRange(e.startTime, e.endTime) || 'No time set'}{e.location ? ` · ${e.location}` : ''}
                    </div>
                  </div>
                  <ChevronRight size={18} style={{ opacity: 0.45, flexShrink: 0 }} />
                </button>
              ))
            )
          ) : (
            <>
              <button className="dir-drawer-back" onClick={() => setDateEventId(null)} style={{ marginBottom: 8 }}>
                <ChevronLeft size={18} /> All of {parseDate(dateSel).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </button>
              {dateEvent.ensembleIds.map(eid => {
                const roster = sortStudents(
                  resolveRoster(students, overrides, { ensembleId: eid, date: dateSel, eventsById }).map(r => r.student),
                  sort,
                );
                return (
                  <div key={eid}>
                    <div className="dir-form-section-label">
                      {onNavigate && ensembleMap[eid] ? (
                        <button
                          type="button"
                          className="dir-inline-link"
                          onClick={() => onNavigate('ensembleHub', { ensembleId: eid })}
                        >
                          {ensembleMap[eid].name}
                        </button>
                      ) : (ensembleMap[eid]?.name ?? 'Ensemble')}
                      {' '}— expected roster ({roster.length})
                    </div>
                    <div style={{ padding: '0 0 8px' }}>
                      <SortToggle value={sort} onChange={setSort} />
                    </div>
                    {roster.map(s => (
                      <button
                        key={s.id}
                        className="dir-ens-row dir-sc-pick"
                        onClick={() => { setPrefill({ ensembleId: eid, date: dateSel }); setSelectedId(s.id); }}
                      >
                        <span className="dir-ens-swatch" style={{ background: ensembleColor(ensembleMap[eid]) }} />
                        <div className="dir-ens-info">
                          <div className="dir-ens-name">{s.name}</div>
                          <div className="dir-ens-sub">{s.instrument || '—'}</div>
                        </div>
                        <ChevronRight size={18} style={{ opacity: 0.45, flexShrink: 0 }} />
                      </button>
                    ))}
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function pickColor(s: Student, ensembles: Ensemble[]): string {
  const first = ensembles.find(e => s.ensembleIds?.includes(e.id));
  return first ? ensembleColor(first) : '#94a3b8';
}

function StudentPanel({ student, ensembles, onBack, prefill, autoOpenForm }: {
  student: Student;
  ensembles: Ensemble[];
  onBack: () => void;
  prefill?: Prefill;
  autoOpenForm?: boolean;
}) {
  const { updateStudent } = useStudents();
  const { overrides, addOverride, deleteOverride } = useRosterOverrides();
  // "New schedule change" opens the verb menu (#schedule-ux-redesign §2.2);
  // each verb pre-answers ChangeForm's category quiz, and "Something else…"
  // keeps the raw form reachable for odd cases.
  const [menuOpen, setMenuOpen] = useState(!!autoOpenForm);
  const [verb, setVerb] = useState<Verb | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const ensembleMap = useMemo(() => Object.fromEntries(ensembles.map(e => [e.id, e])), [ensembles]);
  const memberOf = (student.ensembleIds ?? []).map(id => ensembleMap[id]).filter(Boolean) as Ensemble[];
  const myOverrides = overrides
    .filter(o => o.studentId === student.id)
    .sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? ''));

  async function removePermanent(ensembleId: string) {
    setBusy(true); setError('');
    try {
      await updateStudent(student.id, { ensembleIds: (student.ensembleIds ?? []).filter(id => id !== ensembleId) });
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save — try again.'); }
    finally { setBusy(false); }
  }

  return (
    <div className="dir-tab-page">
      <div className="dir-sc-panel-head">
        <button className="dir-drawer-back" onClick={onBack}><ChevronLeft size={18} /> Back</button>
        <div className="dir-sc-student">
          <div className="dir-sc-student-name">{student.name}</div>
          <div className="dir-ens-sub">{student.instrument || '—'}</div>
        </div>
      </div>

      <div className="dir-page-body">
        {error && <div className="dir-sc-error">⚠ {error}</div>}

        <div className="dir-form-section-label">In these ensembles (permanent)</div>
        {memberOf.length === 0 ? (
          <div className="dir-empty-inline">Not a permanent member of any ensemble.</div>
        ) : (
          memberOf.map(e => (
            <div key={e.id} className="dir-ens-row">
              <span className="dir-ens-swatch" style={{ background: ensembleColor(e) }} />
              <div className="dir-ens-info"><div className="dir-ens-name">{e.name}</div></div>
              <button
                className="dir-btn dir-btn-ghost dir-sc-small"
                disabled={busy}
                onClick={() => {
                  if (window.confirm(`Remove this student from ${e.name} permanently? For one event or a date range, use a temporary change instead.`)) removePermanent(e.id);
                }}
              >
                <UserMinus size={14} /> Remove
              </button>
            </div>
          ))
        )}

        <div className="dir-form-section-label">Temporary changes & lessons</div>
        {myOverrides.length === 0 ? (
          <div className="dir-empty-inline">No temporary subs, pull-outs, or lessons right now.</div>
        ) : (
          myOverrides.map(o => (
            <div key={o.id} className={`dir-sc-ov ${o.kind === 'lesson' ? 'lesson' : o.action}`}>
              <div className="dir-sc-ov-body">
                <div className="dir-sc-ov-title">
                  {o.kind === 'lesson' ? <GraduationCap size={14} />
                    : o.kind === 'rotation' ? <Repeat size={14} />
                    : o.action === 'add' ? <UserPlus size={14} /> : <UserMinus size={14} />}
                  {o.kind === 'lesson'
                    ? `Lesson — out of ${ensembleMap[o.ensembleId]?.name ?? 'rehearsal'}`
                    : o.kind === 'rotation'
                      ? 'Standing weekly rotation'
                    : o.action === 'remove' && o.destEnsembleId
                      ? `Pulled FROM ${ensembleMap[o.ensembleId]?.name ?? 'ensemble'} → ${ensembleMap[o.destEnsembleId]?.name ?? 'another ensemble'}`
                      : `${o.action === 'add' ? 'Subbed INTO' : 'Pulled FROM'} ${ensembleMap[o.ensembleId]?.name ?? 'ensemble'}`}
                </div>
                <div className="dir-sc-ov-lines">
                  {o.kind === 'rotation' && o.destEnsembleId && (
                    <div className="dir-sc-ov-line">
                      <Repeat size={12} /> {rotationSummary(ensembleMap[o.ensembleId], ensembleMap[o.destEnsembleId], o.days)}
                    </div>
                  )}
                  <div className="dir-sc-ov-line"><CalendarClock size={12} /> {describeWhen(o)}</div>
                  {o.kind === 'lesson' && o.startTime && o.endTime && (
                    <div className="dir-sc-ov-line"><Clock size={12} /> Out {formatTimeRange(o.startTime, o.endTime)} (present the rest of rehearsal)</div>
                  )}
                  {o.reason && !(o.destEnsembleId && o.reason.startsWith('Subbing into')) && <div className="dir-sc-ov-line"><FileText size={12} /> {o.reason}</div>}
                </div>
              </div>
              <button className="dir-icon-btn" onClick={() => deleteOverride(o.id)} aria-label="Delete this change"><Trash2 size={15} /></button>
            </div>
          ))
        )}
      </div>

      <div className="dir-drawer-footer">
        <button className="dir-btn dir-btn-primary" onClick={() => setMenuOpen(true)}>
          <Plus size={16} style={{ verticalAlign: '-3px' }} /> New schedule change
        </button>
      </div>

      {menuOpen && (
        <VerbMenu
          student={student}
          ensembles={ensembles}
          prefill={prefill}
          onPick={v => { setMenuOpen(false); setVerb(v); }}
          onClose={() => setMenuOpen(false)}
        />
      )}

      {verb === 'rotation' ? (
        <RotationForm
          student={student}
          ensembles={ensembles}
          prefill={prefill}
          onClose={() => setVerb(null)}
          onSave={async w => {
            // Membership first: if a later write fails, the student is a member
            // of both (harmless) rather than rotated out with no destination.
            if (w.ensembleIds) await updateStudent(student.id, { ensembleIds: w.ensembleIds });
            for (const o of w.overrides) await addOverride(o);
          }}
        />
      ) : verb ? (
        <ChangeForm
          student={student}
          ensembles={ensembles}
          prefill={prefill}
          preset={verb === 'other' ? undefined : VERB_PRESET[verb]}
          title={verb === 'other' ? undefined : VERB_TITLE[verb]}
          onClose={() => setVerb(null)}
          onSavePermanent={async ensembleId => {
            await updateStudent(student.id, { ensembleIds: Array.from(new Set([...(student.ensembleIds ?? []), ensembleId])) });
          }}
          onRemovePermanent={async ensembleId => {
            await updateStudent(student.id, { ensembleIds: (student.ensembleIds ?? []).filter(id => id !== ensembleId) });
          }}
          onSaveTemporary={async data => { await addOverride(data); }}
        />
      ) : null}
    </div>
  );
}

type ChangeKind = 'temporary' | 'lesson' | 'permanent';

/**
 * The director's verbs (#schedule-ux-redesign §2.2). Each pre-answers
 * ChangeForm's category quiz so the segmented controls disappear for these
 * paths; 'rotation' opens its own small face (§2.4) over the same
 * RosterOverride machinery; 'other' is the raw form for odd cases.
 */
type Verb = 'lesson' | 'send' | 'subIn' | 'out' | 'rotation' | 'other';

interface Preset {
  kind: ChangeKind;
  action?: 'add' | 'remove';
  dest?: 'ensemble' | 'lesson' | 'other';
  span?: 'day' | 'range';
}

const VERB_PRESET: Record<Exclude<Verb, 'rotation' | 'other'>, Preset> = {
  lesson: { kind: 'lesson' },
  send:   { kind: 'temporary', action: 'remove', dest: 'ensemble', span: 'day' },
  subIn:  { kind: 'temporary', action: 'add', span: 'day' },
  out:    { kind: 'temporary', action: 'remove', dest: 'other', span: 'day' },
};

const VERB_TITLE: Record<Exclude<Verb, 'rotation' | 'other'>, string> = {
  lesson: 'Lesson pull-out',
  send:   'Send to another ensemble today',
  subIn:  'Sub in',
  out:    'Out today',
};

/** The five verb entries shown after tapping a student (§2.2). */
function VerbMenu({ student, ensembles, prefill, onPick, onClose }: {
  student: Student;
  ensembles: Ensemble[];
  prefill?: Prefill;
  onPick: (v: Verb) => void;
  onClose: () => void;
}) {
  const panelRef = useModalA11y<HTMLDivElement>(onClose, true, { closeOnBack: true });
  const ensName = prefill?.ensembleId ? ensembles.find(e => e.id === prefill.ensembleId)?.name : undefined;
  const items: { verb: Verb; icon: React.ReactNode; title: string; sub: string }[] = [
    { verb: 'lesson', icon: <GraduationCap size={16} />, title: 'Lesson pull-out…', sub: 'Out for part of rehearsal — present (and on roll) the rest' },
    { verb: 'send', icon: <CornerUpRight size={16} />, title: 'Send to another ensemble today…', sub: 'One entry — pulled from here, on the other roll for the day' },
    { verb: 'subIn', icon: <UserPlus size={16} />, title: 'Sub someone in…', sub: `${student.name} joins an ensemble for the day` },
    { verb: 'out', icon: <UserMinus size={16} />, title: 'Out today (trip, excused)…', sub: 'Off the roster for the day, with the reason documented' },
    { verb: 'rotation', icon: <Repeat size={16} />, title: 'Standing weekly rotation…', sub: 'Every week — with another ensemble on set weekdays' },
    { verb: 'other', icon: <Pencil size={16} />, title: 'Something else…', sub: 'The full form — date ranges, permanent membership' },
  ];
  return (
    <div className="dir-drawer-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dir-drawer" role="dialog" aria-modal="true" aria-label="New schedule change" tabIndex={-1} ref={panelRef}>
        <div className="dir-drawer-handle" />
        <div className="dir-drawer-header">
          <span className="dir-drawer-title">{student.name}</span>
          <button className="dir-drawer-close" onClick={onClose}>×</button>
        </div>
        <div className="dir-drawer-body">
          {(ensName || prefill?.date) && (
            <div className="dir-field-hint" style={{ marginBottom: 8 }}>
              {[ensName, prefill?.date ? fmtLong(prefill.date) : undefined].filter(Boolean).join(' · ')}
            </div>
          )}
          {items.map(it => (
            <button key={it.verb} className="dir-ens-row dir-sc-pick" onClick={() => onPick(it.verb)}>
              <div className="dir-ens-info">
                <div className="dir-ens-name">{it.icon} {it.title}</div>
                <div className="dir-ens-sub">{it.sub}</div>
              </div>
              <ChevronRight size={16} style={{ flexShrink: 0, opacity: 0.5 }} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Standing rotation (#schedule-ux-redesign §2.4): a small face over
 * `rotationWrites` (rosterResolver.ts) — scripts/apply-rotations.mjs's
 * member-of-both convention, the one every live rotation uses. The save is
 * membership in BOTH ensembles plus removes carving out rehearsal days, so
 * the concert exemption keeps the student on both concert rosters.
 * Weekdays follow Ensemble.meetingDays: 0=Sun…6=Sat.
 */
function RotationForm({ student, ensembles, prefill, onSave, onClose }: {
  student: Student;
  ensembles: Ensemble[];
  prefill?: Prefill;
  onSave: (writes: ReturnType<typeof rotationWrites>) => Promise<void>;
  onClose: () => void;
}) {
  const memberEnsembles = ensembles.filter(e => student.ensembleIds?.includes(e.id));
  const baseOptions = musicEnsembles(memberEnsembles.length ? memberEnsembles : ensembles);
  const [baseId, setBaseId] = useState(() =>
    baseOptions.some(e => e.id === prefill?.ensembleId) ? prefill!.ensembleId! : baseOptions[0]?.id ?? '');
  const [destId, setDestId] = useState('');
  const [days, setDays] = useState<number[]>([]);
  const [startDate, setStartDate] = useState(prefill?.date ?? todayStr());
  // Default end: the org's end of term, when configured. Otherwise typed.
  const [endDate, setEndDate] = useState(ORG.termEnd ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const panelRef = useModalA11y<HTMLDivElement>(onClose, true, { closeOnBack: true });

  const base = ensembles.find(e => e.id === baseId);
  const dest = ensembles.find(e => e.id === destId);
  const summary = rotationSummary(base, dest, days);
  const ready = !!baseId && !!destId && days.length > 0 && !!startDate && !!endDate && endDate >= startDate;

  async function handleSave() {
    if (!ready) return;
    setSaving(true); setError('');
    try {
      await onSave(rotationWrites(student, baseId, destId, days, startDate, endDate));
      onClose();
    } catch (e) {
      setSaving(false);
      setError(e instanceof Error ? e.message : 'Could not save — try again.');
    }
  }

  return (
    <div className="dir-drawer-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dir-drawer" role="dialog" aria-modal="true" aria-label="Standing weekly rotation" tabIndex={-1} ref={panelRef}>
        <div className="dir-drawer-handle" />
        <div className="dir-drawer-header">
          <span className="dir-drawer-title"><Repeat size={16} style={{ verticalAlign: '-2px' }} /> Standing rotation — {student.name}</span>
          <button className="dir-drawer-close" onClick={onClose}>×</button>
        </div>
        <div className="dir-drawer-body">
          <div className="dir-field">
            <label className="dir-label">Base ensemble</label>
            <select className="dir-input" value={baseId} onChange={e => setBaseId(e.target.value)}>
              {baseOptions.map(e => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>
          <div className="dir-field">
            <label className="dir-label">But on</label>
            <div className="dir-field-row" style={{ gap: 6, flexWrap: 'wrap' }}>
              {WEEKDAY_LABEL.map((label, d) => (
                <button
                  key={d}
                  type="button"
                  className={`dir-tool-btn ${days.includes(d) ? 'active' : ''}`}
                  aria-pressed={days.includes(d)}
                  onClick={() => setDays(cur => cur.includes(d) ? cur.filter(x => x !== d) : [...cur, d])}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="dir-field">
            <label className="dir-label">They're with</label>
            <select className="dir-input" value={destId} onChange={e => setDestId(e.target.value)}>
              <option value="">— pick an ensemble —</option>
              {musicEnsembles(ensembles).filter(e => e.id !== baseId).map(e => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>
          <div className="dir-field-row">
            <div className="dir-field">
              <label className="dir-label">From</label>
              <input className="dir-input" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div className="dir-field">
              <label className="dir-label">To</label>
              <input className="dir-input" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
              {ORG.termEnd && <div className="dir-field-hint">Defaults to the end of term.</div>}
            </div>
          </div>
          <div className="dir-field-hint">
            Rehearsals only — on a concert day they play with whichever ensemble is on stage.
          </div>
          {summary && <div className="dir-sc-summary">{summary}</div>}
          {error && <div className="dir-sc-error">⚠ {error}</div>}
        </div>
        <div className="dir-drawer-footer">
          <button className="dir-btn dir-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="dir-btn dir-btn-primary" disabled={saving || !ready} onClick={handleSave}>
            {saving ? 'Saving…' : 'Save rotation'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ChangeForm({
  student, ensembles, onClose, onSavePermanent, onRemovePermanent, onSaveTemporary, prefill, preset, title,
}: {
  student: Student;
  ensembles: Ensemble[];
  onClose: () => void;
  onSavePermanent: (ensembleId: string) => Promise<void>;
  onRemovePermanent: (ensembleId: string) => Promise<void>;
  onSaveTemporary: (data: Omit<RosterOverride, 'id'>) => Promise<void>;
  prefill?: Prefill;
  /** A verb entry's pre-answers (§2.2) — each answered category's segmented
   *  control is hidden, so the quiz disappears for these paths. */
  preset?: Preset;
  title?: string;
}) {
  const memberEnsembles = ensembles.filter(e => student.ensembleIds?.includes(e.id));
  const [kind, setKind] = useState<ChangeKind>(preset?.kind ?? 'temporary');
  // Coming from a roster (by-date flow), pulling out is the likely intent.
  const [action, setAction] = useState<'add' | 'remove'>(preset?.action ?? (prefill ? 'remove' : 'add'));
  const [ensembleId, setEnsembleId] = useState(prefill?.ensembleId ?? ensembles[0]?.id ?? '');
  const [lessonEnsembleId, setLessonEnsembleId] = useState(prefill?.ensembleId ?? memberEnsembles[0]?.id ?? ensembles[0]?.id ?? '');
  const [span, setSpan] = useState<'day' | 'range'>(preset?.span ?? 'day');
  const [startDate, setStartDate] = useState(prefill?.date ?? todayStr());
  const [endDate, setEndDate] = useState(prefill?.date ?? todayStr());
  const [lessonStart, setLessonStart] = useState('15:00');
  const [lessonEnd, setLessonEnd] = useState('15:50');
  const [reason, setReason] = useState('');
  // Pull-out destination: subbing into another ensemble, a lesson, or other.
  const [dest, setDest] = useState<'ensemble' | 'lesson' | 'other'>(preset?.dest ?? 'other');
  const [destEnsembleId, setDestEnsembleId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const panelRef = useModalA11y<HTMLDivElement>(onClose, true, { closeOnBack: true });

  const activeEnsembleId = kind === 'lesson' ? lessonEnsembleId : ensembleId;
  const ensembleName = ensembles.find(e => e.id === activeEnsembleId)?.name ?? 'ensemble';

  async function handleSave() {
    if (!activeEnsembleId) return;
    setSaving(true); setError('');
    try {
      if (kind === 'permanent') {
        if (action === 'add') await onSavePermanent(ensembleId);
        else await onRemovePermanent(ensembleId);
      } else if (kind === 'lesson') {
        await onSaveTemporary({
          studentId: student.id,
          ensembleId: lessonEnsembleId,
          action: 'remove',
          scope: 'range',
          startDate,
          endDate: startDate,
          startTime: lessonStart,
          // Guard against a zero/negative-length window — nudge to a 30-min minimum.
          endTime: lessonEnd <= lessonStart ? addMinutesToTime(lessonStart, 30) : lessonEnd,
          kind: 'lesson',
          reason: reason.trim() || undefined,
        });
      } else {
        const start = startDate;
        const end = span === 'day' ? startDate : endDate;
        const subbingInto = action === 'remove' && dest === 'ensemble' && destEnsembleId ? destEnsembleId : undefined;
        await onSaveTemporary({
          studentId: student.id,
          ensembleId,
          action,
          scope: 'range',
          startDate: start,
          endDate: end < start ? start : end,
          reason: reason.trim() || (subbingInto ? `Subbing into ${ensembles.find(e => e.id === subbingInto)?.name ?? 'another ensemble'}` : undefined),
          ...(subbingInto ? { destEnsembleId: subbingInto } : {}),
        });
      }
      onClose();
    } catch (e) {
      setSaving(false);
      setError(e instanceof Error ? e.message : 'Could not save — try again.');
    }
  }

  const summary =
    kind === 'permanent' ? `${student.name} will ${action === 'add' ? 'join' : 'leave'} ${ensembleName} permanently.`
    : kind === 'lesson' ? `${student.name} has a lesson ${fmt(startDate)}, ${fmtTime(lessonStart)}–${fmtTime(lessonEnd)} — out of ${ensembleName} for that window only.`
    : `${student.name} ${action === 'add' ? 'subbed into' : 'pulled from'} ${ensembleName} ${span === 'day' ? `on ${fmt(startDate)}` : `${fmt(startDate)} – ${fmt(endDate)}`}.`;

  return (
    <div className="dir-drawer-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dir-drawer" role="dialog" aria-modal="true" aria-label={title ?? 'New schedule change'} tabIndex={-1} ref={panelRef}>
        <div className="dir-drawer-handle" />
        <div className="dir-drawer-header">
          <span className="dir-drawer-title">{title ?? 'New schedule change'}</span>
          <button className="dir-drawer-close" onClick={onClose}>×</button>
        </div>
        <div className="dir-drawer-body">
          {!preset && (
          <div className="dir-field">
            <label className="dir-label">Type</label>
            <div className="dir-segment">
              <button className={`dir-segment-btn ${kind === 'temporary' ? 'active' : ''}`} onClick={() => setKind('temporary')}>Temporary</button>
              <button className={`dir-segment-btn ${kind === 'lesson' ? 'active' : ''}`} onClick={() => setKind('lesson')}>
                <GraduationCap size={15} /> Lesson
              </button>
              <button className={`dir-segment-btn ${kind === 'permanent' ? 'active' : ''}`} onClick={() => setKind('permanent')}>Permanent</button>
            </div>
          </div>
          )}

          {kind === 'lesson' ? (
            <>
              <div className="dir-field">
                <label className="dir-label">Out of which rehearsal</label>
                <select className="dir-input" value={lessonEnsembleId} onChange={e => setLessonEnsembleId(e.target.value)}>
                  {(memberEnsembles.length ? memberEnsembles : ensembles).map(e => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              </div>
              <div className="dir-field">
                <label className="dir-label">Lesson date</label>
                <input className="dir-input" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
              </div>
              <div className="dir-field-row">
                <div className="dir-field">
                  <label className="dir-label">Lesson starts</label>
                  <input className="dir-input" type="time" value={lessonStart} onChange={e => setLessonStart(e.target.value)} />
                </div>
                <div className="dir-field">
                  <label className="dir-label">Lesson ends</label>
                  <input className="dir-input" type="time" value={lessonEnd} onChange={e => setLessonEnd(e.target.value)} />
                </div>
              </div>
              <div className="dir-field">
                <label className="dir-label">Reason *</label>
                <input className="dir-input" value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Trumpet lesson — Dr. Rivera" />
                <div className="dir-field-hint">Every pull-out is documented — this shows on the Roll screen and Who's Out.</div>
              </div>
            </>
          ) : (
            <>
              {!preset?.action && (
              <div className="dir-field">
                <label className="dir-label">Change</label>
                <div className="dir-segment">
                  <button className={`dir-segment-btn ${action === 'add' ? 'active' : ''}`} onClick={() => setAction('add')}>
                    <UserPlus size={15} /> {kind === 'permanent' ? 'Join' : 'Sub in'}
                  </button>
                  <button className={`dir-segment-btn ${action === 'remove' ? 'active' : ''}`} onClick={() => setAction('remove')}>
                    <UserMinus size={15} /> {kind === 'permanent' ? 'Leave' : 'Pull out'}
                  </button>
                </div>
              </div>
              )}

              <div className="dir-field">
                <label className="dir-label">Ensemble</label>
                <select className="dir-input" value={ensembleId} onChange={e => setEnsembleId(e.target.value)}>
                  {musicEnsembles(ensembles).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>

              {kind === 'temporary' && (
                <>
                  {action === 'remove' && (
                    <>
                      {!preset?.dest && (
                      <div className="dir-field">
                        <label className="dir-label">Where are they going?</label>
                        <div className="dir-segment">
                          <button className={`dir-segment-btn ${dest === 'ensemble' ? 'active' : ''}`} onClick={() => setDest('ensemble')}>Another ensemble</button>
                          <button className={`dir-segment-btn ${dest === 'lesson' ? 'active' : ''}`} onClick={() => setDest('lesson')}>Lesson</button>
                          <button className={`dir-segment-btn ${dest === 'other' ? 'active' : ''}`} onClick={() => setDest('other')}>Other</button>
                        </div>
                      </div>
                      )}
                      {dest === 'ensemble' && (
                        <div className="dir-field">
                          <label className="dir-label">Subbing into</label>
                          <select className="dir-input" value={destEnsembleId} onChange={e => setDestEnsembleId(e.target.value)}>
                            <option value="">— pick an ensemble —</option>
                            {musicEnsembles(ensembles).filter(e => e.id !== ensembleId).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                          </select>
                          <div className="dir-field-hint">One entry — they're pulled from {ensembleName} and show on the other ensemble's roll for these dates.</div>
                        </div>
                      )}
                    </>
                  )}
                  {!preset?.span && (
                  <div className="dir-field">
                    <label className="dir-label">When</label>
                    <div className="dir-segment">
                      <button className={`dir-segment-btn ${span === 'day' ? 'active' : ''}`} onClick={() => setSpan('day')}>Just one day</button>
                      <button className={`dir-segment-btn ${span === 'range' ? 'active' : ''}`} onClick={() => setSpan('range')}>Date range</button>
                    </div>
                  </div>
                  )}
                  <div className="dir-field-row">
                    <div className="dir-field">
                      <label className="dir-label">{span === 'day' ? 'Date' : 'From'}</label>
                      <input className="dir-input" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                    </div>
                    {span === 'range' && (
                      <div className="dir-field">
                        <label className="dir-label">To</label>
                        <input className="dir-input" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                      </div>
                    )}
                  </div>
                  <div className="dir-field">
                    <label className="dir-label">Reason {action === 'remove' && dest !== 'ensemble' ? '*' : '(recommended)'}</label>
                    <input
                      className="dir-input"
                      value={reason}
                      onChange={e => setReason(e.target.value)}
                      placeholder={dest === 'lesson' ? 'e.g. Trumpet lesson — Dr. Rivera' : dest === 'ensemble' ? 'optional note' : 'e.g. field trip, released from school'}
                    />
                    {action === 'remove' && dest !== 'ensemble' && (
                      <div className="dir-field-hint">Nobody gets pulled without a reason — this shows on the Roll screen and Who's Out.</div>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          <div className="dir-sc-summary">{summary}</div>
        </div>

        {error && <div className="dir-sc-error" style={{ padding: '4px 16px 0' }}>{error}</div>}
        <div className="dir-drawer-footer">
          <button className="dir-btn dir-btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="dir-btn dir-btn-primary"
            onClick={handleSave}
            disabled={saving || !activeEnsembleId
              || (kind === 'lesson' && !reason.trim())
              || (kind === 'temporary' && action === 'remove' && dest === 'ensemble' && !destEnsembleId)
              || (kind === 'temporary' && action === 'remove' && dest !== 'ensemble' && !reason.trim())}
          >
            {saving ? 'Saving…' : 'Save change'}
          </button>
        </div>
      </div>
    </div>
  );
}

function fmt(d: string) {
  return parseDate(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function fmtTime(t: string) {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(m).padStart(2, '0')} ${ampm}`;
}
const WEEKDAY_LABEL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** "Mon/Wed: Camerata · Fri: Wind Ensemble" — the base ensemble's remaining
 *  meeting days (when it declares any), then the rotation days. */
function rotationSummary(base: Ensemble | undefined, dest: Ensemble | undefined, days: number[] | undefined): string {
  if (!dest || !days?.length) return '';
  const names = (ds: number[]) => [...ds].sort((a, b) => a - b).map(d => WEEKDAY_LABEL[d]).join('/');
  const destPart = `${names(days)}: ${dest.name}`;
  if (!base) return destPart;
  const baseDays = (base.meetingDays ?? []).filter(d => !days.includes(d));
  return `${baseDays.length ? names(baseDays) : 'Other days'}: ${base.name} · ${destPart}`;
}
function describeWhen(o: RosterOverride) {
  if (o.scope === 'event') return 'For one rehearsal';
  if (o.startDate && o.endDate) {
    // A weekday rotation is NOT a continuous pull — saying so made a Tue/Fri
    // rotation read identically to a 325-day removal.
    if (o.days?.length) {
      const on = o.days.map(d => WEEKDAY_LABEL[d]).join(', ');
      return `${on} only · ${fmtLong(o.startDate)} → ${fmtLong(o.endDate)}`;
    }
    if (o.startDate === o.endDate) return fmtLong(o.startDate);
    const days = Math.round((parseDate(o.endDate).getTime() - parseDate(o.startDate).getTime()) / 86400000) + 1;
    return `${fmtLong(o.startDate)} → ${fmtLong(o.endDate)} (${days} days)`;
  }
  return 'Ongoing';
}
function fmtLong(d: string) {
  return parseDate(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
