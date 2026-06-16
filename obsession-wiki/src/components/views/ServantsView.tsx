import type { ServantDef } from '../../types';
import { ExpansionBadge } from '../ExpansionBadge';
import { ServantIcon } from '../icons/ServantIcon';

interface Props {
  servants: ServantDef[];
}

export function ServantsView({ servants }: Props) {
  const base = servants.filter(s => s.expansion === 'base');
  const expansion = servants.filter(s => s.expansion !== 'base');

  return (
    <div>
      <div className="section-header">
        <h1>Servant Reference</h1>
        <p>All servant types, their roles, and substitution rules. Servants become unavailable for 2 rounds after participating in an activity.</p>
      </div>

      <div className="section-label">Base Game Servants (6)</div>

      {base.map(servant => (
        <ServantCard key={servant.type} servant={servant} />
      ))}

      <div className="section-label">Expansion Servants — Upstairs, Downstairs</div>

      {expansion.map(servant => (
        <ServantCard key={servant.type} servant={servant} />
      ))}

      {/* Substitution Diagram */}
      <div style={{ padding: '0 18px 18px' }}>
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '16px',
        }}>
          <h3 style={{ fontFamily: "'Playfair Display', serif", color: 'var(--gold-l)', marginBottom: 12, fontSize: '0.95rem' }}>
            Substitution Summary
          </h3>
          <table style={{ width: '100%', fontSize: '0.78rem', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', color: 'var(--gold)', padding: '6px 8px', borderBottom: '1px solid var(--border-gold)', fontSize: '0.7rem', textTransform: 'uppercase' }}>Servant</th>
                <th style={{ textAlign: 'left', color: 'var(--gold)', padding: '6px 8px', borderBottom: '1px solid var(--border-gold)', fontSize: '0.7rem', textTransform: 'uppercase' }}>Can Replace</th>
                <th style={{ textAlign: 'left', color: 'var(--gold)', padding: '6px 8px', borderBottom: '1px solid var(--border-gold)', fontSize: '0.7rem', textTransform: 'uppercase' }}>Can Be Replaced By</th>
              </tr>
            </thead>
            <tbody>
              {servants.filter(s => (s.canSubstituteFor?.length ?? 0) > 0 || (s.canBeSubstitutedBy?.length ?? 0) > 0).map(s => (
                <tr key={s.type}>
                  <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)', color: 'var(--text)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <ServantIcon type={s.type} size={16} />
                      {s.name}
                    </div>
                  </td>
                  <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)', color: 'var(--gold)' }}>
                    {s.canSubstituteFor?.length ? s.canSubstituteFor.join(', ') : '—'}
                  </td>
                  <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                    {s.canBeSubstitutedBy?.length ? s.canBeSubstitutedBy.join(', ') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 12, padding: '10px 12px', background: 'rgba(201,162,39,0.08)', borderRadius: '8px', fontSize: '0.78rem', color: 'var(--text)', lineHeight: 1.5 }}>
            <strong style={{ color: 'var(--gold)' }}>Special Note:</strong> A Footman may substitute for a Valet only when the <em>Brushing Room</em> improvement tile is in your estate tableau.
          </div>
        </div>
      </div>
    </div>
  );
}

function ServantCard({ servant }: { servant: ServantDef }) {
  return (
    <div className="servant-card">
      <div className="servant-header">
        <div className="servant-icon-wrap">
          <ServantIcon type={servant.type} size={28} />
        </div>
        <div>
          <div className="servant-name">{servant.name}</div>
          <div className="servant-role">
            <ExpansionBadge expansion={servant.expansion} />
          </div>
        </div>
      </div>

      <div className="servant-desc">{servant.description}</div>

      <div style={{ fontSize: '0.78rem', color: 'var(--text)', marginBottom: 6 }}>
        <strong style={{ color: 'var(--gold-l)' }}>Primary Role:</strong> {servant.primaryRole}
      </div>

      {(servant.canSubstituteFor?.length ?? 0) > 0 && (
        <div className="substitution-row">
          <span className="sub-label">Can replace:</span>
          {servant.canSubstituteFor!.map(s => (
            <span key={s} className="sub-chip">→ {s}</span>
          ))}
        </div>
      )}

      {(servant.canBeSubstitutedBy?.length ?? 0) > 0 && (
        <div className="substitution-row">
          <span className="sub-label">Replaced by:</span>
          {servant.canBeSubstitutedBy!.map(s => (
            <span key={s} className="sub-chip">{s} →</span>
          ))}
        </div>
      )}

      {servant.specialAbility && (
        <div className="special-ability">
          <div className="special-ability-label">✦ Special Ability</div>
          {servant.specialAbility}
        </div>
      )}
    </div>
  );
}
