import { useState } from 'react';
import type { Family } from '../../types';
import { ExpansionBadge } from '../ExpansionBadge';

interface Props {
  families: Family[];
}

export function FamiliesView({ families }: Props) {
  const [compare, setCompare] = useState(false);

  return (
    <div>
      <div className="section-header">
        <h1>Families</h1>
        <p>Six families compete for prominence in Derbyshire. Each begins with a unique advantage that shapes your strategy.</p>
      </div>

      <div style={{ padding: '0 18px 12px', display: 'flex', gap: 8 }}>
        <button
          className={`filter-chip ${!compare ? 'active' : ''}`}
          onClick={() => setCompare(false)}
        >
          Cards
        </button>
        <button
          className={`filter-chip ${compare ? 'active' : ''}`}
          onClick={() => setCompare(true)}
        >
          Compare All
        </button>
      </div>

      {compare ? (
        <div style={{ padding: '0 18px 18px', overflowX: 'auto' }}>
          <table className="compare-table">
            <thead>
              <tr>
                <th>Family</th>
                <th>Expansion</th>
                <th>Start Rep</th>
                <th>Start £</th>
                <th>Special Bonus</th>
              </tr>
            </thead>
            <tbody>
              {families.map(f => (
                <tr key={f.id}>
                  <td style={{ fontFamily: "'Playfair Display', serif", color: 'var(--gold-l)', fontWeight: 600 }}>
                    {f.name}
                  </td>
                  <td><ExpansionBadge expansion={f.expansion} /></td>
                  <td style={{ color: 'var(--reputation)' }}>{f.startingReputation}</td>
                  <td style={{ color: 'var(--money)' }}>£{f.startingMoney}</td>
                  <td style={{ fontSize: '0.75rem' }}>{f.specialBonus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        families.map(family => (
          <div
            key={family.id}
            className="family-card"
            style={{ '--fam-color': family.color } as React.CSSProperties}
          >
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: family.color, opacity: 0.8 }} />
            <div className="family-header">
              <div
                className="family-crest"
                style={{ background: `linear-gradient(135deg, ${family.color}, #000)` }}
              >
                {family.name[0]}
              </div>
              <div className="family-title">
                <div className="family-name">
                  The {family.name} Family
                </div>
                <div className="family-sub">
                  <ExpansionBadge expansion={family.expansion} />
                </div>
              </div>
            </div>

            <div className="family-stats">
              <div className="family-stat">
                <span className="family-stat-label">Start Rep</span>
                <span className="family-stat-value" style={{ color: 'var(--reputation)' }}>
                  {family.startingReputation}
                </span>
              </div>
              <div className="family-stat">
                <span className="family-stat-label">Start £</span>
                <span className="family-stat-value" style={{ color: 'var(--money)' }}>
                  £{family.startingMoney}
                </span>
              </div>
              {family.extraServants && family.extraServants.length > 0 && (
                <div className="family-stat">
                  <span className="family-stat-label">Extra</span>
                  <span className="family-stat-value">
                    {family.extraServants.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(', ')}
                  </span>
                </div>
              )}
            </div>

            <div className="family-bonus">
              ⭐ <strong>Special Advantage:</strong> {family.specialBonus}
            </div>

            <div className="family-desc">{family.description}</div>
          </div>
        ))
      )}
    </div>
  );
}
