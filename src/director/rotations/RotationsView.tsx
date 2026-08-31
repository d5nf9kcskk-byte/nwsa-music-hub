import { useState, useMemo } from 'react';
import { Repeat, Plus, Trash2, Pencil, CalendarClock } from 'lucide-react';
import { ORG } from '../../org';
import { useStudents } from '../hooks/useStudents';
import { useEnsembles } from '../hooks/useEnsembles';
import { useRosterOverrides } from '../hooks/useRosterOverrides';
import { rotationWrites } from '../rosterResolver';
import { todayStr, musicEnsembles, WEEKDAY_LABELS, parseDate } from '../utils';
import { useModalA11y } from '../../shared/useModalA11y';
import type { Student, Ensemble, RosterOverride } from '../types';

/**
 * Rotations — the single reference point for standing weekly rotations
 * (docs/schedule-ux-two-doors.md §4, Phase 4d). Not every student rotates;
 * the ones who do are all listed here, one row each, editable and deletable
 * in place. Writes reuse `rotationWrites()` — the member-of-both convention
 * every live rotation uses (scripts/apply-rotations.mjs) — so the concert
 * exemption in overrideApplies keeps rotators on both concert rosters.
 * Delete removes ONLY the rotation's override docs: membership stays, because
 * removing membership is a Roster decision, not a rotation one.
 */

/** A student's kind:'rotation' docs sharing one date range = one logical
 *  rotation. In-app rotations are a base doc (destEnsembleId + days) plus a
 *  reciprocal; scripts/apply-rotations.mjs writes plain-shaped removes with
 *  no destEnsembleId — both group the same way. */
interface RotationGroup {
  student: Student;
  docs: RosterOverride[];
  startDate: string;
  endDate: string;
  /** Present when the group reduces to the form's base/dest/days shape.
   *  A 3-ensemble import rotation doesn't — those rows delete-and-re-add. */
  form?: { baseId: string; destId: string; days: number[] };
}

function groupRotations(students: Student[], overrides: RosterOverride[]): RotationGroup[] {
  const byKey = new Map<string, RosterOverride[]>();
  for (const o of overrides) {
    if (o.kind !== 'rotation') continue;
    const key = `${o.studentId}|${o.startDate ?? ''}|${o.endDate ?? ''}`;
    (byKey.get(key) ?? byKey.set(key, []).get(key)!).push(o);
  }
  const byId = Object.fromEntries(students.map(s => [s.id, s]));
  const out: RotationGroup[] = [];
  for (const docs of byKey.values()) {
    const student = byId[docs[0].studentId];
    if (!student) continue; // orphaned doc — apply-rotations reports these as drift
    out.push({
      student,
      docs,
      startDate: docs[0].startDate ?? '',
      endDate: docs[0].endDate ?? '',
      form: reduceToForm(docs),
    });
  }
  out.sort((a, b) => a.student.name.localeCompare(b.student.name) || a.startDate.localeCompare(b.startDate));
  return out;
}

function reduceToForm(docs: RosterOverride[]): RotationGroup['form'] {
  // App shape: exactly one doc names the destination.
  const withDest = docs.filter(d => d.destEnsembleId);
  if (withDest.length === 1) {
    const base = withDest[0];
    return { baseId: base.ensembleId, destId: base.destEnsembleId!, days: base.days ?? [] };
  }
  // Script shape: two plain removes with disjoint days — the one removed on
  // fewer days is the base (out of it only on the rotation days).
  if (withDest.length === 0 && docs.length === 2 && docs[0].days?.length && docs[1].days?.length) {
    const [a, b] = docs[0].days!.length <= docs[1].days!.length ? docs : [docs[1], docs[0]];
    if (!a.days!.some(d => b.days!.includes(d))) {
      return { baseId: a.ensembleId, destId: b.ensembleId, days: a.days! };
    }
  }
  return undefined;
}

/** "Mon/Wed: Camerata · Fri: Wind Ensemble" — where the student actually is
 *  each school day, from membership minus that day's rotation removes. Works
 *  for both doc shapes (member-of-both convention). */
