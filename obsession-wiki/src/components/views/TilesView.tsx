import { useState, useMemo } from 'react';
import { X, Search } from 'lucide-react';
import type { ImprovementTile, TileCategory, Expansion } from '../../types';
import { ExpansionBadge } from '../ExpansionBadge';
import { CategoryIcon } from '../icons/CategoryIcon';
import { ServantIcon } from '../icons/ServantIcon';

interface Props {
  tiles: ImprovementTile[];
}

const CATEGORY_FILTERS: { id: TileCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'essential', label: '🏠 Essential' },
  { id: 'service', label: '🔔 Service' },
  { id: 'estate', label: '🌳 Estate' },
  { id: 'prestige', label: '👑 Prestige' },
  { id: 'sporting', label: '🏇 Sporting' },
  { id: 'monument', label: '🏛️ Monument' },
];

const EXP_FILTERS: { id: Expansion | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'base', label: 'Base' },
  { id: 'wessex', label: 'Wessex' },
  { id: 'upstairs-downstairs', label: 'U/D' },
  { id: 'characters', label: 'Characters' },
  { id: 'useful-box', label: 'Useful Box' },
];

const SORT_OPTIONS = [
  { id: 'name', label: 'Name' },
  { id: 'cost', label: 'Cost' },
  { id: 'vp', label: 'VP' },
  { id: 'rep', label: 'Min Rep' },
];

