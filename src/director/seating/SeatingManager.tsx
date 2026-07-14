import { useState, useMemo } from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown, Pencil, ChevronLeft, Armchair } from 'lucide-react';
import { useStudents } from '../hooks/useStudents';
import { useRepertoire } from '../hooks/useRepertoire';
import { useSeatingCharts } from '../hooks/useSeatingCharts';
import { scoreOrderRank, lastName } from '../scoreOrder';
import { todayStr, parseDate, pieceEnsembleIds } from '../utils';
import type { SeatingChart, Student } from '../types';
import { SeatingChartCard } from '../../public/components/SeatingChartCard';

/** Director seating editor for one ensemble. Charts are per-piece playing-exam
 *  seating: seat 1 = principal. Published charts show on the public ensemble page. */
export function SeatingManager({ ensembleId, ensembleName, onClose }: {
  ensembleId: string; ensembleName: string; onClose: () => void;
}) {
  const { charts, addChart, updateChart, deleteChart } = useSeatingCharts(ensembleId);
  const { students } = useStudents();
  const { pieces } = useRepertoire();
  const [editing, setEditing] = useState<SeatingChart | 'new' | null>(null);

  const roster = useMemo(
    () => students.filter(s => s.status === 'Active' && s.ensembleIds?.includes(ensembleId)),
    [students, ensembleId],
  );
  const ensemblePieces = pieces.filter(p => pieceEnsembleIds(p).includes(ensembleId));

  if (editing) {
    return (
      <SeatingEditor
        chart={editing === 'new' ? null : editing}
        ensembleId={ensembleId}
        roster={roster}
        pieces={ensemblePieces}
        onSave={async data => { if (editing === 'new') await addChart(data); else await updateChart(editing.id, data); setEditing(null); }}
        onDelete={editing !== 'new' ? async () => { await deleteChart(editing.id); setEditing(null); } : undefined}
        onBack={() => setEditing(null)}
      />
    );
  }

  return (
    <div className="dir-drawer-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dir-drawer">
        <div className="dir-drawer-handle" />
        <div className="dir-drawer-header">
          <span className="dir-drawer-title"><Armchair size={17} style={{ verticalAlign: '-3px' }} /> Seating · {ensembleName}</span>
          <button className="dir-drawer-close" onClick={onClose}>×</button>
        </div>
        <div className="dir-drawer-body">
          {charts.length === 0 ? (
            <div className="dir-empty-inline">No seating charts yet. Create one after a playing exam.</div>
          ) : (
            charts.map(c => (
              <div key={c.id} className="dir-ens-row" onClick={() => setEditing(c)}>
                <Armchair size={18} className="dir-hub-icon" />
                <div className="dir-ens-info">
                  <div className="dir-ens-name">{c.title}</div>
                  <div className="dir-ens-sub">{c.sections.reduce((n, s) => n + s.seats.length, 0)} seats{c.date ? ` · ${parseDate(c.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}</div>
                </div>
                <button className="dir-icon-btn" onClick={e => { e.stopPropagation(); setEditing(c); }}><Pencil size={15} /></button>
              </div>
            ))
          )}
        </div>
        <div className="dir-drawer-footer">
          <button className="dir-btn dir-btn-primary" onClick={() => setEditing('new')}>
            <Plus size={16} style={{ verticalAlign: '-3px' }} /> New seating chart
          </button>
        </div>
      </div>
    </div>
  );
}

/** Section key for seating. Keeps Violin 1 vs Violin 2 distinct: the roster
 *  stores instrument as plain "Violin", so honor a part recorded in the
 *  student's `section` ("Violin 1" / "1" / "II"). Instruments already stored as
 *  "Violin I" / "Violin II" split on their own via scoreOrderRank (400 vs 402).
 *  Non-numeric section roles (e.g. "First Chair") never trigger a split. */
function seatingSectionKey(s: Student): string {
  const instr = (s.instrument || 'Other').trim();
  if (/^violins?$/i.test(instr) && s.section) {
    if (/\b(2|ii)\b/i.test(s.section)) return 'Violin 2';
    if (/\b(1|i)\b/i.test(s.section)) return 'Violin 1';
  }
  return instr;
}

function buildSections(roster: Student[]): SeatingChart['sections'] {
  const byInstr = new Map<string, Student[]>();
  for (const s of roster) {
    const key = seatingSectionKey(s);
    if (!byInstr.has(key)) byInstr.set(key, []);
    byInstr.get(key)!.push(s);
  }
  return [...byInstr.entries()]
    .sort((a, b) => scoreOrderRank(a[0]) - scoreOrderRank(b[0]) || a[0].localeCompare(b[0]))
    .map(([section, list]) => ({
      section,
      seats: list.sort((a, b) => lastName(a.name).localeCompare(lastName(b.name))).map(s => ({ studentId: s.id })),
    }));
}

function SeatingEditor({ chart, ensembleId, roster, pieces, onSave, onDelete, onBack }: {
  chart: SeatingChart | null;
  ensembleId: string;
  roster: Student[];
  pieces: { id: string; title: string }[];
  onSave: (data: Omit<SeatingChart, 'id'>) => Promise<void>;
  onDelete?: () => Promise<void>;
  onBack: () => void;
}) {
  const nameById = useMemo(() => Object.fromEntries(roster.map(s => [s.id, s.name])), [roster]);
  const [title, setTitle] = useState(chart?.title ?? '');
  const [pieceId, setPieceId] = useState(chart?.pieceId ?? '');
  const [date, setDate] = useState(chart?.date ?? todayStr());
  const [sections, setSections] = useState<SeatingChart['sections']>(chart?.sections ?? buildSections(roster));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  // Student-view-first: an existing chart opens in the read-only student view;
  // a brand-new chart opens straight into edit.
  const [editing, setEditing] = useState(!chart);

  function move(si: number, seatIdx: number, dir: -1 | 1) {
    setSections(prev => {
      const next = prev.map(s => ({ ...s, seats: [...s.seats] }));
      const seats = next[si].seats;
      const j = seatIdx + dir;
      if (j < 0 || j >= seats.length) return prev;
      [seats[seatIdx], seats[j]] = [seats[j], seats[seatIdx]];
      return next;
    });
  }
  function removeSeat(si: number, seatIdx: number) {
    setSections(prev => prev.map((s, i) => i === si ? { ...s, seats: s.seats.filter((_, k) => k !== seatIdx) } : s));
  }
  function setNote(si: number, seatIdx: number, note: string) {
    setSections(prev => prev.map((s, i) => i === si
      ? { ...s, seats: s.seats.map((seat, k) => k === seatIdx ? { ...seat, note: note || undefined } : seat) }
      : s));
  }

  async function save() {
    if (!title.trim()) { setErr('Give the chart a title.'); return; }
    setSaving(true); setErr('');
    try {
      await onSave({
        ensembleId,
        title: title.trim(),
        pieceId: pieceId || undefined,
        date: date || undefined,
        sections: sections.filter(s => s.seats.length > 0),
        createdAt: chart?.createdAt ?? Date.now(),
      });
    } catch (e) { setSaving(false); setErr(e instanceof Error ? e.message : 'Could not save.'); }
  }

  return (
    <div className="dir-drawer-overlay" onClick={e => e.target === e.currentTarget && onBack()}>
      <div className="dir-drawer">
        <div className="dir-drawer-handle" />
        <div className="dir-drawer-header">
          <button className="dir-drawer-back" onClick={onBack}><ChevronLeft size={18} /> Back</button>
          <span className="dir-drawer-title">{chart ? 'Edit Seating' : 'New Seating'}</span>
          <button className="dir-drawer-close" onClick={onBack}>×</button>
        </div>
        <div className="dir-drawer-body">
          <div className="dir-mode-toggle">
            <button type="button" className={`dir-segment-btn ${!editing ? 'active' : ''}`} onClick={() => setEditing(false)}>Student view</button>
            <button type="button" className={`dir-segment-btn ${editing ? 'active' : ''}`} onClick={() => setEditing(true)}>Edit</button>
          </div>
          {editing ? (
          <>
          <div className="dir-field">
            <label className="dir-label">Title *</label>
            <input className="dir-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Fall Concert seating" autoFocus />
          </div>
          <div className="dir-field-row">
            <div className="dir-field">
              <label className="dir-label">For piece (optional)</label>
              <select className="dir-input" value={pieceId} onChange={e => setPieceId(e.target.value)}>
                <option value="">— any / general —</option>
                {pieces.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </div>
            <div className="dir-field" style={{ flex: '0 0 130px' }}>
              <label className="dir-label">Date</label>
              <input className="dir-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
          </div>

          <div className="dir-field-hint">Seat 1 = principal. Use the arrows to set the order after a playing exam.</div>

          {sections.map((sec, si) => (
            <div key={si} style={{ marginTop: 12 }}>
              <div className="dir-form-section-label" style={{ padding: 0 }}>{sec.section}</div>
              {sec.seats.map((seat, seatIdx) => (
                <div key={seat.studentId} className="dir-seat-row">
                  <span className="dir-seat-num">{seatIdx + 1}</span>
                  <div className="dir-seat-body">
                    <div className="dir-seat-name">{nameById[seat.studentId] ?? seat.studentId}</div>
                    <input className="dir-input dir-seat-note" value={seat.note ?? ''} onChange={e => setNote(si, seatIdx, e.target.value)} placeholder="note (e.g. Principal)" />
                  </div>
                  <div className="dir-seat-moves">
                    <button className="dir-icon-btn dir-seat-move" onClick={() => move(si, seatIdx, -1)} disabled={seatIdx === 0}><ChevronUp size={14} /></button>
                    <button className="dir-icon-btn dir-seat-move" onClick={() => move(si, seatIdx, 1)} disabled={seatIdx === sec.seats.length - 1}><ChevronDown size={14} /></button>
                    <button className="dir-icon-btn dir-seat-move" onClick={() => removeSeat(si, seatIdx)}><Trash2 size={13} /></button>
                  </div>
                </div>
              ))}
            </div>
          ))}

          {onDelete && (
            <button
              className="dir-btn dir-btn-danger"
              style={{ marginTop: 16 }}
              onClick={() => { if (window.confirm('Delete this seating chart? Students will no longer see it.')) onDelete(); }}
            >
              Delete chart
            </button>
          )}
          </>
          ) : (
            <SeatingChartCard
              chart={{ id: chart?.id ?? 'preview', ensembleId, title: title || 'Seating', pieceId: pieceId || undefined, date: date || undefined, sections: sections.filter(s => s.seats.length > 0), createdAt: chart?.createdAt ?? 0 }}
              studentName={sid => nameById[sid] ?? sid}
            />
          )}
        </div>
        {err && <div className="dir-sc-error" style={{ padding: '4px 16px 0' }}>{err}</div>}
        <div className="dir-drawer-footer">
          <button className="dir-btn dir-btn-ghost" onClick={onBack}>Cancel</button>
          <button className="dir-btn dir-btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Publish'}</button>
        </div>
      </div>
    </div>
  );
}
