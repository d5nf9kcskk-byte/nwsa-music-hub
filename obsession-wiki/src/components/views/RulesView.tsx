import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Expansion, RuleSection } from '../../types';
import { ExpansionBadge } from '../ExpansionBadge';

interface Props {
  baseRules: RuleSection[];
  udRules: RuleSection[];
  charsRules: RuleSection[];
  usefulBoxRules: RuleSection[];
}

type ExpTab = 'base' | 'wessex' | 'upstairs-downstairs' | 'characters' | 'useful-box';

const TABS: { id: ExpTab; label: string; expansion: Expansion }[] = [
  { id: 'base', label: 'Base Game', expansion: 'base' },
  { id: 'upstairs-downstairs', label: 'Upstairs/Downstairs', expansion: 'upstairs-downstairs' },
  { id: 'characters', label: 'Characters', expansion: 'characters' },
  { id: 'wessex', label: 'Wessex', expansion: 'wessex' },
  { id: 'useful-box', label: 'Useful Box', expansion: 'useful-box' },
];

function renderContent(content: string) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let key = 0;

  for (const line of lines) {
    if (!line.trim()) { elements.push(<br key={key++} />); continue; }
    if (line.startsWith('**') && line.endsWith('**')) {
      elements.push(<h4 key={key++}>{line.replace(/\*\*/g, '')}</h4>);
    } else if (line.startsWith('- ')) {
      elements.push(<li key={key++}>{renderInline(line.slice(2))}</li>);
    } else {
      elements.push(<p key={key++}>{renderInline(line)}</p>);
    }
  }

  return elements;
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : part
  );
}

function Accordion({ section, defaultOpen = false }: { section: RuleSection; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="accordion">
      <button className="accordion-header" onClick={() => setOpen(o => !o)}>
        <span className="accordion-title">{section.title}</span>
        <ChevronDown size={16} className={`accordion-chevron ${open ? 'open' : ''}`} />
      </button>
      {open && (
        <div className="accordion-body">
          <ul style={{ listStyle: 'none' }}>
            {renderContent(section.content)}
          </ul>
          {section.subsections?.map(sub => (
            <div key={sub.id} style={{ marginTop: 16, paddingLeft: 12, borderLeft: '2px solid var(--border-gold)' }}>
              <h4 style={{ marginBottom: 8 }}>{sub.title}</h4>
              <ul style={{ listStyle: 'none' }}>{renderContent(sub.content)}</ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const WESSEX_RULES: RuleSection[] = [
  {
    id: 'wessex-overview',
    expansion: 'wessex',
    title: 'Wessex Expansion Overview',
    content: `The Wessex expansion adds a fifth playable family — the Wessex family — along with new gentry, new tiles, and additional solo opponents.

**What's New:**
- Wessex family board with unique starting tile choices
- 16 new gentry cards (3 family, 5 starter, 5 casual, 5 prestige)
- 4 new improvement tiles (Breakfast Room, Tennis Court, Retiring Room, Obelisk)
- 6 new solo opponent cards`,
  },
  {
    id: 'wessex-family',
    expansion: 'wessex',
    title: 'Wessex Family Setup',
    content: `The Wessex family begins with a larger estate than any other family. At setup, the Wessex player chooses between two pairs of additional starting tiles:

**Option A:** Breakfast Room + Tennis Court
**Option B:** Morning Room + Retiring Room

This choice represents the type of entertainment the Wessex family specializes in and will shape your strategy for the entire game.

All other setup rules are identical to the base game.`,
  },
  {
    id: 'wessex-tiles',
    expansion: 'wessex',
    title: 'New Tiles',
    content: `**Breakfast Room** (Essential, Req: 1, Cost: Starting)
A morning dining room for female-focused activities. Provides monetary favours.

**Tennis Court** (Sporting, Req: 1, Cost: Starting)
A sporting facility for mixed-gender activities. Provides money and reputation.

**Retiring Room** (Essential, Req: 2, Cost: £200)
A ladies' withdrawing room. Provides reputation favours. Also available as a Wessex starting tile option.

**Obelisk** (Monument, Req: 3, Cost: £500)
A garden monument providing +1 Reputation each round passively.`,
  },
];

const USEFUL_BOX_RULES_LOCAL: RuleSection[] = [
  {
    id: 'ub-setup',
    expansion: 'useful-box',
    title: 'Using Useful Box Content',
    content: `The Useful Box contains several types of content, each used differently:

**Promotional Gentry Cards** (Lady Mary Shelton, Aston Webb)
Add these to the appropriate supply decks (prestige in this case) when setting up. Shuffle in before distributing.

**New Improvement Tiles**
Separate these by category (Service, Estate, Essential, Prestige, Sporting) and shuffle into the appropriate tile stacks before filling the Builder's Market.

**Solo Opponent Cards**
When playing solo with the Upstairs/Downstairs expansion, shuffle these in with the solo opponent deck to add variety.

**Dynamic AI Cards**
Use in place of (or in addition to) standard solo opponent cards for a more varied solo experience.`,
  },
  {
    id: 'ub-dynamic-ai',
    expansion: 'useful-box',
    title: 'Dynamic AI System',
    content: `The Dynamic AI system provides solo opponents with distinct personalities. Unlike standard opponent cards (which use the same priority system), each Dynamic AI opponent has:

**Priority Categories:** Reputation-focused, Wealth-focused, Tile-focused, Guest-focused
**Strategy Modifiers:** These alter which action the AI takes when the die roll gives multiple options
**Difficulty Scaling:** Different AI personalities suit different player skill levels

**Using Dynamic AI:**
1. Choose a Dynamic AI personality card
2. Use it in place of a standard solo opponent card
3. When consulting the AI card, apply its priority modifiers to the die roll result
4. The AI's strategy will differ significantly each game

Free print-and-play versions are available from kayentapublishing.com/resources`,
  },
];

export function RulesView({ baseRules, udRules, charsRules, usefulBoxRules }: Props) {
  const [activeTab, setActiveTab] = useState<ExpTab>('base');

  const getRulesForTab = () => {
    switch (activeTab) {
      case 'base': return baseRules;
      case 'upstairs-downstairs': return udRules;
      case 'characters': return charsRules;
      case 'wessex': return WESSEX_RULES;
      case 'useful-box': return [...usefulBoxRules, ...USEFUL_BOX_RULES_LOCAL];
    }
  };

  const rules = getRulesForTab();

  return (
    <div>
      <div className="section-header">
        <h1>Rules Reference</h1>
        <p>Complete rules for the base game and all expansions. Select an expansion to view its specific rules.</p>
      </div>

      <div className="tab-bar">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div style={{ marginBottom: 8, padding: '0 18px' }}>
        <ExpansionBadge expansion={activeTab as Expansion} />
      </div>

      {rules.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📜</div>
          <h3>No rules loaded</h3>
          <p>Rules for this expansion are not yet available.</p>
        </div>
      ) : (
        rules.map((section, i) => (
          <Accordion key={section.id} section={section} defaultOpen={i === 0} />
        ))
      )}

      {activeTab === 'base' && (
        <div className="info-box" style={{ marginTop: 4 }}>
          <strong>💡 Tip:</strong> New to Obsession? Start with the <em>Game Overview</em> and <em>Turn Structure</em> sections. The <em>Special Rounds</em> section explains the all-important Courtship mechanism.
        </div>
      )}
    </div>
  );
}