function weeklySummary(g: RotationGroup, ensembleMap: Record<string, Ensemble>): string {
  const involved = [...new Set(g.docs.flatMap(d => [d.ensembleId, d.destEnsembleId].filter(Boolean) as string[]))];
  const daysByPlace = new Map<string, number[]>();
  for (const d of [1, 2, 3, 4, 5]) {
    const removed = new Set(g.docs.filter(o => o.days?.includes(d)).map(o => o.ensembleId));
    const here = involved.filter(id => !removed.has(id));
    if (here.length === 0 || here.length === involved.length) continue; // day untouched by the rotation
    const place = here.map(id => ensembleMap[id]?.name ?? id).join(' + ');
    (daysByPlace.get(place) ?? daysByPlace.set(place, []).get(place)!).push(d);
  }
  const line = [...daysByPlace.entries()]
    .sort((a, b) => a[1][0] - b[1][0])
    .map(([place, days]) => `${days.map(d => WEEKDAY_LABELS[d]).join('/')}: ${place}`)
    .join(' · ');
  if (line) return line;
  // Degenerate group (e.g. a lone import doc): describe the docs literally.
  return g.docs
    .map(d => `Out of ${ensembleMap[d.ensembleId]?.name ?? d.ensembleId} on ${(d.days ?? []).map(x => WEEKDAY_LABELS[x]).join('/')}`)
    .join(' · ');
}

