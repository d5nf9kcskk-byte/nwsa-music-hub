import { useMemo } from 'react';
import { Search, Users, Grid3X3, UserCheck, HelpCircle, X } from 'lucide-react';
import type { SearchResult } from '../../hooks/useSearch';
import { ExpansionBadge } from '../ExpansionBadge';
import type { GentryCard, ImprovementTile } from '../../types';

interface Props {
  query: string;
  setQuery: (q: string) => void;
  results: SearchResult[];
  onClose: () => void;
}

const TYPE_ICON = {
  gentry: Users,
  tile: Grid3X3,
  servant: UserCheck,
  faq: HelpCircle,
};

const TYPE_LABEL = {
  gentry: 'Gentry Cards',
  tile: 'Improvement Tiles',
  servant: 'Servants',
  faq: 'FAQ & Rules',
};

export function SearchView({ query, setQuery, results, onClose }: Props) {
  const grouped = useMemo(() => {
    const groups: Record<string, SearchResult[]> = {};
    for (const r of results) {
      if (!groups[r.type]) groups[r.type] = [];
      groups[r.type].push(r);
    }
    return groups;
  }, [results]);

  return (
    <div>
      <div className="section-header" style={{ paddingBottom: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <h1>Search</h1>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}
          >
            <X size={20} />
          </button>
        </div>
        <p>Search across all gentry cards, tiles, servants, and FAQ entries.</p>
      </div>

      <div className="faq-search-wrap">
        <div className="search-input-wrap">
          <Search size={14} className="search-input-icon" />
          <input
            className="search-input"
            placeholder="Search the entire wiki..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
          />
        </div>
      </div>

      {!query.trim() && (
        <div className="empty-state">
          <div className="empty-state-icon">🔍</div>
          <h3>Start typing to search</h3>
          <p style={{ marginBottom: 16 }}>Try: "Butler", "Ballroom", "courtship", "market refill"</p>
          <div style={{ display: 'flex', flex: 'wrap', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            {['Butler', 'Ballroom', 'Fairchild', 'market', 'Wessex', 'courtship'].map(term => (
              <button
                key={term}
                className="filter-chip"
                onClick={() => setQuery(term)}
              >
                {term}
              </button>
            ))}
          </div>
        </div>
      )}

      {query.trim() && results.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">😕</div>
          <h3>No results found</h3>
          <p>Try different keywords or check your spelling.</p>
        </div>
      )}

      {results.length > 0 && (
        <div style={{ padding: '0 0 24px' }}>
          <div style={{ padding: '6px 18px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {results.length} result{results.length !== 1 ? 's' : ''} for "{query}"
          </div>
          {Object.entries(grouped).map(([type, items]) => {
            const Icon = TYPE_ICON[type as keyof typeof TYPE_ICON] || Search;
            return (
              <div key={type} className="search-results-section">
                <div className="search-results-section-title">
                  <Icon size={13} /> {TYPE_LABEL[type as keyof typeof TYPE_LABEL] ?? type} ({items.length})
                </div>
                {items.map(item => (
                  <div key={item.id} className="search-result-item">
                    <div className="search-result-icon">
                      <Icon size={16} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="search-result-name">{item.name}</div>
                      <div className="search-result-desc">{item.description}</div>
                      <div style={{ marginTop: 4 }}>
                        <ExpansionBadge expansion={item.expansion as any} />
                        {type === 'gentry' && (
                          <span style={{ marginLeft: 6, fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                            {(item.original as GentryCard).type} ·{' '}
                            {(item.original as GentryCard).vp ? `${(item.original as GentryCard).vp}VP` : ''}
                          </span>
                        )}
                        {type === 'tile' && (
                          <span style={{ marginLeft: 6, fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                            {(item.original as ImprovementTile).category} · £{(item.original as ImprovementTile).cost}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
