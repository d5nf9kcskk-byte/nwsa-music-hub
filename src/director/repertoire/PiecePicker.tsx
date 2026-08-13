import { useState, useMemo, useRef } from 'react';
import { Search, Plus, Check, ChevronUp, ChevronDown, X, ListMusic, GripVertical } from 'lucide-react';
import { useRepertoire } from '../hooks/useRepertoire';
import { pieceEnsembleIds } from '../utils';
import type { Ensemble } from '../types';

interface Props {
  /** Ensemble(s) on this event — their pieces list first; search covers the full library. */
  ensembleIds: string[];
  ensembles: Ensemble[];
  /** Selected piece IDs, in program order. */
  value: string[];
  onChange: (ids: string[]) => void;
  /**
   * Per-piece movement selection for THIS concert. Key = pieceId, value =
   * indices into that piece's movements[]. A piece absent from the map performs
   * every movement. Optional: when omitted, the movement UI is hidden.
   */
  movementSel?: Record<string, number[]>;
  onMovementSelChange?: (sel: Record<string, number[]>) => void;
}

export function PiecePicker({ ensembleIds, ensembles, value, onChange, movementSel, onMovementSelChange }: Props) {
  const { pieces, addPiece } = useRepertoire();
  const [search, setSearch] = useState('');
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [qaTitle, setQaTitle] = useState('');
  const [qaComposer, setQaComposer] = useState('');
  const [qaSaving, setQaSaving] = useState(false);
  // Which selected piece has its movement-picker expanded (by piece id).
  const [openMovements, setOpenMovements] = useState<string | null>(null);
  const movementsEnabled = !!onMovementSelChange;
  // Drag-to-reorder (#program-order): grip handle on each selected row.
  // While a drag is live the pending order is kept locally and only committed
  // to the form on release. `from` is the item's index in `value`; `to` is its
  // current index in the displayed (pending) order.
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const selListRef = useRef<HTMLDivElement | null>(null);

  const ensembleMap = useMemo(
    () => Object.fromEntries(ensembles.map(e => [e.id, e])),
    [ensembles],
  );
  const piecesById = useMemo(
    () => Object.fromEntries(pieces.map(p => [p.id, p])),
    [pieces],
  );

  const primaryIds = useMemo(() => new Set(ensembleIds), [ensembleIds]);

  // Browse: this event's ensemble pieces first. Search: every library piece
  // (so Camerata can pull Nutcracker for a strings sectional), still sorted
  // with this ensemble's pieces on top.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const primary = (p: (typeof pieces)[number]) =>
      primaryIds.size === 0 || pieceEnsembleIds(p).some(id => primaryIds.has(id));
    const matchesQuery = (p: (typeof pieces)[number]) =>
      !q
      || p.title.toLowerCase().includes(q)
      || (p.composer ?? '').toLowerCase().includes(q);

    const pool = !q && primaryIds.size > 0
      ? pieces.filter(primary)
      : pieces.filter(matchesQuery);

    return [...pool].sort((a, b) => {
      const ap = primary(a) ? 0 : 1;
      const bp = primary(b) ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return (a.order ?? 0) - (b.order ?? 0) || a.title.localeCompare(b.title);
    });
  }, [pieces, search, primaryIds]);

  const isPrimary = (p: (typeof pieces)[number]) =>
    primaryIds.size === 0 || pieceEnsembleIds(p).some(id => primaryIds.has(id));


  // Selected pieces resolved in program order — with any live drag applied —
  // (skip any that were deleted).
  const selected = pendingOrder().map(id => piecesById[id]).filter(Boolean);

  function toggle(id: string) {
    const removing = value.includes(id);
    onChange(removing ? value.filter(x => x !== id) : [...value, id]);
    // Dropping a piece from the concert also drops its movement selection so no
    // orphaned entry lingers on the event.
    if (removing && movementSel && movementSel[id] && onMovementSelChange) {
      const next = { ...movementSel };
      delete next[id];
      onMovementSelChange(next);
    }
  }

  /** Set which movements of `pieceId` this concert performs. An empty or
   *  full selection is normalized to "all" by dropping the key entirely. */
  function setPieceMovements(pieceId: string, indices: number[], total: number) {
    if (!onMovementSelChange) return;
    const next = { ...(movementSel ?? {}) };
    const sorted = [...new Set(indices)].sort((a, b) => a - b);
    if (sorted.length === 0 || sorted.length >= total) delete next[pieceId];
    else next[pieceId] = sorted;
    onMovementSelChange(next);
  }

  function toggleMovement(pieceId: string, index: number, total: number) {
    // Current effective selection: an explicit subset, else "all".
    const current = movementSel?.[pieceId] ?? Array.from({ length: total }, (_, i) => i);
    const nextSet = new Set(current);
    if (nextSet.has(index)) nextSet.delete(index);
    else nextSet.add(index);
    setPieceMovements(pieceId, [...nextSet], total);
  }

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }

  /** Selected ids in displayed order: the saved order with any live drag applied. */
  function pendingOrder(): string[] {
    if (!drag || drag.from === drag.to) return value;
    const next = [...value];
    const [moved] = next.splice(drag.from, 1);
    next.splice(drag.to, 0, moved);
    return next;
  }

  function onGripDown(e: React.PointerEvent<HTMLButtonElement>, displayIndex: number) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ from: displayIndex, to: displayIndex });
  }

  function onGripMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (!drag) return;
    const rows = Array.from(
      selListRef.current?.querySelectorAll<HTMLElement>('[data-sel-row]') ?? [],
    );
    // Rows render in pending order; drop before the first row whose midpoint
    // is below the pointer (else at the end).
    let to = rows.length - 1;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i].getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) { to = i; break; }
    }
    if (to !== drag.to) setDrag(d => (d ? { ...d, to } : d));
  }

  function onGripUp() {
    if (!drag) return;
    if (drag.from !== drag.to) onChange(pendingOrder());
    setDrag(null);
  }

  async function handleQuickAdd() {
    if (!qaTitle.trim()) return;
    // A piece quick-added from a concert belongs to all of that concert's
    // ensembles (e.g. 1812 Overture on Wind + Symphony + Choir).
    const ensIds = ensembleIds.length ? ensembleIds : (ensembles[0] ? [ensembles[0].id] : []);
    if (ensIds.length === 0) return;
    setQaSaving(true);
    const nextOrder = pieces.filter(p => pieceEnsembleIds(p).includes(ensIds[0])).reduce((m, p) => Math.max(m, p.order ?? 0), 0) + 1;
    const newId = await addPiece({
      ensembleId: ensIds[0],
      ensembleIds: ensIds,
      title: qaTitle.trim(),
      composer: qaComposer.trim() || undefined,
      order: nextOrder,
    });
    if (newId) onChange([...value, newId]);
    setQaTitle('');
    setQaComposer('');
    setShowQuickAdd(false);
    setQaSaving(false);
  }

  return (
    <div className="dir-piece-picker">
      {/* Selected pieces, in program order */}
      {selected.length > 0 && (
        <div className="dir-piece-selected" ref={selListRef}>
          <div className="dir-piece-selected-head">
            {selected.length > 1 ? 'Program order' : 'Selected'}
            <span className="dir-piece-selected-count">{selected.length}</span>
            {selected.length > 1 && <span className="dir-piece-selected-hint">drag ≡ to reorder</span>}
          </div>
          {selected.map((p, i) => {
            const movements = p.movements ?? [];
            const hasMovements = movementsEnabled && movements.length > 0;
            const sel = movementSel?.[p.id];
            const isSubset = !!sel && sel.length > 0 && sel.length < movements.length;
            const chosenCount = isSubset ? sel!.length : movements.length;
            const open = openMovements === p.id;
            return (
              <div key={p.id} data-sel-row className={`dir-piece-sel-item${drag && drag.to === i ? ' dragging' : ''}`}>
                <div className="dir-piece-sel-row">
                  {selected.length > 1 && (
                    <button
                      type="button"
                      className="dir-piece-grip"
                      aria-label={`Reorder ${p.title} — drag, or use arrow keys`}
                      onPointerDown={e => onGripDown(e, i)}
                      onPointerMove={onGripMove}
                      onPointerUp={onGripUp}
                      onPointerCancel={() => setDrag(null)}
                      onKeyDown={e => {
                        if (e.key === 'ArrowUp') { e.preventDefault(); move(i, -1); }
                        if (e.key === 'ArrowDown') { e.preventDefault(); move(i, 1); }
                      }}
                    >
                      <GripVertical size={16} />
                    </button>
                  )}
                  <span className="dir-piece-sel-num">{i + 1}</span>
                  <span className="dir-piece-sel-info">
                    <span className="dir-piece-title">{p.title}</span>
                    {p.composer && <span className="dir-piece-composer">{p.composer}</span>}
                    {hasMovements && (
                      <button
                        type="button"
                        className={`dir-piece-mvt-toggle${isSubset ? ' subset' : ''}`}
                        onClick={() => setOpenMovements(open ? null : p.id)}
                        aria-expanded={open}
                      >
                        <ListMusic size={11} />
                        {isSubset
                          ? `${chosenCount} of ${movements.length} movements`
                          : `All ${movements.length} movements`}
                        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>
                    )}
                  </span>
                  <button
                    type="button"
                    className="dir-piece-remove"
                    onClick={() => toggle(p.id)}
                    aria-label="Remove"
                  >
                    <X size={15} />
                  </button>
                </div>
                {hasMovements && open && (
                  <div className="dir-piece-mvt-panel">
                    <div className="dir-piece-mvt-hint">
                      Which movements does this concert perform? Uncheck the ones you're not doing.
                    </div>
                    <label className="dir-piece-mvt-all">
                      <input
                        type="checkbox"
                        checked={!isSubset}
                        onChange={() => setPieceMovements(p.id, [], movements.length)}
                      />
                      <span>All movements</span>
                    </label>
                    {movements.map((m, mi) => {
                      const checked = isSubset ? sel!.includes(mi) : true;
                      return (
                        <label key={mi} className="dir-piece-mvt-row">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleMovement(p.id, mi, movements.length)}
                          />
                          <span className="dir-piece-mvt-name">{mi + 1}. {m.title || `Movement ${mi + 1}`}</span>
                          {m.duration ? <span className="dir-piece-mvt-dur">{m.duration}′</span> : null}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Search + quick add */}
      <div className="dir-piece-search-row">
        <div className="dir-piece-search">
          <Search size={13} className="dir-piece-search-icon" />
          <input
            className="dir-piece-search-input"
            placeholder={ensembleIds.length
              ? 'Search this ensemble, or any orchestra piece…'
              : 'Search pieces to add…'}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button
          className="dir-piece-add-btn"
          onClick={() => setShowQuickAdd(s => !s)}
          type="button"
          title="Quick-add a piece"
        >
          <Plus size={15} />
        </button>
      </div>

      {showQuickAdd && (
        <div className="dir-piece-quickadd">
          <input
            className="dir-input"
            placeholder="Title *"
            value={qaTitle}
            onChange={e => setQaTitle(e.target.value)}
            autoFocus
          />
          <input
            className="dir-input"
            placeholder="Composer (optional)"
            value={qaComposer}
            onChange={e => setQaComposer(e.target.value)}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="dir-btn dir-btn-primary"
              style={{ flex: 1 }}
              onClick={handleQuickAdd}
              disabled={qaSaving || !qaTitle.trim()}
              type="button"
            >
              {qaSaving ? 'Adding…' : 'Add & select'}
            </button>
            <button
              className="dir-btn dir-btn-ghost"
              onClick={() => { setShowQuickAdd(false); setQaTitle(''); setQaComposer(''); }}
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="dir-piece-list">
        {filtered.length === 0 ? (
          <div className="dir-empty-inline">
            {search ? `No pieces match "${search}".` : 'No pieces yet — use + to quick-add.'}
          </div>
        ) : (
          filtered.map(p => {
            const sel = value.includes(p.id);
            const fromOther = primaryIds.size > 0 && !isPrimary(p);
            return (
              <button
                key={p.id}
                className={`dir-piece-row${sel ? ' selected' : ''}`}
                onClick={() => toggle(p.id)}
                type="button"
              >
                <span className="dir-piece-check">{sel && <Check size={11} />}</span>
                <span className="dir-piece-info">
                  <span className="dir-piece-title">{p.title}</span>
                  {p.composer && <span className="dir-piece-composer">{p.composer}</span>}
                </span>
                {(ensembleIds.length === 0 || fromOther) && (
                  <span className="dir-piece-ens">{pieceEnsembleIds(p).map(id => ensembleMap[id]?.name).filter(Boolean).join(', ')}</span>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