function fmtLong(d: string) {
  return parseDate(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function RotationsView() {
  const { students, updateStudent } = useStudents();
  const { ensembles } = useEnsembles();
  const { overrides, addOverride, deleteOverrides } = useRosterOverrides();
  const [editing, setEditing] = useState<RotationGroup | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  const ensembleMap = useMemo(() => Object.fromEntries(ensembles.map(e => [e.id, e])), [ensembles]);
  const groups = useMemo(() => groupRotations(students, overrides), [students, overrides]);
  const today = todayStr();
  // An archived (non-Active) student is skipped by every roster resolve, so
  // their rotation is as inert as an expired one — fold it, don't list it live.
  const inert = (g: RotationGroup) =>
    (!!g.endDate && g.endDate < today) || g.student.status !== 'Active';
  const active = groups.filter(g => !inert(g));
  const expired = groups.filter(inert);

  async function handleDelete(g: RotationGroup) {
    if (!window.confirm(
      `Remove ${g.student.name}'s standing rotation? They stay a member of both ensembles — `
      + 'to take them out of an ensemble entirely, use the Roster.',
    )) return;
    setError('');
    try {
      await deleteOverrides(g.docs.map(d => d.id), `Removed ${g.student.name}'s rotation — restore?`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not delete — try again.'); }
  }

  async function handleSave(student: Student, w: ReturnType<typeof rotationWrites>, replacing?: RotationGroup) {
    // Replace = delete the old docs first (no undo — the new docs supersede
    // them), then write like a fresh add. Membership before overrides: if a
    // later write fails, the student is a member of both (harmless) rather
    // than rotated out with no destination.
    if (replacing) await deleteOverrides(replacing.docs.map(d => d.id));
    if (w.ensembleIds) await updateStudent(student.id, { ensembleIds: w.ensembleIds });
    for (const o of w.overrides) await addOverride(o);
  }

  const renderRow = (g: RotationGroup) => (
    <div key={g.docs[0].id} className="dir-sc-ov remove">
      <div className="dir-sc-ov-body">
        <div className="dir-sc-ov-title">
          <Repeat size={14} /> {g.student.name}{g.student.instrument ? ` — ${g.student.instrument}` : ''}
          {g.student.status !== 'Active' && ' · archived'}
        </div>
        <div className="dir-sc-ov-lines">
          <div className="dir-sc-ov-line">{weeklySummary(g, ensembleMap) || 'Rotation days not set'}</div>
          {g.startDate && g.endDate && (
            <div className="dir-sc-ov-line"><CalendarClock size={12} /> {fmtLong(g.startDate)} → {fmtLong(g.endDate)}</div>
          )}
        </div>
      </div>
      {g.form && (
        <button className="dir-icon-btn" onClick={() => setEditing(g)} aria-label={`Edit ${g.student.name}'s rotation`}>
          <Pencil size={15} />
        </button>
      )}
      <button className="dir-icon-btn" onClick={() => handleDelete(g)} aria-label={`Delete ${g.student.name}'s rotation`}>
        <Trash2 size={15} />
      </button>
    </div>
  );

  return (
    <div className="dir-tab-page">
      <div className="dir-sc-intro">
        <Repeat size={18} />
        Every student on a standing weekly rotation, in one place.
      </div>
      <div className="dir-field-hint" style={{ margin: '0 16px 8px' }}>
        Rotations cover rehearsals only — on a concert day they play with whichever ensemble is on stage.
      </div>

      <div className="dir-page-body">
        {error && <div className="dir-sc-error">⚠ {error}</div>}
        {active.length === 0 ? (
          <div className="dir-empty-inline">Nobody is on a standing rotation right now.</div>
        ) : (
          active.map(renderRow)
        )}
        {expired.length > 0 && (
          <details style={{ marginTop: 12 }}>
            <summary className="dir-form-section-label" style={{ cursor: 'pointer' }}>
              Expired or archived rotations ({expired.length})
            </summary>
            {expired.map(renderRow)}
          </details>
        )}
      </div>

      <div className="dir-drawer-footer">
        <button className="dir-btn dir-btn-primary" onClick={() => setAdding(true)}>
          <Plus size={16} style={{ verticalAlign: '-3px' }} /> New rotation
        </button>
      </div>

      {(adding || editing) && (
        <RotationDrawer
          students={students}
          ensembles={ensembles}
          editing={editing ?? undefined}
          onClose={() => { setAdding(false); setEditing(null); }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

/** The rotation form — same fields and `rotationWrites` save shape as the
 *  Move a Student flow's RotationForm (schedule-changes/ScheduleChangeView.tsx,
 *  not imported: Phase 4b is rewriting that file), plus a student picker
 *  since this page isn't scoped to one student. */
function RotationDrawer({ students, ensembles, editing, onSave, onClose }: {
  students: Student[];
  ensembles: Ensemble[];
  editing?: RotationGroup;
  onSave: (student: Student, w: ReturnType<typeof rotationWrites>, replacing?: RotationGroup) => Promise<void>;
  onClose: () => void;
}) {
  const [studentId, setStudentId] = useState(editing?.student.id ?? '');
  const [baseId, setBaseId] = useState(editing?.form?.baseId ?? '');
  const [destId, setDestId] = useState(editing?.form?.destId ?? '');
  const [days, setDays] = useState<number[]>(editing?.form?.days ?? []);
  const [startDate, setStartDate] = useState(editing?.startDate || todayStr());
  const [endDate, setEndDate] = useState(editing?.endDate || (ORG.termEnd ?? ''));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const panelRef = useModalA11y<HTMLDivElement>(onClose, true, { closeOnBack: true });

  const student = students.find(s => s.id === studentId) ?? null;
  const pickable = useMemo(
    () => students.filter(s => s.status !== 'Graduated' && s.status !== 'Inactive')
      .sort((a, b) => a.name.localeCompare(b.name)),
    [students],
  );
  const memberEnsembles = ensembles.filter(e => student?.ensembleIds?.includes(e.id));
  const baseOptions = musicEnsembles(memberEnsembles.length ? memberEnsembles : ensembles);
  const ready = !!student && !!baseId && !!destId && baseId !== destId
    && days.length > 0 && !!startDate && !!endDate && endDate >= startDate;

  async function handleSave() {
    if (!ready || !student) return;
    setSaving(true); setError('');
    try {
      await onSave(student, rotationWrites(student, baseId, destId, days, startDate, endDate), editing);
      onClose();
    } catch (e) {
      setSaving(false);
      setError(e instanceof Error ? e.message : 'Could not save — try again.');
    }
  }

  return (
    <div className="dir-drawer-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dir-drawer" role="dialog" aria-modal="true" aria-label={editing ? 'Edit rotation' : 'New rotation'} tabIndex={-1} ref={panelRef}>
        <div className="dir-drawer-handle" />
        <div className="dir-drawer-header">
          <span className="dir-drawer-title">
            <Repeat size={16} style={{ verticalAlign: '-2px' }} /> {editing ? `Edit rotation — ${editing.student.name}` : 'New standing rotation'}
          </span>
          <button className="dir-drawer-close" onClick={onClose}>×</button>
        </div>
        <div className="dir-drawer-body">
          {!editing && (
            <div className="dir-field">
              <label className="dir-label">Student</label>
              <select className="dir-input" value={studentId} onChange={e => { setStudentId(e.target.value); setBaseId(''); setDestId(''); }}>
                <option value="">— pick a student —</option>
                {pickable.map(s => (
                  <option key={s.id} value={s.id}>{s.name}{s.instrument ? ` (${s.instrument})` : ''}</option>
                ))}
              </select>
            </div>
          )}
          <div className="dir-field">
            <label className="dir-label">Base ensemble</label>
            <select className="dir-input" value={baseId} onChange={e => setBaseId(e.target.value)} disabled={!student}>
              <option value="">— pick an ensemble —</option>
              {baseOptions.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
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
            <select className="dir-input" value={destId} onChange={e => setDestId(e.target.value)} disabled={!student}>
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
            They stay a member of both ensembles.
          </div>
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
