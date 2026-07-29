import { useState, useMemo, useRef } from 'react';
import { Plus, Trash2, Pencil, ChevronLeft, Armchair, GripVertical } from 'lucide-react';
import { useStudents } from '../hooks/useStudents';
import { useRepertoire } from '../hooks/useRepertoire';
import { useSeatingCharts } from '../hooks/useSeatingCharts';
import { scoreOrderRank, lastName } from '../scoreOrder';
import { todayStr, parseDate, pieceEnsembleIds } from '../utils';
import type { SeatingChart, Student } from '../types';
import { SeatingChartCard } from '../../public/components/SeatingChartCard';
import { useModalA11y } from '../../shared/useModalA11y';

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
  const panelRef = useModalA11y<HTMLDivElement>(onBack, true, { closeOnBack: true });

  // Drag-to-reorder seats within a section (mirrors PiecePicker's program-order
  // grip): while a drag is live the pending order is kept locally and only
  // committed to `sections` on release. `si` scopes the drag to one section —
  // moving a seat to a DIFFERENT section is a separate action (the per-seat
  // "move to" select below), not a cross-section drag.
  const [drag, setDrag] = useState<{ si: number; from: number; to: number } | null>(null);
  const sectionRefs = useRef(new Map<number, HTMLDivElement>());

  // Seats shown for section `si`, with any live drag in that section applied.
  function displaySeats(si: number) {
    const seats = sections[si].seats;
    if (!drag || drag.si !== si || drag.from === drag.to) return seats;
    const next = [...seats];
    const [moved] = next.splice(drag.from, 1);
    next.splice(drag.to, 0, moved);
    return next;
  }

  function moveWithinSection(si: number, seatIdx: number, dir: -1 | 1) {
    setSections(prev => {
      const next = prev.map((s, i) => i === si ? { ...s, seats: [...s.seats] } : s);
      const seats = next[si].seats;
      const j = seatIdx + dir;
      if (j < 0 || j >= seats.length) return prev;
      [seats[seatIdx], seats[j]] = [seats[j], seats[seatIdx]];
      return next;
    });
  }

  function onGripDown(e: React.PointerEvent<HTMLButtonElement>, si: number, seatIdx: number) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ si, from: seatIdx, to: seatIdx });
  }
  function onGripMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (!drag) return;
    const container = sectionRefs.current.get(drag.si);
    const rows = Array.from(container?.querySelectorAll<HTMLElement>('[data-seat-row]') ?? []);
    let to = rows.length - 1;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i].getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) { to = i; break; }
    }
    if (to !== drag.to) setDrag(d => (d ? { ...d, to } : d));
  }
  function onGripUp() {
    if (!drag) return;
    if (drag.from !== drag.to) {
      setSections(prev => {
        const next = prev.map((s, i) => i === drag.si ? { ...s, seats: [...s.seats] } : s);
        const seats = next[drag.si].seats;
        const [moved] = seats.splice(drag.from, 1);
        seats.splice(drag.to, 0, moved);
        return next;
      });
    }
    setDrag(null);
  }

  function removeSeat(si: number, studentId: string) {
    setSections(prev => prev.map((s, i) => i === si ? { ...s, seats: s.seats.filter(seat => seat.studentId !== studentId) } : s));
  }
  function setNote(si: number, studentId: string, note: string) {
    setSections(prev => prev.map((s, i) => i === si
      ? { ...s, seats: s.seats.map(seat => seat.studentId === studentId ? { ...seat, note: note || undefined } : seat) }
      : s));
  }
  /** Move a seated student to a different section (a category change, e.g.
   *  moving someone from "Saxophone" into a newly-added "Saxophone 3"). */
  function moveSeatToSection(fromSi: number, studentId: string, toSi: number) {
    if (fromSi === toSi) return;
    setSections(prev => {
      const seat = prev[fromSi].seats.find(s => s.studentId === studentId);
      if (!seat) return prev;
      return prev.map((s, i) => {
        if (i === fromSi) return { ...s, seats: s.seats.filter(x => x.studentId !== studentId) };
        if (i === toSi) return { ...s, seats: [...s.seats, seat] };
        return s;
      });
    });
  }

  // Custom categories (#seating-sections): the director isn't limited to
  // whatever buildSections() auto-derived from instruments — a 3rd sax part
  // or an obscure percussion part gets its own named section.
  const [newSectionName, setNewSectionName] = useState('');
  function addSection() {
    const name = newSectionName.trim();
    if (!name || sections.some(s => s.section.toLowerCase() === name.toLowerCase())) return;
    setSections(prev => [...prev, { section: name, seats: [] }]);
    setNewSectionName('');
  }
  function renameSection(si: number, name: string) {
    setSections(prev => prev.map((s, i) => i === si ? { ...s, section: name } : s));
  }
  function removeSection(si: number) {
    const sec = sections[si];
    if (sec.seats.length > 0 && !window.confirm(
      `Remove "${sec.section}"? ${sec.seats.length} seated student${sec.seats.length === 1 ? '' : 's'} will be unseated.`
    )) return;
    setSections(prev => prev.filter((_, i) => i !== si));
  }

  // Adding a student to a section — only from the roster and only students
  // not already seated somewhere else in this chart.
  const [addingSeatSection, setAddingSeatSection] = useState<number | null>(null);
  const [seatQuery, setSeatQuery] = useState('');
  const seatedIds = useMemo(() => new Set(sections.flatMap(s => s.seats.map(x => x.studentId))), [sections]);
  const unseated = useMemo(() => roster.filter(s => !seatedIds.has(s.id)), [roster, seatedIds]);
  function addSeat(si: number, studentId: string) {
    setSections(prev => prev.map((s, i) => i === si ? { ...s, seats: [...s.seats, { studentId }] } : s));
    setAddingSeatSection(null);
    setSeatQuery('');
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
      <div className="dir-drawer" role="dialog" aria-modal="true" aria-label={chart ? 'Edit Seating' : 'New Seating'} tabIndex={-1} ref={panelRef}>
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

          <div className="dir-field-hint">Seat 1 = principal. Drag ≡ to set the order after a playing exam.</div>

          {sections.map((sec, si) => {
            const seats = displaySeats(si);
            return (
              <div key={si} style={{ marginTop: 16 }}>
                <div className="dir-seat-section-head">
                  <input
                    className="dir-input dir-seat-section-name"
                    value={sec.section}
                    onChange={e => renameSection(si, e.target.value)}
                    placeholder="Section name"
                  />
                  <button
                    type="button"
                    className="dir-icon-btn"
                    onClick={() => removeSection(si)}
                    aria-label={`Remove ${sec.section || 'section'}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div ref={el => { if (el) sectionRefs.current.set(si, el); else sectionRefs.current.delete(si); }}>
                  {seats.map((seat, seatIdx) => (
                    <div
                      key={seat.studentId}
                      data-seat-row
                      className={`dir-seat-row${drag && drag.si === si && drag.to === seatIdx ? ' dragging' : ''}`}
                    >
                      <button
                        type="button"
                        className="dir-seat-grip"
                        aria-label={`Reorder ${nameById[seat.studentId] ?? seat.studentId} — drag, or use arrow keys`}
                        onPointerDown={e => onGripDown(e, si, seatIdx)}
                        onPointerMove={onGripMove}
                        onPointerUp={onGripUp}
                        onPointerCancel={() => setDrag(null)}
                        onKeyDown={e => {
                          if (e.key === 'ArrowUp') { e.preventDefault(); moveWithinSection(si, seatIdx, -1); }
                          if (e.key === 'ArrowDown') { e.preventDefault(); moveWithinSection(si, seatIdx, 1); }
                        }}
                      >
                        <GripVertical size={15} />
                      </button>
                      <span className="dir-seat-num">{seatIdx + 1}</span>
                      <div className="dir-seat-body">
                        <div className="dir-seat-name">{nameById[seat.studentId] ?? seat.studentId}</div>
                        <input className="dir-input dir-seat-note" value={seat.note ?? ''} onChange={e => setNote(si, seat.studentId, e.target.value)} placeholder="note (e.g. Principal)" />
                      </div>
                      <div className="dir-seat-moves">
                        {sections.length > 1 && (
                          <select
                            className="dir-seat-section-move"
                            value={si}
                            onChange={e => moveSeatToSection(si, seat.studentId, Number(e.target.value))}
                            aria-label={`Move ${nameById[seat.studentId] ?? seat.studentId} to a different section`}
                          >
                            {sections.map((s2, i2) => <option key={i2} value={i2}>{s2.section || `Section ${i2 + 1}`}</option>)}
                          </select>
                        )}
                        <button className="dir-icon-btn dir-seat-move" onClick={() => removeSeat(si, seat.studentId)} aria-label={`Remove ${nameById[seat.studentId] ?? seat.studentId}`}><Trash2 size={13} /></button>
                      </div>
                    </div>
                  ))}
                </div>

                {addingSeatSection === si ? (
                  <div className="dir-seat-add">
                    <input
                      className="dir-input"
                      value={seatQuery}
                      onChange={e => setSeatQuery(e.target.value)}
                      placeholder="Search a student to add…"
                      autoFocus
                    />
                    <div className="dir-add-sub-list" style={{ marginTop: 6 }}>
                      {unseated.filter(s => s.name.toLowerCase().includes(seatQuery.toLowerCase())).slice(0, 8).map(s => (
                        <button key={s.id} type="button" className="dir-ens-row dir-sc-pick" onClick={() => addSeat(si, s.id)}>
                          <div className="dir-ens-info">
                            <div className="dir-ens-name">{s.name}</div>
                            <div className="dir-ens-sub">{s.instrument}</div>
                          </div>
                          <Plus size={16} />
                        </button>
                      ))}
                      {unseated.length === 0 && <div className="dir-empty-inline">Everyone on the roster is already seated.</div>}
                    </div>
                    <button type="button" className="dir-btn dir-btn-ghost dir-sc-small" style={{ marginTop: 6 }} onClick={() => { setAddingSeatSection(null); setSeatQuery(''); }}>Done</button>
                  </div>
                ) : (
                  <button type="button" className="dir-tool-btn" style={{ marginTop: 8 }} onClick={() => { setAddingSeatSection(si); setSeatQuery(''); }}>
                    <Plus size={13} /> Add student
                  </button>
                )}
              </div>
            );
          })}

          <div className="dir-field-row" style={{ marginTop: 16, alignItems: 'flex-end' }}>
            <div className="dir-field">
              <label className="dir-label">Add a section</label>
              <input
                className="dir-input"
                value={newSectionName}
                onChange={e => setNewSectionName(e.target.value)}
                placeholder="e.g. Saxophone 3, Auxiliary Percussion"
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSection(); } }}
              />
            </div>
            <button type="button" className="dir-btn dir-btn-ghost" onClick={addSection} disabled={!newSectionName.trim()}>
              <Plus size={15} /> Add
            </button>
          </div>

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
