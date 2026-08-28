import { useMemo, useState } from 'react';
import { Search, UserPlus } from 'lucide-react';
import { useStudents } from '../hooks/useStudents';
import { useModalA11y } from '../../shared/useModalA11y';
import { studentMatchesQuery } from '../studentSearch';
import type { DirNavigate } from '../types-nav';

/**
 * "Add students to this ensemble" — the one obvious place to build a newly
 * created ensemble's roster (#ux). Every active student is listed with a
 * checkbox; ticking it adds the student to the ensemble (writes
 * `ensembleIds` on the student doc), unticking removes them. Changes save
 * instantly — there is no separate Save step to forget.
 */
export function EnsembleRosterEditor({ ensembleId, ensembleName, onNavigate, onClose }: {
  ensembleId: string;
  ensembleName: string;
  onNavigate?: DirNavigate;
  onClose: () => void;
}) {
  const { students, updateStudent } = useStudents();
  const [filter, setFilter] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const panelRef = useModalA11y<HTMLDivElement>(onClose, true, { closeOnBack: true });

  const active = useMemo(
    () => students
      .filter(s => s.status === 'Active')
      .filter(s => studentMatchesQuery(s, filter)),
    [students, filter],
  );
  const memberCount = students.filter(s => s.status === 'Active' && s.ensembleIds?.includes(ensembleId)).length;

  async function toggle(studentId: string) {
    const s = students.find(x => x.id === studentId);
    if (!s) return;
    setBusyId(studentId);
    try {
      const has = s.ensembleIds?.includes(ensembleId);
      const next = has
        ? (s.ensembleIds ?? []).filter(id => id !== ensembleId)
        : [...(s.ensembleIds ?? []), ensembleId];
      await updateStudent(studentId, { ensembleIds: next });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="dir-drawer-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dir-drawer" role="dialog" aria-modal="true" aria-label={`Add students to ${ensembleName}`} tabIndex={-1} ref={panelRef}>
        <div className="dir-drawer-handle" />
        <div className="dir-drawer-header">
          <span className="dir-drawer-title"><UserPlus size={16} style={{ verticalAlign: '-2px' }} /> Add students · {ensembleName}</span>
          <button className="dir-drawer-close" onClick={onClose}>×</button>
        </div>
        <div className="dir-drawer-body">
          <div className="dir-field-hint" style={{ marginTop: 0 }}>
            Check a student to add them to {ensembleName}; uncheck to remove them. Changes save instantly —
            <strong> {memberCount} student{memberCount === 1 ? '' : 's'}</strong> on this roster so far.
          </div>
          <div className="dir-sc-search">
            <Search size={16} />
            <input
              className="dir-input"
              style={{ border: 'none', background: 'transparent', flex: 1 }}
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Search name, instrument, or grade…"
            />
          </div>
          {active.length === 0 ? (
            <div className="dir-empty-inline">
              {students.some(s => s.status === 'Active')
                ? 'No students match that search.'
                : <>No students in the roster yet.{onNavigate && (
                    <button className="dir-btn dir-btn-ghost dir-sc-small" style={{ marginLeft: 8 }} onClick={() => { onClose(); onNavigate('roster'); }}>
                      Open Roster
                    </button>
                  )}</>}
            </div>
          ) : (
            active.map(s => {
              const checked = !!s.ensembleIds?.includes(ensembleId);
              return (
                <label key={s.id} className="dir-ens-row" style={{ cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={busyId === s.id}
                    onChange={() => toggle(s.id)}
                    style={{ width: 18, height: 18, flexShrink: 0 }}
                  />
                  <div className="dir-ens-info">
                    <div className="dir-ens-name">{s.name}</div>
                    <div className="dir-ens-sub">
                      {s.instrument}{s.grade ? ` · Grade ${s.grade}` : ''}
                    </div>
                  </div>
                </label>
              );
            })
          )}
        </div>
        <div className="dir-drawer-footer">
          <button className="dir-btn dir-btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
