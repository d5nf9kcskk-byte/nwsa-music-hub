import { useMemo, useState } from 'react';
import { Repeat, Pencil, Trash2, CalendarClock } from 'lucide-react';
import { ORG } from '../../org';
import { useStudents } from '../hooks/useStudents';
import { useEnsembles } from '../hooks/useEnsembles';
import { useRosterOverrides } from '../hooks/useRosterOverrides';
import { rotationWrites } from '../rosterResolver';
import { parseDate, todayStr, musicEnsembles, WEEKDAY_LABELS } from '../utils';
import { useModalA11y } from '../../shared/useModalA11y';
import { rotationSummary, rotationEntries, type RotationEntry } from './rotations';
import type { Student, Ensemble } from '../types';

const fmt = (d?: string) => d ? parseDate(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';

/**
 * Rotations — the single reference point for every standing weekly rotation
 * (docs/schedule-ux-two-doors.md §4). Lists each rotating student's pattern,
 * editable and deletable in place, plus add. Everything writes through
 * `rotationWrites` (rosterResolver.ts) — the member-of-both convention
 * scripts/apply-rotations.mjs established, untouched. Deleting a rotation
 * removes ITS override docs only; membership stays (removing membership is a
 * Roster decision, not a rotation one).
 */
export function RotationsView({ initialStudentId }: { initialStudentId?: string }) {
  const { students, updateStudent } = useStudents();
  const { ensembles } = useEnsembles();
  const { overrides, addOverride, deleteOverride } = useRosterOverrides();
  // Deep-linked from Move a Student's "Standing weekly rotation" verb: open
  // the add form for that student as soon as the roster loads.
  const [addForId, setAddForId] = useState<string | null>(initialStudentId ?? null);
  const [editing, setEditing] = useState<RotationEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const studentMap = useMemo(() => Object.fromEntries(students.map(s => [s.id, s])), [students]);
  const ensembleMap = useMemo(() => Object.fromEntries(ensembles.map(e => [e.id, e])), [ensembles]);

  const entries = useMemo(
    () => rotationEntries(overrides).sort((a, b) => {
      const an = studentMap[a.primary.studentId]?.name ?? '';
      const bn = studentMap[b.primary.studentId]?.name ?? '';
      return an.localeCompare(bn) || (a.primary.startDate ?? '').localeCompare(b.primary.startDate ?? '');
    }),
    [overrides, studentMap],
  );

  const activeStudents = useMemo(
    () => students
      .filter(s => s.status !== 'Graduated' && s.status !== 'Inactive')
      .sort((a, b) => a.name.localeCompare(b.name)),
    [students],
  );

  const addFor = addForId ? studentMap[addForId] : undefined;
  const editFor = editing ? studentMap[editing.primary.studentId] : undefined;

  async function saveWrites(student: Student, w: ReturnType<typeof rotationWrites>, replacing?: RotationEntry) {
    // Membership first: if a later write fails, the student is a member of
    // both (harmless) rather than rotated out with no destination. When
    // replacing, the NEW docs land before the old ones are deleted, so a
    // failure never leaves the student with no rotation at all.
    if (w.ensembleIds) await updateStudent(student.id, { ensembleIds: w.ensembleIds });
    for (const o of w.overrides) await addOverride(o);
    if (replacing) {
      await deleteOverride(replacing.primary.id);
      if (replacing.reciprocal) await deleteOverride(replacing.reciprocal.id);
    }
  }

  async function handleDelete(en: RotationEntry) {
    const name = studentMap[en.primary.studentId]?.name ?? 'This student';
    if (!window.confirm(`End this rotation? ${name} stays a member of both ensembles — removing membership is a Roster decision.`)) return;
    setBusy(true); setError('');
    try {
      await deleteOverride(en.primary.id);
      if (en.reciprocal) await deleteOverride(en.reciprocal.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete — try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dir-tab-page">
      <div className="dir-page-body">
        <div className="dir-field-hint">
          Standing weekly rotations — students who rehearse with one ensemble on
          set weekdays and their base ensemble the rest of the week. Rehearsals
          only: on a concert day they play with whichever ensemble is on stage.
          One-day moves belong on Move a Student.
        </div>

        <div className="dir-field" style={{ maxWidth: 420 }}>
          <select
            className="dir-input"
            value=""
            aria-label="Add a rotation"
            onChange={e => e.target.value && setAddForId(e.target.value)}
          >
            <option value="">＋ Add a rotation — pick a student…</option>
            {activeStudents.map(s => (
              <option key={s.id} value={s.id}>{s.name}{s.instrument ? ` (${s.instrument})` : ''}</option>
            ))}
          </select>
        </div>

        {error && <div className="dir-sc-error">⚠ {error}</div>}

        {entries.length === 0 ? (
          <div className="dir-empty-inline">No standing rotations right now.</div>
        ) : (
          entries.map(en => {
            const s = studentMap[en.primary.studentId];
            return (
              <div key={en.primary.id} className="dir-ens-row">
                <div className="dir-ens-info">
                  <div className="dir-ens-name">
                    {s?.name ?? 'Student no longer on the roster'}
                    {s?.instrument && <span className="dir-ens-sub" style={{ marginLeft: 8, display: 'inline' }}>{s.instrument}</span>}
                  </div>
                  <div className="dir-ens-sub">
                    <Repeat size={12} style={{ verticalAlign: '-2px' }} />{' '}
                    {rotationSummary(ensembleMap[en.primary.ensembleId], ensembleMap[en.primary.destEnsembleId ?? ''], en.primary.days)
                      || 'Rotation (details missing)'}
                  </div>
                  <div className="dir-ens-sub">
                    <CalendarClock size={12} style={{ verticalAlign: '-2px' }} />{' '}
                    {fmt(en.primary.startDate)} → {fmt(en.primary.endDate)}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  {s && (
                    <button className="dir-tool-btn" disabled={busy} onClick={() => setEditing(en)}>
                      <Pencil size={14} /> Edit
                    </button>
                  )}
                  <button className="dir-tool-btn" style={{ color: 'var(--dir-danger)' }} disabled={busy} onClick={() => handleDelete(en)}>
                    <Trash2 size={14} /> Delete
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {addFor && (
        <RotationForm
          student={addFor}
          ensembles={ensembles}
          onClose={() => setAddForId(null)}
          onSave={w => saveWrites(addFor, w)}
        />
      )}

      {editing && editFor && (
        <RotationForm
          student={editFor}
          ensembles={ensembles}
          initial={{
            baseId: editing.primary.ensembleId,
            destId: editing.primary.destEnsembleId ?? '',
            days: editing.primary.days ?? [],
            startDate: editing.primary.startDate ?? todayStr(),
            endDate: editing.primary.endDate ?? (ORG.termEnd ?? ''),
          }}
          onClose={() => setEditing(null)}
          onSave={w => saveWrites(editFor, w, editing)}
        />
      )}
    </div>
  );
}

/**
 * Standing rotation form (#schedule-ux-redesign §2.4, moved here in Phase
 * 4d): a small face over `rotationWrites` (rosterResolver.ts) —
 * scripts/apply-rotations.mjs's member-of-both convention, the one every
 * live rotation uses. The save is membership in BOTH ensembles plus removes
 * carving out rehearsal days, so the concert exemption keeps the student on
 * both concert rosters. Weekdays follow Ensemble.meetingDays: 0=Sun…6=Sat.
 */
export function RotationForm({ student, ensembles, initial, onSave, onClose }: {
  student: Student;
  ensembles: Ensemble[];
  /** Editing an existing rotation — seed every field from its docs. */
  initial?: { baseId: string; destId: string; days: number[]; startDate: string; endDate: string };
  onSave: (writes: ReturnType<typeof rotationWrites>) => Promise<void>;
  onClose: () => void;
}) {
  const memberEnsembles = ensembles.filter(e => student.ensembleIds?.includes(e.id));
  const baseOptions = musicEnsembles(memberEnsembles.length ? memberEnsembles : ensembles);
  const [baseId, setBaseId] = useState(() => initial?.baseId ?? baseOptions[0]?.id ?? '');
  const [destId, setDestId] = useState(initial?.destId ?? '');
  const [days, setDays] = useState<number[]>(initial?.days ?? []);
  const [startDate, setStartDate] = useState(initial?.startDate ?? todayStr());
  // Default end: the org's end of term, when configured. Otherwise typed.
  const [endDate, setEndDate] = useState(initial?.endDate ?? ORG.termEnd ?? '');
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
              {WEEKDAY_LABELS.map((label, d) => (
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
