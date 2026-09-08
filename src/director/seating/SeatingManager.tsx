import { useState, useMemo, useRef } from 'react';
import { Plus, Trash2, Pencil, ChevronLeft, Armchair, GripVertical, ChevronUp, ChevronDown, ArrowDownWideNarrow, Megaphone, X } from 'lucide-react';
import { useStudents } from '../hooks/useStudents';
import { useRepertoire } from '../hooks/useRepertoire';
import { useSeatingCharts } from '../hooks/useSeatingCharts';
import { useAnnouncements } from '../hooks/useAnnouncements';
import { todayStr, parseDate, pieceEnsembleIds, buildSections } from '../utils';
import { scoreOrderRank } from '../scoreOrder';
import type { SeatingChart, Student } from '../types';
import { SeatingChartCard } from '../../public/components/SeatingChartCard';
import { useModalA11y } from '../../shared/useModalA11y';
import { whenQueued } from '../writeStatus';
import { studentMatchesQuery } from '../studentSearch';

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
  const ensemblePieces = useMemo(
    () => pieces.filter(p => pieceEnsembleIds(p).includes(ensembleId)),
    [pieces, ensembleId],
  );

  if (editing) {
    return (
      <SeatingEditor
        chart={editing === 'new' ? null : editing}
        ensembleId={ensembleId}
        ensembleName={ensembleName}
        roster={roster}
        pieces={ensemblePieces}
        allPieces={pieces}
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


function SeatingEditor({ chart, ensembleId, ensembleName, roster, pieces, allPieces, onSave, onDelete, onBack }: {
  chart: SeatingChart | null;
  ensembleId: string;
  ensembleName: string;
  roster: Student[];
  /** The ensemble's own repertoire — the DEFAULT list in the piece picker. */
  pieces: { id: string; title: string }[];
  /** Every piece in the library, reachable by searching (#seating-sections):
   *  a chart is often made for a piece that isn't on this ensemble's list yet. */
  allPieces: { id: string; title: string }[];
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
  // The chair number is TYPEABLE (#seating-sections): while a box is focused
  // its own text is held here so a half-typed "1" of "12" doesn't reshuffle
  // the section on every keystroke. Committed on blur / Enter, dropped on Esc.
  const [seatNumDraft, setSeatNumDraft] = useState<{ si: number; idx: number; value: string } | null>(null);
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

  /** Move a SEAT to an explicit chair number (#seating-sections). Typing 5 in
   *  the box beside a name puts that player in chair 5 and shuffles the rest
   *  up or down — the fastest way to enter an audition result, since the
   *  director already has the numbers on paper. Out-of-range numbers clamp
   *  rather than dropping anyone. */
  function moveSeatToIndex(si: number, from: number, to: number) {
    setSections(prev => {
      const seats = prev[si]?.seats;
      if (!seats) return prev;
      const dest = Math.max(0, Math.min(seats.length - 1, to));
      if (dest === from || from < 0 || from >= seats.length) return prev;
      const next = prev.map((s, i) => i === si ? { ...s, seats: [...s.seats] } : s);
      const [moved] = next[si].seats.splice(from, 1);
      next[si].seats.splice(dest, 0, moved);
      return next;
    });
  }

  /** Reorder the SECTIONS themselves (#seating-sections). A section added by
   *  hand — "Violin 2" after the fact — landed at the bottom with no way to
   *  lift it, so the published chart read Violin 1, Viola, Cello, Violin 2. */
  function moveSection(si: number, dir: -1 | 1) {
    setSections(prev => {
      const j = si + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[si], next[j]] = [next[j], next[si]];
      return next;
    });
  }
  /** One press to put every section back in full-score order (the same ranking
   *  buildSections() uses, so a hand-added "Violin 2" lands right after
   *  "Violin 1"). Seats inside each section are untouched. */
  function sortSectionsIntoScoreOrder() {
    setSections(prev => [...prev].sort((a, b) =>
      scoreOrderRank(a.section) - scoreOrderRank(b.section) || a.section.localeCompare(b.section)));
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

  // Piece picker (#seating-sections): the ensemble's own repertoire is the
  // DEFAULT list, but a chart is often made for a piece that lives on another
  // group's list (a combined concert, a piece not filed here yet), so typing
  // searches the WHOLE library. Selecting is still one id on the chart.
  const [pieceQuery, setPieceQuery] = useState('');
  const [pieceOpen, setPieceOpen] = useState(false);
  const selectedPieceTitle = useMemo(
    () => allPieces.find(p => p.id === pieceId)?.title ?? '',
    [allPieces, pieceId],
  );
  const pieceResults = useMemo(() => {
    const q = pieceQuery.trim().toLowerCase();
    if (!q) return pieces.slice(0, 12);
    return allPieces.filter(p => p.title.toLowerCase().includes(q)).slice(0, 12);
  }, [pieceQuery, pieces, allPieces]);

  // Post an announcement to THIS ensemble without leaving the chart
  // (#seating-sections). Publishing seating and telling the group about it are
  // one action in the director's head; they were two screens in the app.
  const { addAnnouncement } = useAnnouncements();
  const [annOpen, setAnnOpen] = useState(false);
  const [annTitle, setAnnTitle] = useState('');
  const [annBody, setAnnBody] = useState('');
  const [annPinned, setAnnPinned] = useState(false);
  const [annPosting, setAnnPosting] = useState(false);
  const [annPosted, setAnnPosted] = useState(false);
  const [annErr, setAnnErr] = useState('');

  function openAnnouncement() {
    setAnnTitle(title.trim() ? title.trim() + ' \u2014 seating posted' : ensembleName + ' seating posted');
    setAnnBody('');
    setAnnPosted(false);
    setAnnErr('');
    setAnnOpen(true);
  }

  async function postAnnouncement() {
    if (!annTitle.trim()) { setAnnErr('Give the announcement a title.'); return; }
    setAnnPosting(true); setAnnErr('');
    try {
      await whenQueued(addAnnouncement({
        ensembleId,                     // scoped to this group, never school-wide
        title: annTitle.trim(),
        body: annBody.trim() || undefined,
        priority: 'info',
        pinned: annPinned || undefined,
        createdAt: Date.now(),
      }));
      setAnnPosted(true);
      setAnnOpen(false);
    } catch (e) {
      setAnnErr(e instanceof Error ? e.message : 'Could not post.');
    } finally {
      setAnnPosting(false);
    }
  }

  async function save() {
    if (!title.trim()) { setErr('Give the chart a title.'); return; }
    setSaving(true); setErr('');
    try {
      await whenQueued(onSave({
        ensembleId,
        title: title.trim(),
        pieceId: pieceId || undefined,
        date: date || undefined,
        sections: sections.filter(s => s.seats.length > 0),
        createdAt: chart?.createdAt ?? Date.now(),
      }));
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
            <div className="dir-field dir-seat-piece">
              <label className="dir-label">For piece (optional)</label>
              {pieceId && !pieceOpen ? (
                <div className="dir-seat-piece-chosen">
                  <span className="dir-seat-piece-title">{selectedPieceTitle || pieceId}</span>
                  <button type="button" className="dir-icon-btn" onClick={() => { setPieceId(''); setPieceQuery(''); }} aria-label="Clear piece"><X size={14} /></button>
                </div>
              ) : (
                <input
                  className="dir-input"
                  value={pieceQuery}
                  onChange={e => { setPieceQuery(e.target.value); setPieceOpen(true); }}
                  onFocus={() => setPieceOpen(true)}
                  placeholder="Any / general — or search every piece…"
                />
              )}
              {pieceOpen && (
                <div className="dir-add-sub-list dir-seat-piece-list">
                  {!pieceQuery.trim() && (
                    <div className="dir-field-hint" style={{ padding: '2px 4px 4px' }}>
                      {pieces.length > 0 ? 'On this ensemble\u2019s list \u2014 type to search every piece.' : 'Type to search every piece in the library.'}
                    </div>
                  )}
                  {pieceResults.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      className="dir-ens-row dir-sc-pick"
                      onClick={() => { setPieceId(p.id); setPieceOpen(false); setPieceQuery(''); }}
                    >
                      <div className="dir-ens-info"><div className="dir-ens-name">{p.title}</div></div>
                      <Plus size={15} />
                    </button>
                  ))}
                  {pieceResults.length === 0 && <div className="dir-empty-inline">No piece matches that.</div>}
                  <button type="button" className="dir-btn dir-btn-ghost dir-sc-small" style={{ marginTop: 6 }} onClick={() => { setPieceOpen(false); setPieceQuery(''); }}>Done</button>
                </div>
              )}
            </div>
            <div className="dir-field" style={{ flex: '0 0 130px' }}>
              <label className="dir-label">Date</label>
              <input className="dir-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
          </div>

          <div className="dir-field-hint">Seat 1 = principal. Drag ≡ to set the order after a playing exam, or type a chair number over the one beside a name.</div>
          {sections.length > 1 && (
            <div className="dir-seat-section-tools">
              <span className="dir-field-hint" style={{ margin: 0 }}>Use ↑ ↓ beside a section name to reorder the sections.</span>
              <button type="button" className="dir-tool-btn" onClick={sortSectionsIntoScoreOrder}>
                <ArrowDownWideNarrow size={13} /> Score order
              </button>
            </div>
          )}

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
                    onClick={() => moveSection(si, -1)}
                    disabled={si === 0}
                    aria-label={`Move ${sec.section || 'section'} up`}
                  >
                    <ChevronUp size={15} />
                  </button>
                  <button
                    type="button"
                    className="dir-icon-btn"
                    onClick={() => moveSection(si, 1)}
                    disabled={si === sections.length - 1}
                    aria-label={`Move ${sec.section || 'section'} down`}
                  >
                    <ChevronDown size={15} />
                  </button>
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
                      <input
                        className="dir-seat-num dir-seat-num-input"
                        type="text"
                        inputMode="numeric"
                        value={seatNumDraft?.si === si && seatNumDraft.idx === seatIdx ? seatNumDraft.value : String(seatIdx + 1)}
                        aria-label={`Chair number for ${nameById[seat.studentId] ?? seat.studentId}`}
                        onFocus={e => { setSeatNumDraft({ si, idx: seatIdx, value: String(seatIdx + 1) }); e.currentTarget.select(); }}
                        onChange={e => setSeatNumDraft({ si, idx: seatIdx, value: e.target.value.replace(/[^0-9]/g, '') })}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
                          if (e.key === 'Escape') { setSeatNumDraft(null); e.currentTarget.blur(); }
                        }}
                        onBlur={() => {
                          const draft = seatNumDraft;
                          setSeatNumDraft(null);
                          if (!draft || draft.si !== si || draft.idx !== seatIdx) return;
                          const n = parseInt(draft.value, 10);
                          if (Number.isNaN(n)) return;
                          moveSeatToIndex(si, seatIdx, n - 1);
                        }}
                      />
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
                      {unseated.filter(s => studentMatchesQuery(s, seatQuery)).slice(0, 8).map(s => (
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

          <div className="dir-seat-announce">
            {annOpen ? (
              <>
                <div className="dir-field">
                  <label className="dir-label">Announcement to {ensembleName}</label>
                  <input className="dir-input" value={annTitle} onChange={e => setAnnTitle(e.target.value)} placeholder="Title" />
                </div>
                <div className="dir-field">
                  <textarea className="dir-input" rows={3} value={annBody} onChange={e => setAnnBody(e.target.value)} placeholder="Anything they should know (optional)" />
                </div>
                <label className="dir-check-row">
                  <input type="checkbox" checked={annPinned} onChange={e => setAnnPinned(e.target.checked)} />
                  Pin to the top of their page
                </label>
                {annErr && <div className="dir-sc-error">{annErr}</div>}
                <div className="dir-seat-announce-actions">
                  <button type="button" className="dir-btn dir-btn-ghost dir-sc-small" onClick={() => setAnnOpen(false)}>Cancel</button>
                  <button type="button" className="dir-btn dir-btn-primary dir-sc-small" onClick={postAnnouncement} disabled={annPosting}>
                    {annPosting ? 'Posting\u2026' : 'Post announcement'}
                  </button>
                </div>
              </>
            ) : (
              <button type="button" className="dir-tool-btn" onClick={openAnnouncement}>
                <Megaphone size={13} /> {annPosted ? 'Post another announcement to ' + ensembleName : 'Announce this to ' + ensembleName}
              </button>
            )}
            {annPosted && !annOpen && <div className="dir-field-hint">Posted to {ensembleName}.</div>}
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
