import { BookOpen, Users, Grid3X3, User, UserCheck, Package, HelpCircle, Search, Shuffle } from 'lucide-react';
import type { View } from '../../types';

interface Props {
  onNavigate: (view: View) => void;
}

const EXPANSION_DATA = [
  {
    expansion: 'base' as const,
    name: 'Base Game',
    icon: '🏰',
    color: '#8b1a1a',
    colorL: '#c44a4a',
    meta: '4 families · 81 gentry · 80 tiles',
    description: 'The complete Victorian social experience.',
  },
  {
    expansion: 'wessex' as const,
    name: 'Wessex',
    icon: '🌿',
    color: '#1a4a2e',
    colorL: '#3a8a5e',
    meta: '1 family · 16 gentry · 4 tiles',
    description: 'The rising family with a larger estate.',
  },
  {
    expansion: 'upstairs-downstairs' as const,
    name: 'Upstairs, Downstairs',
    icon: '🪜',
    color: '#1a2a5c',
    colorL: '#3a5aac',
    meta: '1 family · 49 gentry · 4 servants · 5 tiles',
    description: 'Deeper servant mechanics and new game modes.',
  },
  {
    expansion: 'characters' as const,
    name: 'Characters',
    icon: '🎭',
    color: '#3d1a5c',
    colorL: '#7a3aac',
    meta: '28 new gentry · 52 objectives',
    description: 'Worker placement characters and Distinguished Members.',
  },
  {
    expansion: 'useful-box' as const,
    name: 'Useful Box',
    icon: '📦',
    color: '#5c3d00',
    colorL: '#ac7a00',
    meta: 'Promo cards · New tiles · Dynamic AI',
    description: 'Promotional content and updated components.',
  },
  {
    expansion: 'promo' as const,
    name: 'Promo Tiles (2019)',
    icon: '🎟️',
    color: '#2a2a2a',
    colorL: '#666666',
    meta: '20 backer-designed tiles',
    description: 'Kickstarter stretch goal tiles.',
  },
];

const QUICK_NAV = [
  { label: 'Rules', view: 'rules' as View, icon: BookOpen },
  { label: 'Cards', view: 'cards' as View, icon: Users },
  { label: 'Tiles', view: 'tiles' as View, icon: Grid3X3 },
  { label: 'Families', view: 'families' as View, icon: User },
  { label: 'Servants', view: 'servants' as View, icon: UserCheck },
  { label: 'Sort Helper', view: 'sort' as View, icon: Package },
  { label: 'FAQ / Q&A', view: 'faq' as View, icon: HelpCircle },
  { label: 'Search', view: 'search' as View, icon: Search },
  { label: 'Sort Cards', view: 'sort' as View, icon: Shuffle },
];

export function HomeView({ onNavigate }: Props) {
  return (
    <div>
      {/* Hero */}
      <div className="hero">
        <div className="hero-crest">⚜</div>
        <h1>Obsession Wiki</h1>
        <p className="hero-tagline">
          Pride, Intrigue &amp; Prejudice in Victorian England
        </p>
        <div className="hero-about">
          <strong>Obsession</strong> is a 1–4 player deck-building and tile-placement game by Dan Hallagan (Kayenta Games), set in 1860s Derbyshire. Players manage struggling gentry families, renovate their estates, host social activities, and compete for the attention of the influential Fairchild family across 16 rounds of Victorian social manoeuvring.
        </div>
      </div>

      {/* Expansions */}
      <div style={{ padding: '18px 18px 8px' }}>
        <h2 style={{ fontFamily: "'Playfair Display', serif", color: 'var(--gold-l)', fontSize: '1.1rem', marginBottom: '12px' }}>
          Expansions & Content
        </h2>
      </div>
      <div className="expansion-cards-grid">
        {EXPANSION_DATA.map(exp => (
          <div
            key={exp.expansion}
            className="expansion-card"
            style={{ '--exp-color': exp.colorL } as React.CSSProperties}
            onClick={() => onNavigate('rules')}
            role="button"
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && onNavigate('rules')}
          >
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: 3,
              background: exp.colorL
            }} />
            <div className="expansion-card-icon">{exp.icon}</div>
            <div className="expansion-card-name">{exp.name}</div>
            <div className="expansion-card-meta">{exp.meta}</div>
          </div>
        ))}
      </div>

      {/* Divider */}
      <div className="ornamental-divider">
        <span>✦</span>
      </div>

      {/* Quick Nav */}
      <div style={{ padding: '0 18px 8px' }}>
        <h2 style={{ fontFamily: "'Playfair Display', serif", color: 'var(--gold-l)', fontSize: '1.1rem', marginBottom: '12px' }}>
          Reference Tools
        </h2>
      </div>
      <div className="quick-nav-grid">
        {QUICK_NAV.map(({ label, view, icon: Icon }) => (
          <button
            key={`${label}-${view}`}
            className="quick-nav-btn"
            onClick={() => onNavigate(view)}
          >
            <Icon size={22} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* Info */}
      <div className="info-box">
        <strong>Designer:</strong> Dan Hallagan (Kayenta Games)<br />
        <strong>Players:</strong> 1–4 (up to 6 with expansions)<br />
        <strong>Duration:</strong> 30–120 minutes<br />
        <strong>Complexity:</strong> Medium — recommended 2+ plays before adding expansions
      </div>

      {/* Special Rounds Quick Ref */}
      <div style={{ padding: '0 18px 8px' }}>
        <h2 style={{ fontFamily: "'Playfair Display', serif", color: 'var(--gold-l)', fontSize: '1.1rem', marginBottom: '8px' }}>
          Special Rounds at a Glance
        </h2>
      </div>
      <div style={{ padding: '0 18px 18px' }}>
        <table className="special-rounds-table">
          <thead>
            <tr>
              <th>Event</th>
              <th>Standard</th>
              <th>Extended</th>
              <th>Effect</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>🎪 Village Fair</td>
              <td>3, 9</td>
              <td>4, 9, 16</td>
              <td>Private Study holders gain £300 + 2 Rep</td>
            </tr>
            <tr>
              <td>💌 Courtship</td>
              <td>4, 8, 12, 16</td>
              <td>5, 10, 15, 20</td>
              <td>VP by theme category; winner gets Fairchild card</td>
            </tr>
            <tr>
              <td>🏗️ Builder's Holiday</td>
              <td>11</td>
              <td>13</td>
              <td>Buy unlimited improvement tiles</td>
            </tr>
            <tr>
              <td>🎉 National Holiday</td>
              <td>14</td>
              <td>11</td>
              <td>All reputation restrictions removed</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
