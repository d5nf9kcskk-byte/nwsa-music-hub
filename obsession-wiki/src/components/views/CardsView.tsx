import { useState, useMemo } from 'react';
import { X } from 'lucide-react';
import { Search } from 'lucide-react';
import type { GentryCard, Expansion, GentryType } from '../../types';
import { ExpansionBadge } from '../ExpansionBadge';
import { FavorIcon } from '../icons/FavorIcon';

interface Props {
  cards: GentryCard[];
}

const EXPANSION_FILTERS: { id: Expansion | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'base', label: 'Base' },
  { id: 'wessex', label: 'Wessex' },
  { id: 'upstairs-downstairs', label: 'U/D' },
  { id: 'characters', label: 'Characters' },
  { id: 'useful-box', label: 'Useful Box' },
];

const TYPE_FILTERS: { id: GentryType | 'all'; label: string }[] = [
  { id: 'all', label: 'All Types' },
  { id: 'fairchild', label: '⚜ Fairchild' },
  { id: 'family', label: '👑 Family' },
  { id: 'prestige', label: '★★ Prestige' },
  { id: 'casual', label: '★ Casual' },
  { id: 'starter', label: 'Starter' },
];

const GENDER_EMOJI = { male: '♂', female: '♀' };

export function CardsView({ cards }: Props) {
  const [expansion, setExpansion] = useState<Expansion | 'all'>('all');
  const [type, setType] = useState<GentryType | 'all'>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<GentryCard | null>(null);

  const filtered = useMemo(() => {
    return cards.filter(c => {
      if (expansion !== 'all' && c.expansion !== expansion) return false;
      if (type !== 'all' && c.type !== type) return false;
      if (search) {
        const q = search.toLowerCase();
        return c.name.toLowerCase().includes(q) ||
          c.flavorText?.toLowerCase().includes(q) ||
          c.favors.some(f => f.description.toLowerCase().includes(q));
      }
      return true;
    });
  }, [cards, expansion, type, search]);

  return (
    <div>
      <div className="section-header">
        <h1>Gentry Cards</h1>
        <p>{filtered.length} of {cards.length} cards shown · Click a card for full details</p>
      </div>

      <div className="filter-bar">
        <div className="search-input-wrap">
          <Search size={14} className="search-input-icon" />
          <input
            className="search-input"
            placeholder="Search cards..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="filter-bar" style={{ paddingTop: 0 }}>
        {EXPANSION_FILTERS.map(f => (
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
        {TYPE_FILTERS.map(f => (
          <button
            key={f.id}
            className={`filter-chip ${type === f.id ? 'active' : ''}`}
            onClick={() => setType(f.id as GentryType | 'all')}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🃏</div>
          <h3>No cards found</h3>
          <p>Try adjusting your filters or search terms.</p>
        </div>
      ) : (
        <div className="cards-grid">
          {filtered.map(card => (
            <div
              key={card.id}
              className={`gentry-card expansion-${card.expansion}`}
              onClick={() => setSelected(card)}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && setSelected(card)}
            >
              <div className={`card-portrait ${card.gender || 'neutral'}`}>
                {card.type === 'fairchild' ? '⚜️' :
                 card.type === 'family' ? '👑' :
                 card.gender === 'male' ? '🎩' :
                 card.gender === 'female' ? '👒' : '🃏'}
              </div>
              <div className="card-name">{card.name}</div>
              <div className="card-meta">
                <span className={`type-badge ${card.type}`}>{card.type}</span>
                {card.vp !== undefined && card.vp > 0 && (
                  <span className="card-vp">🏆 {card.vp}VP</span>
                )}
              </div>
              {card.reputationRequired !== undefined && card.reputationRequired > 0 && (
                <div style={{ marginTop: 4, fontSize: '0.65rem', color: 'var(--text-dim)' }}>
                  ⭐ Rep {card.reputationRequired}+
                </div>
              )}
              <div style={{ marginTop: 6 }}>
                <ExpansionBadge expansion={card.expansion} />
              </div>
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
                  <ExpansionBadge expansion={selected.expansion} />
                  <span className={`type-badge ${selected.type}`}>{selected.type}</span>
                  {selected.gender && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {GENDER_EMOJI[selected.gender]} {selected.gender}
                    </span>
                  )}
                </div>
              </div>
              <button className="modal-close" onClick={() => setSelected(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              {selected.reputationRequired !== undefined && selected.reputationRequired > 0 && (
                <div className="modal-row">
                  <span className="modal-row-label">Rep Required</span>
                  <span className="modal-row-value" style={{ color: 'var(--reputation)' }}>
                    Level {selected.reputationRequired}+
                  </span>
                </div>
              )}
              {selected.vp !== undefined && (
                <div className="modal-row">
                  <span className="modal-row-label">Victory Points</span>
                  <span className="modal-row-value" style={{ color: 'var(--vp-color)', fontWeight: 700 }}>
                    {selected.vp} VP
                  </span>
                </div>
              )}
              <div className="modal-row">
                <span className="modal-row-label">Favours</span>
                <div className="modal-row-value">
                  <div className="favor-list">
                    {selected.favors.map((f, i) => (
                      <span key={i} className={`favor-chip ${f.type}`}>
                        <FavorIcon type={f.type} />
                        {f.description}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              {selected.flavorText && (
                <div className="flavor-text">
                  "{selected.flavorText}"
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
