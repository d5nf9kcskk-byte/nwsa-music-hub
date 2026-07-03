import { useState, useMemo } from 'react';
import { ChevronLeft, Search, Plus, UserPlus, UserMinus, Trash2, CalendarClock } from 'lucide-react';
import { useStudents } from '../hooks/useStudents';
import { useEnsembles } from '../hooks/useEnsembles';
import { useRosterOverrides } from '../hooks/useRosterOverrides';
import { ensembleColor, parseDate, todayStr } from '../utils';
import type { Student, Ensemble, RosterOverride } from '../types';

/**
 * A dedicated, clear home for changing a student's schedule — either
 * PERMANENTLY (join/leave an ensemble → edits the student's ensembleIds) or
 * TEMPORARILY (sub-in / pull-out for a day or a date range → a RosterOverride).
 * Both feed the existing rosterResolver, so attendance and every schedule
 * view update automatically.
 */
export function ScheduleChangeView() {
  const { students } = useStudents();
  const { ensembles } = useEnsembles();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const selected = students.find(s => s.id === selectedId) ?? null;

  if (selected) {
    return <StudentPanel student={selected} ensembles={ensembles} onBack={() => setSelectedId(null)} />;
  }

  const list = students
    .filter(s => s.status !== 'Graduated')
    .filter(s => s.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="dir-tab-page">
      <div className="dir-sc-intro">
        <CalendarClock size={18} /> Pick a student to change their schedule.
      </div>
      <div className="dir-sc-search">
        <Search size={16} />
        <input
          className="dir-sc-search-input"
          placeholder="Search students…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>
      <div className="dir-drawer-body">
        {list.length === 0 ? (
          <div className="dir-empty-inline">No students found.</div>
        ) : (
          list.map(s => (
            <button key={s.id} className="dir-ens-row dir-sc-pick" onClick={() => setSelectedId(s.id)}>
              <span className="dir-ens-swatch" style={{ background: '#64748b' }} />
              <div className="dir-ens-info">
                <div className="dir-ens-name">{s.name}</div>
                <div className="dir-ens-sub">{[s.instrument, s.status !== 'Active' ? s.status : null].filter(Boolean).join(' · ') || '—'}</div>
              </div>
              <ChevronLeft size={18} style={{ transform: 'rotate(180deg)', opacity: 0.4 }} />
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function StudentPanel({ student, ensembles, onBack }: { student: Student; ensembles: Ensemble[]; onBack: () => void }) {
  const { updateStudent } = useStudents();
  const { overrides, addOverride, deleteOverride } = useRosterOverrides();
  const [showForm, setShowForm] = useState(false);
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

        {/* Permanent membership */}
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

        {/* Temporary changes */}
        <div className="dir-form-section-label">Temporary changes</div>
        {myOverrides.length === 0 ? (
          <div className="dir-empty-inline">No temporary subs or pull-outs right now.</div>
        ) : (
          myOverrides.map(o => (
            <div key={o.id} className={`dir-sc-ov ${o.action}`}>
              <div className="dir-sc-ov-body">
                <div className="dir-sc-ov-title">
                  {o.action === 'add' ? <UserPlus size={14} /> : <UserMinus size={14} />}
                  {o.action === 'add' ? 'Subbed into' : 'Pulled from'} {ensembleMap[o.ensembleId]?.name ?? 'ensemble'}
                </div>
                <div className="dir-sc-ov-meta">{describeWhen(o)}{o.reason ? ` · ${o.reason}` : ''}</div>
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

function ChangeForm({
  student, ensembles, onClose, onSavePermanent, onRemovePermanent, onSaveTemporary,
}: {
  student: Student;
  ensembles: Ensemble[];
  onClose: () => void;
  onSavePermanent: (ensembleId: string) => Promise<void>;
  onRemovePermanent: (ensembleId: string) => Promise<void>;
  onSaveTemporary: (data: Omit<RosterOverride, 'id'>) => Promise<void>;
}) {
  const [kind, setKind] = useState<'permanent' | 'temporary'>('temporary');
  const [action, setAction] = useState<'add' | 'remove'>('add');
  const [ensembleId, setEnsembleId] = useState(ensembles[0]?.id ?? '');
  const [span, setSpan] = useState<'day' | 'range'>('day');
  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState(todayStr());
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const ensembleName = ensembles.find(e => e.id === ensembleId)?.name ?? 'ensemble';

  async function handleSave() {
    if (!ensembleId) return;
    setSaving(true); setError('');
    try {
      if (kind === 'permanent') {
        if (action === 'add') await onSavePermanent(ensembleId);
        else await onRemovePermanent(ensembleId);
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

  const summary = kind === 'permanent'
    ? `${student.name} will ${action === 'add' ? 'join' : 'leave'} ${ensembleName} permanently.`
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
              <button className={`dir-segment-btn ${kind === 'permanent' ? 'active' : ''}`} onClick={() => setKind('permanent')}>Permanent</button>
            </div>
          </div>

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
                <label className="dir-label">Reason (optional)</label>
                <input className="dir-input" value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. field trip, illness, sectional swap" />
              </div>
            </>
          )}

          <div className="dir-sc-summary">{summary}</div>
        </div>

        {error && <div className="dir-sc-error" style={{ padding: '4px 16px 0' }}>{error}</div>}
        <div className="dir-drawer-footer">
          <button className="dir-btn dir-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="dir-btn dir-btn-primary" onClick={handleSave} disabled={saving || !ensembleId}>
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
function describeWhen(o: RosterOverride) {
  if (o.scope === 'event') return 'for one rehearsal';
  if (o.startDate && o.endDate) {
    return o.startDate === o.endDate ? fmt(o.startDate) : `${fmt(o.startDate)} – ${fmt(o.endDate)}`;
  }
  return 'temporary';
}
