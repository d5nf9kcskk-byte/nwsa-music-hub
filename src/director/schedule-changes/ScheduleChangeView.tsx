import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Search, Plus, UserPlus, UserMinus, Trash2, CalendarClock, GraduationCap } from 'lucide-react';
import { useStudents } from '../hooks/useStudents';
import { useEnsembles } from '../hooks/useEnsembles';
import { useEvents } from '../hooks/useEvents';
import { useRosterOverrides } from '../hooks/useRosterOverrides';
import { resolveRoster } from '../rosterResolver';
import { ensembleColor, parseDate, todayStr, formatTimeRange, addMinutesToTime, EVENT_TYPE_ICON } from '../utils';
import { sortStudents, type StudentSort } from '../scoreOrder';
import { SortToggle } from '../components/SortToggle';
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
export function ScheduleChangeView({ initialEnsembleId = '' }: { initialEnsembleId?: string }) {
  const { students } = useStudents();
  const { ensembles } = useEnsembles();
  const { events } = useEvents();
  const { overrides } = useRosterOverrides();
  const [mode, setMode] = useState<'student' | 'date'>('student');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  const [query, setQuery] = useState('');
  const [ensembleId, setEnsembleId] = useState(initialEnsembleId);
  const [sort, setSort] = useState<StudentSort>('lastName');
  const [dateSel, setDateSel] = useState(todayStr());
  const [dateEventId, setDateEventId] = useState<string | null>(null);

  const eventsById = useMemo(() => Object.fromEntries(events.map(e => [e.id, e])), [events]);
  const ensembleMap = useMemo(() => Object.fromEntries(ensembles.map(e => [e.id, e])), [ensembles]);

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
          <div className="dir-tabs">
            <button className={`dir-tab ${!ensembleId ? 'active' : ''}`} onClick={() => setEnsembleId('')}>All students</button>
            {ensembles.map(e => (
              <button
                key={e.id}
                className={`dir-tab ${ensembleId === e.id ? 'active' : ''}`}
                onClick={() => setEnsembleId(id => id === e.id ? '' : e.id)}
              >
                {e.name}
              </button>
            ))}
          </div>
          <div style={{ padding: '2px 16px 8px' }}>
            <SortToggle value={sort} onChange={setSort} />
          </div>

          <div className="dir-drawer-body">
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
        <div className="dir-drawer-body">
          <div className="dir-field">
            <label className="dir-label">Date</label>
            <input
              className="dir-input"
              type="date"
              value={dateSel}
              onChange={e => { setDateSel(e.target.value); setDateEventId(null); }}
            />
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
                      {ensembleMap[eid]?.name ?? 'Ensemble'} — expected roster ({roster.length})
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
  const [showForm, setShowForm] = useState(!!autoOpenForm);
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

      <div className="dir-drawer-body">
        {error && <div className="dir-sc-error">⚠ {error}</div>}

        <div className="dir-form-section-label">In these ensembles (permanent)</div>
        {memberOf.length === 0 ? (
          <div className="dir-empty-inline">Not a permanent member of any ensemble.</div>
        ) : (
          memberOf.map(e => (
            <div key={e.id} className="dir-ens-row">
              <span className="dir-ens-swatch" style={{ background: ensembleColor(e) }} />
              <div className="dir-ens-info"><div className="dir-ens-name">{e.name}</div></div>
              <button className="dir-btn dir-btn-ghost dir-sc-small" disabled={busy} onClick={() => removePermanent(e.id)}>
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
                    : o.action === 'add' ? <UserPlus size={14} /> : <UserMinus size={14} />}
                  {o.kind === 'lesson'
                    ? `Lesson during ${ensembleMap[o.ensembleId]?.name ?? 'rehearsal'}`
                    : `${o.action === 'add' ? 'Subbed into' : 'Pulled from'} ${ensembleMap[o.ensembleId]?.name ?? 'ensemble'}`}
                </div>
                <div className="dir-sc-ov-meta">
                  {describeWhen(o)}
                  {o.startTime && o.endTime ? ` · out ${formatTimeRange(o.startTime, o.endTime)}` : ''}
                  {o.reason ? ` · ${o.reason}` : ''}
                </div>
              </div>
              <button className="dir-icon-btn" onClick={() => deleteOverride(o.id)} aria-label="Undo change"><Trash2 size={15} /></button>
            </div>
          ))
        )}
      </div>

      <div className="dir-drawer-footer">
        <button className="dir-btn dir-btn-primary" onClick={() => setShowForm(true)}>
          <Plus size={16} style={{ verticalAlign: '-3px' }} /> New schedule change
        </button>
      </div>

      {showForm && (
        <ChangeForm
          student={student}
          ensembles={ensembles}
          prefill={prefill}
          onClose={() => setShowForm(false)}
          onSavePermanent={async ensembleId => {
            await updateStudent(student.id, { ensembleIds: Array.from(new Set([...(student.ensembleIds ?? []), ensembleId])) });
          }}
          onRemovePermanent={async ensembleId => {
            await updateStudent(student.id, { ensembleIds: (student.ensembleIds ?? []).filter(id => id !== ensembleId) });
          }}
          onSaveTemporary={async data => { await addOverride(data); }}
        />
      )}
    </div>
  );
}

