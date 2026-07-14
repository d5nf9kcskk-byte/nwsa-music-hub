import { useState, useMemo } from 'react';
import { Search, Plus, Check, ChevronUp, ChevronDown, X } from 'lucide-react';
import { useRepertoire } from '../hooks/useRepertoire';
import { pieceEnsembleIds } from '../utils';
import type { Ensemble } from '../types';

interface Props {
  /** Filter piece suggestions to these ensembles; empty array = show all. */
  ensembleIds: string[];
  ensembles: Ensemble[];
  /** Selected piece IDs, in program order. */
  value: string[];
  onChange: (ids: string[]) => void;
}

export function PiecePicker({ ensembleIds, ensembles, value, onChange }: Props) {
  const { pieces, addPiece } = useRepertoire();
  const [search, setSearch] = useState('');
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [qaTitle, setQaTitle] = useState('');
  const [qaComposer, setQaComposer] = useState('');
  const [qaSaving, setQaSaving] = useState(false);

  const ensembleMap = useMemo(
    () => Object.fromEntries(ensembles.map(e => [e.id, e])),
    [ensembles],
  );
  const piecesById = useMemo(
    () => Object.fromEntries(pieces.map(p => [p.id, p])),
    [pieces],
  );

  const pool = ensembleIds.length
    ? pieces.filter(p => pieceEnsembleIds(p).some(id => ensembleIds.includes(id)))
    : pieces;

  const filtered = search
    ? pool.filter(p =>
        p.title.toLowerCase().includes(search.toLowerCase()) ||
        (p.composer ?? '').toLowerCase().includes(search.toLowerCase()),
      )
    : pool;

  // Selected pieces resolved in program order (skip any that were deleted).
  const selected = value.map(id => piecesById[id]).filter(Boolean);

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter(x => x !== id) : [...value, id]);
  }

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
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
        <div className="dir-piece-selected">
          <div className="dir-piece-selected-head">
            {selected.length > 1 ? 'Program order' : 'Selected'}
            <span className="dir-piece-selected-count">{selected.length}</span>
          </div>
          {selected.map((p, i) => (
            <div key={p.id} className="dir-piece-sel-row">
              <span className="dir-piece-sel-num">{i + 1}</span>
              <span className="dir-piece-sel-info">
                <span className="dir-piece-title">{p.title}</span>
                {p.composer && <span className="dir-piece-composer">{p.composer}</span>}
              </span>
              {selected.length > 1 && (
                <span className="dir-piece-sel-moves">
                  <button
                    type="button"
                    className="dir-piece-move"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label="Move up"
                  >
                    <ChevronUp size={15} />
                  </button>
                  <button
                    type="button"
                    className="dir-piece-move"
                    onClick={() => move(i, 1)}
                    disabled={i === selected.length - 1}
                    aria-label="Move down"
                  >
                    <ChevronDown size={15} />
                  </button>
                </span>
              )}
              <button
                type="button"
                className="dir-piece-remove"
                onClick={() => toggle(p.id)}
                aria-label="Remove"
              >
                <X size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Search + quick add */}
      <div className="dir-piece-search-row">
        <div className="dir-piece-search">
          <Search size={13} className="dir-piece-search-icon" />
          <input
            className="dir-piece-search-input"
            placeholder="Search pieces to add…"
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
                {ensembleIds.length === 0 && (
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