export function TilesView({ tiles }: Props) {
  const [category, setCategory] = useState<TileCategory | 'all'>('all');
  const [expansion, setExpansion] = useState<Expansion | 'all'>('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [selected, setSelected] = useState<ImprovementTile | null>(null);

  const filtered = useMemo(() => {
    let result = tiles.filter(t => {
      if (category !== 'all' && t.category !== category) return false;
      if (expansion !== 'all' && t.expansion !== expansion) return false;
      if (search) {
        const q = search.toLowerCase();
        return t.name.toLowerCase().includes(q) ||
          t.level1.favors.some(f => f.toLowerCase().includes(q)) ||
          t.notes?.toLowerCase().includes(q);
      }
      return true;
    });

    result = [...result].sort((a, b) => {
      if (sortBy === 'cost') return a.cost - b.cost;
      if (sortBy === 'vp') return b.level1.vp - a.level1.vp;
      if (sortBy === 'rep') return a.reputationRequired - b.reputationRequired;
      return a.name.localeCompare(b.name);
    });

    return result;
  }, [tiles, category, expansion, search, sortBy]);

  return (
    <div>
      <div className="section-header">
        <h1>Improvement Tiles</h1>
        <p>{filtered.length} of {tiles.length} tiles shown · Click a tile for full details</p>
      </div>

      <div className="filter-bar">
        <div className="search-input-wrap">
          <Search size={14} className="search-input-icon" />
          <input
            className="search-input"
            placeholder="Search tiles..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="filter-bar" style={{ paddingTop: 0 }}>
        {CATEGORY_FILTERS.map(f => (
          <button
            key={f.id}
            className={`filter-chip ${category === f.id ? 'active' : ''}`}
            onClick={() => setCategory(f.id as TileCategory | 'all')}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="filter-bar" style={{ paddingTop: 0 }}>
        {EXP_FILTERS.map(f => (
          <button
            key={f.id}
            className={`filter-chip ${expansion === f.id ? 'active' : ''}`}
            onClick={() => setExpansion(f.id as Expansion | 'all')}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="filter-bar" style={{ paddingTop: 0 }}>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginRight: 4 }}>Sort:</span>
        {SORT_OPTIONS.map(s => (
          <button
            key={s.id}
            className={`filter-chip ${sortBy === s.id ? 'active' : ''}`}
            onClick={() => setSortBy(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🏗️</div>
          <h3>No tiles found</h3>
          <p>Try adjusting your filters or search terms.</p>
        </div>
      ) : (
        <div className="cards-grid">
          {filtered.map(tile => (
            <div
              key={tile.id}
              className={`tile-card category-${tile.category}`}
              onClick={() => setSelected(tile)}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && setSelected(tile)}
            >
              <div className={`tile-category-badge ${tile.category}`}>
                <CategoryIcon category={tile.category} size={12} /> {tile.category}
              </div>
              <div className="tile-name">{tile.name}</div>
              <div className="tile-stats">
                <span className="tile-stat cost">💰 £{tile.cost}</span>
                <span className="tile-stat vp">🏆 {tile.level1.vp}VP</span>
                {tile.level2 && <span className="tile-stat vp" style={{ opacity: 0.7 }}>/L2:{tile.level2.vp}</span>}
              </div>
              <div style={{ marginTop: 4, fontSize: '0.65rem', color: 'var(--text-dim)' }}>
                ⭐ Rep {tile.reputationRequired}+
              </div>
              <div style={{ marginTop: 6 }}>
                <ExpansionBadge expansion={tile.expansion} />
              </div>
              {tile.requires.servants.length > 0 && (
                <div style={{ marginTop: 6, display: 'flex', gap: 3 }}>
                  {tile.requires.servants.map(s => (
                    <ServantIcon key={s} type={s} size={18} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {selected && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setSelected(null)}>
          <div className="modal">
            <div className="modal-header">
              <div>
                <div className="modal-title">{selected.name}</div>
                <div style={{ marginTop: 4, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span className={`tile-category-badge ${selected.category}`}>
                    <CategoryIcon category={selected.category} size={12} /> {selected.category}
                  </span>
                  <ExpansionBadge expansion={selected.expansion} />
                </div>
              </div>
              <button className="modal-close" onClick={() => setSelected(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <div className="modal-row">
                <span className="modal-row-label">Cost</span>
                <span className="modal-row-value" style={{ color: 'var(--money)', fontWeight: 700 }}>
                  £{selected.cost}
                </span>
              </div>
              <div className="modal-row">
                <span className="modal-row-label">Min. Reputation</span>
                <span className="modal-row-value" style={{ color: 'var(--reputation)' }}>
                  Level {selected.reputationRequired}+
                </span>
              </div>
              {selected.requires.servants.length > 0 && (
                <div className="modal-row">
                  <span className="modal-row-label">Servants</span>
                  <div className="modal-row-value" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    {selected.requires.servants.map(s => (
                      <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem' }}>
                        <ServantIcon type={s} size={16} />
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {selected.requires.guestCount && (
                <div className="modal-row">
                  <span className="modal-row-label">Guests</span>
                  <span className="modal-row-value">
                    {selected.requires.guestCount} guest{selected.requires.guestCount !== 1 ? 's' : ''}
                    {selected.requires.guestGender && ` (${selected.requires.guestGender})`}
                  </span>
                </div>
              )}
              {/* Level 1 */}
              <div style={{ marginTop: 12, marginBottom: 4 }}>
                <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--gold)', marginBottom: 6 }}>
                  Level 1 (Front)
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ color: 'var(--vp-color)', fontWeight: 700 }}>🏆 {selected.level1.vp} VP</span>
                </div>
                <div className="favor-list">
                  {selected.level1.favors.map((f, i) => (
                    <span key={i} className="favor-chip tile">{f}</span>
                  ))}
                </div>
              </div>
              {/* Level 2 */}
              {selected.level2 && (
                <div style={{ marginTop: 12, marginBottom: 4 }}>
                  <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--gold-l)', marginBottom: 6 }}>
                    Level 2 (Flipped)
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ color: 'var(--vp-color)', fontWeight: 700 }}>🏆 {selected.level2.vp} VP</span>
                  </div>
                  <div className="favor-list">
                    {selected.level2.favors.map((f, i) => (
                      <span key={i} className="favor-chip tile">{f}</span>
                    ))}
                  </div>
                </div>
              )}
              {selected.notes && (
                <div className="flavor-text" style={{ marginTop: 12 }}>
                  📝 {selected.notes}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