type ChangeKind = 'temporary' | 'lesson' | 'permanent';

function ChangeForm({
  student, ensembles, onClose, onSavePermanent, onRemovePermanent, onSaveTemporary, prefill,
}: {
  student: Student;
  ensembles: Ensemble[];
  onClose: () => void;
  onSavePermanent: (ensembleId: string) => Promise<void>;
  onRemovePermanent: (ensembleId: string) => Promise<void>;
  onSaveTemporary: (data: Omit<RosterOverride, 'id'>) => Promise<void>;
  prefill?: Prefill;
}) {
  const memberEnsembles = ensembles.filter(e => student.ensembleIds?.includes(e.id));
  const [kind, setKind] = useState<ChangeKind>('temporary');
  // Coming from a roster (by-date flow), pulling out is the likely intent.
  const [action, setAction] = useState<'add' | 'remove'>(prefill ? 'remove' : 'add');
  const [ensembleId, setEnsembleId] = useState(prefill?.ensembleId ?? ensembles[0]?.id ?? '');
  const [lessonEnsembleId, setLessonEnsembleId] = useState(prefill?.ensembleId ?? memberEnsembles[0]?.id ?? ensembles[0]?.id ?? '');
  const [span, setSpan] = useState<'day' | 'range'>('day');
  const [startDate, setStartDate] = useState(prefill?.date ?? todayStr());
  const [endDate, setEndDate] = useState(prefill?.date ?? todayStr());
  const [lessonStart, setLessonStart] = useState('15:00');
  const [lessonEnd, setLessonEnd] = useState('15:50');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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
        await onSaveTemporary({
          studentId: student.id,
          ensembleId,
          action,
          scope: 'range',
          startDate: start,
          endDate: end < start ? start : end,
          reason: reason.trim() || undefined,
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
      <div className="dir-drawer">
        <div className="dir-drawer-handle" />
        <div className="dir-drawer-header">
          <span className="dir-drawer-title">New schedule change</span>
          <button className="dir-drawer-close" onClick={onClose}>×</button>
        </div>
        <div className="dir-drawer-body">
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
                <label className="dir-label">Applied teacher / note (optional)</label>
                <input className="dir-input" value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Dr. Rivera, trumpet lesson" />
              </div>
            </>
          ) : (
            <>
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

              <div className="dir-field">
                <label className="dir-label">Ensemble</label>
                <select className="dir-input" value={ensembleId} onChange={e => setEnsembleId(e.target.value)}>
                  {ensembles.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>

              {kind === 'temporary' && (
                <>
                  <div className="dir-field">
                    <label className="dir-label">When</label>
                    <div className="dir-segment">
                      <button className={`dir-segment-btn ${span === 'day' ? 'active' : ''}`} onClick={() => setSpan('day')}>Just one day</button>
                      <button className={`dir-segment-btn ${span === 'range' ? 'active' : ''}`} onClick={() => setSpan('range')}>Date range</button>
                    </div>
                  </div>
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
                    <label className="dir-label">Reason (optional — illness, school function, …)</label>
                    <input className="dir-input" value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. field trip, illness" />
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
          <button className="dir-btn dir-btn-primary" onClick={handleSave} disabled={saving || !activeEnsembleId}>
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
function describeWhen(o: RosterOverride) {
  if (o.scope === 'event') return 'for one rehearsal';
  if (o.startDate && o.endDate) {
    return o.startDate === o.endDate ? fmt(o.startDate) : `${fmt(o.startDate)} – ${fmt(o.endDate)}`;
  }
  return 'temporary';
}
