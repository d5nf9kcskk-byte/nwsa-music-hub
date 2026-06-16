import { useState } from 'react';
import { Package } from 'lucide-react';
import type { Expansion, SortManifest } from '../../types';

interface Props {
  manifests: SortManifest[];
}

const EXPANSION_ORDER: Expansion[] = ['base', 'wessex', 'upstairs-downstairs', 'characters', 'useful-box', 'promo'];

const EXPANSION_LABEL: Record<Expansion, string> = {
  base: 'Base Game',
  wessex: 'Wessex Expansion',
  'upstairs-downstairs': 'Upstairs, Downstairs',
  characters: 'Characters Expansion',
  'useful-box': 'Useful Box',
  promo: 'Promo Tiles (2019 KS)',
};

const CATEGORY_LABELS: Record<string, string> = {
  essential: '🏠 Essential',
  service: '🔔 Service',
  estate: '🌳 Estate',
  prestige: '👑 Prestige',
  sporting: '🏇 Sporting',
  monument: '🏛️ Monument',
};

const GENTRY_LABELS: Record<string, string> = {
  family: '👑 Family Cards',
  fairchild: '⚜️ Fairchild Cards',
  starter: '🌱 Starter Guests',
  casual: '⭐ Casual Guests',
  prestige: '★★ Prestige Guests',
};

export function SortHelperView({ manifests }: Props) {
  const [selected, setSelected] = useState<Set<Expansion>>(new Set(['base']));
  const [activeManifest, setActiveManifest] = useState<Expansion | null>(null);

  const toggleExpansion = (exp: Expansion) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (exp === 'base') return next; // base can't be deselected
      if (next.has(exp)) next.delete(exp);
      else next.add(exp);
      return next;
    });
  };

  const selectedManifests = manifests.filter(m => selected.has(m.expansion));

  const totalGentry = selectedManifests.reduce((acc, m) =>
    acc + m.gentry.reduce((s, g) => s + g.count, 0), 0
  );
  const totalTiles = selectedManifests.reduce((acc, m) =>
    acc + m.tiles.reduce((s, t) => s + t.count, 0), 0
  );
  const allFamilies = selectedManifests.flatMap(m => m.families);
  const allServants = [...new Set(selectedManifests.flatMap(m => m.servants))];

  return (
    <div>
      <div className="section-header">
        <h1>Sort Helper</h1>
        <p>Select the expansions you own to see exactly which components to include in your game setup.</p>
      </div>

      {/* Selection */}
      <div className="section-label">Select Your Expansions</div>
      {EXPANSION_ORDER.map(exp => {
        const manifest = manifests.find(m => m.expansion === exp);
        if (!manifest) return null;
        const isChecked = selected.has(exp);
        const isBase = exp === 'base';
        return (
          <div
            key={exp}
            className="sort-expansion-row"
            onClick={() => !isBase && toggleExpansion(exp)}
            style={{ cursor: isBase ? 'default' : 'pointer' }}
          >
            <div className={`sort-checkbox ${isChecked ? 'checked' : ''}`} />
            <div className="sort-color-dot" style={{ background: manifest.color }} />
            <div className="sort-label">
              {EXPANSION_LABEL[exp]}
              {isBase && <span style={{ marginLeft: 8, fontSize: '0.65rem', color: 'var(--text-muted)' }}>(always required)</span>}
            </div>
          </div>
        );
      })}

      {/* Summary */}
      <div style={{ padding: '12px 18px' }}>
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border-gold)',
          borderRadius: 'var(--radius)',
          padding: '14px 16px',
          display: 'flex',
          gap: 16,
          flexWrap: 'wrap',
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--gold)', fontFamily: "'Playfair Display', serif" }}>
              {totalGentry}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Gentry Cards</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--gold)', fontFamily: "'Playfair Display', serif" }}>
              {totalTiles}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Tiles</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--gold)', fontFamily: "'Playfair Display', serif" }}>
              {allFamilies.length}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Families</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--gold)', fontFamily: "'Playfair Display', serif" }}>
              {allServants.length}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Servant Types</div>
          </div>
        </div>
      </div>

      {/* Per-expansion breakdown tabs */}
      {selectedManifests.length > 0 && (
        <>
          <div className="tab-bar" style={{ paddingTop: 0 }}>
            <button
              className={`tab-btn ${activeManifest === null ? 'active' : ''}`}
              onClick={() => setActiveManifest(null)}
            >
              All Components
            </button>
            {selectedManifests.map(m => (
              <button
                key={m.expansion}
                className={`tab-btn ${activeManifest === m.expansion ? 'active' : ''}`}
                onClick={() => setActiveManifest(m.expansion)}
              >
                {m.label}
              </button>
            ))}
          </div>

          {(activeManifest === null ? selectedManifests : selectedManifests.filter(m => m.expansion === activeManifest)).map(manifest => (
            <div key={manifest.expansion}>
              <div className="section-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: manifest.color, flexShrink: 0 }} />
                {manifest.label}
              </div>

              {/* Families */}
              {manifest.families.length > 0 && (
                <div className="component-section">
                  <div className="component-section-header">
                    <Package size={12} /> Family Boards ({manifest.families.length})
                  </div>
                  {manifest.families.map(family => (
                    <div key={family} className="component-row">
                      <span className="component-count">1×</span>
                      <span className="component-name">{family} Family Board</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Gentry */}
              {manifest.gentry.length > 0 && (
                <div className="component-section">
                  <div className="component-section-header">
                    <Package size={12} /> Gentry Cards ({manifest.gentry.reduce((s, g) => s + g.count, 0)} total)
                  </div>
                  {manifest.gentry.map(g => (
                    <div key={g.type} className="component-row">
                      <span className="component-count">{g.count}×</span>
                      <div style={{ flex: 1 }}>
                        <span className="component-name">{GENTRY_LABELS[g.type] ?? g.type}</span>
                        {g.notes && <div className="component-note">{g.notes}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Tiles */}
              {manifest.tiles.length > 0 && (
                <div className="component-section">
                  <div className="component-section-header">
                    <Package size={12} /> Improvement Tiles ({manifest.tiles.reduce((s, t) => s + t.count, 0)} total)
                  </div>
                  {manifest.tiles.map(t => (
                    <div key={t.category} className="component-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                      <div style={{ display: 'flex', gap: 10, width: '100%', alignItems: 'center' }}>
                        <span className="component-count">{t.count}×</span>
                        <span className="component-name">{CATEGORY_LABELS[t.category] ?? t.category}</span>
                      </div>
                      {t.names.length > 0 && (
                        <div style={{ paddingLeft: 40, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          {t.names.join(' · ')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Servants */}
              {manifest.servants.length > 0 && (
                <div className="component-section">
                  <div className="component-section-header">
                    <Package size={12} /> New Servant Types
                  </div>
                  {manifest.servants.map(s => (
                    <div key={s} className="component-row">
                      <span className="component-count">1×</span>
                      <span className="component-name capitalize">{s.charAt(0).toUpperCase() + s.slice(1).replace(/([a-z])([A-Z])/g, '$1 $2')}</span>
                      <span className="component-note">tokens + board space</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Special */}
              {manifest.specialComponents.length > 0 && (
                <div className="component-section">
                  <div className="component-section-header">
                    <Package size={12} /> Additional Components
                  </div>
                  {manifest.specialComponents.map((c, i) => (
                    <div key={i} className="component-row">
                      <span className="component-name">{c}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
