import { useState, useMemo } from 'react';
import { ChevronDown, Search, ExternalLink } from 'lucide-react';
import type { FAQEntry, Expansion } from '../../types';
import { ExpansionBadge } from '../ExpansionBadge';

interface Props {
  entries: FAQEntry[];
}

const EXP_TABS: { id: Expansion | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'base', label: 'Base Game' },
  { id: 'wessex', label: 'Wessex' },
  { id: 'upstairs-downstairs', label: 'Upstairs/Downstairs' },
  { id: 'characters', label: 'Characters' },
  { id: 'useful-box', label: 'Useful Box' },
];

function FAQItem({ entry }: { entry: FAQEntry }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="faq-entry">
      <button className="faq-question" onClick={() => setOpen(o => !o)}>
        <span style={{ flex: 1 }}>{entry.question}</span>
        <ChevronDown size={16} style={{ transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none', flexShrink: 0, color: 'var(--gold)' }} />
      </button>
      {open && (
        <div className="faq-answer">
          {entry.answer}
          <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <ExpansionBadge expansion={entry.expansion} />
            {entry.source && (
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                📎 {entry.source}
              </span>
            )}
          </div>
          {entry.tags.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {entry.tags.map(tag => (
                <span key={tag} style={{
                  background: 'var(--surface2)', border: '1px solid var(--border)',
                  padding: '2px 6px', borderRadius: 4, fontSize: '0.65rem', color: 'var(--text-muted)'
                }}>
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function FAQView({ entries }: Props) {
  const [search, setSearch] = useState('');
  const [expFilter, setExpFilter] = useState<Expansion | 'all'>('all');

  const filtered = useMemo(() => {
    return entries.filter(e => {
      const matchesExp = expFilter === 'all' || e.expansion === expFilter || e.expansion === 'all';
      if (!matchesExp) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        e.question.toLowerCase().includes(q) ||
        e.answer.toLowerCase().includes(q) ||
        e.tags.some(t => t.toLowerCase().includes(q))
      );
    });
  }, [entries, search, expFilter]);

  return (
    <div>
      <div className="section-header">
        <h1>FAQ &amp; Q&amp;A</h1>
        <p>Ask a question or browse common rules clarifications. {entries.length} entries covering all expansions.</p>
      </div>

      <div className="faq-search-wrap">
        <div className="search-input-wrap" style={{ flex: 1 }}>
          <Search size={14} className="search-input-icon" />
          <input
            className="search-input"
            placeholder="Ask a question or search..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus={false}
          />
        </div>
      </div>

      <div className="tab-bar">
        {EXP_TABS.map(t => (
          <button
            key={t.id}
            className={`tab-btn ${expFilter === t.id ? 'active' : ''}`}
            onClick={() => setExpFilter(t.id as Expansion | 'all')}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ padding: '0 18px 8px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
        {filtered.length} result{filtered.length !== 1 ? 's' : ''}
        {search && ` for "${search}"`}
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">❓</div>
          <h3>No answers found</h3>
          <p>Try different search terms, or visit the official BGG FAQ thread.</p>
          <div style={{ marginTop: 16 }}>
            <a
              href="https://boardgamegeek.com/thread/3186077/obsession-faq"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--gold)', textDecoration: 'none', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}
            >
              <ExternalLink size={14} /> BGG Obsession FAQ Thread
            </a>
          </div>
        </div>
      ) : (
        filtered.map(entry => (
          <FAQItem key={entry.id} entry={entry} />
        ))
      )}

      <div style={{ padding: '8px 18px 24px', textAlign: 'center' }}>
        <a
          href="https://boardgamegeek.com/thread/3186077/obsession-faq"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--gold)', textDecoration: 'none', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <ExternalLink size={13} /> View full FAQ on BoardGameGeek
        </a>
      </div>
    </div>
  );
}
